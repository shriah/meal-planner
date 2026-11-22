import { describe, expect, it } from 'vitest';
import type { Constraint, CountConstraint, PairConstraint, PreferConstraint } from './constraints';
import { all, is, oneOf, type Matcher } from './matcher';
import { bringsWith, capped, compareScore, compileModel as compileBare, explain, freePickLimited, mealBrings, mealHasConditional, score, slotPairs, UNKNOWN_COMPONENT } from './scorer';
import { capConstraints, component } from './test-utils';
import { emptyPlan, slotIndex, type Day, type Meal, type PlanState, type SlotState } from './types';

// Every model here is built as a library's would be: with its stored curry and subzi caps after the other constraints.
const compileModel = (library: Parameters<typeof compileBare>[0], constraints: readonly Constraint[]) =>
  compileBare(library, [...constraints, ...capConstraints()]);

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
    kind: 'pair', id: `pair-${component}`, label: 'Served with', origin: 'rule', when: is('id', 1), of: is('id', component), strength: 'must', ...p,
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
    expect(runLib([...units, breakfastOnlySambar({ level: 'dish', owner: 2 })], meal).hard).toBe(0);
    expect(runLib([...units, breakfastOnlySambar()], meal).hard).toBe(1);
  });

  it("a free pick still follows the side's own rules", () => {
    expect(runLib([...units, breakfastOnlySambar({ level: 'dish', owner: 2 })], at('lunch', { base: 6, curry: 2 })).hard).toBe(1);
  });

  it("a prefer that gives way to asked sides skips a side a prefer pair asks for", () => {
    const m = compileModel(lib, [pair(2, { strength: 'prefer' }), prefer({ level: 'frequency' })]);
    expect(score(m, at('lunch', { base: 1, curry: 2 })).soft).toBe(0);
    expect(score(m, at('lunch', { base: 6, curry: 5 })).soft).toBe(2);
  });

  it('a free pick is charged the limits that give way to asked sides', () => {
    const sambarNever = count({ id: 'sambar-never', select: is('id', 2), bounds: { hardMax: 0 }, level: 'frequency' });
    const m = compileModel(lib, [pair(2, { strength: 'prefer' }), sambarNever]);
    const plan = at('lunch', { base: 1, curry: 2 });
    expect(score(m, plan).hard).toBe(0);
    expect(score(m, plan, false, { freePick: { id: 2 } }).hard).toBe(1);
  });

  it('a free pick can be charged only where a hard limit gives way to asked sides', () => {
    const limit = (p: Partial<CountConstraint>) => count({ id: 'sambar-limit', select: is('id', 2), groupBy: 'plan', ...p });
    expect(freePickLimited(compileModel(lib, [limit({ bounds: { hardMax: 1 }, level: 'frequency' })]), 2)).toBe(true);
    expect(freePickLimited(compileModel(lib, [limit({ bounds: { hardMax: 1 }, level: 'frequency' })]), 5)).toBe(false);
    expect(freePickLimited(compileModel(lib, [limit({ bounds: { softMax: 1 }, level: 'frequency' })]), 2)).toBe(false);
    expect(freePickLimited(compileModel(lib, [limit({ bounds: { hardMax: 1 }, level: 'dish' })]), 2)).toBe(false);
    expect(freePickLimited(compileModel(lib, [limit({ bounds: { hardMax: 1 } })]), 2)).toBe(false);
  });

  it("a free pick's weekly limit counts the dish's other brought meals", () => {
    const sambarOnce = count({ id: 'sambar-once', select: is('id', 2), groupBy: 'plan', bounds: { hardMax: 1 }, level: 'frequency' });
    const m = compileModel(lib, [pair(2, { strength: 'prefer' }), sambarOnce]);
    const plan = planWith([['monday', 'lunch', { base: 1, curry: 2 }], ['tuesday', 'lunch', { base: 1, curry: 2 }]]);
    expect(score(m, plan).hard).toBe(0);
    expect(score(m, plan, false, { freePick: { id: 2 } }).hard).toBe(1);
  });

  it('a prefer that gives way to units still charges a side only asked for', () => {
    const m = compileModel(lib, [pair(2, { strength: 'prefer' }), prefer({ level: 'dish' })]);
    expect(score(m, at('lunch', { base: 1, curry: 2 })).soft).toBe(2);
  });

  it('a missing prefer pair costs its cost, 10 by default', () => {
    expect(runLib([pair(2, { strength: 'prefer' })], at('lunch', { base: 1 })).soft).toBe(10);
    const r = runLib([pair(2, { strength: 'prefer', cost: 3 })], at('lunch', { base: 1 }));
    expect(r).toMatchObject({ hard: 0, soft: 3 });
    expect(r.justifications[0]).toMatchObject({ level: 'soft', cost: 3, group: { day: 'monday', meal: 'lunch', componentId: 2 } });
  });

  it("a unit member does not trigger its base's own rules", () => {
    const neverWithSambar = count({ select: is('id', 1), when: { exists: is('id', 2) }, bounds: { hardMax: 0 }, owner: 1, level: 'dish' });
    expect(runLib([...units, neverWithSambar], at('lunch', { base: 1, curry: 2, extras: [4] })).hard).toBe(0);
  });

  it("a unit member still triggers another dish's rules, and that dish gives way", () => {
    const chutneyNeverWithSambar = count({ select: is('id', 4), when: { exists: is('id', 2) }, bounds: { hardMax: 0 }, owner: 4, level: 'dish' });
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
    expect(soft[0]).toMatchObject({ cost: 0, group: { componentId: 5 }, suppressed: { by: 1, part: 2, heldBy: 2, heldMust: true, heldWith: 1 } });
    expect(slotPairs(m, plan, slot)).toEqual([
      { candidates: [2], component: 2, by: 1, unit: true },
      { candidates: [5], by: 1, unit: false, suppressed: true },
      { candidates: [4], component: 4, by: 1, unit: true },
    ]);
    expect(bringsWith(m, 1, 'base', slot).wants).toEqual([{ of: [2], unit: true }, { of: [4], unit: true }]);
  });

  it('two Always curries for one base are both kept without the curry cap, and the second gives way with it', () => {
    const plan = at('lunch', { base: 1, curry: 2 });
    const uncapped = score(compileBare(lib, [sambarPair, pair(5)]), plan, true);
    expect(uncapped.justifications.filter((j) => j.suppressed)).toEqual([]);
    expect(uncapped.justifications).toEqual([expect.objectContaining({ level: 'hard', group: expect.objectContaining({ componentId: 5 }) })]);
    const withCap = score(compileBare(lib, [sambarPair, pair(5), capConstraints()[0]]), plan, true);
    expect(withCap.hard).toBe(0);
    expect(withCap.justifications).toEqual([expect.objectContaining({ level: 'soft', cost: 0, suppressed: { by: 1, part: 2, heldBy: 2, heldMust: true, heldWith: 1 } })]);
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
      expect(bringsWith(m, 1, 'base', slot)).toEqual({ wants: [{ of: [2], unit: true }] });
      expect(slotPairs(m, meal, slot)).toContainEqual({ candidates: [5], by: 1, unit: false, suppressed: true });
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
    expect(r.justifications[0].suppressed).toEqual({ by: 4, part: 2, heldBy: 2, heldMust: true, heldWith: 1 });
  });

  it('a missing pair that is enforced carries no suppressed mark', () => {
    const r = runLib([pair(2, { strength: 'prefer' })], at('lunch', { base: 1 }));
    expect(r.justifications[0].suppressed).toBeUndefined();
  });

  it('a pair is still enforced when only a free pick holds its role', () => {
    const chutneyNeedsRasam = pair(5, { id: 'chutney-rasam', when: is('id', 4) });
    expect(runLib([chutneyNeedsRasam], at('lunch', { base: 6, curry: 2, extras: [4] })).hard).toBe(1);
    const chutneyAsksRasam = pair(5, { id: 'chutney-rasam', when: is('id', 4), strength: 'prefer', cost: 3 });
    expect(runLib([chutneyAsksRasam], at('lunch', { base: 6, curry: 2, extras: [4] })).soft).toBe(3);
  });

  it("a prefer pair gives way where the side's own rules forbid it, and is not brought there", () => {
    const sambarNever = count({ id: 'sambar-never', select: is('id', 2), bounds: { hardMax: 0 }, owner: 2, level: 'dish' });
    const m = compileModel(lib, [pair(2, { strength: 'prefer' }), sambarNever, breakfastOnlySambar({ owner: 2, level: 'dish' })]);
    const slot = slotIndex('monday', 'lunch');
    expect(score(m, at('lunch', { base: 1 }))).toMatchObject({ hard: 0, soft: 0 });
    expect(bringsWith(m, 1, 'base', slot)).toEqual({ wants: [] });
    expect(slotPairs(m, at('lunch', { base: 1 }), slot)).toEqual([]);
  });

  it("a prefer pair gives way only in the slots where the side's own rule forbids it", () => {
    const m = compileModel(lib, [pair(2, { strength: 'prefer' }), breakfastOnlySambar({ owner: 2, level: 'dish' })]);
    expect(score(m, at('lunch', { base: 1 })).soft).toBe(0);
    expect(score(m, at('breakfast', { base: 1 })).soft).toBe(10);
    expect(bringsWith(m, 1, 'base', slotIndex('monday', 'breakfast')).wants).toEqual([{ of: [2], unit: false }]);
  });

  it('a prefer pair still asks for a side forbidden only by a rule it does not own, or one with a trigger', () => {
    const notOwned = count({ id: 'no-sambar', select: is('id', 2), bounds: { hardMax: 0 } });
    const withTrigger = count({ id: 'sambar-not-with-raita', select: is('id', 2), when: { exists: is('id', 4) }, bounds: { hardMax: 0 }, owner: 2, level: 'dish' });
    for (const c of [notOwned, withTrigger]) {
      expect(score(compileModel(lib, [pair(2, { strength: 'prefer' }), c]), at('lunch', { base: 1 })).soft).toBe(10);
    }
  });

  it("a must pair is enforced even where the side's own rules forbid it", () => {
    const sambarNever = count({ id: 'sambar-never', select: is('id', 2), bounds: { hardMax: 0 }, owner: 2, level: 'dish' });
    const m = compileModel(lib, [sambarPair, sambarNever]);
    expect(score(m, at('lunch', { base: 1 })).hard).toBe(1);
    expect(score(m, at('lunch', { base: 1, curry: 2 })).hard).toBe(0);
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
    expect(bringsWith(m, 2, 'curry', slotIndex('monday', 'lunch'))).toEqual({ wants: [] });
  });

  it('scoring again gives the same result (no stale unit state)', () => {
    const m = compileModel(lib, [...units, breakfastOnlySambar({ level: 'dish', owner: 2 })]);
    const unit = at('lunch', { base: 1, curry: 2, extras: [4] });
    const free = at('lunch', { base: 6, curry: 2 });
    expect(score(m, unit).hard).toBe(0);
    expect(score(m, free).hard).toBe(1);
    expect(score(m, unit).hard).toBe(0);
  });
});

