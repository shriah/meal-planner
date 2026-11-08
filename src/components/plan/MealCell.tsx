'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Fragment } from 'react'
import { PlanComponentRow, PairedNote } from './PlanComponentRow'
import { cn } from '@/lib/utils'
import type { PlanSlot, DayOfWeek } from '@/types/plan'
import type { PlanProblem, PairedSide } from '@/services/plan-generation'
import type { MealSlot } from '@/types/preferences'
import type { ComponentRecord } from '@/types/component'

interface MealCellProps {
  day: DayOfWeek
  slot: MealSlot
  planSlot: PlanSlot | undefined
  componentsMap: Map<number, ComponentRecord>
  /** Hard problems located in this meal. */
  problems: PlanProblem[]
  /** Sides in this meal that a pairing brought. */
  paired?: PairedSide[]
  onPickerOpen: (componentType: 'base' | 'curry' | 'subzi' | 'extras') => void
}

export function MealCell({ day, slot, planSlot, componentsMap, problems, paired = [], onPickerOpen }: MealCellProps) {
  const hasProblem = problems.length > 0
  const [showProblems, setShowProblems] = useState(false)

  if (!planSlot) {
    return (
      <div className="rounded-md border p-4 flex items-center justify-center text-muted-foreground text-sm">
        {'\u2014'}
      </div>
    )
  }

  const baseName = componentsMap.get(planSlot.base_id)?.name ?? null
  const curryName = planSlot.curry_id ? componentsMap.get(planSlot.curry_id)?.name ?? null : null
  const subziName = planSlot.subzi_id ? componentsMap.get(planSlot.subzi_id)?.name ?? null : null
  const baseOf = (id: number | undefined) => {
    const by = paired.find(p => p.component === id)?.by
    return by === undefined ? undefined : componentsMap.get(by)?.name
  }
  const extras = planSlot.extra_ids.filter(id => componentsMap.get(id)?.name)
  const extrasNames = extras.length > 0
    ? extras.map((id, i) => {
        const base = baseOf(id)
        return (
          <Fragment key={id}>
            {i > 0 && ', '}
            {componentsMap.get(id)?.name}
            {base && <PairedNote base={base} />}
          </Fragment>
        )
      })
    : null

  return (
    <div className={cn(
      'rounded-md border p-2 flex flex-col gap-1',
      hasProblem && 'border-2 border-amber-400'
    )}>
      {hasProblem && (
        <div className="mb-1 text-amber-600">
          <button
            type="button"
            aria-expanded={showProblems}
            onClick={() => setShowProblems(open => !open)}
            className="flex items-center gap-1 text-xs"
          >
            <AlertTriangle className="h-3 w-3" />
            <span>Rule broken</span>
          </button>
          {showProblems && (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-foreground">
              {problems.map((p, i) => <li key={i}>{p.reason}</li>)}
            </ul>
          )}
        </div>
      )}
      <PlanComponentRow day={day} slot={slot} componentType="base" displayName={baseName} onPickerOpen={() => onPickerOpen('base')} />
      <PlanComponentRow day={day} slot={slot} componentType="curry" displayName={curryName} pairedWith={baseOf(planSlot.curry_id)} onPickerOpen={() => onPickerOpen('curry')} />
      <PlanComponentRow day={day} slot={slot} componentType="subzi" displayName={subziName} pairedWith={baseOf(planSlot.subzi_id)} onPickerOpen={() => onPickerOpen('subzi')} />
      <PlanComponentRow day={day} slot={slot} componentType="extras" displayName={extrasNames} onPickerOpen={() => onPickerOpen('extras')} />
    </div>
  )
}
