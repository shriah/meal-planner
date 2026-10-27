import { describe, expect, it } from 'vitest';
import type { WeeklyPlan } from '@/types/plan';
import { pinsFromLocks } from './pins';

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