describe('parts that hold one dish', () => {
  const cap = (c: Partial<CountConstraint> = {}): CountConstraint => ({
    kind: 'count', id: 'cap', label: 'At most one', origin: 'rule', select: is('part', 2), groupBy: 'slot', bounds: { hardMax: 1 }, ...c,
  });
  const cappedBy = (...constraints: Constraint[]) => [...capped(compileBare(library, constraints))];

  it('are the parts with a hard cap of 1 per meal', () => {
    expect(cappedBy(...capConstraints())).toEqual([2, 3]);
    expect(cappedBy(cap())).toEqual([2]);
    expect(cappedBy(cap({ select: all(is('part', 2)) }))).toEqual([2]);
    expect(cappedBy(cap({ select: oneOf('part', [3]) }))).toEqual([3]);
    expect(cappedBy(cap({ select: all(oneOf('part', [3])) }))).toEqual([3]);
    expect(cappedBy()).toEqual([]);
  });

  it('are not capped by a cap that is scoped, conditional, soft, above 1, over days or over other dishes', () => {
    expect(cappedBy(
      cap({ scope: { meals: ['lunch'] } }),
      cap({ when: { exists: is('id', 1) } }),
      cap({ bounds: { softMax: 1 } }),
      cap({ bounds: { hardMax: 2 } }),
      cap({ groupBy: 'day' }),
      cap({ select: oneOf('part', [2, 3]) }),
      cap({ select: all(is('part', 2), is('id', 2)) }),
      cap({ select: { not: is('part', 2) } }),
      cap({ select: { field: 'part', op: 'neq', value: 2 } as Matcher }),
      cap({ select: is('role', 'curry') }),
    )).toEqual([]);
  });
});

