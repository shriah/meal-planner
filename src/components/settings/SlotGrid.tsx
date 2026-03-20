'use client'

import { Checkbox } from '@/components/ui/checkbox'
import type { BaseType } from '@/types/component'
import type { MealSlot } from '@/types/preferences'

interface SlotGridProps {
  baseTypeSlots: Partial<Record<BaseType, MealSlot[]>>
  onToggle: (baseType: BaseType, slot: MealSlot) => void
}

const BASE_TYPES: { key: BaseType; label: string }[] = [
  { key: 'rice-based', label: 'Rice-based' },
  { key: 'bread-based', label: 'Bread-based' },
  { key: 'other', label: 'Other' },
]

const MEAL_SLOTS: { key: MealSlot; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
]

export function SlotGrid({ baseTypeSlots, onToggle }: SlotGridProps) {
  return (
    <div className="overflow-x-auto">
      <div className="grid grid-cols-4 gap-4 items-center min-w-[320px]">
        {/* Header row */}
        <div />
        {MEAL_SLOTS.map(slot => (
          <div
            key={slot.key}
            className="text-sm font-semibold text-foreground text-center"
          >
            {slot.label}
          </div>
        ))}

        {/* Data rows */}
        {BASE_TYPES.map(baseType => (
          <>
            <div
              key={`label-${baseType.key}`}
              className="text-sm font-medium text-foreground"
            >
              {baseType.label}
            </div>
            {MEAL_SLOTS.map(slot => (
              <div
                key={`${baseType.key}-${slot.key}`}
                className="flex items-center justify-center"
              >
                <Checkbox
                  checked={baseTypeSlots[baseType.key]?.includes(slot.key) ?? false}
                  onCheckedChange={() => onToggle(baseType.key, slot.key)}
                  aria-label={`${baseType.label} - ${slot.label}`}
                />
              </div>
            ))}
          </>
        ))}
      </div>
    </div>
  )
}
