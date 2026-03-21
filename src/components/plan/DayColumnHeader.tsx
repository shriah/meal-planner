'use client'

import { Button } from '@/components/ui/button'
import { usePlanStore } from '@/stores/plan-store'
import type { DayOfWeek } from '@/types/plan'

const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
}

export function DayColumnHeader({ day }: { day: DayOfWeek }) {
  const locks = usePlanStore(s => s.locks)
  const lockDay = usePlanStore(s => s.lockDay)
  const unlockDay = usePlanStore(s => s.unlockDay)
  const plan = usePlanStore(s => s.plan)

  // Check if all 12 components for this day are locked
  const ALL_SLOTS = ['breakfast', 'lunch', 'dinner'] as const
  const ALL_COMPS = ['base', 'curry', 'subzi', 'extras'] as const
  const allLocked = plan !== null && ALL_SLOTS.every(slot =>
    ALL_COMPS.every(comp => locks[`${day}-${slot}-${comp}`])
  )

  return (
    <div className="flex flex-col items-center gap-1 py-2">
      <span className="text-base font-semibold">{DAY_LABELS[day]}</span>
      {plan && (
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7 px-2"
          onClick={() => allLocked ? unlockDay(day) : lockDay(day)}
        >
          {allLocked ? 'Unlock Day' : 'Lock Day'}
        </Button>
      )}
    </div>
  )
}
