import { describe, expect, it } from 'vitest';
import type { WeeklyPlan } from '@/types/plan';
import { pinsForMeal, pinsFromLocks, settleMeal } from './pins';

const plan: WeeklyPlan = {
  slots: [
    { day: 'monday', meal_slot: 'lunch', base_id: 1, curry_id: 2, extra_ids: [5] },
    { day: 'tuesday', meal_slot: 'dinner', base_id: 3, subzi_id: 4, extra_ids: [] },
  ],
};

describe('pinsFromLocks', () => {
  it('pins only the locked parts, and skips slots with nothing locked', () => {
    expect(pinsFromLocks(plan, { 'monday-lunch-curry': true, 'monday-lunch-extras': true, 'tuesday-dinner-curry': true }))
      .toEqual({ 'monday-lunch': { curry_id: 2, extra_ids: [5] } });
  });

  it('pins a locked base and subzi', () => {
    expect(pinsFromLocks(plan, { 'tuesday-dinner-base': true, 'tuesday-dinner-subzi': true }))
      .toEqual({ 'tuesday-dinner': { base_id: 3, subzi_id: 4 } });
  });
});

describe('pinsForMeal', () => {
  it('pins other meals exactly, and only the base and locked parts of the meal', () => {
    expect(pinsForMeal(plan, { 'monday-lunch-subzi': true, 'monday-lunch-extras': true, 'tuesday-dinner-curry': true }, 'monday', 'lunch'))
      .toEqual({
        'monday-lunch': { base_id: 1, subzi_id: null, extra_ids: [5] },
        'tuesday-dinner': { base_id: 3, curry_id: null, subzi_id: 4, extra_ids: [] },
      });
  });

  it.each([
    ['curry', { base_id: 1, curry_id: 9 }],
    ['subzi', { base_id: 1, subzi_id: 9 }],
    ['extras', { base_id: 1, extra_ids: [9] }],
    ['base', { base_id: 9 }],
  ] as const)('pins a %s picked by hand with the base and leaves the other parts free', (part, mine) => {
    const pins = pinsForMeal(plan, {}, 'monday', 'lunch', { part, id: 9 });
    expect(pins['monday-lunch']).toEqual(mine);
    expect(pins['tuesday-dinner']).toEqual({ base_id: 3, curry_id: null, subzi_id: 4, extra_ids: [] });
  });

  it('keeps the locked parts beside a pick, and the pick wins over its own lock', () => {
    expect(pinsForMeal(plan, { 'monday-lunch-extras': true, 'monday-lunch-curry': true }, 'monday', 'lunch', { part: 'curry', id: 9 })['monday-lunch'])
      .toEqual({ base_id: 1, curry_id: 9, extra_ids: [5] });
  });
});

describe('settleMeal', () => {
  const picked = { day: 'monday', meal_slot: 'lunch', base_id: 1, curry_id: 20, extra_ids: [5] } as const;
  const pair = (component: number, by: number) => ({ day: 'monday', meal: 'lunch', component, by }) as const;
  const found = (over: object) => ({ ...picked, ...over }) as never;

  it('adds a side the pick brings and keeps the rest', () => {
    expect(settleMeal(picked, { part: 'curry', id: 20 }, found({ extra_ids: [5, 7] }), [pair(7, 20)]).extra_ids).toEqual([5, 7]);
  });

  it('follows the chain: a side brought by a side the pick brought', () => {
    const settled = settleMeal(picked, { part: 'curry', id: 20 }, found({ subzi_id: 30, extra_ids: [8] }), [pair(30, 20), pair(8, 30)]);
    expect(settled).toMatchObject({ curry_id: 20, subzi_id: 30, extra_ids: [5, 8] });
  });

  it('leaves out a side the base brings that the user had removed (a)', () => {
    expect(settleMeal(picked, { part: 'curry', id: 20 }, found({ extra_ids: [5, 7] }), [pair(7, 1)])).toEqual(picked);
  });

  it('leaves out a side brought by a dish the pass chose freely, and keeps the old dish (b)', () => {
    expect(settleMeal(picked, { part: 'curry', id: 20 }, found({ subzi_id: 31, extra_ids: [5, 7] }), [pair(7, 31)])).toEqual(picked);
  });

  it('ignores the pairs of other meals', () => {
    expect(settleMeal(picked, { part: 'curry', id: 20 }, found({ extra_ids: [5, 7] }), [{ ...pair(7, 20), day: 'tuesday' }])).toEqual(picked);
  });
});
