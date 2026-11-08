import { describe, expect, it } from 'vitest';
import { everyMealWith, nearNoRulesCount, noHardProblems } from './expect';
import { TEST_LIBRARY } from './library';
import { runPlanCase, statusOf } from './run';
import type { CaseWeeks } from './types';

const weeks = (lib = TEST_LIBRARY): CaseWeeks => ({ weeks: [[]], hard: [[]], lib });
/** Weeks where Pongal is planned `n` times in total. */
const withPongal = (n: number): CaseWeeks => {
  const id = TEST_LIBRARY.dish('Pongal').id;
  const slots = Array.from({ length: n }, () => ({ day: 'monday' as const, meal_slot: 'breakfast' as const, base_id: id, extra_ids: [] }));
  return { weeks: [slots], hard: [[]], lib: TEST_LIBRARY };
};

describe('TEST_LIBRARY', () => {
  it('has 18 dishes with unique ids under 900', () => {
    const ids = TEST_LIBRARY.dishes.map((d) => d.id);
    expect(ids).toHaveLength(18);
    expect(new Set(ids).size).toBe(18);
    expect(Math.max(...ids)).toBeLessThan(900);
  });
  it('knows Pongal as a Rice-based base', () => {
    const pongal = TEST_LIBRARY.dish('Pongal');
    expect(pongal.componentType).toBe('base');
    expect(pongal.base_category_id).toBe(TEST_LIBRARY.category('Rice-based').id);
  });
});

describe('expectations', () => {
  it('everyMealWith fails when no meal has the dish', () => {
    expect(everyMealWith('Pongal', ['Sambar']).check(weeks(), { baseline: weeks })).toEqual({ pass: false, got: '0 of 0' });
  });
  it('nearNoRulesCount compares with the baseline', () => {
    const near = nearNoRulesCount('Pongal');
    expect(near.check(withPongal(6), { baseline: () => withPongal(8) }).pass).toBe(true);
    expect(near.check(withPongal(13), { baseline: () => withPongal(8) }).pass).toBe(false);
    expect(near.check(withPongal(4), { baseline: () => withPongal(2) }).pass).toBe(true);
  });
});

describe('statusOf', () => {
  it('reads known issues', () => {
    expect(statusOf(true, 'x')).toBe('known-now-passes');
    expect(statusOf(false, 'x')).toBe('known');
    expect(statusOf(false)).toBe('fail');
    expect(statusOf(true)).toBe('pass');
  });
});

describe('runPlanCase', () => {
  it('plans a case with no rules', () => {
    const r = runPlanCase({ kind: 'plan', id: 'empty', group: 'Extras', name: 'Empty', why: 'x', rules: () => [], expect: [noHardProblems()] });
    expect(r.status).toBe('pass');
    expect(r.sampleWeek).toHaveLength(21);
  });
});
