// Turns the locked parts of a plan into planner pins, so a re-plan keeps them and plans around them.
import type { Pins, SlotPins } from '@/planner';
import type { DayOfWeek, WeeklyPlan } from '@/types/plan';
import type { MealSlot } from '@/types/preferences';

export function pinsFromLocks(plan: WeeklyPlan, locks: Record<string, boolean>): Pins {
  const pins: Pins = {};
  for (const planSlot of plan.slots) {
    const prefix = `${planSlot.day}-${planSlot.meal_slot}` as keyof Pins;
    const slotPins: NonNullable<Pins[keyof Pins]> = {};
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
export function pinsForMeal(plan: WeeklyPlan, locks: Record<string, boolean>, day: DayOfWeek, meal: MealSlot): Pins {
  const pins: Pins = {};
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
