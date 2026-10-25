import { describe, expect, it } from 'vitest';
import {
  clashCurryCategories, curryClashRule, dayModeOf, daysOfMode, dayRule, describeDays, exclusionRule, ownedChanges,
  pairingCategories, pairingRule, readOwned, ruleDays,
} from './owned';

const dish = { id: 7, name: 'Sambar' };
const NONE = { bases: [], clashes: [], days: [], neverAuto: false };
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;

describe('readOwned', () => {
  it('reads nothing from no rules', () => {
    expect(readOwned([])).toEqual(NONE);
  });

  it('reads the value of each kind of owned rule', () => {
    const rules = [pairingRule(dish, [1, 3]), curryClashRule(dish, ['soup']), dayRule(dish, ['friday', 'sunday']), exclusionRule(dish)];
    expect(readOwned(rules)).toEqual({ bases: [1, 3], clashes: ['soup'], days: ['friday', 'sunday'], neverAuto: true });
    expect(pairingCategories(rules[0])).toEqual([1, 3]);
    expect(clashCurryCategories(rules[1])).toEqual(['soup']);
    expect(ruleDays(rules[2])).toEqual(['friday', 'sunday']);
  });
});

describe('ownedChanges', () => {
  const v = { bases: [1], clashes: ['soup' as const], days: ['monday' as const], neverAuto: true };

  it('builds a rule for every value that is set and removes the others', () => {
    const changes = ownedChanges('curry', v);
    expect(changes.pairs_with?.(dish).spec).toMatchObject({ template: 'pairs_with', params: { baseCategories: [1] } });
    expect(changes.allowed_days?.(dish).spec).toMatchObject({ template: 'allowed_days', params: { days: ['monday'] } });
    expect(changes.exclude?.(dish).spec).toMatchObject({ template: 'exclude' });
    expect(ownedChanges('curry', NONE)).toEqual({ pairs_with: null, allowed_days: null, exclude: null });
  });

  it('only offers each dish type the rules that make sense for it', () => {
    expect(Object.keys(ownedChanges('subzi', NONE)).sort()).toEqual(['allowed_days', 'exclude', 'pairs_with']);
    expect(Object.keys(ownedChanges('extra', NONE)).sort()).toEqual(['allowed_days', 'avoid_with', 'exclude']);
    expect(Object.keys(ownedChanges('base', NONE)).sort()).toEqual(['allowed_days', 'exclude']);
    expect(ownedChanges('extra', v).avoid_with?.(dish).spec).toMatchObject({ template: 'avoid_with' });
  });
});

describe('days', () => {
  it('names the mode of a set of days and converts back', () => {
    expect(dayModeOf([])).toBe('any');
    expect(dayModeOf([...WEEKDAYS])).toBe('weekdays');
    expect(dayModeOf(['sunday', 'saturday'])).toBe('weekends');
    expect(dayModeOf(['monday', 'sunday'])).toBe('specific');
    expect(daysOfMode('any', ['monday'])).toEqual([]);
    expect(daysOfMode('weekdays', [])).toEqual([...WEEKDAYS]);
    expect(daysOfMode('weekends', [])).toEqual(['saturday', 'sunday']);
    expect(daysOfMode('specific', ['friday'])).toEqual(['friday']);
  });

  it('describes days for a badge, in week order', () => {
    expect(describeDays([])).toBeUndefined();
    expect(describeDays([...WEEKDAYS])).toBe('Weekdays');
    expect(describeDays(['sunday', 'saturday'])).toBe('Weekends');
    expect(describeDays(['friday', 'monday'])).toBe('Only Mon, Fri');
  });
});
