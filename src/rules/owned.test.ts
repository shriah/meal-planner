import { describe, expect, it } from 'vitest';
import {
  clashCurryCategories, curryClashRule, dayModeOf, daysOfMode, dayRule, describeDays, exclusionRule, ownedChanges,
  mealRule, noLinks, offersLink, ownedSlot, linkRule, readLink, pairedCategories, pairingCategories, pairingRule, readOwned, ruleDays, describeMeals,
} from './owned';

const dish = { id: 7, name: 'Sambar' };
const NONE = { days: [], meals: [], neverAuto: false };
const NO_LINKS = noLinks();
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;

describe('readOwned', () => {
  it('reads nothing from no rules', () => {
    expect(readOwned([])).toEqual({ ...NONE, links: NO_LINKS });
  });

  it('reads the value of each kind of owned rule', () => {
    const rules = [pairingRule(dish, [1, 3]), curryClashRule(dish, ['soup']), dayRule(dish, ['friday', 'sunday']), mealRule(dish, ['breakfast', 'dinner']), exclusionRule(dish)];
    expect(readOwned(rules)).toEqual({ links: { ...NO_LINKS, base_category: { mode: 'with', values: [1, 3] }, curry_category: { mode: 'never', values: ['soup'] } }, days: ['friday', 'sunday'], meals: ['breakfast', 'dinner'], neverAuto: true });
    expect(pairingCategories(rules[0])).toEqual([1, 3]);
    expect(clashCurryCategories(rules[1])).toEqual(['soup']);
    expect(ruleDays(rules[2])).toEqual(['friday', 'sunday']);
  });
});

describe('ownedChanges', () => {
  const v = {
    links: { base_category: { mode: 'with' as const, values: [1] }, curry_category: { mode: 'never' as const, values: ['soup' as const] } },
    days: ['monday' as const], meals: ['lunch' as const], neverAuto: true,
  };

  it('builds a rule for every value that is set and removes the others', () => {
    expect(ownedChanges('base', NONE).allowed_meals).toBeNull();
    const changes = ownedChanges('curry', v);
    expect(changes['with:base_category']?.(dish).spec).toMatchObject({ template: 'pairs_with', params: { baseCategories: [1] } });
    expect(changes['never:curry_category']?.(dish).spec).toMatchObject({ template: 'avoid_with' });
    expect(changes['never:base_category']).toBeNull();
    expect(changes.allowed_days?.(dish).spec).toMatchObject({ template: 'allowed_days', params: { days: ['monday'] } });
    expect(changes.exclude?.(dish).spec).toMatchObject({ template: 'exclude' });
    expect(ownedChanges('curry', NONE)).toEqual({ allowed_days: null, exclude: null });
  });

  it('removes a link rule when the mode is any or nothing is chosen, and the other mode of the same target', () => {
    const none = ownedChanges('extra', { ...NONE, links: { extra_category: { mode: 'any', values: [] }, curry_category: { mode: 'with', values: [] } } });
    expect(none['with:extra_category']).toBeNull();
    expect(none['never:extra_category']).toBeNull();
    expect(none['with:curry_category']).toBeNull();
    const swapped = ownedChanges('extra', { ...NONE, links: { curry_category: { mode: 'with', values: ['soup'] } } });
    expect(swapped['with:curry_category']).toBeTypeOf('function');
    expect(swapped['never:curry_category']).toBeNull();
  });

  it('offers every dish type links to the other kinds of category, but a base none to base categories', () => {
    const all = { base_category: { mode: 'never' as const, values: [1] }, extra_category: { mode: 'never' as const, values: [2] }, curry_category: { mode: 'never' as const, values: ['soup' as const] } };
    expect(Object.keys(ownedChanges('base', { ...NONE, links: all })).sort()).toEqual(
      ['allowed_days', 'allowed_meals', 'exclude', 'never:curry_category', 'never:extra_category', 'with:curry_category', 'with:extra_category'],
    );
    expect(ownedChanges('extra', { ...NONE, links: all })['never:base_category']).toBeTypeOf('function');
  });
});