describe('pairs naming several candidates', () => {
  const lib = [component('base', { id: 1 }), ...[11, 12, 13].map((id) => component('curry', { id }))];
  const pair = (of: number[], p: Partial<PairConstraint> = {}): PairConstraint => ({
    kind: 'pair', id: `pair-${of.join('-')}`, label: 'Served with', origin: 'rule', when: is('id', 1), of: oneOf('id', of), strength: 'must', ...p,
  });
  const lunch = (s: Partial<SlotState>) => planWith([['monday', 'lunch', s]]);
  const runLib = (constraints: Constraint[], plan: PlanState) => score(compileModel(lib, constraints), plan, true);

  it('a pair of two candidates is met by either', () => {
    expect(runLib([pair([11, 12])], lunch({ base: 1, curry: 12 })).hard).toBe(0);
    expect(runLib([pair([11, 12])], lunch({ base: 1, curry: 11 })).hard).toBe(0);
    const r = runLib([pair([11, 12])], lunch({ base: 1 }));
    expect(r.hard).toBe(1);
    expect(r.justifications[0]).toMatchObject({ group: { componentId: 11 }, candidates: [11, 12] });
  });

  it('two pairs claiming the curry role are suppressed only when they share no candidate', () => {
    expect(runLib([pair([11, 12]), pair([12, 13])], lunch({ base: 1, curry: 12 })).hard).toBe(0);
    // Sharing 12, neither gives way to the other: curry 11 leaves the second unmet.
    expect(runLib([pair([11, 12]), pair([12, 13])], lunch({ base: 1, curry: 11 })).hard).toBe(1);
    const r = runLib([pair([11]), pair([13])], lunch({ base: 1, curry: 11 }));
    expect(r.hard).toBe(0);
    expect(r.justifications).toHaveLength(1);
    expect(r.justifications[0].group.componentId).toBe(13);
    expect(r.justifications[0].suppressed?.by).toBe(1);
    expect(r.justifications[0]).not.toHaveProperty('candidates');
  });

  it('a pair with no candidate in the library is ignored', () => {
    const m = compileModel(lib, [{ ...pair([]), of: is('id', 99) }]);
    expect(score(m, lunch({ base: 1 }))).toMatchObject({ hard: 0, soft: 0 });
    expect(bringsWith(m, 1, 'base', 0)).toEqual({ wants: [] });
  });

  it('bringsWith lists the candidates of each want', () => {
    expect(bringsWith(compileModel(lib, [pair([12, 11])]), 1, 'base', 0)).toEqual({ wants: [{ of: [11, 12], unit: true }] });
  });

  it('slotPairs names the candidate present', () => {
    const m = compileModel(lib, [pair([11, 12])]);
    const slot = slotIndex('monday', 'lunch');
    expect(slotPairs(m, lunch({ base: 1, curry: 12 }), slot)).toEqual([{ candidates: [11, 12], component: 12, by: 1, unit: true }]);
    expect(slotPairs(m, lunch({ base: 1 }), slot)).toEqual([{ candidates: [11, 12], by: 1, unit: true }]);
  });

  it('a candidate does not trigger its own pair', () => {
    const m = compileModel(lib, [pair([11, 12], { when: is('role', 'curry') })]);
    expect(score(m, lunch({ base: 1, curry: 11 })).hard).toBe(0);
    expect(score(m, lunch({ base: 1, curry: 13 })).hard).toBe(1);
  });
});

