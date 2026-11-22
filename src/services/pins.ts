// Turns the locked parts of a plan into pins, so a re-plan keeps them and plans around them. Pins keep today's
// shape (base, curry, subzi, extras); the planner gets them by part through `toWeekPartPins`.
import type { Day, Meal } from '@/planner';
import type { DayOfWeek, WeeklyPlan } from '@/types/plan';
import type { MealSlot } from '@/types/preferences';

/** Locked values for one slot. The planner never moves a pinned value. A `null` curry or subzi holds that part empty. */
export interface SlotPins {
  base_id?: number;
  curry_id?: number | null;
  subzi_id?: number | null;
  extra_ids?: number[];
}
export type LegacyPins = Partial<Record<`${Day}-${Meal}`, SlotPins>>;

export function pinsFromLocks(plan: WeeklyPlan, locks: Record<string, boolean>): LegacyPins {
  const pins: LegacyPins = {};
  for (const planSlot of plan.slots) {
    const prefix = `${planSlot.day}-${planSlot.meal_slot}` as keyof LegacyPins;
    const slotPins: NonNullable<LegacyPins[keyof LegacyPins]> = {};
    if (locks[`${prefix}-base`]) slotPins.base_id = planSlot.base_id;
    if (locks[`${prefix}-curry`] && planSlot.curry_id !== undefined) slotPins.curry_id = planSlot.curry_id;
    if (locks[`${prefix}-subzi`] && planSlot.subzi_id !== undefined) slotPins.subzi_id = planSlot.subzi_id;
    if (locks[`${prefix}-extras`]) slotPins.extra_ids = planSlot.extra_ids;
    if (Object.keys(slotPins).length) pins[prefix] = slotPins;
  }
  return pins;
}

/**
 * Pins for re-planning one meal: every other meal is pinned exactly as it is (an empty curry or subzi
 * held empty), and in this meal only the base and the locked parts are pinned.
 */
export function pinsForMeal(plan: WeeklyPlan, locks: Record<string, boolean>, day: DayOfWeek, meal: MealSlot): LegacyPins {
  const pins: LegacyPins = {};
  for (const s of plan.slots) {
    const prefix = `${s.day}-${s.meal_slot}` as const;
    if (s.day !== day || s.meal_slot !== meal) {
      pins[prefix] = { base_id: s.base_id, curry_id: s.curry_id ?? null, subzi_id: s.subzi_id ?? null, extra_ids: [...s.extra_ids] };
      continue;
    }
    const slotPins: SlotPins = { base_id: s.base_id };
    if (locks[`${prefix}-curry`]) slotPins.curry_id = s.curry_id ?? null;
    if (locks[`${prefix}-subzi`]) slotPins.subzi_id = s.subzi_id ?? null;
    if (locks[`${prefix}-extras`]) slotPins.extra_ids = [...s.extra_ids];
    pins[prefix] = slotPins;
  }
  return pins;
}
