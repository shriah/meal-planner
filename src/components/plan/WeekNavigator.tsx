'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePlanStore } from '@/stores/plan-store'
import { formatWeekLabel, addWeeks, getISOWeekStart } from '@/services/week-utils'

export function WeekNavigator() {
  const currentWeekStart = usePlanStore(s => s.currentWeekStart)
  const navigateToWeek = usePlanStore(s => s.navigateToWeek)

  const thisWeek = getISOWeekStart(new Date())
  const isCurrentWeek = currentWeekStart === thisWeek
  const isPastOrFuture = !isCurrentWeek

  return (
    <div className="flex items-center justify-center gap-4 min-h-[48px] mb-2">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Previous week"
        onClick={() => navigateToWeek(addWeeks(currentWeekStart, -1))}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span
        className={`text-base font-medium text-center min-w-[180px] ${isPastOrFuture ? 'text-muted-foreground' : ''}`}
        aria-live="polite"
      >
        {formatWeekLabel(currentWeekStart)}
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Next week"
        onClick={() => navigateToWeek(addWeeks(currentWeekStart, 1))}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
