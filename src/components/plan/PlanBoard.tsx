'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getAllComponents } from '@/services/food-db'
import { usePlanStore } from '@/stores/plan-store'
import { getISOWeekStart } from '@/services/week-utils'
import { ALL_DAYS } from '@/types/plan'
import type { DayOfWeek } from '@/types/plan'
import type { MealSlot } from '@/types/preferences'
import { DayColumnHeader } from './DayColumnHeader'
import { SlotRowLabel } from './SlotRowLabel'
import { MealCell } from './MealCell'
import { PlanActionBar } from './PlanActionBar'
import { WarningBanner } from './WarningBanner'
import { MealPickerSheet } from './MealPickerSheet'
import { WeekNavigator } from './WeekNavigator'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { BaseType } from '@/types/component'

const ALL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner']

export function PlanBoard() {
  const plan = usePlanStore(s => s.plan)
  const warnings = usePlanStore(s => s.warnings)
  const hydrated = usePlanStore(s => s.hydrated)
  const isGenerating = usePlanStore(s => s.isGenerating)
  const initFromDB = usePlanStore(s => s.initFromDB)
  const generateFresh = usePlanStore(s => s.generateFresh)
  const isReadOnly = usePlanStore(s => s.isReadOnly)
  const currentWeekStart = usePlanStore(s => s.currentWeekStart)

  // Picker state (which cell + component type is being picked)
  const [pickerState, setPickerState] = useState<{
    day: DayOfWeek; slot: MealSlot; componentType: 'base' | 'curry' | 'subzi' | 'extras'
  } | null>(null)

  useEffect(() => { initFromDB() }, [initFromDB])

  // Load all components for ID-to-name resolution
  const allComponents = useLiveQuery(() => getAllComponents(), [], [])
  const componentsMap = useMemo(() => {
    const map = new Map<number, (typeof allComponents)[number]>()
    for (const c of allComponents ?? []) {
      if (c.id !== undefined) map.set(c.id, c)
    }
    return map
  }, [allComponents])

  if (!hydrated) {
    return (
      <div className="px-4 py-8 sm:px-8">
        <div className="animate-pulse text-muted-foreground">Loading plan...</div>
      </div>
    )
  }

  const hasPlan = plan !== null && plan.slots.length > 0
  const isPastWeek = isReadOnly
  const isFutureWeek = !isReadOnly && currentWeekStart > getISOWeekStart(new Date())

  return (
    <div className="px-4 py-8 sm:px-8">
      <WeekNavigator />
      <Separator className="mb-4" />

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[28px] font-semibold font-heading">Weekly Plan</h1>
        <PlanActionBar />
      </div>

      <WarningBanner />

      {isPastWeek && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900 mb-4" role="status">
          <AlertDescription>This is a past week — the plan is read-only.</AlertDescription>
        </Alert>
      )}

      {!hasPlan ? (
        <>
          {isFutureWeek ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <h2 className="text-xl font-semibold">No plan yet for this week</h2>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                This week hasn&apos;t been planned yet. Generate a fresh plan to get started.
              </p>
              <Button onClick={generateFresh} disabled={isGenerating} size="lg">
                {isGenerating ? 'Generating...' : 'Generate Plan for This Week'}
              </Button>
            </div>
          ) : isPastWeek ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <h2 className="text-xl font-semibold text-muted-foreground">No plan was saved for this week</h2>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <h2 className="text-xl font-semibold">No plan yet</h2>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                Generate your first weekly meal plan. Locked slots will stay across regenerations.
              </p>
              <Button onClick={generateFresh} disabled={isGenerating} size="lg">
                {isGenerating ? 'Generating...' : 'Generate Plan'}
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="overflow-x-auto mt-4">
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: '80px repeat(7, minmax(120px, 1fr))' }}
          >
            {/* Header row: empty corner + 7 day headers */}
            <div className="sticky left-0 z-10 bg-background" /> {/* empty corner */}
            {ALL_DAYS.map(day => (
              <DayColumnHeader key={day} day={day} />
            ))}

            {/* 3 slot rows */}
            {ALL_SLOTS.map(slot => (
              <Fragment key={slot}>
                <SlotRowLabel slot={slot} />
                {ALL_DAYS.map(day => {
                  const planSlot = plan.slots.find(
                    s => s.day === day && s.meal_slot === slot
                  )
                  return (
                    <MealCell
                      key={`${day}-${slot}`}
                      day={day}
                      slot={slot}
                      planSlot={planSlot}
                      componentsMap={componentsMap}
                      warnings={warnings}
                      onPickerOpen={isReadOnly ? () => {} : (componentType) => setPickerState({ day, slot, componentType })}
                    />
                  )
                })}
              </Fragment>
            ))}
          </div>
        </div>
      )}

      {!isReadOnly && pickerState && (
        <MealPickerSheet
          open={pickerState !== null}
          onOpenChange={(open) => { if (!open) setPickerState(null) }}
          day={pickerState.day}
          slot={pickerState.slot}
          componentType={pickerState.componentType}
          currentBaseType={
            pickerState.componentType === 'extras'
              ? (() => {
                  const ps = plan?.slots.find(s => s.day === pickerState.day && s.meal_slot === pickerState.slot)
                  const baseComp = ps ? componentsMap.get(ps.base_id) : undefined
                  return baseComp?.base_type as BaseType | undefined
                })()
              : undefined
          }
        />
      )}
    </div>
  )
}