describe('pairs that wait for a curry or subzi in the meal', () => {
  const rice = component('base', { id: 1, name: 'Rice' });
  const sambar = component('curry', { id: 2, name: 'Sambar' });
  const rasam = component('curry', { id: 3, name: 'Rasam' });
  const beans = component('subzi', { id: 4, name: 'Beans Poriyal' });
  const aloo = component('subzi', { id: 5, name: 'Aloo Gobi' });
  const papad = component('extra', { id: 6, name: 'Papad' });
  const lib = [rice, sambar, rasam, beans, aloo, papad];
  const pair = (of: number, p: Partial<PairConstraint> = {}): PairConstraint => ({
    kind: 'pair', id: `pair-${of}`, label: 'Comes with', origin: 'rule', when: is('id', 1), of: is('id', of), strength: 'must', ...p,
  });
  const curryIs = (...ids: number[]) => all(is('role', 'curry'), oneOf('id', ids));
  const subziIs = (...ids: number[]) => all(is('role', 'subzi'), oneOf('id', ids));
  const slot = slotIndex('monday', 'lunch');
  const lunch = (s: Partial<SlotState>) => planWith([['monday', 'lunch', s]]);

  // A missing conditional pair is a soft problem at the pair's cost, even for an Always link: it gives way to
  // whatever kept its dish out of the meal.
  it('a conditional pair holds only when the meal has its curry', () => {
    const m = compileModel(lib, [pair(6, { inMeal: [curryIs(2)] })]);
    expect(score(m, lunch({ base: 1, curry: 2 }))).toMatchObject({ hard: 0, soft: 10 });
    expect(score(m, lunch({ base: 1, curry: 2, extras: [6] })).hard).toBe(0);
    expect(score(m, lunch({ base: 1, curry: 3 })).hard).toBe(0);
    expect(score(m, lunch({ base: 1 })).hard).toBe(0);
  });

  it('tells whether a dish of the meal has a conditional pair, met or not', () => {
    const m = compileModel(lib, [pair(6, { inMeal: [curryIs(2)] })]);
    expect(mealHasConditional(m, { base: 1, curry: 3, extras: [] }, slot)).toBe(true);
    expect(mealHasConditional(m, { base: 1, curry: 2, extras: [] }, slot)).toBe(true);
    expect(mealHasConditional(m, { curry: 2, extras: [6] }, slot)).toBe(false);
    expect(mealHasConditional(compileModel(lib, [pair(6)]), { base: 1, curry: 2, extras: [] }, slot)).toBe(false);
  });

  it("a met conditional pair takes the subzi role from its dish's plain pair", () => {
    const m = compileModel(lib, [pair(5, { ruleId: 1 }), pair(4, { ruleId: 2, inMeal: [curryIs(2)] })]);
    expect(score(m, lunch({ base: 1, curry: 2, subzi: 4 })).hard).toBe(0);
    expect(score(m, lunch({ base: 1, curry: 2, subzi: 5 }))).toMatchObject({ hard: 0, soft: 10 });
    expect(score(m, lunch({ base: 1, curry: 3, subzi: 5 })).hard).toBe(0);
    expect(score(m, lunch({ base: 1, curry: 3, subzi: 4 })).hard).toBe(1);
    expect(slotPairs(m, lunch({ base: 1, curry: 2, subzi: 4 }), slot)).toEqual([
      { candidates: [5], by: 1, ruleId: 1, unit: false, suppressed: true },
      { candidates: [4], component: 4, by: 1, ruleId: 2, unit: true },
    ]);
    expect(slotPairs(m, lunch({ base: 1, curry: 3, subzi: 5 }), slot)).toEqual([
      { candidates: [5], component: 5, by: 1, ruleId: 1, unit: true },
    ]);
  });

  it('mealBrings adds the conditional want only when the curry is there', () => {
    const m = compileModel(lib, [pair(6, { inMeal: [curryIs(2, 3)] })]);
    expect(mealBrings(m, { base: 1, curry: 2, extras: [] }, slot, 1, 'base')).toEqual({ wants: [{ of: [6], unit: true, cond: true }] });
    expect(mealBrings(m, { base: 1, curry: 3, extras: [] }, slot, 1, 'base')).toEqual({ wants: [{ of: [6], unit: true, cond: true }] });
    expect(mealBrings(m, { base: 1, extras: [] }, slot, 1, 'base')).toEqual({ wants: [] });
    expect(bringsWith(m, 1, 'base', slot)).toEqual({ wants: [] });
  });

  it('a curry-and-subzi pair needs both', () => {
    const m = compileModel(lib, [pair(6, { inMeal: [curryIs(2), subziIs(4)] })]);
    expect(score(m, lunch({ base: 1, curry: 2, subzi: 4 }))).toMatchObject({ hard: 0, soft: 10 });
    expect(score(m, lunch({ base: 1, curry: 2, subzi: 4, extras: [6] }))).toMatchObject({ hard: 0, soft: 0 });
    expect(score(m, lunch({ base: 1, curry: 2, subzi: 5 })).hard).toBe(0);
    expect(score(m, lunch({ base: 1, curry: 3, subzi: 4 })).hard).toBe(0);
    expect(mealBrings(m, { base: 1, curry: 2, extras: [] }, slot, 1, 'base')).toEqual({ wants: [] });
  });
  it('a missing conditional pair is reported as a soft problem naming its rule', () => {
    const m = compileModel(lib, [pair(6, { ruleId: 7, inMeal: [curryIs(2)] })]);
    const r = score(m, lunch({ base: 1, curry: 2 }), true);
    expect(r).toMatchObject({ hard: 0, soft: 10 });
    expect(r.justifications).toEqual([expect.objectContaining({ ruleId: 7, level: 'soft', cost: 10, group: { day: 'monday', meal: 'lunch', componentId: 6 } })]);
  });

  describe('ignoreConditional', () => {
    const curd = component('extra', { id: 7, name: 'Curd' });
    const libWithCurd = [...lib, curd];
    const blind = { ignoreConditional: true };
    const extrasCap = count({ id: 'cap', select: is('componentType', 'extra'), bounds: { hardMax: 1 } });
    const noPapad = count({ id: 'no-papad', select: is('id', 6), groupBy: 'plan', bounds: { hardMax: 0 } });
    const papadTriggers = count({ id: 'with-papad', select: is('componentType', 'curry'), when: { exists: is('id', 6) }, bounds: { hardMax: 0 } });
    const avoidExtras: PreferConstraint = { kind: 'prefer', id: 'avoid-extras', label: 'Avoid extras', origin: 'rule', select: is('componentType', 'extra'), weight: 2 };
    const subziAtLunch = count({ id: 'subzi', select: is('componentType', 'subzi'), scope: { days: ['monday'], meals: ['lunch'] }, bounds: { hardMin: 1 } });

    it('ignoreConditional leaves a conditionally brought side out of every count', () => {
      const m = compileModel(libWithCurd, [pair(6, { strength: 'prefer', inMeal: [curryIs(2)] }), extrasCap, noPapad, papadTriggers, avoidExtras]);
      const withPapad = lunch({ base: 1, curry: 2, extras: [7, 6] });
      const without = lunch({ base: 1, curry: 2, extras: [7] });
      // Normally Papad breaks the cap, its own limit and the rule it triggers.
      expect(score(m, withPapad).hard).toBe(3);
      // Blind to the conditional pair, Papad is not there at all, and its absence costs nothing.
      expect(score(m, withPapad, false, blind)).toEqual({ hard: 0, soft: 2, justifications: [] });
      expect(score(m, without, false, blind)).toEqual({ hard: 0, soft: 2, justifications: [] });
      expect(score(m, without)).toMatchObject({ hard: 0, soft: 12 });
      // Where the condition is not met, Papad is an ordinary extra and counts.
      expect(score(m, lunch({ base: 1, curry: 3, extras: [7, 6] }), false, blind).hard).toBe(3);
    });

    it('a side another pair also brings still counts', () => {
      const m = compileModel(libWithCurd, [pair(6, { inMeal: [curryIs(2)] }), pair(6, { id: 'plain' }), extrasCap]);
      expect(score(m, lunch({ base: 1, curry: 2, extras: [7, 6] }), false, blind).hard).toBe(1);
    });

    it('a conditionally brought subzi still meets a minimum and holds its role', () => {
      const m = compileModel(lib, [pair(5, { ruleId: 1, strength: 'prefer' }), pair(4, { ruleId: 2, inMeal: [curryIs(2)] }), subziAtLunch]);
      expect(score(m, lunch({ base: 1, curry: 2, subzi: 4 }), false, blind)).toMatchObject({ hard: 0, soft: 0 });
    });
  });
});
