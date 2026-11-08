import { describe, expect, it } from 'vitest';
import type { Constraint, CountConstraint, PairConstraint, PreferConstraint } from './constraints';
import { all, is } from './matcher';
import { bringsWith, compareScore, compileModel, explain, score, slotPairs, UNKNOWN_COMPONENT } from './scorer';
import { component } from './test-utils';
import { emptyPlan, slotIndex, type Day, type Meal, type PlanState, type SlotState } from './types';

const rice = component('base', { id: 1, name: 'Rice' });
const dal = component('curry', { id: 2, name: 'Dal', protein_tag: 'dal' });
const fish = component('curry', { id: 3, name: 'Fish Curry', protein_tag: 'fish', dietary_tags: ['non-veg'] });
const raita = component('extra', { id: 4, name: 'Raita' });
const library = [rice, dal, fish, raita];

const count = (c: Partial<CountConstraint>): CountConstraint => ({
  kind: 'count', id: 'c', label: 'Rule', origin: 'rule', select: is('role', 'curry'), groupBy: 'slot', bounds: { hardMax: 99 }, ...c,
});
const planWith = (entries: [Day, Meal, Partial<SlotState>][]): PlanState => {
  const p = emptyPlan();
  for (const [d, m, s] of entries) p[slotIndex(d, m)] = { extras: [], ...s };
  return p;
};
const run = (constraints: Constraint[], plan: PlanState) => score(compileModel(library, constraints), plan, true);

describe('scorer', () => {
  it('counts per slot and justifies the violating slot', () => {
    const r = run(
      [count({ id: 'no-fish', label: 'No fish', select: is('protein_tag', 'fish'), bounds: { hardMax: 0 } })],
      planWith([['friday', 'lunch', { base: 1, curry: 3 }], ['monday', 'lunch', { base: 1, curry: 2 }]]),
    );
    expect(r.hard).toBe(1);
    expect(r.justifications).toHaveLength(1);
    expect(r.justifications[0]).toMatchObject({ constraintId: 'no-fish', level: 'hard', actual: 1, group: { day: 'friday', meal: 'lunch' } });
    expect(explain(r.justifications[0])).toBe('No fish: on Friday lunch has 1, must be at most 0');
  });

  it('applies minimum bounds to empty groups too (weekly minimum)', () => {
    const r = run([count({ select: is('protein_tag', 'dal'), groupBy: 'plan', bounds: { hardMin: 2 } })], planWith([['monday', 'lunch', { base: 1, curry: 2 }]]));
    expect(r.hard).toBe(1);
    expect(r.justifications[0]).toMatchObject({ actual: 1, bound: { kind: 'hardMin', value: 2 }, units: 1 });
  });

  it('counts per component inside sliding windows', () => {
    const spacing = count({ groupBy: ['component', { days: 3 }], bounds: { hardMax: 1 } });
    const close = run([spacing], planWith([['monday', 'lunch', { base: 1, curry: 2 }], ['wednesday', 'lunch', { base: 1, curry: 2 }]]));
    const apart = run([spacing], planWith([['monday', 'lunch', { base: 1, curry: 2 }], ['thursday', 'lunch', { base: 1, curry: 2 }]]));
    expect(close.hard).toBe(1);
    expect(close.justifications[0].group).toEqual({ window: ['monday', 'wednesday'], componentId: 2 });
    expect(apart.hard).toBe(0);
  });

  it('evaluates a group only when its trigger exists in the same time group', () => {
    const needRaitaWithFish = count({
      select: is('role', 'extra'), groupBy: 'slot', when: { exists: is('protein_tag', 'fish') }, bounds: { hardMin: 1 },
    });
    const r = run([needRaitaWithFish], planWith([
      ['friday', 'lunch', { base: 1, curry: 3 }],
      ['friday', 'dinner', { base: 1, curry: 3, extras: [4] }],
      ['monday', 'lunch', { base: 1, curry: 2 }],
    ]));
    expect(r.hard).toBe(1);
    expect(r.justifications[0].group).toEqual({ day: 'friday', meal: 'lunch' });
  });

  it('only evaluates scoped groups', () => {
    const fridayLunchNeedsFish = count({ select: is('protein_tag', 'fish'), scope: { days: ['friday'], meals: ['lunch'] }, bounds: { hardMin: 1 } });
    const r = run([fridayLunchNeedsFish], planWith([['friday', 'lunch', { base: 1, curry: 2 }]]));
    expect(r.hard).toBe(1);
    expect(r.justifications[0].group).toEqual({ day: 'friday', meal: 'lunch' });
  });

  it('charges soft costs outside soft bounds and applies severity to hard units', () => {
    const r = run([
      count({ id: 'soft', select: all(is('role', 'curry'), is('protein_tag', 'dal')), groupBy: 'plan', bounds: { softMax: 0 }, costs: { max: 5 } }),
      count({ id: 'hard', select: is('protein_tag', 'dal'), groupBy: 'plan', bounds: { hardMax: 0 }, severity: 4 }),
      { kind: 'prefer', id: 'p', label: 'Extras cost', origin: 'rule', select: is('role', 'extra'), weight: 2 },
    ], planWith([['monday', 'lunch', { base: 1, curry: 2, extras: [4] }]]));
    expect(r).toMatchObject({ hard: 4, soft: 5 + 2 });
  });

  it('reports plan entries whose component no longer exists', () => {
    const r = run([], planWith([['monday', 'lunch', { base: 999 }]]));
    expect(r.hard).toBe(1);
    expect(r.justifications[0]).toMatchObject({ constraintId: UNKNOWN_COMPONENT, group: { componentId: 999 } });
  });

  it('orders scores lexicographically: any hard violation outweighs any soft cost', () => {
    expect(compareScore({ hard: 0, soft: 1e9 }, { hard: 1, soft: -1e9 })).toBeLessThan(0);
    expect(compareScore({ hard: 1, soft: 1 }, { hard: 1, soft: 2 })).toBeLessThan(0);
  });

  it('gives the same result when the same model scores again (no stale state)', () => {
    const m = compileModel(library, [count({ groupBy: 'component', bounds: { hardMax: 1 } })]);
    const repeated = planWith([['monday', 'lunch', { base: 1, curry: 2 }], ['tuesday', 'lunch', { base: 1, curry: 2 }]]);
    const once = planWith([['monday', 'lunch', { base: 1, curry: 2 }]]);
    expect(score(m, repeated).hard).toBe(1);
    expect(score(m, once).hard).toBe(0);
    expect(score(m, repeated).hard).toBe(1);
  });
});

