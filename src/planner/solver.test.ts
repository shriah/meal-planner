import { describe, expect, it } from 'vitest';
import type { Constraint, CountConstraint, Level } from './constraints';
import { all, is, oneOf, type Matcher } from './matcher';
import { buildModel } from './plan';
import { compareScore, compileModel, lockNudge, score, type CompiledModel, type Score } from './scorer';
import { searchBudget } from './budget';
import { SAFETY_CAP_MS, broughtScore, chooseCandidate, clonePlan, solve } from './solver';
import { component } from './test-utils';
import { DAYS, MEALS, SLOT_COUNT, emptyPlan, slotIndex, type ComponentLike, type PlanState, type SlotState } from './types';

const library: ComponentLike[] = [
  ...[1, 2, 3, 4].map((id) => component('base', { id, base_category_id: 10 })),
  ...[11, 12, 13, 14, 15].map((id) => component('curry', { id, protein_tag: id === 15 ? 'fish' : 'dal', dietary_tags: id === 15 ? ['non-veg'] : ['veg'] })),
  ...[21, 22, 23, 24].map((id) => component('subzi', { id })),
  ...[31, 32].map((id) => component('extra', { id })),
];
const quick = { timeLimitMs: Infinity, maxIterations: 20_000 };

describe('solver', () => {
  it('is deterministic for a seed and varies across seeds', () => {
    const m = () => buildModel({ library });
    const a = solve(m(), { ...quick, seed: 7 }).plan;
    const b = solve(m(), { ...quick, seed: 7 }).plan;
    const c = solve(m(), { ...quick, seed: 8 }).plan;
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('gives the same plan for a seed whatever was solved before, even on a reused model', () => {
    // Rice (1) comes with extra 31 when the curry is 11: the conditional pair fills the per-meal caches.
    const pairs: Constraint[] = [{
      kind: 'pair', id: 'cond', label: 'Base 1 with 31 when curry 11', origin: 'rule', when: is('id', 1), of: is('id', 31),
      strength: 'must', inMeal: [all(is('role', 'curry'), is('id', 11))],
    }];
    const fresh = solve(buildModel({ library, constraints: pairs }), { ...quick, seed: 5 });
    solve(buildModel({ library }), { ...quick, seed: 2 });
    const reused = buildModel({ library, constraints: pairs });
    solve(reused, { ...quick, seed: 9 });
    const again = solve(reused, { ...quick, seed: 5 });
    const after = solve(buildModel({ library, constraints: pairs }), { ...quick, seed: 5 });
    expect(again.plan).toEqual(fresh.plan);
    expect(after.plan).toEqual(fresh.plan);
    expect(again.score).toEqual(fresh.score);
  });

  it('always returns structurally valid slots', () => {
    const r = solve(buildModel({ library }), { ...quick, seed: 3 });
    expect(r.score.hard).toBe(0);
    for (const s of r.plan) {
      expect(library.find((c) => c.id === s.base)?.componentType).toBe('base');
      if (s.curry !== undefined) expect(library.find((c) => c.id === s.curry)?.componentType).toBe('curry');
      if (s.subzi !== undefined) expect(library.find((c) => c.id === s.subzi)?.componentType).toBe('subzi');
      expect(new Set(s.extras).size).toBe(s.extras.length);
    }
  });

  it('never moves pinned values, even when they break a rule, and explains the break', () => {
    const noFish = { kind: 'count' as const, id: 'no-fish', label: 'No fish', origin: 'rule' as const, select: is('protein_tag', 'fish'), groupBy: 'slot' as const, bounds: { hardMax: 0 } };
    const r = solve(buildModel({ library, constraints: [noFish] }), {
      ...quick, seed: 1, pins: { 'friday-lunch': { base_id: 2, curry_id: 15 } },
    });
    const friday = r.plan[slotIndex('friday', 'lunch')];
    expect(friday).toMatchObject({ base: 2, curry: 15 });
    expect(r.score.hard).toBe(1);
    expect(r.score.justifications.filter((j) => j.level === 'hard')).toEqual([
      expect.objectContaining({ constraintId: 'no-fish', group: { day: 'friday', meal: 'lunch' } }),
    ]);
  });

  it('keeps a role pinned empty', () => {
    const wantCurry = { kind: 'count' as const, id: 'want-curry', label: 'Want a curry', origin: 'rule' as const, select: is('componentType', 'curry'), groupBy: 'slot' as const, bounds: { hardMin: 1 } };
    const r = solve(buildModel({ library, constraints: [wantCurry] }), {
      ...quick, seed: 1, pins: { 'friday-lunch': { base_id: 2, curry_id: null } },
    });
    expect(r.plan[slotIndex('friday', 'lunch')]).toMatchObject({ base: 2, curry: undefined });
    expect(r.plan[slotIndex('friday', 'dinner')].curry).toBeDefined();
  });

  it('satisfies a weekly minimum the greedy generator could not express', () => {
    const fishTwice = { kind: 'count' as const, id: 'fish-2', label: 'Fish twice a week', origin: 'rule' as const, select: is('protein_tag', 'fish'), groupBy: 'plan' as const, bounds: { hardMin: 2 } };
    const r = solve(buildModel({ library, constraints: [fishTwice] }), { ...quick, seed: 5 });
    expect(r.score.hard).toBe(0);
    expect(r.plan.filter((s) => s.curry === 15).length).toBeGreaterThanOrEqual(2);
  });

  it('stops early on a plateau once every hard rule holds', () => {
    const r = solve(buildModel({ library }), { timeLimitMs: Infinity, maxIterations: 1_000_000, plateauIterations: 500, seed: 2 });
    expect(r.stats.stopReason).toBe('plateau');
    expect(r.stats.iterations).toBeLessThan(1_000_000);
  });

  describe('a base with a must pairing', () => {
    // Base 1 is always served with curry 11; curry 11's own rule keeps it out of every meal, but it
    // gives way when 11 comes with its base.
    const constraints = [
      { kind: 'pair' as const, id: 'pair-1-11', label: 'Base 1 with curry 11', origin: 'rule' as const, when: is('id', 1), of: is('id', 11), strength: 'must' as const },
      { kind: 'count' as const, id: 'exclude-11', label: 'Never plan curry 11', origin: 'rule' as const, select: is('id', 11), groupBy: 'slot' as const, bounds: { hardMax: 0 }, level: 'dish' as const, owner: 11 },
    ];

    it.each([1, 2, 3, 4, 5])('plans the base, always with its curry (seed %i)', (seed) => {
      const r = solve(buildModel({ library, constraints }), { ...quick, seed });
      expect(r.score.hard).toBe(0);
      const withBase = r.plan.filter((s) => s.base === 1);
      expect(withBase.length).toBeGreaterThanOrEqual(1);
      for (const s of withBase) expect(s.curry).toBe(11);
    });

    it('keeps a pinned curry over the pairing and reports the pairing once', () => {
      const r = solve(buildModel({ library, constraints }), { ...quick, seed: 1, pins: { 'monday-lunch': { base_id: 1, curry_id: 12 } } });
      expect(r.plan[slotIndex('monday', 'lunch')]).toMatchObject({ base: 1, curry: 12 });
      const hard = r.score.justifications.filter((j) => j.level === 'hard');
      expect(hard).toHaveLength(1);
      expect(hard[0]).toMatchObject({ constraintId: 'pair-1-11', group: { componentId: 11 } });
    });
  });

  describe('a pair naming several candidates', () => {
    const lib: ComponentLike[] = [component('base', { id: 1 }), ...library.filter((c) => c.componentType !== 'base')];
    const want: Constraint = { kind: 'pair', id: 'pair-1', label: 'Base 1 with 11 or 12', origin: 'rule', when: is('id', 1), of: oneOf('id', [11, 12]), strength: 'must' };

    it('bringing places one candidate of a want', () => {
      const r = solve(buildModel({ library: lib, constraints: [want] }), { ...quick, seed: 1 });
      expect(r.score.hard).toBe(0);
      for (const s of r.plan) expect([11, 12]).toContain(s.curry);
    });

    it('a want of two allowed candidates plans both over a week', () => {
      const r = solve(buildModel({ library: lib, constraints: [want] }), { ...quick, seed: 1 });
      expect(r.score.hard).toBe(0);
      const curries = new Set(r.plan.map((s) => s.curry));
      expect(curries).toContain(11);
      expect(curries).toContain(12);
    });

    it('a candidate the week forbids is passed over', () => {
      // Curry 12's own rule keeps it out of every meal; it gives way to a unit, as a dish's "never planned
      // automatically" does, so only the choice between the candidates keeps it out.
      const never11: Constraint = { kind: 'count', id: 'exclude-11', label: 'Never plan curry 11', origin: 'rule', select: is('id', 11), groupBy: 'slot', bounds: { hardMax: 0 }, level: 'dish', owner: 11 };
      const r = solve(buildModel({ library: lib, constraints: [want, never11] }), { ...quick, seed: 1 });
      expect(r.score.hard).toBe(0);
      for (const s of r.plan) expect(s.curry).toBe(12);
    });

    it('broughtScore ranks a candidate under its limit ahead of one over it', () => {
      // Curry 11 is limited to once a week and already planned with base 2; the limit gives way to a
      // brought dish, so the hard score is the same for both candidates and only the limit's rank tells
      // them apart.
      const once11: Constraint = { kind: 'count', id: 'once-11', label: 'Curry 11 once a week', origin: 'rule', select: is('id', 11), groupBy: 'plan', bounds: { hardMax: 1 }, level: 'frequency' };
      const m = buildModel({ library, constraints: [want, once11] });
      const plan: PlanState = Array.from({ length: SLOT_COUNT }, () => ({ extras: [] }));
      plan[slotIndex('monday', 'lunch')] = { base: 2, curry: 11, extras: [] };
      const slot = slotIndex('tuesday', 'lunch');
      const withCurry = (curry: number) => {
        const p = clonePlan(plan);
        p[slot] = { base: 1, curry, extras: [] };
        return broughtScore(m, p, slot, curry);
      };
      expect(withCurry(11).hard).toBe(withCurry(12).hard);
      expect(compareScore(withCurry(12), withCurry(11))).toBeLessThan(0);
    });

    it("broughtScore ranks a candidate over its limit ahead of one outside its own meals", () => {
      // A dish's days and meals (OVERRIDE_WEIGHT) outrank its limits (LIMIT_WEIGHT): curry 11 is over its
      // once-a-week limit, curry 12 is kept to lunch and dinner and this is breakfast.
      const once11: Constraint = { kind: 'count', id: 'once-11', label: 'Curry 11 once a week', origin: 'rule', select: is('id', 11), groupBy: 'plan', bounds: { hardMax: 1 }, level: 'frequency' };
      const meals12: Constraint = { kind: 'count', id: 'meals-12', label: 'Curry 12 at lunch and dinner', origin: 'rule', select: is('id', 12), groupBy: 'slot', scope: { meals: ['breakfast'] }, bounds: { hardMax: 0 }, level: 'dish', owner: 12 };
      const m = buildModel({ library, constraints: [want, once11, meals12] });
      const plan: PlanState = Array.from({ length: SLOT_COUNT }, () => ({ extras: [] }));
      plan[slotIndex('monday', 'lunch')] = { base: 2, curry: 11, extras: [] };
      const slot = slotIndex('tuesday', 'breakfast');
      const withCurry = (curry: number) => {
        const p = clonePlan(plan);
        p[slot] = { base: 1, curry, extras: [] };
        return broughtScore(m, p, slot, curry);
      };
      expect(compareScore(withCurry(11), withCurry(12))).toBeLessThan(0);
    });

    it('a candidate with its own Always pairing is chosen too, and brings its side', () => {
      const brings31: Constraint = { kind: 'pair', id: 'pair-11', label: 'Curry 11 with extra 31', origin: 'rule', when: is('id', 11), of: is('id', 31), strength: 'must' };
      const r = solve(buildModel({ library: lib, constraints: [want, brings31] }), { ...quick, seed: 1 });
      expect(r.score.hard).toBe(0);
      const curries = new Set(r.plan.map((s) => s.curry));
      expect(curries).toContain(11);
      expect(curries).toContain(12);
      for (const s of r.plan) if (s.curry === 11) expect(s.extras).toContain(31);
    });

    describe('frequent and rare candidates', () => {
      const libByFrequency = lib.map((c) => (c.id === 11 ? { ...c, frequency: 'frequent' as const } : c.id === 12 ? { ...c, frequency: 'rare' as const } : c));
      const frequencyRules: Constraint[] = [
        { kind: 'prefer', id: 'prefer-frequent', label: 'Prefer frequent dishes', origin: 'rule', select: is('frequency', 'frequent'), weight: -1, level: 'dish' },
        { kind: 'prefer', id: 'avoid-rare', label: 'Avoid rare dishes', origin: 'rule', select: is('frequency', 'rare'), weight: 1, level: 'dish' },
      ];
      const curryCounts = (constraints: Constraint[]) => {
        const r = solve(buildModel({ library: libByFrequency, constraints }), { ...quick, seed: 1 });
        expect(r.score.hard).toBe(0);
        const count = (id: number) => r.plan.filter((s) => s.curry === id).length;
        return { frequent: count(11), rare: count(12) };
      };

      it('a frequent candidate is chosen more often than a rare one', () => {
        const { frequent, rare } = curryCounts([want, ...frequencyRules]);
        expect(rare).toBeGreaterThan(0);
        expect(frequent).toBeGreaterThan(2 * rare);
      });

      it('a frequent candidate is chosen more often than a rare one when the frequency prefers give way to asked sides', () => {
        // The defaults as compiled since frequency rules give way to every brought dish: all three on 'ask'.
        const askRules: Constraint[] = [
          ...frequencyRules.map((c) => ({ ...c, level: 'frequency' as const })),
          { kind: 'prefer', id: 'sides-only-when-asked', label: 'sides', origin: 'rule', select: oneOf('componentType', ['curry', 'subzi', 'extra']), weight: 2, level: 'frequency' },
        ];
        const { frequent, rare } = curryCounts([want, ...askRules]);
        expect(rare).toBeGreaterThan(0);
        expect(frequent).toBeGreaterThan(2 * rare);
      });

      it('a rare candidate of a base planned twice a week is still planned in some weeks', () => {
        // Base 1 is pinned at Tuesday and Thursday lunch (slots 4 and 10) and allowed nowhere else; it
        // always brings normal curry 11 or rare curry 12. Sides come only when asked for, at a cost high
        // enough that construction does not leave 11 or 12 in other meals to sway the choice.
        const lib2: ComponentLike[] = library.map((c) => (c.id === 12 ? { ...c, frequency: 'rare' as const } : c));
        const notElsewhere = (id: string, scope: { days?: (typeof DAYS)[number][]; meals?: (typeof MEALS)[number][] }): Constraint => (
          { kind: 'count', id, label: id, origin: 'rule', select: is('id', 1), groupBy: 'slot', scope, bounds: { hardMax: 0 } });
        const constraints: Constraint[] = [
          want,
          ...frequencyRules,
          { kind: 'prefer', id: 'sides-only-when-asked', label: 'sides', origin: 'rule', select: oneOf('componentType', ['curry', 'subzi', 'extra']), weight: 20, level: 'frequency' },
          notElsewhere('base-1-days', { days: DAYS.filter((d) => d !== 'tuesday' && d !== 'thursday') }),
          notElsewhere('base-1-meals', { meals: ['breakfast', 'dinner'] }),
        ];
        const pins = { 'tuesday-lunch': { base_id: 1 }, 'thursday-lunch': { base_id: 1 } };
        let normal = 0;
        let rare = 0;
        for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
          const r = solve(buildModel({ library: lib2, constraints }), { ...quick, seed, pins });
          expect(r.score.hard).toBe(0);
          for (const s of r.plan) {
            if (s.base !== 1) continue;
            if (s.curry === 11) normal++;
            if (s.curry === 12) rare++;
          }
        }
        expect(normal + rare).toBe(16);
        expect(rare).toBeGreaterThan(0);
        expect(normal).toBeGreaterThan(rare);
      });

      it('without frequency rules candidates alternate evenly', () => {
        const { frequent, rare } = curryCounts([want]);
        expect(Math.abs(frequent - rare)).toBeLessThanOrEqual(1);
      });
    });

    it('two overlapping wants plan a dish both name', () => {
      const overlap: Constraint = { kind: 'pair', id: 'pair-2', label: 'Base 1 with 12 or 13', origin: 'rule', when: is('id', 1), of: oneOf('id', [12, 13]), strength: 'must' };
      const r = solve(buildModel({ library: lib, constraints: [want, overlap] }), { ...quick, seed: 1 });
      expect(r.score.hard).toBe(0);
      for (const s of r.plan) expect(s.curry).toBe(12);
    });

    it('bringing stops when two dishes bring each other', () => {
      const constraints: Constraint[] = [
        { kind: 'pair', id: 'a', label: '11 with 21', origin: 'rule', when: is('id', 11), of: is('id', 21), strength: 'must' },
        { kind: 'pair', id: 'b', label: '21 with 11', origin: 'rule', when: is('id', 21), of: is('id', 11), strength: 'must' },
      ];
      const r = solve(buildModel({ library, constraints }), { ...quick, seed: 1, pins: { 'monday-lunch': { curry_id: 11 } } });
      expect(r.plan[slotIndex('monday', 'lunch')]).toMatchObject({ curry: 11, subzi: 21 });
      for (const s of r.plan) if (s.curry === 11) expect(s.subzi).toBe(21);
    });
  });

  describe('a pair that waits for a curry', () => {
    // Base 1 always comes with extras 31 and 32, filling a cap of 2 extras a meal; a curry is wanted at every
    // meal. With curry 11, base 1 also comes with extra 33, which would break the cap.
    const lib: ComponentLike[] = [
      component('base', { id: 1 }), component('base', { id: 2 }),
      ...[11, 12, 13].map((id) => component('curry', { id })),
      ...[31, 32, 33].map((id) => component('extra', { id })),
    ];
    const comes = (of: number, inMeal?: Matcher[]): Constraint => ({
      kind: 'pair', id: `pair-${of}`, label: `Base 1 with ${of}`, origin: 'rule', when: is('id', 1), of: is('id', of), strength: 'must', ...(inMeal && { inMeal }),
    });
    const given: Constraint[] = [
      comes(31), comes(32),
      { kind: 'count', id: 'cap', label: 'At most 2 extras', origin: 'rule', select: is('componentType', 'extra'), groupBy: 'slot', bounds: { hardMax: 2 } },
      { kind: 'count', id: 'curry', label: 'A curry at every meal', origin: 'rule', select: is('componentType', 'curry'), groupBy: 'slot', bounds: { hardMin: 1 } },
    ];
    const papad = comes(33, [all(is('role', 'curry'), is('id', 11))]);

    it("a curry's chance is the same with and without a conditional link whose side breaks a limit", () => {
      for (const seed of [1, 2, 3]) {
        const without = solve(buildModel({ library: lib, constraints: given }), { ...quick, seed });
        const withLink = solve(buildModel({ library: lib, constraints: [...given, papad] }), { ...quick, seed });
        expect(withLink.plan.map((s) => [s.base, s.curry])).toEqual(without.plan.map((s) => [s.base, s.curry]));
        expect(withLink.plan.some((s) => s.base === 1 && s.curry === 11)).toBe(true);
        // The side that cannot fit is left out and reported as a soft problem, never a hard one.
        expect(withLink.score.hard).toBe(0);
        for (const s of withLink.plan) expect(s.extras.length).toBeLessThanOrEqual(2);
        expect(withLink.score.justifications).toContainEqual(expect.objectContaining({ constraintId: 'pair-33', level: 'soft' }));
      }
    });
  });

  describe('a conditional side refused for a hard rule that later stops applying', () => {
    // Base 1 comes with extra 33 when the curry is 11, but 33 is never on a day with 34, which base 2 (avoided,
    // so the search replaces it) always brings. 33 is refused while a base 2 meal shares the day; once that
    // meal changes, 33 fits again.
    const lib: ComponentLike[] = [
      ...[1, 2, 3, 4, 5, 6].map((id) => component('base', { id })),
      ...[11, 12, 13].map((id) => component('curry', { id })),
      ...[33, 34, 35].map((id) => component('extra', { id })),
    ];
    const constraints: Constraint[] = [
      { kind: 'pair', id: 'pair-33', label: 'Base 1 with 33 when 11', origin: 'rule', when: is('id', 1), of: is('id', 33), strength: 'must', inMeal: [all(is('role', 'curry'), is('id', 11))] },
      { kind: 'pair', id: 'pair-34', label: 'Base 2 with 34', origin: 'rule', when: is('id', 2), of: is('id', 34), strength: 'must' },
      { kind: 'count', id: 'apart', label: '33 never on a day with 34', origin: 'rule', select: is('id', 33), when: { exists: is('id', 34) }, groupBy: 'day', bounds: { hardMax: 0 } },
      { kind: 'count', id: 'curry', label: 'A curry at every meal', origin: 'rule', select: is('componentType', 'curry'), groupBy: 'slot', bounds: { hardMin: 1 } },
      { kind: 'prefer', id: 'avoid-2', label: 'Avoid base 2', origin: 'rule', select: is('id', 2), weight: 1 },
      { kind: 'prefer', id: 'sides', label: 'Extras only when asked', origin: 'rule', select: is('componentType', 'extra'), weight: 2, level: 'frequency' },
    ];

    it('is brought where it fits by the end', () => {
      // Seeds where, without a retry, some base 1 and curry 11 meal ends without 33 although 33 fits.
      for (const seed of [16, 17, 20, 25]) {
        const m = buildModel({ library: lib, constraints });
        const { plan } = solve(m, { ...quick, seed });
        plan.forEach((s, i) => {
          if (s.base !== 1 || s.curry !== 11 || s.extras.includes(33)) return;
          const withSide = clonePlan(plan);
          withSide[i].extras.push(33);
          expect(score(m, withSide).hard, `seed ${seed}, slot ${i}`).toBeGreaterThan(score(m, plan).hard);
        });
      }
    });
  });

  it('fills every slot', () => {
    const r = solve(buildModel({ library }), { ...quick, seed: 4 });
    expect(r.plan.filter((s) => s.base !== undefined)).toHaveLength(SLOT_COUNT);
  });
});

describe('lockNudge', () => {
  // Rice (1) comes with Papad (6) when the curry is Sambar (2); with `both`, also when the subzi is Beans (4).
  const lib: ComponentLike[] = [
    component('base', { id: 1 }), component('base', { id: 7 }),
    component('curry', { id: 2 }), component('curry', { id: 3 }),
    component('subzi', { id: 4 }), component('subzi', { id: 5 }),
    component('extra', { id: 6 }),
  ];
  const curryIs = (id: number) => all(is('role', 'curry'), is('id', id));
  const subziIs = (id: number) => all(is('role', 'subzi'), is('id', id));
  const papad = (inMeal: Matcher[], p: Partial<Constraint> = {}): Constraint =>
    ({ kind: 'pair', id: 'papad', label: 'Rice with Papad', origin: 'rule', when: is('id', 1), of: is('id', 6), strength: 'must', inMeal, ...p }) as Constraint;
  const slot = slotIndex('monday', 'lunch');
  const lunch = (s: Partial<SlotState>): PlanState => {
    const plan = emptyPlan();
    plan[slot] = { extras: [], ...s };
    return plan;
  };

  it('lockNudge charges a locked Papad meal whose curry is not Sambar', () => {
    const m = compileModel(lib, [papad([curryIs(2)])]);
    expect(lockNudge(m, lunch({ base: 1, curry: 3, extras: [6] }), slot, [6])).toBe(10);
    expect(lockNudge(m, lunch({ base: 1, extras: [6] }), slot, [6])).toBe(10);
    expect(lockNudge(m, lunch({ base: 1, curry: 2, extras: [6] }), slot, [6])).toBe(0);
    // Only a locked candidate pulls, and only where the meal's base triggers the link.
    expect(lockNudge(m, lunch({ base: 1, curry: 3, extras: [6] }), slot, [])).toBe(0);
    expect(lockNudge(m, lunch({ base: 7, curry: 3, extras: [6] }), slot, [6])).toBe(0);
  });

  it("charges a softer link's cost", () => {
    const m = compileModel(lib, [papad([curryIs(2)], { strength: 'prefer', cost: 6 })]);
    expect(lockNudge(m, lunch({ base: 1, curry: 3, extras: [6] }), slot, [6])).toBe(6);
  });

  it('with a curry and a subzi part, one cost until both are met', () => {
    const m = compileModel(lib, [papad([curryIs(2), subziIs(4)])]);
    expect(lockNudge(m, lunch({ base: 1, curry: 3, subzi: 5, extras: [6] }), slot, [6])).toBe(10);
    expect(lockNudge(m, lunch({ base: 1, curry: 2, subzi: 5, extras: [6] }), slot, [6])).toBe(10);
    expect(lockNudge(m, lunch({ base: 1, curry: 3, subzi: 4, extras: [6] }), slot, [6])).toBe(10);
    expect(lockNudge(m, lunch({ base: 1, curry: 2, subzi: 4, extras: [6] }), slot, [6])).toBe(0);
  });

  it('a locked Papad makes Sambar win the locked meal over a softer pull away from it', () => {
    const avoidSambar: Constraint = { kind: 'prefer', id: 'avoid', label: 'Avoid Sambar', origin: 'rule', select: is('id', 2), weight: 4 };
    const curryEveryMeal: Constraint = { kind: 'count', id: 'curry', label: 'A curry at every meal', origin: 'rule', select: is('componentType', 'curry'), groupBy: 'slot', bounds: { hardMin: 1 } };
    const pins = { 'monday-lunch': { base_id: 1, extra_ids: [6] } };
    for (const seed of [1, 2, 3]) {
      const r = solve(buildModel({ library: lib, constraints: [papad([curryIs(2)]), avoidSambar, curryEveryMeal] }), { ...quick, seed, pins });
      expect(r.plan[slot]).toMatchObject({ base: 1, curry: 2 });
      expect(r.score.hard).toBe(0);
    }
  });
});

describe('chooseCandidate', () => {
  const tie = () => ({ hard: 0, soft: 0 });
  const used: Record<number, number> = { 1: 3, 2: 2 };
  const pick = (weights: Record<number, number>) =>
    chooseCandidate([1, 2], 0, tie, (id) => used[id], 0, (id) => weights[id], () => 0);

  it('picks the lowest weighted use among equal scores', () => {
    // 1: 3 × 2^0 = 3; 2: 2 × 2^1 = 4.
    expect(pick({ 1: 0, 2: 1 })).toBe(1);
  });

  it('a weight every candidate shares does not change the pick, even past the bound on w', () => {
    expect(pick({ 1: 2, 2: 3 })).toBe(1);
    expect(pick({ 1: 20, 2: 21 })).toBe(1);
  });

  it('bounds how far apart two candidates are weighted', () => {
    // A spread of 5 counts as 4: 1: 3 × 2^0 = 3; 2: 0.25 × 2^4 = 4.
    const rarely: Record<number, number> = { 1: 3, 2: 0.25 };
    expect(chooseCandidate([1, 2], 0, tie, (id) => rarely[id], 0, (id) => ({ 1: 0, 2: 5 })[id]!, () => 0)).toBe(1);
    // A spread of 3 is kept: 2: 0.25 × 2^3 = 2.
    expect(chooseCandidate([1, 2], 0, tie, (id) => rarely[id], 0, (id) => ({ 1: 0, 2: 3 })[id]!, () => 0)).toBe(2);
  });
});

describe('final descent', () => {
  // Mirrors TEST_LIBRARY in src/rule-cases/library.ts (ids, roles, order).
  // The rule-case test library and the default rules as compileRules
  // compiles them, written out here because planner files may not import the rules module. On seed 4
  // the search used to stop on a plateau with Pongal (1) on Wednesday and Thursday, one change from
  // the best week.
  const lib: ComponentLike[] = [
    ...[1, 2, 3, 4, 5, 6, 7].map((id) => component('base', { id, frequency: 'normal' })),
    ...[8, 9, 10, 11].map((id) => component('curry', { id, frequency: 'normal' })),
    ...[12, 13].map((id) => component('subzi', { id, frequency: 'normal' })),
    ...[14, 15, 16, 17, 18].map((id) => component('extra', { id, frequency: 'normal' })),
  ];
  const BASES = lib.filter((c) => c.componentType === 'base').map((c) => c.id);
  const dishes = all(oneOf('componentType', ['base', 'curry', 'subzi']), oneOf('role', ['base', 'curry', 'subzi']));
  const rule = (c: Omit<CountConstraint, 'kind' | 'origin'>): CountConstraint => ({ kind: 'count', origin: 'rule', ...c });
  const prefer = (id: string, select: Matcher, weight: number, level: Level): Constraint => ({ kind: 'prefer', id, label: id, origin: 'rule', select, weight, level });
  const defaults: Constraint[] = [
    ...(['breakfast', 'lunch', 'dinner'] as const).map((meal, i) => rule({
      id: `extras-${meal}`, label: `extras-${meal}`, select: is('componentType', 'extra'), groupBy: 'slot',
      scope: { meals: [meal] }, bounds: { hardMax: [2, 3, 2][i] }, level: 'dish',
    })),
    rule({ id: 'variety', label: 'variety', select: dishes, groupBy: 'component', bounds: { softMax: 1 }, costs: { min: 2, max: 2 }, level: 'dish' }),
    rule({ id: 'spacing', label: 'spacing', select: dishes, groupBy: ['component', { days: 2 }], bounds: { softMax: 1 }, costs: { min: 3, max: 3 }, level: 'dish' }),
    prefer('sides-only-when-asked', oneOf('componentType', ['curry', 'subzi', 'extra']), 2, 'frequency'),
    prefer('prefer-frequent', is('frequency', 'frequent'), -1, 'dish'),
    prefer('avoid-rare', is('frequency', 'rare'), 1, 'dish'),
  ];
  const budget = { timeLimitMs: Infinity, maxIterations: 20_000, plateauIterations: 3000 };
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
  const mealName = (i: number) => `${DAYS[Math.floor(i / MEALS.length)]}-${MEALS[i % MEALS.length]}`;

  /** The first single change of a base that gives a hard-0 score strictly below `current`, if any. */
  const improvingBaseChange = (m: CompiledModel, plan: PlanState, current: Score, skip: readonly number[] = []): string | undefined => {
    const p = clonePlan(plan);
    for (let i = 0; i < SLOT_COUNT; i++) {
      if (skip.includes(i)) continue;
      const old = p[i].base;
      for (const b of BASES) {
        if (b === old) continue;
        p[i].base = b;
        const s = score(m, p);
        p[i].base = old;
        if (s.hard === 0 && compareScore(s, current) < 0) {
          return `${mealName(i)}: base ${old} -> ${b} gives soft ${s.soft} (plan has hard ${current.hard}, soft ${current.soft})`;
        }
      }
    }
    return undefined;
  };

  it.each(SEEDS)('returns a plan no single base change improves (seed %i)', (seed) => {
    const m = buildModel({ library: lib, constraints: defaults });
    const r = solve(m, { ...budget, seed });
    expect(improvingBaseChange(m, r.plan, r.score)).toBeUndefined();
  });

  it('keeps pinned bases even when changing one would help', () => {
    // The same base twice on Monday costs spacing; changing either would help, but both are pinned.
    const m = buildModel({ library: lib, constraints: defaults });
    const pins = { 'monday-breakfast': { base_id: 1 }, 'monday-lunch': { base_id: 1 } };
    const r = solve(m, { ...budget, seed: 4, pins });
    const pinned = [slotIndex('monday', 'breakfast'), slotIndex('monday', 'lunch')];
    for (const i of pinned) expect(r.plan[i].base).toBe(1);
    expect(improvingBaseChange(m, r.plan, r.score)).toMatch(/^monday-(breakfast|lunch)/);
    expect(improvingBaseChange(m, r.plan, r.score, pinned)).toBeUndefined();
  });

  it.each(SEEDS)('keeps a base with its unit curry and leaves the curry nowhere else (seed %i)', (seed) => {
    // Base 1 must come with curry 11, and curry 11 is never planned on its own, so a curry 11 left
    // behind when a base 1 was changed would break a hard rule.
    const pairing: Constraint[] = [
      { kind: 'pair', id: 'pair-1-11', label: 'Base 1 with curry 11', origin: 'rule', when: is('id', 1), of: is('id', 11), strength: 'must' },
      rule({ id: 'exclude-11', label: 'Never plan curry 11', select: is('id', 11), groupBy: 'slot', bounds: { hardMax: 0 }, level: 'dish', owner: 11 }),
    ];
    const r = solve(buildModel({ library: lib, constraints: [...defaults, ...pairing] }), { ...budget, seed });
    expect(r.score.hard).toBe(0);
    expect(r.plan.some((s) => s.base === 1)).toBe(true);
    for (const s of r.plan) {
      if (s.base === 1) expect(s.curry).toBe(11);
      else expect(s.curry).not.toBe(11);
    }
  });

  it('runs the final descent in full even once the time limit has passed; only the pass count bounds it', () => {
    const run = (o: { timeLimitMs: number; maxIterations?: number }) => SEEDS.map((seed) => solve(buildModel({ library: lib, constraints: defaults }), { seed, ...o }));
    const late = run({ timeLimitMs: 0 });
    const unhurried = run({ timeLimitMs: Infinity, maxIterations: 0 });
    // Both skip the search; the descent then runs the same either way.
    late.forEach((l, k) => expect(l.plan).toEqual(unhurried[k].plan));
  });

  describe('search budget', () => {
    it('uses the search budget by default', () => {
      const m = buildModel({ library });
      const budget = searchBudget(m);
      expect(solve(m, { seed: 1 }).stats.iterations).toBeLessThanOrEqual(budget.maxIterations);
      // A hard rule no library can meet: the plateau stop never applies, so the budget is what ends the search.
      const impossible: Constraint = {
        kind: 'count', id: 'impossible', label: 'Fifty fish a week', origin: 'rule', select: is('protein_tag', 'fish'),
        groupBy: 'plan', bounds: { hardMin: 50 },
      };
      const hard = buildModel({ library, constraints: [impossible] });
      const r = solve(hard, { seed: 1 });
      expect(r.stats.stopReason).toBe('iterations');
      expect(r.stats.iterations).toBe(searchBudget(hard).maxIterations);
    });

    it('gives the same week whatever the time limit', () => {
      const a = solve(buildModel({ library }), { seed: 3 });
      const b = solve(buildModel({ library }), { seed: 3, timeLimitMs: 60_000 });
      expect(a.plan).toEqual(b.plan);
      expect(a.stats.iterations).toBe(b.stats.iterations);
    });

    it('a search that has converged when the deadline passes reports plateau, not time', () => {
      const r = solve(buildModel({ library }), { seed: 1, timeLimitMs: 0, plateauIterations: 0 });
      expect(r.stats.stopReason).toBe('plateau');
    });

    it('the cap stops the search', () => {
      expect(SAFETY_CAP_MS).toBe(10_000);
      expect(solve(buildModel({ library }), { seed: 1, timeLimitMs: 0 }).stats.stopReason).toBe('time');
      expect(solve(buildModel({ library }), { seed: 1 }).stats.stopReason).not.toBe('time');
    });
  });
});
