'use client'

import { AlertTriangle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { PlanComponentRow } from './PlanComponentRow'
import { cn } from '@/lib/utils'
import type { PlanSlot, DayOfWeek } from '@/types/plan'
import type { PlanProblem } from '@/services/plan-generation'
import type { MealSlot } from '@/types/preferences'
import type { ComponentRecord } from '@/types/component'

interface MealCellProps {
  day: DayOfWeek
  slot: MealSlot
  planSlot: PlanSlot | undefined
  componentsMap: Map<number, ComponentRecord>
  /** Hard problems located in this meal. */
  problems: PlanProblem[]
  onPickerOpen: (componentType: 'base' | 'curry' | 'subzi' | 'extras') => void
}

export function MealCell({ day, slot, planSlot, componentsMap, problems, onPickerOpen }: MealCellProps) {
  const hasProblem = problems.length > 0

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
  const extrasNames = planSlot.extra_ids.length > 0
    ? planSlot.extra_ids.map(id => componentsMap.get(id)?.name).filter(Boolean).join(', ') || null
    : null

  return (
    <div className={cn(
      'rounded-md border p-2 flex flex-col gap-1',
      hasProblem && 'border-2 border-amber-400'
    )}>
      {hasProblem && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 text-amber-600 mb-1">
                <AlertTriangle className="h-3 w-3" />
                <span className="text-xs">Rule broken</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              {problems.map((p, i) => <p key={i} className="text-xs">{p.message}</p>)}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      <PlanComponentRow day={day} slot={slot} componentType="base" displayName={baseName} onPickerOpen={() => onPickerOpen('base')} />
      <PlanComponentRow day={day} slot={slot} componentType="curry" displayName={curryName} onPickerOpen={() => onPickerOpen('curry')} />
      <PlanComponentRow day={day} slot={slot} componentType="subzi" displayName={subziName} onPickerOpen={() => onPickerOpen('subzi')} />
      <PlanComponentRow day={day} slot={slot} componentType="extras" displayName={extrasNames} onPickerOpen={() => onPickerOpen('extras')} />
    </div>
  )
}
