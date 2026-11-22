import { describe, expect, it } from 'vitest';
import { all, is, oneOf } from '@/planner';
import {
  addableSlots, bringMode, dayModeOf, daysOfMode, dayRule, describeDays, exclusionRule, ownedChanges, linkModes, linkTargets,
  mealRule, offersLink, ownedSlot, linkRule, linkSlotOf, readLink, pairingCategories, pairingRule, readOwned, ruleDays, describeMeals,
  linkChanges, sameLink, cleanWhen, ownedRuleNameOf,
  type DishLink, type LinkTarget,
} from './owned';
import { TEST_RULE_PARTS } from './test-parts';

// The converted parts, ids 1 to 4 in meal order.
const PARTS = TEST_RULE_PARTS.list;
const BASE = 1, CURRY = 2, SUBZI = 3, EXTRAS = 4;
const dishes = (part: number): LinkTarget => ({ part, kind: 'dish' });
const categories = (part: number): LinkTarget => ({ part, kind: 'category' });
const dish = { id: 7, name: 'Sambar', part_id: CURRY };
const NONE = { days: [], meals: [], neverAuto: false };
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;
const link = (mode: DishLink['mode'], target: LinkTarget, values: number[], strength: DishLink['strength'] = 'always'): DishLink =>
  ({ mode, target, values, strength });
const rule = (self: { id: number; name: string }, l: Omit<DishLink, 'strength'> & { strength?: DishLink['strength'] }) => linkRule(self, l, PARTS);
const read = (r: Parameters<typeof readLink>[0]) => readLink(r, PARTS);

describe('readOwned', () => {
  it('reads nothing from no rules', () => {
    expect(readOwned([], PARTS)).toEqual({ ...NONE, links: [] });
  });

  it('reads the value of each kind of owned rule', () => {
    const rules = [pairingRule(dish, [1, 3], PARTS), rule(dish, link('never', categories(CURRY), [21])), dayRule(dish, ['friday', 'sunday']), mealRule(dish, ['breakfast', 'dinner']), exclusionRule(dish)];
    expect(readOwned(rules, PARTS)).toEqual({ links: [link('with', categories(BASE), [1, 3]), link('never', categories(CURRY), [21])], days: ['friday', 'sunday'], meals: ['breakfast', 'dinner'], neverAuto: true });
    expect(pairingCategories(rules[0])).toEqual([1, 3]);
    expect(ruleDays(rules[2])).toEqual(['friday', 'sunday']);
  });

  it('keeps both modes of one target', () => {
    const links = readOwned([rule(dish, link('with', dishes(BASE), [1, 2])), rule(dish, link('never', dishes(BASE), [2]))], PARTS).links;
    expect(links).toHaveLength(2);
    expect(links.map(linkSlotOf)).toEqual(['with:1:dish', 'never:1:dish']);
  });

  it('reads costs as strengths', () => {
    expect(read(pairingRule(dish, [1], PARTS))?.strength).toBe('always');
    expect(read(pairingRule(dish, [1], PARTS))).not.toHaveProperty('scope');
    const odd = rule(dish, link('never', categories(EXTRAS), [4]));
    odd.spec.params = { ...odd.spec.params, strength: 'prefer', cost: 5 } as never;
    expect(read(odd)?.strength).toBe('moderately');
    const bare = rule(dish, link('never', categories(EXTRAS), [4]));
    bare.spec.params = { ...bare.spec.params, strength: 'prefer' } as never;
    expect(read(bare)?.strength).toBe('usually');
  });

  it('lists links as today: only with and never with, then served with, then comes with; categories before dishes', () => {
    const owner = { id: 1, name: 'Rice' };
    const rules = [
      rule(owner, link('comes', dishes(EXTRAS), [16])),
      rule(owner, link('never', dishes(SUBZI), [12])),
      rule(owner, link('never', categories(EXTRAS), [4])),
      rule(owner, link('comes', dishes(CURRY), [8])),
    ].map((r, i) => ({ ...r, id: i + 1 }));
    expect(readOwned(rules, PARTS).links.map(linkSlotOf)).toEqual(['never:4:category', 'never:3:dish', 'comes:2:dish', 'comes:4:dish']);
  });

  it('reads no pairing without parts to name the first one', () => {
    expect(readLink(pairingRule(dish, [1], PARTS), [])).toBeUndefined();
  });
});

