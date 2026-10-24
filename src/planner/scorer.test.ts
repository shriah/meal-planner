import { describe, expect, it } from 'vitest';
import type { Constraint, CountConstraint } from './constraints';
import { all, is } from './matcher';
import { compareScore, compileModel, explain, score, UNKNOWN_COMPONENT } from './scorer';
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