describe('pairings', () => {
  const pongal = component('base', { id: 1, name: 'Pongal' });
  const sambar = component('curry', { id: 2, name: 'Sambar' });
  const rasam = component('curry', { id: 5, name: 'Rasam' });
  const chutney = component('extra', { id: 4, name: 'Chutney' });
  const idli = component('base', { id: 6, name: 'Idli' });
  const lib = [pongal, sambar, rasam, chutney, idli];

  const pair = (component: number, p: Partial<PairConstraint> = {}): PairConstraint => ({
    kind: 'pair', id: `pair-${component}`, label: 'Served with', origin: 'rule', when: is('id', 1), component, strength: 'must', ...p,
  });
  const prefer = (p: Partial<PreferConstraint>): PreferConstraint => ({
    kind: 'prefer', id: 'p', label: 'Sides cost', origin: 'rule', select: is('role', 'curry'), weight: 2, ...p,
  });
  const sambarPair = pair(2);
  const chutneyPair = pair(4);
  const units = [sambarPair, chutneyPair];
  const at = (meal: Meal, s: Partial<SlotState>, day: Day = 'monday') => planWith([[day, meal, s]]);
  const runLib = (constraints: Constraint[], plan: PlanState) => score(compileModel(lib, constraints), plan, true);
  const breakfastOnlySambar = (p: Partial<CountConstraint> = {}) =>
    count({ id: 'sambar-meals', select: is('id', 2), scope: { meals: ['lunch', 'dinner'] }, bounds: { hardMax: 0 }, ...p });

  it('a base alone breaks each of its must pairings', () => {
    const r = runLib(units, at('breakfast', { base: 1 }));
    expect(r.hard).toBe(2);
    const mins = r.justifications.filter((j) => j.bound.kind === 'hardMin');
    expect(mins.map((j) => j.group.componentId).sort()).toEqual([2, 4]);
    expect(mins[0].group).toMatchObject({ day: 'monday', meal: 'breakfast' });
  });

  it('a base with its sides holds', () => {
    expect(runLib(units, at('breakfast', { base: 1, curry: 2, extras: [4] })).hard).toBe(0);
  });

  it("a unit member skips the side's own rules that give way", () => {
    const meal = at('lunch', { base: 1, curry: 2, extras: [4] });
    expect(runLib([...units, breakfastOnlySambar({ yieldsTo: 'unit', owner: 2 })], meal).hard).toBe(0);
    expect(runLib([...units, breakfastOnlySambar()], meal).hard).toBe(1);
  });

  it("a free pick still follows the side's own rules", () => {
    expect(runLib([...units, breakfastOnlySambar({ yieldsTo: 'unit', owner: 2 })], at('lunch', { base: 6, curry: 2 })).hard).toBe(1);
  });

  it("a prefer that gives way to asked sides skips a side a prefer pair asks for", () => {
    const m = compileModel(lib, [pair(2, { strength: 'prefer' }), prefer({ yieldsTo: 'ask' })]);
    expect(score(m, at('lunch', { base: 1, curry: 2 })).soft).toBe(0);
    expect(score(m, at('lunch', { base: 6, curry: 5 })).soft).toBe(2);
  });

  it('a prefer that gives way to units still charges a side only asked for', () => {
    const m = compileModel(lib, [pair(2, { strength: 'prefer' }), prefer({ yieldsTo: 'unit' })]);
    expect(score(m, at('lunch', { base: 1, curry: 2 })).soft).toBe(2);
  });

  it('a missing prefer pair costs its cost, 10 by default', () => {
    expect(runLib([pair(2, { strength: 'prefer' })], at('lunch', { base: 1 })).soft).toBe(10);
    const r = runLib([pair(2, { strength: 'prefer', cost: 3 })], at('lunch', { base: 1 }));
    expect(r).toMatchObject({ hard: 0, soft: 3 });
    expect(r.justifications[0]).toMatchObject({ level: 'soft', cost: 3, group: { day: 'monday', meal: 'lunch', componentId: 2 } });
  });

  it("a unit member does not trigger its base's own rules", () => {
    const neverWithSambar = count({ select: is('id', 1), when: { exists: is('id', 2) }, bounds: { hardMax: 0 }, owner: 1, yieldsTo: 'unit' });
    expect(runLib([...units, neverWithSambar], at('lunch', { base: 1, curry: 2, extras: [4] })).hard).toBe(0);
  });

  it("a unit member still triggers another dish's rules, and that dish gives way", () => {
    const chutneyNeverWithSambar = count({ select: is('id', 4), when: { exists: is('id', 2) }, bounds: { hardMax: 0 }, owner: 4, yieldsTo: 'unit' });
    expect(runLib([sambarPair, chutneyNeverWithSambar], at('lunch', { base: 1, curry: 2, extras: [4] })).hard).toBe(1);
  });

  it('a second must curry for the same base is suppressed, not enforced', () => {
    const rasamPair = pair(5);
    const m = compileModel(lib, [sambarPair, rasamPair, chutneyPair]);
    const plan = at('lunch', { base: 1, curry: 2, extras: [4] });
    const slot = slotIndex('monday', 'lunch');
    const r = score(m, plan, true);
    expect(r.hard).toBe(0);
    const soft = r.justifications.filter((j) => j.level === 'soft');
    expect(soft).toHaveLength(1);
    expect(soft[0]).toMatchObject({ cost: 0, group: { componentId: 5 } });
    expect(slotPairs(m, plan, slot)).toEqual([
      { component: 2, by: 1, unit: true },
      { component: 5, by: 1, unit: false, suppressed: true },
      { component: 4, by: 1, unit: true },
    ]);
    expect(bringsWith(m, 1, 'base', slot).unit).toEqual([2, 4]);
  });

  it('a prefer curry that cannot fit beside a must curry is suppressed, in either order', () => {
    const rasamPrefer = pair(5, { strength: 'prefer' });
    const meal = at('lunch', { base: 1, curry: 2 });
    const slot = slotIndex('monday', 'lunch');
    for (const constraints of [[sambarPair, rasamPrefer], [rasamPrefer, sambarPair]]) {
      const m = compileModel(lib, constraints);
      const r = score(m, meal, true);
      expect(r).toMatchObject({ hard: 0, soft: 0 });
      expect(r.justifications).toEqual([expect.objectContaining({ cost: 0, group: expect.objectContaining({ componentId: 5 }) })]);
      expect(bringsWith(m, 1, 'base', slot)).toEqual({ unit: [2], asked: [2] });
      expect(slotPairs(m, meal, slot)).toContainEqual({ component: 5, by: 1, unit: false, suppressed: true });
    }
  });

  it('of two prefer curries for one base, the first claims the role', () => {
    const m = compileModel(lib, [pair(2, { strength: 'prefer' }), pair(5, { strength: 'prefer' })]);
    expect(score(m, at('lunch', { base: 1, curry: 2 }))).toMatchObject({ hard: 0, soft: 0 });
  });

  it("a prefer pair from another dish gives way when a unit member holds its role", () => {
    const chutneyAsksRasam = pair(5, { id: 'chutney-rasam', when: is('id', 4), strength: 'prefer' });
    const r = runLib([...units, chutneyAsksRasam], at('lunch', { base: 1, curry: 2, extras: [4] }));
    expect(r).toMatchObject({ hard: 0, soft: 0 });
  });

  it("a must pair from another dish is suppressed when a unit member holds its role", () => {
    const chutneyNeedsRasam = pair(5, { id: 'chutney-rasam', when: is('id', 4) });
    const r = runLib([...units, chutneyNeedsRasam], at('lunch', { base: 1, curry: 2, extras: [4] }));
    expect(r).toMatchObject({ hard: 0, soft: 0 });
    expect(r.justifications).toEqual([expect.objectContaining({ level: 'soft', cost: 0, group: expect.objectContaining({ componentId: 5 }) })]);
  });

  it('a pair is still enforced when only a free pick holds its role', () => {
    const chutneyNeedsRasam = pair(5, { id: 'chutney-rasam', when: is('id', 4) });
    expect(runLib([chutneyNeedsRasam], at('lunch', { base: 6, curry: 2, extras: [4] })).hard).toBe(1);
    const chutneyAsksRasam = pair(5, { id: 'chutney-rasam', when: is('id', 4), strength: 'prefer', cost: 3 });
    expect(runLib([chutneyAsksRasam], at('lunch', { base: 6, curry: 2, extras: [4] })).soft).toBe(3);
  });

  it('a scoped pair is triggered only in its scope', () => {
    const m = compileModel(lib, [pair(2, { scope: { meals: ['breakfast'] } })]);
    const lunch = at('lunch', { base: 1 });
    expect(score(m, lunch).hard).toBe(0);
    expect(slotPairs(m, lunch, slotIndex('monday', 'lunch'))).toEqual([]);
    expect(score(m, at('breakfast', { base: 1 })).hard).toBe(1);
  });

  it('a pair does not trigger itself', () => {
    const m = compileModel(lib, [pair(2, { when: is('role', 'curry') })]);
    const plan = at('lunch', { base: 6, curry: 2 });
    expect(score(m, plan).hard).toBe(0);
    expect(slotPairs(m, plan, slotIndex('monday', 'lunch'))).toEqual([]);
    expect(bringsWith(m, 2, 'curry', slotIndex('monday', 'lunch'))).toEqual({ unit: [], asked: [] });
  });

  it('scoring again gives the same result (no stale unit state)', () => {
    const m = compileModel(lib, [...units, breakfastOnlySambar({ yieldsTo: 'unit', owner: 2 })]);
    const unit = at('lunch', { base: 1, curry: 2, extras: [4] });
    const free = at('lunch', { base: 6, curry: 2 });
    expect(score(m, unit).hard).toBe(0);
    expect(score(m, free).hard).toBe(1);
    expect(score(m, unit).hard).toBe(0);
  });
});
