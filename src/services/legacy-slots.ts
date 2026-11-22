// Converts between today's stored meal shape (base/curry/subzi/extras) and meals by part.
import type { LegacyParts } from '@/db/parts';
import type { PartPins, PartSlot, WeekPartPins } from '@/planner';
import type { LegacyPins, SlotPins } from './pins';
import type { PlanSlot } from '@/types/plan';

/** A legacy slot holds one dish in Base, Curry and Subzi and many extras. Throws when a part slot does not fit. */
export function toLegacySlot(s: PartSlot, legacy: LegacyParts): PlanSlot {
  const one = (partId: number, required: boolean): number | undefined => {
    const ids = s.parts[partId] ?? [];
    if (ids.length > 1) throw new Error(`a legacy slot holds one dish in part ${partId}, got ${ids.length}`);
    if (required && ids.length === 0) throw new Error(`part ${partId} of ${s.day}-${s.meal_slot} is empty`);
    return ids[0];
  };
  const curry = one(legacy.curry, false);
  const subzi = one(legacy.subzi, false);
  return {
    day: s.day,
    meal_slot: s.meal_slot,
    base_id: one(legacy.base, true) as number,
    ...(curry !== undefined ? { curry_id: curry } : {}),
    ...(subzi !== undefined ? { subzi_id: subzi } : {}),
    extra_ids: [...(s.parts[legacy.extra] ?? [])],
  };
}

export function fromLegacySlot(s: PlanSlot, legacy: LegacyParts): PartSlot {
  return {
    day: s.day,
    meal_slot: s.meal_slot,
    parts: {
      [legacy.base]: [s.base_id],
      [legacy.curry]: s.curry_id === undefined ? [] : [s.curry_id],
      [legacy.subzi]: s.subzi_id === undefined ? [] : [s.subzi_id],
      [legacy.extra]: [...s.extra_ids],
    },
  };
}

/** Pins by part: `undefined` is free, `null` curry or subzi is locked empty, extras lock to their list. */
export function toPartPins(p: SlotPins, legacy: LegacyParts): PartPins {
  const pins: Record<number, readonly number[]> = {};
  if (p.base_id !== undefined) pins[legacy.base] = [p.base_id];
  if (p.curry_id !== undefined) pins[legacy.curry] = p.curry_id === null ? [] : [p.curry_id];
  if (p.subzi_id !== undefined) pins[legacy.subzi] = p.subzi_id === null ? [] : [p.subzi_id];
  if (p.extra_ids !== undefined) pins[legacy.extra] = [...p.extra_ids];
  return pins;
}

export function toWeekPartPins(p: LegacyPins, legacy: LegacyParts): WeekPartPins {
  const week: WeekPartPins = {};
  for (const key of Object.keys(p) as (keyof LegacyPins)[]) {
    const slot = p[key];
    if (slot) week[key] = toPartPins(slot, legacy);
  }
  return week;
}
