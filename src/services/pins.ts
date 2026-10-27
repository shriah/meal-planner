// Turns the locked parts of a plan into planner pins, so a re-plan keeps them and plans around them.
import type { Pins } from '@/planner';
import type { WeeklyPlan } from '@/types/plan';

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
