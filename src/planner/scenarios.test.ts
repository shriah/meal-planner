// Regression suite on the real seed library: rule shapes the planner must satisfy.
// Iteration budgets (not wall-clock) keep results deterministic regardless of machine load.
import { describe, expect, it } from 'vitest';
import { materializePooriSeed, materializeSeedComponents, type SeedCategoryLookup } from '@/db/seed-data';
import type { CountConstraint } from './constraints';
import { all, is, not, oneOf } from './matcher';
import { planWeek, type PlanResult, type PlanSlotLike } from './plan';
import { explain } from './scorer';
import type { ComponentLike, Pins } from './types';

const CAT = {
  base: { 'rice-based': 1, 'bread-based': 2, other: 3 },
  extra: { liquid: 11, crunchy: 12, condiment: 13, dairy: 14, sweet: 15 },
} satisfies SeedCategoryLookup;

const library: ComponentLike[] = [...materializeSeedComponents(CAT), materializePooriSeed(CAT)].map((c, i) => ({
  ...c,
  id: 100 + i,
  frequency: i % 7 === 0 ? 'frequent' : i % 11 === 0 ? 'rare' : 'normal',
}));
const byName = (name: string) => {
  const c = library.find((x) => x.name === name);
  if (!c) throw new Error(`no seed component "${name}"`);
  return c;
};
const nameOf = (id: number) => library.find((c) => c.id === id)?.name;

const SEEDS = [1, 2, 3, 4, 5];
const BUDGET = { timeLimitMs: Infinity, maxIterations: 40_000, plateauIterations: 4000 };
const rule = (c: Omit<CountConstraint, 'kind' | 'origin'>): CountConstraint => ({ kind: 'count', origin: 'rule', ...c });
const run = (constraints: CountConstraint[], seed: number, pins?: Pins) =>
  planWeek({ library, constraints }, { ...BUDGET, seed, pins });
const hardOf = (r: PlanResult) => r.justifications.filter((j) => j.level === 'hard').map((j) => explain(j, { component: nameOf }));
const ids = (r: PlanResult, pick: (s: PlanSlotLike) => (number | undefined)[]) => r.slots.flatMap(pick).filter((x): x is number => x !== undefined);