describe('ownedChanges', () => {
  const v = { days: ['monday' as const], meals: ['lunch' as const], neverAuto: true };

  it('builds a rule for every value that is set and removes the others', () => {
    expect(ownedChanges('base', NONE).allowed_meals).toBeNull();
    const changes = ownedChanges('curry', v);
    expect(changes.allowed_days?.(dish).spec).toMatchObject({ template: 'allowed_days', params: { days: ['monday'] } });
    expect(changes.exclude?.(dish).spec).toMatchObject({ template: 'exclude' });
    expect(ownedChanges('curry', NONE)).toEqual({ allowed_days: null, exclude: null });
  });

  it('never touches links, which change by rule id', () => {
    for (const type of ['base', 'curry', 'subzi', 'extra'] as const) {
      expect(Object.keys(ownedChanges(type, { ...v, links: [link('never', categories(CURRY), [21])] } as never)).filter((k) => k.includes(':'))).toEqual([]);
    }
  });
});

describe('links to specific dishes', () => {
  it('round-trips, listing the dish itself in "only with" without showing it back', () => {
    const only = rule(dish, link('with', dishes(BASE), [3, 4]));
    expect(only.spec.params).toMatchObject({ with: all(is('part', BASE), { not: oneOf('id', [3, 4, 7]) }) });
    expect(read(only)).toEqual(link('with', dishes(BASE), [3, 4]));
    expect(read(rule(dish, link('never', dishes(EXTRAS), [9])))).toEqual(link('never', dishes(EXTRAS), [9]));
    expect(ownedSlot(rule(dish, link('never', dishes(SUBZI), [2])), PARTS)).toBe('never:3:dish');
  });
});

describe('which links a dish is offered', () => {
  it('offers never with to any part, and only with and comes with to any part but its own', () => {
    for (const target of [dishes(CURRY), categories(CURRY), dishes(BASE)]) expect(offersLink(CURRY, target, PARTS, 'never')).toBe(true);
    expect(offersLink(CURRY, dishes(CURRY), PARTS, 'comes')).toBe(false);
    expect(offersLink(CURRY, dishes(CURRY), PARTS, 'with')).toBe(false);
    expect(offersLink(CURRY, dishes(EXTRAS), PARTS, 'comes')).toBe(true);
    expect(offersLink(CURRY, dishes(BASE), PARTS, 'with')).toBe(true);
    expect(offersLink(CURRY, dishes(99), PARTS, 'never')).toBe(false);
  });

  it('"comes with" brings a lower part and is served with a higher one', () => {
    expect(bringMode(BASE, CURRY, PARTS)).toBe('comes');
    expect(bringMode(CURRY, EXTRAS, PARTS)).toBe('comes');
    expect(bringMode(EXTRAS, CURRY, PARTS)).toBe('serve');
    expect(bringMode(CURRY, BASE, PARTS)).toBe('serve');
  });

  it('offers the modes of today: served with, only with and never with to the first part; comes with and never with below; never with to its own part', () => {
    expect(linkModes(CURRY, categories(BASE), PARTS)).toEqual(['serve', 'with', 'never']);
    expect(linkModes(CURRY, dishes(EXTRAS), PARTS)).toEqual(['comes', 'never']);
    expect(linkModes(EXTRAS, dishes(CURRY), PARTS)).toEqual(['serve', 'never']);
    expect(linkModes(CURRY, categories(CURRY), PARTS)).toEqual(['never']);
    expect(linkModes(BASE, dishes(BASE), PARTS)).toEqual(['never']);
  });

  it('lists every part\'s categories, then every part\'s dishes', () => {
    expect(linkTargets(PARTS, (p) => p !== SUBZI)).toEqual([categories(BASE), categories(CURRY), categories(EXTRAS), dishes(BASE), dishes(CURRY), dishes(SUBZI), dishes(EXTRAS)]);
  });
});

