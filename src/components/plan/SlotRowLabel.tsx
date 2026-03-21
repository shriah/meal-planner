'use client'

import type { MealSlot } from '@/types/preferences'

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
}

export function SlotRowLabel({ slot }: { slot: MealSlot }) {
  return (
    <div className="sticky left-0 z-10 bg-background flex items-center justify-center px-2 py-4 text-sm font-semibold">
      {SLOT_LABELS[slot]}
    </div>
  )
}
