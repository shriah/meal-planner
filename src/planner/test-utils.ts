// Small builders shared by planner tests. Tests may name today's four parts (base, curry, subzi, extras):
// they are TEST_PARTS, the converted library's parts.
import type { CountConstraint } from './constraints';
import { is, type Matcher } from './matcher';
import type { ComponentLike, Day, Meal, PartSlot, PlannerPart, Pins, PlanState, Role, SlotState } from './types';

/** The four converted parts as the planner sees them, in meal order. */
export const TEST_PARTS: readonly PlannerPart[] = [
  { id: 1, name: 'Base', varied: true },
  { id: 2, name: 'Curry', varied: true },
  { id: 3, name: 'Subzi', varied: true },
  { id: 4, name: 'Extras', varied: false },
];
/** The TEST_PARTS id of each dish type. */
export const PART_OF_TYPE: Record<Role, number> = { base: 1, curry: 2, subzi: 3, extra: 4 };

/**
 * A dish of the TEST_PARTS part of `type`, where every valid plan places it: what a stored rule's `role` meant, as
 * `compileRules` rewrites it (`slot_part` is for built-ins only).
 */
export const placedIn = (type: Role): Matcher => is('part', PART_OF_TYPE[type]);

let nextId = 1;

export function component(componentType: Role, overrides: Partial<ComponentLike> = {}): ComponentLike {
  const id = overrides.id ?? nextId++;
  return {
    id,
    name: `${componentType} ${id}`,
    componentType,
    part_id: PART_OF_TYPE[componentType],
    dietary_tags: ['veg'],
    regional_tags: ['pan-indian'],
    occasion_tags: [],
    ...overrides,
  };
}

/**
 * "At most one Curry per meal" and "At most one Subzi per meal" as `compileRules` gives them to the planner (the
 * stored `capRules()`): a hard cap of 1 per meal on the Curry and Subzi parts. A model built by hand includes them
 * where a library would.
 */
export function capConstraints(parts: readonly PlannerPart[] = TEST_PARTS): CountConstraint[] {
  return ['Curry', 'Subzi'].map((name) => {
    const part = parts.find((p) => p.name === name);
    if (!part) throw new Error(`no ${name} part`);
    return {
      kind: 'count', id: `cap:${name.toLowerCase()}`, label: `At most one ${name} per meal`, origin: 'rule', level: 'rule',
      select: { field: 'part', op: 'eq', value: part.id }, groupBy: 'slot', bounds: { hardMax: 1 },
    };
  });
}

/** A meal in today's terms, for tests over TEST_PARTS. */
export interface LegacyMeal { base?: number; curry?: number; subzi?: number; extras: number[] }

/** A TEST_PARTS meal from today's terms. */
export const slotOf = (s: Partial<LegacyMeal>): SlotState => ({
  parts: [s.base, s.curry, s.subzi].map((id) => (id === undefined ? [] : [id])).concat([[...(s.extras ?? [])]]),
});

/** A TEST_PARTS meal in today's terms (every key present). */
export const legacyOf = (s: SlotState): LegacyMeal => {
  if (s.parts.length !== 4 || s.parts.slice(0, 3).some((d) => d.length > 1)) throw new Error(`not a TEST_PARTS meal: ${JSON.stringify(s)}`);
  return { base: s.parts[0][0], curry: s.parts[1][0], subzi: s.parts[2][0], extras: s.parts[3] };
};

/** A week of TEST_PARTS meals from today's terms; meals not given are empty. */
export const planOf = (meals: Partial<LegacyMeal>[] = []): PlanState =>
  Array.from({ length: 21 }, (_, i) => slotOf(meals[i] ?? {}));

/** Locked values of one meal in today's terms: `null` holds a curry or subzi empty. */
export interface LegacySlotPins { base_id?: number; curry_id?: number | null; subzi_id?: number | null; extra_ids?: number[] }
export type LegacyPins = Partial<Record<`${Day}-${Meal}`, LegacySlotPins>>;

/** TEST_PARTS pins from pins in today's terms. */
export function partPinsOf(pins: LegacyPins): Pins {
  const out: Pins = {};
  for (const [key, p] of Object.entries(pins) as [keyof LegacyPins, LegacySlotPins][]) {
    const part: Record<number, readonly number[]> = {};
    if (p.base_id !== undefined) part[1] = [p.base_id];
    if (p.curry_id !== undefined) part[2] = p.curry_id === null ? [] : [p.curry_id];
    if (p.subzi_id !== undefined) part[3] = p.subzi_id === null ? [] : [p.subzi_id];
    if (p.extra_ids !== undefined) part[4] = [...p.extra_ids];
    out[key] = part;
  }
  return out;
}

/** A planned TEST_PARTS meal in today's stored terms. */
export interface LegacySlot { day: Day; meal_slot: Meal; base_id: number; curry_id?: number; subzi_id?: number; extra_ids: number[] }

/** A planned TEST_PARTS meal (`planWeek`'s) in today's stored terms. */
export function legacySlot(s: PartSlot): LegacySlot {
  const one = (id: number) => {
    const d = s.parts[id] ?? [];
    if (d.length > 1) throw new Error(`part ${id} holds ${d.length} dishes`);
    return d[0];
  };
  const curry = one(2);
  const subzi = one(3);
  return {
    day: s.day, meal_slot: s.meal_slot, base_id: one(1),
    ...(curry !== undefined && { curry_id: curry }), ...(subzi !== undefined && { subzi_id: subzi }), extra_ids: [...(s.parts[4] ?? [])],
  };
}
