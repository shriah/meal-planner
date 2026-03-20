'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useLiveQuery } from 'dexie-react-hooks'
import { getPreferences, putPreferences, getAllComponents } from '@/services/food-db'
import { Button } from '@/components/ui/button'
import { SlotGrid } from './SlotGrid'
import { ComponentExceptions } from './ComponentExceptions'
import type { BaseType } from '@/types/component'
import type { MealSlot, SlotRestrictions } from '@/types/preferences'

export function SlotSettings() {
  const prefs = useLiveQuery(() => getPreferences(), [], undefined)
  const allComponents = useLiveQuery(() => getAllComponents(), [], [])

  const [baseTypeSlots, setBaseTypeSlots] = useState<Partial<Record<BaseType, MealSlot[]>>>({})
  const [componentSlotOverrides, setComponentSlotOverrides] = useState<Record<number, MealSlot[]>>(
    {},
  )
  const [initialized, setInitialized] = useState(false)
  const [saved, setSaved] = useState(false)

  // Initialize local state from loaded preferences
  useEffect(() => {
    if (prefs !== undefined && !initialized) {
      setBaseTypeSlots(prefs.slot_restrictions.base_type_slots)
      setComponentSlotOverrides(prefs.slot_restrictions.component_slot_overrides)
      setInitialized(true)
    }
  }, [prefs, initialized])

  const handleToggle = (baseType: BaseType, slot: MealSlot) => {
    setBaseTypeSlots(prev => {
      const current = prev[baseType] ?? []
      const next = current.includes(slot)
        ? current.filter(s => s !== slot)
        : [...current, slot]
      return { ...prev, [baseType]: next }
    })
  }

  const handleAddOverride = (componentId: number, slots: MealSlot[]) => {
    setComponentSlotOverrides(prev => ({ ...prev, [componentId]: slots }))
  }

  const handleRemoveOverride = (componentId: number) => {
    setComponentSlotOverrides(prev => {
      const next = { ...prev }
      delete next[componentId]
      return next
    })
  }

  const handleUpdateOverride = (componentId: number, slots: MealSlot[]) => {
    setComponentSlotOverrides(prev => ({ ...prev, [componentId]: slots }))
  }

  const handleSave = async () => {
    if (!prefs) return

    const updatedSlotRestrictions: SlotRestrictions = {
      base_type_slots: baseTypeSlots,
      component_slot_overrides: componentSlotOverrides,
    }

    await putPreferences({
      ...prefs,
      slot_restrictions: updatedSlotRestrictions,
    })

    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (prefs === undefined || !initialized) {
    return (
      <div className="p-8">
        <div className="text-sm text-muted-foreground">Loading preferences...</div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-8">
      {/* Page heading */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold leading-tight">Slot Settings</h1>
        <Link href="/library" className="text-sm text-primary hover:underline">
          Back to Library
        </Link>
      </div>

      {/* Slot grid */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Base type slot assignments</h2>
        <SlotGrid baseTypeSlots={baseTypeSlots} onToggle={handleToggle} />
      </div>

      {/* Component exceptions */}
      <ComponentExceptions
        overrides={componentSlotOverrides}
        allComponents={allComponents ?? []}
        onAddOverride={handleAddOverride}
        onRemoveOverride={handleRemoveOverride}
        onUpdateOverride={handleUpdateOverride}
      />

      {/* Save row */}
      <div className="flex items-center gap-4">
        <Button onClick={handleSave}>Save slot settings</Button>
        {saved && (
          <span className="text-sm text-muted-foreground">Slot settings saved.</span>
        )}
      </div>
    </div>
  )
}
