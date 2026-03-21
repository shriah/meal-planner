'use client'

import { Lock, Unlock } from 'lucide-react'
import { usePlanStore, type LockKey } from '@/stores/plan-store'
import { cn } from '@/lib/utils'
import type { DayOfWeek } from '@/types/plan'
import type { MealSlot } from '@/types/preferences'

type LockableComponent = 'base' | 'curry' | 'subzi' | 'extras'

const COMPONENT_LABELS: Record<LockableComponent, string> = {
  base: 'Base', curry: 'Curry', subzi: 'Subzi', extras: 'Extras',
}

interface PlanComponentRowProps {
  day: DayOfWeek
  slot: MealSlot
  componentType: LockableComponent
  displayName: string | null  // null means empty/unassigned
  onPickerOpen: () => void
}

export function PlanComponentRow({ day, slot, componentType, displayName, onPickerOpen }: PlanComponentRowProps) {
  const lockKey: LockKey = `${day}-${slot}-${componentType}`
  const isLocked = usePlanStore(s => !!s.locks[lockKey])
  const setLock = usePlanStore(s => s.setLock)

  const label = COMPONENT_LABELS[componentType]

  return (
    <div className={cn(
      'flex items-center gap-2 rounded px-2 py-1 min-h-[44px]',
      isLocked ? 'bg-muted' : 'bg-card hover:bg-accent/10'
    )}>
      <button
        onClick={() => setLock(lockKey, !isLocked)}
        className="min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
        aria-label={isLocked ? `Unlock ${label}` : `Lock ${label}`}
      >
        {isLocked
          ? <Lock className="h-4 w-4 text-primary" />
          : <Unlock className="h-4 w-4 text-muted-foreground" />}
      </button>
      <span
        className={cn(
          'text-sm flex-1',
          isLocked ? 'text-muted-foreground' : 'text-foreground cursor-pointer',
          componentType === 'base' && 'text-base font-medium',
        )}
        onClick={isLocked ? undefined : onPickerOpen}
        role={isLocked ? undefined : 'button'}
        tabIndex={isLocked ? undefined : 0}
        onKeyDown={isLocked ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') onPickerOpen() }}
      >
        {displayName ?? '\u2014'}
      </span>
    </div>
  )
}
