// Turns the locked parts of a plan into pins, so a re-plan keeps them and plans around them. Pins keep today's
// shape (base, curry, subzi, extras); the planner gets them by part through `toWeekPartPins`.
import type { Day, Meal } from '@/planner';
import type { DayOfWeek, PlanSlot, WeeklyPlan } from '@/types/plan';
import type { MealSlot } from '@/types/preferences';
import type { PairedSide } from './plan-generation';

/** A dish picked by hand, with the legacy name of the part it was picked for. */
export type MealPick = { part: 'base' | 'curry' | 'subzi' | 'extras'; id: number };

/**
 * The meal as picked, plus only what the pick brings. `found` is a plan of the meal with its other parts free:
 * a side counts when a pairing on the pick brings it, or on a side the pick brought (chain through `by`). Sides
 * the base or a freely chosen dish brought stay out, and the meal's other dishes stay as they were.
 */
export function settleMeal(picked: PlanSlot, pick: MealPick, found: PlanSlot, paired: PairedSide[]): PlanSlot {
  const brought = new Set([pick.id]);
  const mine = paired.filter(p => p.day === picked.day && p.meal === picked.meal_slot);
  for (let grew = true; grew;) {
    grew = false;
    for (const p of mine) if (brought.has(p.by) && !brought.has(p.component)) { brought.add(p.component); grew = true; }
  }
  const settled = { ...picked };
  if (pick.part !== 'curry' && found.curry_id != null && brought.has(found.curry_id)) settled.curry_id = found.curry_id;
  if (pick.part !== 'subzi' && found.subzi_id != null && brought.has(found.subzi_id)) settled.subzi_id = found.subzi_id;
  if (pick.part !== 'extras') settled.extra_ids = [...picked.extra_ids, ...found.extra_ids.filter(id => brought.has(id) && !picked.extra_ids.includes(id))];
  return settled;
}

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
 * held empty), and in this meal only the base and the locked parts are pinned. A dish picked by hand is pinned in
 * its part too (`extras` as the one extra, as a swap writes it); the meal's other unlocked parts stay free.
 */
export function pinsForMeal(
  plan: WeeklyPlan, locks: Record<string, boolean>, day: DayOfWeek, meal: MealSlot,
  picked?: MealPick,
): LegacyPins {
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
    if (picked?.part === 'base') slotPins.base_id = picked.id;
    else if (picked?.part === 'curry') slotPins.curry_id = picked.id;
    else if (picked?.part === 'subzi') slotPins.subzi_id = picked.id;
    else if (picked?.part === 'extras') slotPins.extra_ids = [picked.id];
    pins[prefix] = slotPins;
  }
  return pins;
}
