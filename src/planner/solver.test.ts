import { describe, expect, it } from 'vitest';
import type { Constraint, CountConstraint } from './constraints';
import { all, is, oneOf, type Matcher } from './matcher';
import { buildModel } from './plan';
import { compareScore, score, type CompiledModel, type Score } from './scorer';
import { clonePlan, solve } from './solver';
import { component } from './test-utils';
import { DAYS, MEALS, SLOT_COUNT, slotIndex, type ComponentLike, type PlanState } from './types';

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
      { kind: 'count' as const, id: 'exclude-11', label: 'Never plan curry 11', origin: 'rule' as const, select: is('id', 11), groupBy: 'slot' as const, bounds: { hardMax: 0 }, yieldsTo: 'unit' as const, owner: 11 },
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

    it('bringing stops when two dishes bring each other', () => {
      const constraints: Constraint[] = [
        { kind: 'pair', id: 'a', label: '11 with 21', origin: 'rule', when: is('id', 11), of: is('id', 21), strength: 'must' },
        { kind: 'pair', id: 'b', label: '21 with 11', origin: 'rule', when: is('id', 21), of: is('id', 11), strength: 'must' },
      ];
      const r = solve(buildModel({ library, constraints }), { ...quick, seed: 1 });
      for (const s of r.plan) if (s.curry === 11) expect(s.subzi).toBe(21);
    });
  });

  it('fills every slot', () => {
    const r = solve(buildModel({ library }), { ...quick, seed: 4 });
    expect(r.plan.filter((s) => s.base !== undefined)).toHaveLength(SLOT_COUNT);
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
  const prefer = (id: string, select: Matcher, weight: number, yieldsTo: 'unit' | 'ask'): Constraint => ({ kind: 'prefer', id, label: id, origin: 'rule', select, weight, yieldsTo });
  const defaults: Constraint[] = [
    ...(['breakfast', 'lunch', 'dinner'] as const).map((meal, i) => rule({
      id: `extras-${meal}`, label: `extras-${meal}`, select: is('componentType', 'extra'), groupBy: 'slot',
      scope: { meals: [meal] }, bounds: { hardMax: [2, 3, 2][i] }, yieldsTo: 'unit',
    })),
    rule({ id: 'variety', label: 'variety', select: dishes, groupBy: 'component', bounds: { softMax: 1 }, costs: { min: 2, max: 2 }, yieldsTo: 'unit' }),
    rule({ id: 'spacing', label: 'spacing', select: dishes, groupBy: ['component', { days: 2 }], bounds: { softMax: 1 }, costs: { min: 3, max: 3 }, yieldsTo: 'unit' }),
    prefer('sides-only-when-asked', oneOf('componentType', ['curry', 'subzi', 'extra']), 2, 'ask'),
    prefer('prefer-frequent', is('frequency', 'frequent'), -1, 'unit'),
    prefer('avoid-rare', is('frequency', 'rare'), 1, 'unit'),
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
      rule({ id: 'exclude-11', label: 'Never plan curry 11', select: is('id', 11), groupBy: 'slot', bounds: { hardMax: 0 }, yieldsTo: 'unit', owner: 11 }),
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
});