describe('link strength', () => {
  it('writes always as a hard rule and the others as a preference with a cost, and reads them back', () => {
    for (const r of [rule(dish, link('never', categories(EXTRAS), [4])), rule(dish, link('with', categories(BASE), [1]))]) {
      expect(r.spec.params).toMatchObject({ strength: 'must' });
      expect(read(r)?.strength).toBe('always');
    }
    const usually = rule(dish, link('never', dishes(EXTRAS), [4], 'usually'));
    expect(usually.spec.params).toMatchObject({ strength: 'prefer', cost: 10 });
    expect(read(usually)?.strength).toBe('usually');
    const sometimes = rule(dish, link('with', categories(BASE), [1], 'sometimes'));
    expect(sometimes.spec.params).toMatchObject({ strength: 'prefer', cost: 3 });
    expect(read(sometimes)?.strength).toBe('sometimes');
    expect(readOwned([sometimes], PARTS).links).toEqual([link('with', categories(BASE), [1], 'sometimes')]);
  });

  it('round-trips scope and every strength through each link shape', () => {
    const scope = { days: ['monday' as const], meals: ['lunch' as const] };
    for (const strength of ['always', 'usually', 'moderately', 'sometimes'] as const) {
      for (const shape of [link('with', categories(BASE), [1, 2], strength), link('never', categories(EXTRAS), [4], strength), link('with', dishes(BASE), [3], strength)]) {
        const l: DishLink = { ...shape, scope };
        const r = rule(dish, l);
        expect(read(r)).toEqual(l);
        expect(r.spec.params).toMatchObject({ scope });
      }
    }
    expect(rule(dish, link('never', categories(EXTRAS), [4], 'moderately')).spec.params).toMatchObject({ strength: 'prefer', cost: 6 });
    expect(rule(dish, { ...link('never', categories(EXTRAS), [4]), scope: { days: [], meals: ['lunch'] } }).spec.params).toMatchObject({ scope: { meals: ['lunch'] } });
    expect(rule(dish, { ...link('never', categories(EXTRAS), [4]), scope: { days: [] } }).spec.params).not.toHaveProperty('scope');
  });
});

