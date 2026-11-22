// The planner over user-defined parts: one dish list per part, in the order the parts are stored.
import { describe, expect, it } from 'vitest';
import type { Constraint, PairConstraint } from './constraints';
import { is, type Matcher } from './matcher';
import { buildModel, InvalidConstraintError, planWeek } from './plan';
import { component } from './test-utils';
import { DAYS, MEALS, type PlannerPart } from './types';

// Ids out of position order, so nothing can lean on a part's id to find its place.
const MAIN = 7;
const SIDE = 3;
const DESSERT = 5;
const PARTS: PlannerPart[] = [
  { id: MAIN, name: 'Main', varied: true },
  { id: SIDE, name: 'Side', varied: true },
  { id: DESSERT, name: 'Dessert', varied: false },
];
// The dish type is only today's stored field; the planner places each dish by its `part_id`.
const library = [
  component('base', { id: 1, name: 'Biryani', part_id: MAIN }),
  component('base', { id: 2, name: 'Pulao', part_id: MAIN }),
  component('extra', { id: 11, name: 'Raita', part_id: SIDE }),
  component('extra', { id: 12, name: 'Salan', part_id: SIDE }),
  component('extra', { id: 13, name: 'Salad', part_id: SIDE }),
  component('extra', { id: 21, name: 'Kheer', part_id: DESSERT }),
];
const comesWith = (side: number): PairConstraint => ({
  kind: 'pair', id: `biryani-${side}`, label: `Biryani with ${side}`, origin: 'rule', when: is('id', 1), of: is('id', side), strength: 'must',
});
const quick = { timeLimitMs: Infinity, maxIterations: 5000 };

describe('planner over parts', () => {
  it('rejects a constraint that still names the stored-rule field role', () => {
    const roleRule: Constraint = {
      kind: 'count', id: 'r', label: 'Curries', origin: 'rule', select: is('role', 'curry'), groupBy: 'slot', bounds: { hardMax: 1 },
    };
    expect(() => buildModel({ library, parts: PARTS, constraints: [roleRule] })).toThrow(InvalidConstraintError);
    const rolePair: Constraint = { ...comesWith(11), inMeal: [is('role', 'curry')] };
    expect(() => buildModel({ library, parts: PARTS, constraints: [rolePair] })).toThrow(InvalidConstraintError);
  });

  it('returns every meal with every part, the first part holding exactly one dish', () => {
    const r = planWeek({ library, parts: PARTS }, { ...quick, seed: 1 });
    expect(r.slots).toHaveLength(DAYS.length * MEALS.length);
    for (const s of r.slots) {
      expect(Object.keys(s.parts).map(Number).sort((a, b) => a - b)).toEqual([SIDE, DESSERT, MAIN]);
      expect(s.parts[MAIN]).toHaveLength(1);
      expect([1, 2]).toContain(s.parts[MAIN][0]);
    }
    expect(r.score.hard).toBe(0);
  });

  it.each([1, 2, 3])('with no cap on Side, a Main linked to two Sides has both in its meal (seed %i)', (seed) => {
    const r = planWeek({ library, parts: PARTS, constraints: [comesWith(11), comesWith(12)] }, { ...quick, seed });
    expect(r.score.hard).toBe(0);
    const biryani = r.slots.filter((s) => s.parts[MAIN][0] === 1);
    expect(biryani.length).toBeGreaterThan(0);
    for (const s of biryani) expect(s.parts[SIDE]).toEqual(expect.arrayContaining([11, 12]));
  });

  it('a pinned meal keeps its pinned dishes per part, a part pinned empty included', () => {
    const pins = {
      'monday-lunch': { [MAIN]: [2], [SIDE]: [13, 11], [DESSERT]: [] },
      'tuesday-dinner': { [SIDE]: [12] },
    };
    const want = (id: string, select: Matcher): Constraint =>
      ({ kind: 'count', id, label: id, origin: 'rule', select, groupBy: 'slot', bounds: { softMin: 1 } });
    // Rules that would fill the dessert and change the sides if they could.
    const constraints = [want('kheer', is('id', 21)), want('salan', is('id', 12))];
    for (const seed of [1, 2]) {
      const r = planWeek({ library, parts: PARTS, constraints }, { ...quick, seed, pins });
      const at = (day: string, meal: string) => r.slots.find((s) => s.day === day && s.meal_slot === meal)!;
      expect(at('monday', 'lunch').parts).toEqual({ [MAIN]: [2], [SIDE]: [13, 11], [DESSERT]: [] });
      expect(at('tuesday', 'dinner').parts[SIDE]).toEqual([12]);
      expect(at('wednesday', 'lunch').parts[DESSERT]).toEqual([21]);
    }
  });
});
