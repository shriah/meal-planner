import { describe, expect, it } from 'vitest';
import {
  addableSlots, isSideTarget, LINK_TARGETS, offersComes, clashCurryCategories, curryClashRule, dayModeOf, daysOfMode, dayRule, describeDays, exclusionRule, ownedChanges,
  mealRule, offersLink, ownedSlot, linkRule, linkSlotOf, readLink, LINK_SLOTS, pairingCategories, pairingRule, readOwned, ruleDays, describeMeals,
  type DishLink,
} from './owned';

const dish = { id: 7, name: 'Sambar' };
const NONE = { days: [], meals: [], neverAuto: false };
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;
const link = (mode: DishLink['mode'], target: DishLink['target'], values: DishLink['values'], strength: DishLink['strength'] = 'always'): DishLink =>
  ({ mode, target, values, strength });

describe('readOwned', () => {
  it('reads nothing from no rules', () => {
    expect(readOwned([])).toEqual({ ...NONE, links: [] });
  });

  it('reads the value of each kind of owned rule', () => {
    const rules = [pairingRule(dish, [1, 3]), curryClashRule(dish, ['soup']), dayRule(dish, ['friday', 'sunday']), mealRule(dish, ['breakfast', 'dinner']), exclusionRule(dish)];
    expect(readOwned(rules)).toEqual({ links: [link('with', 'base_category', [1, 3]), link('never', 'curry_category', ['soup'])], days: ['friday', 'sunday'], meals: ['breakfast', 'dinner'], neverAuto: true });
    expect(pairingCategories(rules[0])).toEqual([1, 3]);
    expect(clashCurryCategories(rules[1])).toEqual(['soup']);
    expect(ruleDays(rules[2])).toEqual(['friday', 'sunday']);
  });

  it('keeps both modes of one target', () => {
    const links = readOwned([linkRule(dish, link('with', 'base_dish', [1, 2])), linkRule(dish, link('never', 'base_dish', [2]))]).links;
    expect(links).toHaveLength(2);
    expect(links.map(linkSlotOf)).toEqual(['with:base_dish', 'never:base_dish']);
  });

  it('reads legacy rules as before', () => {
    for (const rule of [pairingRule(dish, [1]), curryClashRule(dish, ['soup'])]) {
      expect(readLink(rule)?.strength).toBe('always');
      expect(readLink(rule)).not.toHaveProperty('scope');
    }
    const odd = linkRule(dish, link('never', 'extra_category', [4]));
    odd.spec.params = { ...odd.spec.params, strength: 'prefer', cost: 5 } as never;
    expect(readLink(odd)?.strength).toBe('moderately');
    const bare = linkRule(dish, link('never', 'extra_category', [4]));
    bare.spec.params = { ...bare.spec.params, strength: 'prefer' } as never;
    expect(readLink(bare)?.strength).toBe('usually');
  });
});