describe('every mode and target kind', () => {
  it('round-trips through its rule and names the slot it fills', () => {
    const owner = { id: 7, name: 'Beans Poriyal', part_id: SUBZI };
    const cases: [DishLink['mode'], LinkTarget, string][] = [
      ['with', categories(BASE), 'pairs_with'], ['with', dishes(BASE), 'avoid_with'],
      ['never', categories(EXTRAS), 'avoid_with'], ['never', dishes(CURRY), 'avoid_with'],
      ['serve', categories(BASE), 'require_with'], ['serve', dishes(BASE), 'require_with'], ['serve', dishes(CURRY), 'require_with'], ['serve', categories(CURRY), 'require_with'],
      ['comes', categories(EXTRAS), 'comes_with'], ['comes', dishes(EXTRAS), 'comes_with'],
    ];
    for (const [mode, target, template] of cases) {
      const l = link(mode, target, [11, 12]);
      const r = rule(owner, l);
      expect(r.spec.template, `${mode}:${target.part}:${target.kind}`).toBe(template);
      expect(read(r)).toEqual(l);
      expect(ownedSlot(r, PARTS)).toBe(`${mode}:${target.part}:${target.kind}`);
      expect(linkSlotOf(l)).toBe(`${mode}:${target.part}:${target.kind}`);
    }
  });

  it('names its rule as today on the converted parts', () => {
    const names = (l: DishLink) => rule(dish, l).name;
    expect(names(link('with', categories(BASE), [1]))).toBe('Sambar: base pairing');
    expect(names(link('never', categories(BASE), [1]))).toBe('Sambar: not with these bases');
    expect(names(link('never', categories(EXTRAS), [4]))).toBe('Sambar: not with these extras');
    expect(names(link('never', categories(CURRY), [21]))).toBe('Sambar: not with these curries');
    expect(names(link('with', categories(EXTRAS), [4]))).toBe('Sambar: only with these extras');
    expect(names(link('serve', dishes(BASE), [1]))).toBe('Sambar: served with these bases');
    expect(names(link('serve', categories(BASE), [1]))).toBe('Sambar: served with these bases');
    expect(names(link('comes', dishes(EXTRAS), [16]))).toBe('Sambar: comes with');
    expect(names(link('never', dishes(EXTRAS), [16]))).toBe('Sambar: rule');
    expect(ownedRuleNameOf(rule(dish, link('comes', dishes(EXTRAS), [16])), PARTS, 'Tiffin Sambar')).toBe('Tiffin Sambar: comes with');
    expect(ownedRuleNameOf(exclusionRule(dish), PARTS, 'Tiffin Sambar')).toBe('Tiffin Sambar: never planned automatically');
  });

  it('does not take a hand-written never-together rule for a link', () => {
    const odd = { spec: { template: 'avoid_with' as const, params: { match: is('id', 7), with: is('part', CURRY), strength: 'must' as const } } };
    expect(read(odd as never)).toBeUndefined();
    expect(ownedSlot(odd as never, PARTS)).toBeUndefined();
  });

  it('does not read a hand-written also-include rule as a link', () => {
    const odd = { spec: { template: 'require_with' as const, params: { when: is('id', 3), components: [7, 8], categories: [], strength: 'must' as const } } };
    expect(read(odd as never)).toBeUndefined();
  });

  it('does not read a rule in the old component-type shape', () => {
    const old = { spec: { template: 'comes_with' as const, params: { match: is('id', 4), of: all(is('componentType', 'extra'), oneOf('id', [16])), strength: 'must' as const } } };
    expect(read(old as never)).toBeUndefined();
  });
});