describe('links to specific dishes', () => {
  it('round-trips, listing the dish itself in "only with" without showing it back', () => {
    const only = linkRule(dish, 'with', 'base_dish', [3, 4]);
    expect(JSON.stringify(only.spec)).toContain('7');
    expect(readLink(only)).toEqual({ mode: 'with', target: 'base_dish', values: [3, 4] });
    expect(readLink(linkRule(dish, 'never', 'extra_dish', [9]))).toEqual({ mode: 'never', target: 'extra_dish', values: [9] });
    expect(ownedSlot(linkRule(dish, 'never', 'subzi_dish', [2]))).toBe('never:subzi_dish');
  });

  it('does not offer a dish its own kind where a meal holds one, or a base any base', () => {
    expect(offersLink('curry', 'curry_dish')).toBe(false);
    expect(offersLink('subzi', 'subzi_dish')).toBe(false);
    expect(offersLink('base', 'base_dish')).toBe(false);
    expect(offersLink('extra', 'extra_dish')).toBe(true);
    expect(offersLink('extra', 'curry_dish')).toBe(true);
  });
});

describe('links', () => {
  it('round-trips each kind of link through its rule, and names the slot it fills', () => {
    for (const mode of ['with', 'never'] as const) {
      for (const [target, values] of [['base_category', [1, 2]], ['extra_category', [4]], ['curry_category', ['soup', 'legume']]] as const) {
        const rule = linkRule(dish, mode, target, values);
        expect(readLink(rule)).toEqual({ mode, target, values });
        expect(ownedSlot(rule)).toBe(`${mode}:${target}`);
      }
    }
    expect(linkRule(dish, 'with', 'base_category', [1]).spec.template).toBe('pairs_with');
    expect(linkRule(dish, 'never', 'extra_category', [4]).spec.template).toBe('avoid_with');
  });

  it('does not take a hand-written never-together rule for a link', () => {
    const odd = { spec: { template: 'avoid_with' as const, params: { match: { field: 'id' as const, op: 'eq' as const, value: 7 }, with: { field: 'role' as const, op: 'eq' as const, value: 'curry' as const }, strength: 'must' as const } } };
    expect(readLink(odd as never)).toBeUndefined();
    expect(ownedSlot(odd as never)).toBeUndefined();
  });
});

describe('pairedCategories', () => {
  it('is every base when the dish has no pairing rule, otherwise the rule\'s bases that still exist', () => {
    expect(pairedCategories(undefined, [1, 2, 3])).toEqual([1, 2, 3]);
    expect(pairedCategories(pairingRule(dish, [2]), [1, 2, 3])).toEqual([2]);
    expect(pairedCategories(pairingRule(dish, [2, 9]), [1, 2, 3])).toEqual([2]);
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

describe('meals', () => {
  it('stores a rule only when the dish is limited to some of the meals', () => {
    const build = (meals: ('breakfast' | 'lunch' | 'dinner')[]) => ownedChanges('base', { ...NONE, meals }).allowed_meals;
    expect(build(['breakfast'])?.(dish).spec).toMatchObject({ template: 'allowed_meals', params: { meals: ['breakfast'] } });
    expect(build([])).toBeNull();
    expect(build(['breakfast', 'lunch', 'dinner'])).toBeNull();
  });

  it('only touches the meals rule for bases, so another dish keeps one it already has', () => {
    for (const type of ['curry', 'subzi', 'extra'] as const) expect('allowed_meals' in ownedChanges(type, { ...NONE, meals: ['lunch'] })).toBe(false);
  });

  it('describes the restriction for a badge', () => {
    expect(describeMeals([])).toBeUndefined();
    expect(describeMeals(['breakfast', 'lunch', 'dinner'])).toBeUndefined();
    expect(describeMeals(['dinner', 'breakfast'])).toBe('Only breakfast, dinner');
  });
});