describe('ownedChanges', () => {
  const v = {
    links: [link('with', 'base_category', [1]), link('never', 'curry_category', ['soup'])],
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

  it('sets or clears every offered slot from a list', () => {
    const one = ownedChanges('extra', { ...NONE, links: [link('never', 'curry_category', ['soup'])] });
    expect(one['never:curry_category']).toBeTypeOf('function');
    for (const slot of LINK_SLOTS.filter((s) => s !== 'never:curry_category')) expect(one[slot]).toBeNull();
    const curry = ownedChanges('curry', { ...NONE, links: [link('never', 'curry_category', ['soup'])] });
    expect(curry).not.toHaveProperty('with:curry_dish');
    expect(curry).not.toHaveProperty('never:curry_dish');
    expect(Object.keys(ownedChanges('extra', NONE)).filter((k) => k.includes(':'))).toEqual([]);
  });

  it('removes a link rule when nothing is chosen', () => {
    const none = ownedChanges('extra', { ...NONE, links: [link('with', 'curry_category', [])] });
    expect(none['with:curry_category']).toBeNull();
    expect(none['never:curry_category']).toBeNull();
  });

  it('offers every dish type links to the other kinds of category, but a base none to base categories', () => {
    const all = [link('never', 'base_category', [1]), link('never', 'extra_category', [2]), link('never', 'curry_category', ['soup'])];
    const base = ownedChanges('base', { ...NONE, links: all });
    expect(Object.keys(base).sort()).toEqual([
      'allowed_days', 'allowed_meals', 'comes:curry_category', 'comes:curry_dish', 'comes:extra_category', 'comes:extra_dish', 'comes:subzi_dish', 'exclude',
      'never:curry_category', 'never:curry_dish', 'never:extra_category', 'never:extra_dish', 'never:subzi_dish',
      'with:curry_category', 'with:curry_dish', 'with:extra_category', 'with:extra_dish', 'with:subzi_dish',
    ]);
    expect(base['with:curry_dish']).toBeNull();
    expect(base).not.toHaveProperty('with:base_dish');
    expect(base).not.toHaveProperty('never:base_dish');
    expect(base).not.toHaveProperty('never:base_category');
    expect(ownedChanges('extra', { ...NONE, links: all })['never:base_category']).toBeTypeOf('function');
  });
});

describe('links to specific dishes', () => {
  it('round-trips, listing the dish itself in "only with" without showing it back', () => {
    const only = linkRule(dish, link('with', 'base_dish', [3, 4]));
    expect(JSON.stringify(only.spec)).toContain('7');
    expect(readLink(only)).toEqual(link('with', 'base_dish', [3, 4]));
    expect(readLink(linkRule(dish, link('never', 'extra_dish', [9])))).toEqual(link('never', 'extra_dish', [9]));
    expect(ownedSlot(linkRule(dish, link('never', 'subzi_dish', [2])))).toBe('never:subzi_dish');
  });

  it('does not offer a dish its own kind where a meal holds one, or a base any base', () => {
    expect(offersLink('curry', 'curry_dish')).toBe(false);
    expect(offersLink('subzi', 'subzi_dish')).toBe(false);
    expect(offersLink('base', 'base_dish')).toBe(false);
    expect(offersLink('extra', 'extra_dish')).toBe(true);
    expect(offersLink('extra', 'curry_dish')).toBe(true);
  });
});

describe('link strength', () => {
  it('writes always as a hard rule and the others as a preference with a cost, and reads them back', () => {
    for (const rule of [linkRule(dish, link('never', 'extra_category', [4])), linkRule(dish, link('with', 'base_category', [1]))]) {
      expect(rule.spec.params).toMatchObject({ strength: 'must' });
      expect(readLink(rule)?.strength).toBe('always');
    }
    const usually = linkRule(dish, link('never', 'extra_dish', [4], 'usually'));
    expect(usually.spec.params).toMatchObject({ strength: 'prefer', cost: 10 });
    expect(readLink(usually)?.strength).toBe('usually');
    const sometimes = linkRule(dish, link('with', 'base_category', [1], 'sometimes'));
    expect(sometimes.spec.params).toMatchObject({ strength: 'prefer', cost: 3 });
    expect(readLink(sometimes)?.strength).toBe('sometimes');
    expect(readOwned([sometimes]).links).toEqual([link('with', 'base_category', [1], 'sometimes')]);
  });

  it('carries the strength into the rule change, and defaults to always', () => {
    const c = ownedChanges('extra', { ...NONE, links: [link('never', 'extra_category', [2], 'usually'), { mode: 'never', target: 'curry_category', values: ['soup'] } as DishLink] });
    expect(c['never:extra_category']?.(dish).spec.params).toMatchObject({ strength: 'prefer', cost: 10 });
    expect(c['never:curry_category']?.(dish).spec.params).toMatchObject({ strength: 'must' });
  });

  it('round-trips scope and every strength through each link shape', () => {
    const scope = { days: ['monday' as const], meals: ['lunch' as const] };
    for (const strength of ['always', 'usually', 'moderately', 'sometimes'] as const) {
      for (const shape of [link('with', 'base_category', [1, 2], strength), link('never', 'extra_category', [4], strength), link('with', 'base_dish', [3], strength)]) {
        const l: DishLink = { ...shape, scope };
        const rule = linkRule(dish, l);
        expect(readLink(rule)).toEqual(l);
        expect(rule.spec.params).toMatchObject({ scope });
      }
    }
    expect(linkRule(dish, link('never', 'extra_category', [4], 'moderately')).spec.params).toMatchObject({ strength: 'prefer', cost: 6 });
    expect(linkRule(dish, { ...link('never', 'extra_category', [4]), scope: { days: [], meals: ['lunch'] } }).spec.params).toMatchObject({ scope: { meals: ['lunch'] } });
    expect(linkRule(dish, { ...link('never', 'extra_category', [4]), scope: { days: [] } }).spec.params).not.toHaveProperty('scope');
  });
});

describe('served with', () => {
  it('stores a serve link as an also-include rule the dish owns, and reads it back', () => {
    for (const target of ['base_dish', 'base_category'] as const) {
      const link = { mode: 'serve' as const, target, values: [3, 4], strength: 'usually' as const, scope: { meals: ['breakfast' as const] } };
      const rule = linkRule(dish, link);
      expect(rule.spec).toMatchObject({ template: 'require_with', params: { components: [7], strength: 'prefer', cost: 10, scope: { meals: ['breakfast'] } } });
      expect(readLink(rule)).toEqual(link);
      expect(ownedSlot(rule)).toBe(`serve:${target}`);
    }
  });

  it('does not read a hand-written also-include rule as a link', () => {
    const odd = { spec: { template: 'require_with' as const, params: { when: { field: 'id' as const, op: 'eq' as const, value: 3 }, components: [7, 8], extraCategories: [], strength: 'must' as const } } };
    expect(readLink(odd as never)).toBeUndefined();
  });

  it('offers serving with bases to every dish but a base', () => {
    const serve = { ...NONE, links: [{ mode: 'serve' as const, target: 'base_dish' as const, values: [3], strength: 'always' as const }] };
    expect(ownedChanges('curry', serve)['serve:base_dish']?.(dish).spec.template).toBe('require_with');
    expect(ownedChanges('extra', serve)['serve:base_category']).toBeNull();
    expect('serve:base_dish' in ownedChanges('base', serve)).toBe(false);
  });
});

describe('links', () => {
  it('round-trips each kind of link through its rule, and names the slot it fills', () => {
    for (const mode of ['with', 'never'] as const) {
      for (const [target, values] of [['base_category', [1, 2]], ['extra_category', [4]], ['curry_category', ['soup', 'legume']]] as const) {
        const l = link(mode, target, [...values]);
        const rule = linkRule(dish, l);
        expect(readLink(rule)).toEqual(l);
        expect(ownedSlot(rule)).toBe(`${mode}:${target}`);
        expect(linkSlotOf(l)).toBe(`${mode}:${target}`);
      }
    }
    expect(linkRule(dish, link('with', 'base_category', [1])).spec.template).toBe('pairs_with');
    expect(linkRule(dish, link('never', 'extra_category', [4])).spec.template).toBe('avoid_with');
  });

  it('does not take a hand-written never-together rule for a link', () => {
    const odd = { spec: { template: 'avoid_with' as const, params: { match: { field: 'id' as const, op: 'eq' as const, value: 7 }, with: { field: 'role' as const, op: 'eq' as const, value: 'curry' as const }, strength: 'must' as const } } };
    expect(readLink(odd as never)).toBeUndefined();
    expect(ownedSlot(odd as never)).toBeUndefined();
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

describe('addableSlots', () => {
  it('offers a curry served with bases, then only with / never with every target it may link to, specific dishes included', () => {
    expect(addableSlots('curry', []).sort()).toEqual([
      'serve:base_category', 'serve:base_dish',
      'with:base_category', 'never:base_category', 'with:extra_category', 'never:extra_category',
      'with:curry_category', 'never:curry_category', 'with:base_dish', 'never:base_dish',
      'with:subzi_dish', 'never:subzi_dish', 'with:extra_dish', 'never:extra_dish',
    ].sort());
    expect(addableSlots('curry', [])[0]).toBe('serve:base_category');
  });

  it('offers an extra specific curries, subzis and extras too', () => {
    const slots = addableSlots('extra', []);
    for (const slot of ['serve:base_dish', 'with:curry_dish', 'never:curry_dish', 'with:subzi_dish', 'with:extra_dish', 'never:extra_dish'] as const) {
      expect(slots).toContain(slot);
    }
  });

  it('offers a base no served-with and no base targets', () => {
    const slots = addableSlots('base', []);
    expect(slots.some((s) => s.startsWith('serve:') || s.endsWith('base_category') || s.endsWith('base_dish'))).toBe(false);
    expect(slots).toContain('never:curry_category');
  });

  it('leaves out slots already taken', () => {
    const slots = addableSlots('curry', [link('serve', 'base_category', [1])]);
    expect(slots).not.toContain('serve:base_category');
    expect(slots).toContain('serve:base_dish');
  });
});

describe('comes with', () => {
  const idiyappam = { id: 1, name: 'Idiyappam' };

  it('a comes link round-trips through its rule', () => {
    const sides = LINK_TARGETS.filter((t) => isSideTarget(t) && offersComes('base', t));
    expect(sides.length).toBeGreaterThan(0);
    for (const target of sides) {
      const values = target === 'curry_category' ? ['soup'] : [11, 12];
      const l = link('comes', target, values);
      const rule = linkRule(idiyappam, l);
      expect(rule.spec.template).toBe('comes_with');
      expect(rule.name).toBe('Idiyappam: comes with');
      expect(readLink(rule)).toEqual(l);
      expect(ownedSlot(rule)).toBe(`comes:${target}`);
    }
    const soft: DishLink = { ...link('comes', 'curry_dish', [11], 'usually'), scope: { meals: ['breakfast'] } };
    expect(readLink(linkRule(idiyappam, soft))).toEqual(soft);
  });

  it('never offers bases as sides', () => {
    expect(offersComes('base', 'base_dish')).toBe(false);
    expect(offersComes('base', 'base_category')).toBe(false);
    expect(offersComes('base', 'curry_dish')).toBe(true);
    expect(offersComes('curry', 'curry_dish')).toBe(false);
  });

  it('an old only-with link to side dishes still reads as with', () => {
    const rule = linkRule(dish, { mode: 'with', target: 'curry_dish', values: [11] });
    expect(rule.spec.template).toBe('avoid_with');
    expect(readLink(rule)).toMatchObject({ mode: 'with', target: 'curry_dish', values: [11] });
  });
});