describe('planner scenarios (seed library)', () => {
  it.each(SEEDS)('built-ins alone: every meal is filled and no hard rule breaks (seed %i)', (seed) => {
    const r = run([], seed);
    expect(hardOf(r)).toEqual([]);
    expect(r.slots).toHaveLength(21);
  });

  it.each(SEEDS)('weekly minimum: at least 6 dal curries (seed %i)', (seed) => {
    const r = run([rule({ id: 'dal-6', label: 'Dal curries this week', select: all(is('role', 'curry'), is('protein_tag', 'dal')), groupBy: 'plan', bounds: { hardMin: 6 } })], seed);
    expect(hardOf(r)).toEqual([]);
    const dal = new Set(library.filter((c) => c.protein_tag === 'dal').map((c) => c.id));
    expect(ids(r, (s) => [s.curry_id]).filter((id) => dal.has(id)).length).toBeGreaterThanOrEqual(6);
  });

  it.each(SEEDS)('a later role constrains an earlier one: Chicken Curry needs a rice base (seed %i)', (seed) => {
    const chicken = byName('Chicken Curry').id;
    const r = run([
      rule({ id: 'chicken-rice', label: 'Chicken Curry needs a rice base', select: all(is('role', 'base'), is('base_category_id', CAT.base['rice-based'])), groupBy: 'slot', when: { exists: is('id', chicken) }, bounds: { hardMin: 1 } }),
      rule({ id: 'chicken-twice', label: 'Chicken Curry twice', select: is('id', chicken), groupBy: 'plan', bounds: { hardMin: 2 } }),
    ], seed);
    expect(hardOf(r)).toEqual([]);
    for (const s of r.slots.filter((x) => x.curry_id === chicken)) {
      expect(library.find((c) => c.id === s.base_id)?.base_category_id).toBe(CAT.base['rice-based']);
    }
  });

  it.each(SEEDS)('spacing: the same curry never within 3 days (seed %i)', (seed) => {
    const r = run([rule({ id: 'spacing', label: 'Same curry within 3 days', select: is('role', 'curry'), groupBy: ['component', { days: 3 }], bounds: { hardMax: 1 } })], seed);
    expect(hardOf(r)).toEqual([]);
  });

  it.each(SEEDS)('cap: at most 2 non-veg dishes per week (seed %i)', (seed) => {
    const r = run([rule({ id: 'nonveg', label: 'Non-veg this week', select: is('dietary_tags', 'non-veg'), groupBy: 'plan', bounds: { hardMax: 2 } })], seed);
    expect(hardOf(r)).toEqual([]);
  });

  it.each(SEEDS)('composition: exclude, allowed meals, require-with and a lock together (seed %i)', (seed) => {
    const idli = byName('Idli').id;
    const r = run([
      rule({ id: 'no-fish', label: 'No fish', select: is('protein_tag', 'fish'), groupBy: 'slot', bounds: { hardMax: 0 } }),
      rule({ id: 'idli-breakfast', label: 'Idli only at breakfast', select: all(is('id', idli), oneOf('meal', ['lunch', 'dinner'])), groupBy: 'slot', bounds: { hardMax: 0 } }),
      rule({ id: 'rice-liquid', label: 'Rice meals need a liquid extra', select: all(is('role', 'extra'), is('extra_category_id', CAT.extra.liquid)), groupBy: 'slot', when: { exists: all(is('role', 'base'), is('base_category_id', CAT.base['rice-based'])) }, bounds: { hardMin: 1 } }),
    ], seed, { 'monday-breakfast': { base_id: idli } });
    expect(hardOf(r)).toEqual([]);
    expect(r.slots.find((s) => s.day === 'monday' && s.meal_slot === 'breakfast')?.base_id).toBe(idli);
  });

  it('conflicting rules: returns the best plan and names exactly the rule it had to break', () => {
    const r = run([
      rule({ id: 'fish-friday', label: 'Fish on Friday lunch', select: is('protein_tag', 'fish'), groupBy: 'slot', scope: { days: ['friday'], meals: ['lunch'] }, bounds: { hardMin: 1 } }),
      rule({ id: 'no-nonveg', label: 'No non-veg', select: is('dietary_tags', 'non-veg'), groupBy: 'slot', bounds: { hardMax: 0 } }),
    ], 1);
    expect(r.score.hard).toBe(1);
    expect(hardOf(r)).toHaveLength(1);
    expect(hardOf(r)[0]).toMatch(/^(Fish on Friday lunch|No non-veg): on Friday lunch has/);
  });

  it.each(SEEDS)('variety under the seeded meal windows: no dish on the same or next day, every meal has a curry (seed %i)', (seed) => {
    const notAt = (id: string, select: CountConstraint['select'], meals: ('breakfast' | 'lunch' | 'dinner')[]) =>
      rule({ id, label: id, select: all(select, not(oneOf('meal', meals))), groupBy: 'slot', bounds: { hardMax: 0 } });
    const r = run([
      notAt('other', is('base_category_id', CAT.base.other), ['breakfast', 'dinner']),
      notAt('rice', is('base_category_id', CAT.base['rice-based']), ['lunch']),
      notAt('bread', is('base_category_id', CAT.base['bread-based']), ['dinner']),
    ], seed);
    expect(hardOf(r)).toEqual([]);
    expect(r.slots.every((s) => s.curry_id !== undefined)).toBe(true);
    const daysUsed = new Map<number, number[]>();
    for (const s of r.slots) {
      const day = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].indexOf(s.day);
      for (const id of [s.base_id, s.curry_id, s.subzi_id]) if (id !== undefined) daysUsed.set(id, [...(daysUsed.get(id) ?? []), day]);
    }
    for (const [id, days] of daysUsed) {
      days.forEach((d, i) => { if (i > 0) expect(d - days[i - 1], `${nameOf(id)} on days ${days}`).toBeGreaterThan(1); });
    }
  });

  it('produces different plans for different seeds', () => {
    const plans = SEEDS.map((seed) => JSON.stringify(run([], seed).slots));
    expect(new Set(plans).size).toBe(SEEDS.length);
  });
});