describe('served with', () => {
  it('stores a serve link as an also-include rule the dish owns, and reads it back', () => {
    for (const target of [dishes(BASE), categories(BASE)]) {
      const l = { mode: 'serve' as const, target, values: [3, 4], strength: 'usually' as const, scope: { meals: ['breakfast' as const] } };
      const r = rule(dish, l);
      expect(r.spec).toMatchObject({ template: 'require_with', params: { components: [7], categories: [], strength: 'prefer', cost: 10, scope: { meals: ['breakfast'] } } });
      expect(read(r)).toEqual(l);
    }
  });

  it('"Papad comes with Sambar" on Papad\'s form is stored as served with: Papad is added when Sambar is in the meal', () => {
    const papad = { id: 16, name: 'Papad', part_id: EXTRAS };
    const mode = bringMode(papad.part_id, CURRY, PARTS);
    const r = rule(papad, link(mode, dishes(CURRY), [8]));
    expect(r.spec).toMatchObject({ template: 'require_with', params: { when: all(is('part', CURRY), oneOf('id', [8])), components: [16] } });
    expect(read(r)).toEqual(link('serve', dishes(CURRY), [8]));
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
  const targets = linkTargets(PARTS, (p) => p !== SUBZI);

  it('offers a curry served with bases, only with bases, never with every target and comes with every lower one', () => {
    expect(addableSlots(CURRY, [], targets, PARTS)).toEqual([
      'serve:1:category', 'with:1:category', 'never:1:category', 'never:2:category', 'comes:4:category', 'never:4:category',
      'serve:1:dish', 'with:1:dish', 'never:1:dish', 'never:2:dish', 'comes:3:dish', 'never:3:dish', 'comes:4:dish', 'never:4:dish',
    ]);
  });

  it('never offers only with below the first part: a link there is made as comes with', () => {
    for (const owner of [BASE, CURRY, SUBZI, EXTRAS]) {
      expect(addableSlots(owner, [], targets, PARTS).filter((s) => s.startsWith('with:') && !s.startsWith(`with:${BASE}:`))).toEqual([]);
    }
  });

  it('offers a base no served-with', () => {
    const slots = addableSlots(BASE, [], targets, PARTS);
    expect(slots.some((s) => s.startsWith('serve:') || s.startsWith('with:'))).toBe(false);
    expect(slots).toContain('never:2:category');
  });

  it('leaves out slots already taken, but a dish may bring or be added with several dishes of one part', () => {
    const slots = addableSlots(CURRY, [link('serve', categories(BASE), [1]), link('comes', dishes(EXTRAS), [16])], targets, PARTS);
    expect(slots).not.toContain('serve:1:category');
    expect(slots).toContain('serve:1:dish');
    expect(slots).toContain('comes:4:dish');
    expect(addableSlots(EXTRAS, [link('serve', dishes(CURRY), [8])], targets, PARTS)).toContain('serve:2:dish');
  });
});

describe('comes with', () => {
  const idiyappam = { id: 1, name: 'Idiyappam', part_id: BASE };
  const rice = { id: 4, name: 'Rice', part_id: BASE };

  it('a comes link round-trips through its rule', () => {
    for (const target of [dishes(CURRY), categories(CURRY), dishes(SUBZI), dishes(EXTRAS), categories(EXTRAS)]) {
      const l = link('comes', target, [11, 12]);
      const r = rule(idiyappam, l);
      expect(r.spec).toMatchObject({ template: 'comes_with', params: { of: all(is('part', target.part), oneOf(target.kind === 'dish' ? 'id' : 'category', [11, 12])) } });
      expect(r.name).toBe('Idiyappam: comes with');
      expect(read(r)).toEqual(l);
    }
    const soft: DishLink = { ...link('comes', dishes(CURRY), [11], 'usually'), scope: { meals: ['breakfast'] } };
    expect(read(rule(idiyappam, soft))).toEqual(soft);
  });

  it('a condition keyed by part round-trips, and a link without one reads back without the key', () => {
    const when = { [CURRY]: [8], [SUBZI]: [12] };
    const l: DishLink = { ...link('comes', dishes(EXTRAS), [16]), when };
    const r = rule(rice, l);
    expect(r.spec.params).toMatchObject({ when: { 2: [8], 3: [12] } });
    expect(read(r)).toEqual(l);
    expect(read(rule(rice, link('comes', dishes(EXTRAS), [16])))).not.toHaveProperty('when');
    expect(rule(rice, link('comes', dishes(EXTRAS), [16])).spec.params).not.toHaveProperty('when');
  });

  it('refuses a condition on the part it brings into, or on the first part', () => {
    expect(() => rule(rice, { ...link('comes', dishes(CURRY), [11]), when: { [CURRY]: [12] } })).toThrow('a link cannot wait for the part it brings into, or for the first part');
    expect(() => rule(rice, { ...link('comes', categories(CURRY), [21]), when: { [CURRY]: [12] } })).toThrow();
    expect(() => rule(rice, { ...link('comes', dishes(SUBZI), [12]), when: { [BASE]: [4] } })).toThrow();
    expect(() => rule(rice, { ...link('comes', dishes(CURRY), [11]), when: { [SUBZI]: [12] } })).not.toThrow();
    expect(() => rule(rice, { ...link('comes', dishes(SUBZI), [12]), when: { [CURRY]: [8] } })).not.toThrow();
  });

  it('stores no condition for an empty one, and drops empty parts', () => {
    expect(rule(rice, { ...link('comes', dishes(EXTRAS), [16]), when: {} }).spec.params).not.toHaveProperty('when');
    expect(rule(rice, { ...link('comes', dishes(EXTRAS), [16]), when: { [CURRY]: [], [SUBZI]: [] } }).spec.params).not.toHaveProperty('when');
    expect(rule(rice, { ...link('comes', dishes(EXTRAS), [16]), when: { [CURRY]: [8], [SUBZI]: [] } }).spec.params).toHaveProperty('when', { 2: [8] });
    expect(() => rule(rice, { ...link('comes', dishes(CURRY), [11]), when: { [CURRY]: [] } })).not.toThrow();
    expect(cleanWhen({ [SUBZI]: [12] })).toEqual({ 3: [12] });
    expect(cleanWhen(undefined)).toBeUndefined();
  });

  it('a change of condition is a change of link', () => {
    const a = link('comes', dishes(EXTRAS), [16]);
    expect(sameLink(a, { ...a, when: { [CURRY]: [8] } })).toBe(false);
    expect(sameLink({ ...a, when: { [CURRY]: [8, 9] } }, { ...a, when: { [CURRY]: [9, 8] } })).toBe(true);
    expect(sameLink({ ...a, when: { [CURRY]: [8] } }, { ...a, when: { [SUBZI]: [8] } })).toBe(false);
    expect(sameLink({ ...a, when: { [CURRY]: [8], [SUBZI]: [] } }, { ...a, when: { [CURRY]: [8] } })).toBe(true);
  });

  it('an old only-with link to side dishes still reads as with', () => {
    const r = rule(dish, { mode: 'with', target: dishes(EXTRAS), values: [11] });
    expect(r.spec.template).toBe('avoid_with');
    expect(read(r)).toMatchObject({ mode: 'with', target: dishes(EXTRAS), values: [11] });
  });
});

describe('links by rule id', () => {
  const idli = { id: 1, name: 'Idli' };
  const comes = (values: number[]) => link('comes', dishes(EXTRAS), values);

  it('readOwned keeps two links of the same kind', () => {
    const rules = [{ id: 7, ...rule(idli, comes([12])) }, { id: 5, ...rule(idli, comes([11])) }];
    expect(readOwned(rules, PARTS).links).toEqual([{ ...comes([11]), ruleId: 5 }, { ...comes([12]), ruleId: 7 }]);
  });

  it('linkChanges writes only what changed', () => {
    const a = { ...comes([11]), ruleId: 5 };
    const b = { ...comes([12]), ruleId: 7 };
    const changed = { ...b, values: [12, 13] };
    const c = comes([14]);
    expect(linkChanges([a, b], [a, changed, c])).toEqual([{ kind: 'update', ruleId: 7, link: changed }, { kind: 'add', link: c }]);
    expect(linkChanges([a, b], [{ ...b, values: [12] }, { ...a, values: [11] }])).toEqual([]);
    expect(linkChanges([a, b], [b])).toEqual([{ kind: 'remove', ruleId: 5 }]);
  });

  it('linkChanges treats a link with no values as absent', () => {
    const a = { ...comes([11]), ruleId: 5 };
    expect(linkChanges([a], [{ ...a, values: [] }])).toEqual([{ kind: 'remove', ruleId: 5 }]);
    expect(linkChanges([], [comes([])])).toEqual([]);
  });

  it('linkChanges updates a stored link the baseline left out', () => {
    const a = { ...comes([11]), ruleId: 5 };
    expect(linkChanges([], [a])).toEqual([{ kind: 'update', ruleId: 5, link: a }]);
  });

  it('sameLink ignores order and the rule id, and compares targets by part and kind', () => {
    expect(sameLink({ ...comes([11, 12]), ruleId: 5 }, comes([12, 11]))).toBe(true);
    expect(sameLink(comes([11]), comes([12]))).toBe(false);
    expect(sameLink(comes([11]), link('comes', categories(EXTRAS), [11]))).toBe(false);
    expect(sameLink(undefined, undefined)).toBe(true);
  });
});
