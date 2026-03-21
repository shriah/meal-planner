'use client'

import { useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import type { ComponentRecord } from '@/types/component'
import type { MealSlot } from '@/types/preferences'

interface ComponentExceptionsProps {
  overrides: Record<number, MealSlot[]>
  allComponents: ComponentRecord[]
  onAddOverride: (componentId: number, slots: MealSlot[]) => void
  onRemoveOverride: (componentId: number) => void
  onUpdateOverride: (componentId: number, slots: MealSlot[]) => void
}

const MEAL_SLOTS: { key: MealSlot; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
]

export function ComponentExceptions({
  overrides,
  allComponents,
  onAddOverride,
  onRemoveOverride,
  onUpdateOverride,
}: ComponentExceptionsProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newComponentId, setNewComponentId] = useState<string>('')
  const [newSlots, setNewSlots] = useState<MealSlot[]>([])

  const overrideIds = Object.keys(overrides).map(Number)

  // Components that don't already have an override
  const availableComponents = allComponents.filter(
    c => c.id !== undefined && !overrideIds.includes(c.id),
  )

  const handleSlotToggle = (componentId: number, slot: MealSlot) => {
    const current = overrides[componentId] ?? []
    const next = current.includes(slot)
      ? current.filter(s => s !== slot)
      : [...current, slot]
    onUpdateOverride(componentId, next)
  }

  const handleNewSlotToggle = (slot: MealSlot) => {
    setNewSlots(prev =>
      prev.includes(slot) ? prev.filter(s => s !== slot) : [...prev, slot],
    )
  }

  const handleAddSubmit = () => {
    const id = Number(newComponentId)
    if (!id || newSlots.length === 0) return
    onAddOverride(id, newSlots)
    setNewComponentId('')
    setNewSlots([])
    setShowAddForm(false)
  }

  const handleAddCancel = () => {
    setNewComponentId('')
    setNewSlots([])
    setShowAddForm(false)
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setIsExpanded(prev => !prev)}
        className="flex items-center gap-1 text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors"
        aria-expanded={isExpanded}
      >
        <span className="text-muted-foreground">{isExpanded ? '▾' : '▸'}</span>
        Component exceptions (optional)
      </button>

      {isExpanded && (
        <div className="pl-4 space-y-3">
          {/* Existing overrides */}
          {overrideIds.length === 0 && !showAddForm && (
            <p className="text-xs text-muted-foreground">No component exceptions yet.</p>
          )}

          {overrideIds.map(id => {
            const component = allComponents.find(c => c.id === id)
            const componentName = component?.name ?? `Component #${id}`
            const slots = overrides[id] ?? []

            return (
              <div
                key={id}
                className="flex flex-wrap items-center gap-4 py-2 border-b border-border/50"
              >
                <span className="text-sm font-medium min-w-[120px]">{componentName}</span>
                <div className="flex items-center gap-3">
                  {MEAL_SLOTS.map(slot => (
                    <label
                      key={slot.key}
                      className="flex items-center gap-1.5 text-xs cursor-pointer"
                    >
                      <Checkbox
                        checked={slots.includes(slot.key)}
                        onCheckedChange={() => handleSlotToggle(id, slot.key)}
                        aria-label={`${componentName} - ${slot.label}`}
                      />
                      {slot.label}
                    </label>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemoveOverride(id)}
                  className="text-destructive hover:text-destructive ml-auto"
                >
                  Remove
                </Button>
              </div>
            )
          })}

          {/* Add exception inline form */}
          {showAddForm && (
            <div className="flex flex-wrap items-end gap-3 py-2 border border-border rounded-md p-3">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Component</span>
                <Combobox
                  options={availableComponents.map(c => ({ value: String(c.id), label: c.name }))}
                  value={newComponentId}
                  onValueChange={setNewComponentId}
                  placeholder="Select component..."
                  searchPlaceholder="Search components..."
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Allowed slots</span>
                <div className="flex items-center gap-3">
                  {MEAL_SLOTS.map(slot => (
                    <label
                      key={slot.key}
                      className="flex items-center gap-1.5 text-xs cursor-pointer"
                    >
                      <Checkbox
                        checked={newSlots.includes(slot.key)}
                        onCheckedChange={() => handleNewSlotToggle(slot.key)}
                      />
                      {slot.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleAddSubmit}
                  disabled={!newComponentId || newSlots.length === 0}
                >
                  Add
                </Button>
                <Button variant="ghost" size="sm" onClick={handleAddCancel}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* + Add exception button */}
          {!showAddForm && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddForm(true)}
              disabled={availableComponents.length === 0}
            >
              + Add exception
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
