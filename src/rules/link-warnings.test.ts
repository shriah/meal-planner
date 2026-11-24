import { describe, expect, it } from 'vitest';
import type { ComponentRecord, ComponentType } from '@/types/component';
import { exclusionRule, linkRule as buildLink, mealRule, dayRule, type DishLink } from './owned';
import { linkWarnings as warningsOver } from './link-warnings';
import type { RuleRecord } from './record';
import { is } from '@/planner';
import { capRules } from './defaults';
import { TEST_RULE_PARTS } from './test-parts';

// The converted parts: Base 1, Curry 2, Subzi 3, Extras 4.
const PARTS = TEST_RULE_PARTS.list;
const T = {
  base_dish: { part: 1, kind: 'dish' }, curry_dish: { part: 2, kind: 'dish' }, subzi_dish: { part: 3, kind: 'dish' }, extra_dish: { part: 4, kind: 'dish' },
  base_category: { part: 1, kind: 'category' }, curry_category: { part: 2, kind: 'category' },
} as const;
const linkRule = (owner: { id: number; name: string }, l: Parameters<typeof buildLink>[1]) => buildLink(owner, l, PARTS);
// The dish under edit is described by its type here; the warnings read its part and category.
type TestSelf = { id?: number; name?: string; componentType: ComponentType; base_category_id?: number };
const linkWarnings = (self: TestSelf, links: DishLink[], lookup: Omit<Parameters<typeof warningsOver>[2], 'parts'>, names?: Parameters<typeof warningsOver>[3]) =>
  warningsOver({ id: self.id, name: self.name, part_id: TEST_RULE_PARTS.legacy[self.componentType], category_id: self.base_category_id }, links, { ...lookup, parts: PARTS }, names);

const names = {
  component: (id: number) => ({ 1: 'Idli', 2: 'Dosa', 3: 'Poori', 10: 'Sambar' } as Record<number, string>)[id],
  category: (id: number) => ({ 1: 'Rice-based' } as Record<number, string>)[id],
};
const dish = (id: number, componentType: ComponentType, over: Partial<ComponentRecord> = {}): ComponentRecord =>
  ({ id, name: names.component(id) ?? `Dish ${id}`, componentType, dietary_tags: [], regional_tags: [], occasion_tags: [], created_at: '', ...over }) as ComponentRecord;
const rec = (rule: ReturnType<typeof exclusionRule>, id: number, enabled = true): RuleRecord => ({ ...rule, id, enabled, created_at: '' }) as RuleRecord;
const self = { id: 10, name: 'Sambar', componentType: 'curry' as ComponentType };
const link = (over: Partial<DishLink>): DishLink => ({ mode: 'with', target: T.base_dish, values: [1], strength: 'always', ...over });
const dishes = [dish(1, 'base', { base_category_id: 1, category_id: 1 }), dish(2, 'base', { base_category_id: 1, category_id: 1 }), dish(3, 'base')];
const idli = { id: 1, name: 'Idli' };

describe('linkWarnings', () => {
  it('flags a value both allowed and ruled out', () => {
    const links = [link({ values: [1, 2] }), link({ mode: 'never', values: [2] })];
    expect(linkWarnings(self, links, { dishes, rules: [] }, names)).toEqual([{ link: 0, message: 'Dosa is both allowed and ruled out.' }]);
  });

  it('capitalises a clash that starts with a deleted value', () => {
    const links = [link({ values: [99] }), link({ mode: 'never', values: [99] })];
    expect(linkWarnings(self, links, { dishes, rules: [] }, names)[0]).toEqual({ link: 0, message: 'A deleted dish is both allowed and ruled out.' });
  });

  it('words a dish target as "None of"', () => {
    const rules = [rec(exclusionRule(idli), 1), rec(exclusionRule({ id: 2, name: 'Dosa' }), 2)];
    expect(linkWarnings(self, [link({ values: [1, 2] })], { dishes, rules }, names)[0].message)
      .toBe('None of Idli or Dosa can be planned, so Sambar would never be planned.');
  });

  it('flags an always link whose dishes never plan automatically', () => {
    const rules = [rec(exclusionRule(idli), 1)];
    expect(linkWarnings(self, [link({ target: T.base_category, values: [1] }), ], { dishes: [dishes[0]], rules }, names)).toEqual([
      { link: 0, message: 'No dish in Rice-based can be planned, so Sambar would never be planned.' },
    ]);
  });

  it('counts deleted dishes as missing, ignores disabled exclusions and the dish itself', () => {
    expect(linkWarnings(self, [link({ values: [99] })], { dishes, rules: [] }, names)).toHaveLength(1);
    expect(linkWarnings(self, [link({})], { dishes, rules: [rec(exclusionRule(idli), 1, false)] }, names)).toEqual([]);
    expect(linkWarnings({ id: 1, componentType: 'base' }, [link({ mode: 'with', target: T.extra_dish, values: [1] })], { dishes, rules: [] }, names)).toHaveLength(1);
  });

  it('uses "this dish" when the dish has no name yet', () => {
    const w = linkWarnings({ componentType: 'curry' }, [link({ values: [99] })], { dishes, rules: [] }, names);
    expect(w[0].message).toBe('None of a deleted dish can be planned, so this dish would never be planned.');
  });

  it('flags chosen dishes that their own meals rule hides from the link scope', () => {
    const rules = [rec(mealRule(idli, ['dinner']), 1), rec(mealRule({ id: 2, name: 'Dosa' }, ['lunch']), 2)];
    expect(linkWarnings(self, [link({ values: [1, 2], scope: { meals: ['breakfast'] } })], { dishes, rules }, names)).toEqual([
      { link: 0, message: 'None of these are planned at breakfast.' },
    ]);
    // one dish can still be planned then
    expect(linkWarnings(self, [link({ values: [1, 3], scope: { meals: ['breakfast'] } })], { dishes, rules }, names)).toEqual([]);
  });

  it('flags chosen dishes that their own days rule hides from the link scope', () => {
    const rules = [rec(dayRule(idli, ['saturday']), 1)];
    expect(linkWarnings(self, [link({ scope: { days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] } })], { dishes, rules }, names)).toEqual([
      { link: 0, message: 'None of these are planned on weekdays.' },
    ]);
  });

  it('does not warn for usually links, never links or a valid link', () => {
    const rules = [rec(exclusionRule(idli), 1)];
    expect(linkWarnings(self, [link({ strength: 'usually' })], { dishes, rules }, names)).toEqual([]);
    expect(linkWarnings(self, [link({ mode: 'never' })], { dishes, rules }, names)).toEqual([]);
    expect(linkWarnings(self, [link({ values: [2] })], { dishes, rules }, names)).toEqual([]);
  });
});

describe('served-with warnings', () => {
  it('flags a base both served with and ruled out', () => {
    const links = [link({ mode: 'serve', values: [1, 2] }), link({ mode: 'never', values: [2] })];
    expect(linkWarnings(self, links, { dishes, rules: [] }, names)).toEqual([{ link: 0, message: 'Dosa is both served with and ruled out.' }]);
  });

  it('flags another curry always served with the same base, but not a softer one', () => {
    const rasam = dish(11, 'curry', { name: 'Rasam' });
    const theirs = (strength: 'always' | 'usually') => rec(linkRule({ id: 11, name: 'Rasam' }, { mode: 'serve', target: T.base_dish, values: [1], strength }), 50);
    const links = [link({ mode: 'serve', values: [1] })];
    expect(linkWarnings(self, links, { dishes: [...dishes, rasam], rules: [theirs('always')] }, names)).toEqual([
      { link: 0, blocking: true, message: 'Rasam is already always served with Idli, and a meal holds one curry.' },
    ]);
    expect(linkWarnings(self, links, { dishes: [...dishes, rasam], rules: [theirs('usually')] }, names)).toEqual([]);
  });
});

describe('comes-with warnings', () => {
  const nm = {
    component: (id: number) => ({ 900: 'Idiyappam', 901: 'Kerala Stew (Veg)', 902: 'Kerala Stew (Non-Veg)', 903: 'Egg Curry', 904: 'Sambar' } as Record<number, string>)[id],
  };
  const lib = [
    dish(900, 'base', { name: 'Idiyappam' }), dish(901, 'curry', { name: 'Kerala Stew (Veg)' }), dish(902, 'curry', { name: 'Kerala Stew (Non-Veg)' }),
    dish(903, 'curry', { name: 'Egg Curry' }), dish(904, 'curry', { name: 'Sambar' }),
  ];
  const idiyappam = { id: 900, name: 'Idiyappam', componentType: 'base' as ComponentType };
  const comes = (values: number[], over: Partial<DishLink> = {}): DishLink => ({ mode: 'comes', target: T.curry_dish, values, strength: 'always', ...over });
  const servedWith = (id: number, name: string) =>
    rec(linkRule({ id, name }, { mode: 'serve', target: T.base_dish, values: [900], strength: 'always' }), 70 + id);

  it('two Always comes-with links needing the one curry block Save', () => {
    const w = linkWarnings(idiyappam, [comes([901]), comes([903])], { dishes: lib, rules: [] }, nm);
    expect(w).toEqual([{ link: 1, blocking: true, message: 'Idiyappam already always comes with Kerala Stew (Veg), and a meal holds one curry.' }]);
    expect(linkWarnings(idiyappam, [comes([901, 902]), comes([902, 903])], { dishes: lib, rules: [] }, nm)).toEqual([]);
    expect(linkWarnings(idiyappam, [comes([901]), comes([903], { strength: 'usually' })], { dishes: lib, rules: [] }, nm)).toEqual([]);
    expect(linkWarnings(idiyappam, [comes([901]), comes([903], { target: T.extra_dish })], { dishes: lib, rules: [] }, nm)).toEqual([]);
  });

  it('an Always served-with on another curry blocks a disjoint comes-with', () => {
    const rules = [servedWith(904, 'Sambar')];
    const w = linkWarnings(idiyappam, [comes([901, 902])], { dishes: lib, rules }, nm);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ link: 0, blocking: true });
    expect(linkWarnings(idiyappam, [comes([901, 902])], { dishes: lib, rules: [{ ...rules[0], enabled: false }] }, nm)).toEqual([]);
  });

  it('a curry always served with a base that always comes with other curries is blocked', () => {
    const rules = [rec(linkRule({ id: 900, name: 'Idiyappam' }, comes([901, 902])), 80)];
    const sambar = { id: 904, name: 'Sambar', componentType: 'curry' as ComponentType };
    const serve = link({ mode: 'serve', values: [900] });
    expect(linkWarnings(sambar, [serve], { dishes: lib, rules }, nm)).toMatchObject([{ link: 0, blocking: true }]);
    expect(linkWarnings({ id: 901, name: 'Kerala Stew (Veg)', componentType: 'curry' }, [serve], { dishes: lib, rules }, nm)).toEqual([]);
  });

  it('an Always served-with that narrows a comes-with link warns', () => {
    const w = linkWarnings(idiyappam, [comes([901, 902])], { dishes: lib, rules: [servedWith(901, 'Kerala Stew (Veg)')] }, nm);
    expect(w).toEqual([{ link: 0, message: 'Kerala Stew (Veg) is always served with Idiyappam, so Kerala Stew (Non-Veg) will never be picked. Remove that link on Kerala Stew (Veg) to let either come.' }]);
    expect(linkWarnings(idiyappam, [comes([901])], { dishes: lib, rules: [servedWith(901, 'Kerala Stew (Veg)')] }, nm)).toEqual([]);
  });

  it('a comes link whose dishes were all deleted does not block a dish served with the base', () => {
    expect(linkWarnings(idiyappam, [comes([999])], { dishes: lib, rules: [servedWith(904, 'Sambar')] }, nm).filter((w) => w.blocking)).toEqual([]);
  });

  it('two disjoint Always comes links to subzis block Save', () => {
    const subzis = [...lib, dish(905, 'subzi', { name: 'Beans' }), dish(906, 'subzi', { name: 'Cabbage' })];
    const sub = (values: number[]): DishLink => comes(values, { target: T.subzi_dish });
    expect(linkWarnings(idiyappam, [sub([905]), sub([906])], { dishes: subzis, rules: [] }, nm)).toMatchObject([{ link: 1, blocking: true }]);
    expect(linkWarnings(idiyappam, [sub([905]), comes([901])], { dishes: subzis, rules: [] }, nm)).toEqual([]);
  });

  it('resolves a curry type link to its curries when judging disjoint', () => {
    const typed = [...lib, dish(907, 'curry', { name: 'Stew B', curry_category: 'stew', category_id: 21 } as Partial<ComponentRecord>), dish(908, 'curry', { name: 'Dal', curry_category: 'lentil', category_id: 22 } as Partial<ComponentRecord>)];
    // The curry type stew is the Curry part's category 21.
    const byType: DishLink = comes([21], { target: T.curry_category });
    expect(linkWarnings(idiyappam, [byType, comes([907])], { dishes: typed, rules: [] }, nm)).toEqual([]);
    expect(linkWarnings(idiyappam, [byType, comes([908])], { dishes: typed, rules: [] }, nm)).toMatchObject([{ link: 1, blocking: true }]);
  });

  it('a comes-with link to nothing plannable warns', () => {
    const rules = [rec(exclusionRule({ id: 901, name: 'Kerala Stew (Veg)' }), 90)];
    expect(linkWarnings(idiyappam, [comes([901])], { dishes: lib, rules }, nm)).toEqual([
      { link: 0, message: 'None of Kerala Stew (Veg) can be planned, so Idiyappam would never be planned.' },
    ]);
  });
});

describe('meal-level comes-with clashes', () => {
  const nm = {
    component: (id: number) => ({ 900: 'Idiyappam', 901: 'Kerala Stew (Veg)', 902: 'Kerala Stew (Non-Veg)', 905: 'Beans', 906: 'Cabbage', 907: 'Egg Curry' } as Record<number, string>)[id],
  };
  const lib = [
    dish(900, 'base', { name: 'Idiyappam' }), dish(901, 'curry', { name: 'Kerala Stew (Veg)' }), dish(902, 'curry', { name: 'Kerala Stew (Non-Veg)' }),
    dish(905, 'subzi', { name: 'Beans' }), dish(906, 'subzi', { name: 'Cabbage' }), dish(907, 'curry', { name: 'Egg Curry' }),
  ];
  const idiyappam = { id: 900, name: 'Idiyappam', componentType: 'base' as ComponentType };
  const stewVeg = { id: 901, name: 'Kerala Stew (Veg)', componentType: 'curry' as ComponentType };
  const curry = (values: number[], over: Partial<DishLink> = {}): DishLink => ({ mode: 'comes', target: T.curry_dish, values, strength: 'always', ...over });
  const subzi = (values: number[], over: Partial<DishLink> = {}): DishLink => ({ mode: 'comes', target: T.subzi_dish, values, strength: 'always', ...over });
  let next = 500;
  const stored = (owner: { id: number; name: string }, l: DishLink) => rec(linkRule(owner, l), next++);
  const blocking = (w: ReturnType<typeof linkWarnings>) => w.filter((x) => x.blocking);

  describe("on the dish's own form", () => {
    const stewBringsBeans = (over: Partial<DishLink> = {}) => stored({ id: 901, name: 'Kerala Stew (Veg)' }, subzi([905], over));

    it('blocks a subzi link that the always curry leaves no room for', () => {
      const w = linkWarnings(idiyappam, [curry([901]), subzi([906])], { dishes: lib, rules: [stewBringsBeans()] }, nm);
      expect(w).toEqual([{ link: 1, blocking: true, message: 'Kerala Stew (Veg) always comes with Beans, which leaves no room for Cabbage, and a meal holds one subzi.' }]);
      // Either order: the later of the two links carries it.
      expect(blocking(linkWarnings(idiyappam, [subzi([906]), curry([901])], { dishes: lib, rules: [stewBringsBeans()] }, nm))).toMatchObject([{ link: 1 }]);
    });

    it('does not block when the sets overlap', () => {
      expect(linkWarnings(idiyappam, [curry([901]), subzi([905, 906])], { dishes: lib, rules: [stewBringsBeans()] }, nm)).toEqual([]);
    });

    it('does not block a softer, scoped or switched-off link on either side', () => {
      const rules = [stewBringsBeans()];
      expect(blocking(linkWarnings(idiyappam, [curry([901], { strength: 'usually' }), subzi([906])], { dishes: lib, rules }, nm))).toEqual([]);
      expect(blocking(linkWarnings(idiyappam, [curry([901]), subzi([906], { strength: 'usually' })], { dishes: lib, rules }, nm))).toEqual([]);
      expect(blocking(linkWarnings(idiyappam, [curry([901]), subzi([906])], { dishes: lib, rules: [stewBringsBeans({ strength: 'usually' })] }, nm))).toEqual([]);
      expect(blocking(linkWarnings(idiyappam, [curry([901]), subzi([906])], { dishes: lib, rules: [stewBringsBeans({ scope: { meals: ['lunch'] } })] }, nm))).toEqual([]);
      expect(blocking(linkWarnings(idiyappam, [curry([901]), subzi([906])], { dishes: lib, rules: [{ ...stewBringsBeans(), enabled: false }] }, nm))).toEqual([]);
    });

    it('blocks only when every curry the link may bring leaves no room', () => {
      const rules = [stewBringsBeans()];
      expect(blocking(linkWarnings(idiyappam, [curry([901, 902]), subzi([906])], { dishes: lib, rules }, nm))).toEqual([]);
      const both = [...rules, stored({ id: 902, name: 'Kerala Stew (Non-Veg)' }, subzi([905]))];
      expect(blocking(linkWarnings(idiyappam, [curry([901, 902]), subzi([906])], { dishes: lib, rules: both }, nm))).toEqual([
        { link: 1, blocking: true, message: 'Kerala Stew (Veg) and Kerala Stew (Non-Veg) each always come with another subzi, which leaves no room for Cabbage, and a meal holds one subzi.' },
      ]);
    });

    it('judges the other way round too: an always subzi that brings a curry', () => {
      const rules = [stored({ id: 906, name: 'Cabbage' }, curry([907]))];
      expect(linkWarnings(idiyappam, [curry([901]), subzi([906])], { dishes: lib, rules }, nm)).toEqual([
        { link: 1, blocking: true, message: 'Cabbage always comes with Egg Curry, which leaves no room for Kerala Stew (Veg), and a meal holds one curry.' },
      ]);
    });
  });

  describe("on the curry's form", () => {
    const idiyappamBrings = (l: DishLink) => stored({ id: 900, name: 'Idiyappam' }, l);

    it('blocks a subzi link when a base that always comes with only this curry wants another subzi', () => {
      const rules = [idiyappamBrings(curry([901])), idiyappamBrings(subzi([906]))];
      expect(linkWarnings(stewVeg, [subzi([905])], { dishes: lib, rules }, nm)).toEqual([
        { link: 0, blocking: true, message: 'Idiyappam always comes with Kerala Stew (Veg) and with Cabbage, which leaves no room for Beans, and a meal holds one subzi.' },
      ]);
    });

    it('does not block when the sets overlap', () => {
      const rules = [idiyappamBrings(curry([901])), idiyappamBrings(subzi([906]))];
      expect(linkWarnings(stewVeg, [subzi([905, 906])], { dishes: lib, rules }, nm)).toEqual([]);
    });

    it('does not block a softer link on either side, or a base that may bring another curry', () => {
      const rules = [idiyappamBrings(curry([901])), idiyappamBrings(subzi([906]))];
      expect(blocking(linkWarnings(stewVeg, [subzi([905], { strength: 'usually' })], { dishes: lib, rules }, nm))).toEqual([]);
      expect(blocking(linkWarnings(stewVeg, [subzi([905])], { dishes: lib, rules: [idiyappamBrings(curry([901])), idiyappamBrings(subzi([906], { strength: 'usually' }))] }, nm))).toEqual([]);
      expect(blocking(linkWarnings(stewVeg, [subzi([905])], { dishes: lib, rules: [idiyappamBrings(curry([901], { strength: 'usually' })), idiyappamBrings(subzi([906]))] }, nm))).toEqual([]);
      expect(blocking(linkWarnings(stewVeg, [subzi([905])], { dishes: lib, rules: [idiyappamBrings(curry([901, 902])), idiyappamBrings(subzi([906]))] }, nm))).toEqual([]);
    });
  });
});

describe('conditional comes-with clashes', () => {
  const nm = {
    component: (id: number) => ({ 900: 'Rice', 901: 'Sambar', 902: 'Rasam', 905: 'Beans Poriyal', 906: 'Aloo Gobi', 907: 'Cabbage' } as Record<number, string>)[id],
  };
  const lib = [
    dish(900, 'base', { name: 'Rice' }), dish(901, 'curry', { name: 'Sambar' }), dish(902, 'curry', { name: 'Rasam' }),
    dish(905, 'subzi', { name: 'Beans Poriyal' }), dish(906, 'subzi', { name: 'Aloo Gobi' }), dish(907, 'subzi', { name: 'Cabbage' }),
  ];
  const rice = { id: 900, name: 'Rice', componentType: 'base' as ComponentType };
  const subzi = (values: number[], over: Partial<DishLink> = {}): DishLink => ({ mode: 'comes', target: T.subzi_dish, values, strength: 'always', ...over });
  const when = (curry: number[]) => ({ when: { 2: curry } });
  const blocking = (w: ReturnType<typeof linkWarnings>) => w.filter((x) => x.blocking);
  const servedWithRice = (id: number, name: string) =>
    rec(linkRule({ id, name }, { mode: 'serve', target: T.base_dish, values: [900], strength: 'always' }), 70 + id);

  it("blocks an Always conditional subzi link against the base's own unconditional Always subzi link", () => {
    const message = 'Rice already always comes with Aloo Gobi, and a meal holds one subzi.';
    expect(linkWarnings(rice, [subzi([906]), subzi([905], when([901]))], { dishes: lib, rules: [] }, nm)).toEqual([{ link: 1, blocking: true, message }]);
    // The conditional link carries it, whichever comes first.
    expect(linkWarnings(rice, [subzi([905], when([901])), subzi([906])], { dishes: lib, rules: [] }, nm)).toEqual([{ link: 0, blocking: true, message }]);
    // Sharing a dish, a softer or a scoped link: no clash.
    expect(blocking(linkWarnings(rice, [subzi([906]), subzi([905, 906], when([901]))], { dishes: lib, rules: [] }, nm))).toEqual([]);
    expect(blocking(linkWarnings(rice, [subzi([906], { strength: 'usually' }), subzi([905], when([901]))], { dishes: lib, rules: [] }, nm))).toEqual([]);
    expect(blocking(linkWarnings(rice, [subzi([906]), subzi([905], { ...when([901]), strength: 'usually' })], { dishes: lib, rules: [] }, nm))).toEqual([]);
    expect(blocking(linkWarnings(rice, [subzi([906], { scope: { meals: ['lunch'] } }), subzi([905], when([901]))], { dishes: lib, rules: [] }, nm))).toEqual([]);
  });

  it('blocks an Always conditional subzi link against an Always subzi served with this base', () => {
    const rules = [servedWithRice(906, 'Aloo Gobi')];
    expect(linkWarnings(rice, [subzi([905], when([901]))], { dishes: lib, rules }, nm)).toEqual([
      { link: 0, blocking: true, message: 'Aloo Gobi is always served with Rice, which leaves no room for Beans Poriyal, and a meal holds one subzi.' },
    ]);
    expect(blocking(linkWarnings(rice, [subzi([905, 906], when([901]))], { dishes: lib, rules }, nm))).toEqual([]);
  });

  it('blocks two Always conditional subzi links whose curries overlap, and not ones waiting for different curries', () => {
    const message = 'Rice already always comes with Aloo Gobi, and a meal holds one subzi.';
    expect(linkWarnings(rice, [subzi([906], when([901, 902])), subzi([905], when([901]))], { dishes: lib, rules: [] }, nm)).toEqual([{ link: 1, blocking: true, message }]);
    // Different curries never meet in one meal.
    expect(linkWarnings(rice, [subzi([906], when([902])), subzi([905], when([901]))], { dishes: lib, rules: [] }, nm)).toEqual([]);
    expect(blocking(linkWarnings(rice, [subzi([906], when([901])), subzi([905, 906], when([901]))], { dishes: lib, rules: [] }, nm))).toEqual([]);
  });

  it('a conditional extra link never clashes, and a conditional link does not count as bringing in every meal', () => {
    const papad: DishLink = { mode: 'comes', target: T.extra_dish, values: [907], strength: 'always', when: { 2: [901] } };
    expect(blocking(linkWarnings(rice, [papad, subzi([905])], { dishes: lib, rules: [] }, nm))).toEqual([]);
    // From Beans Poriyal's form: served with Rice, which only brings Aloo Gobi with Sambar.
    const rules = [rec(linkRule({ id: 900, name: 'Rice' }, subzi([906], when([901]))), 80)];
    const beans = { id: 905, name: 'Beans Poriyal', componentType: 'subzi' as ComponentType };
    expect(blocking(linkWarnings(beans, [link({ mode: 'serve', values: [900] })], { dishes: lib, rules }, nm))).toEqual([]);
  });

  it('counts a conditional subzi link on the curry it waits for, from that curry\'s form', () => {
    // Rice always comes with Sambar, and with Aloo Gobi when the curry is Sambar; Sambar always comes with Beans Poriyal.
    const rules = [
      rec(linkRule({ id: 900, name: 'Rice' }, { mode: 'comes', target: T.curry_dish, values: [901], strength: 'always' }), 80),
      rec(linkRule({ id: 900, name: 'Rice' }, subzi([906], when([901]))), 81),
    ];
    const sambar = { id: 901, name: 'Sambar', componentType: 'curry' as ComponentType };
    expect(blocking(linkWarnings(sambar, [subzi([905])], { dishes: lib, rules }, nm))).toEqual([
      { link: 0, blocking: true, message: 'Rice always comes with Sambar and with Aloo Gobi, which leaves no room for Beans Poriyal, and a meal holds one subzi.' },
    ]);
    // Waiting for another curry, it never meets Sambar.
    const other = [rules[0], rec(linkRule({ id: 900, name: 'Rice' }, subzi([906], when([902]))), 81)];
    expect(blocking(linkWarnings(sambar, [subzi([905])], { dishes: lib, rules: other }, nm))).toEqual([]);
  });
});

describe('link warnings over the parts a rule caps', () => {
  // Main 1, Side 2, Dessert 3: no converted parts, so only a cap rule makes a part hold one dish.
  const parts = [{ id: 1, name: 'Main', varied: true }, { id: 2, name: 'Side', varied: true }, { id: 3, name: 'Dessert', varied: true }];
  const nm = { component: (id: number) => ({ 1: 'Rice', 2: 'Raita', 3: 'Pickle', 4: 'Kheer' } as Record<number, string>)[id] };
  const inPart = (id: number, part_id: number) => dish(id, 'base', { part_id, name: nm.component(id) });
  const lib = [inPart(1, 1), inPart(2, 2), inPart(3, 2), inPart(4, 3)];
  const sideCap = rec({ name: 'At most one Side per meal', spec: { template: 'limit', params: { match: is('part', 2), per: 'meal', max: 1, strength: 'must' } } } as ReturnType<typeof exclusionRule>, 50);
  const sides = (values: number[]): DishLink => ({ mode: 'comes', target: { part: 2, kind: 'dish' }, values, strength: 'always' });
  const rice = { id: 1, name: 'Rice', part_id: 1 };
  const over = (links: DishLink[], rules: RuleRecord[]) => warningsOver(rice, links, { dishes: lib, rules, parts }, nm);

  it('two Always links to different sides block when a rule caps the Side part', () => {
    expect(over([sides([2]), sides([3])], [sideCap])).toEqual([{ link: 1, blocking: true, message: 'Rice already always comes with Raita, and a meal holds one side.' }]);
  });

  it('gives no warning without that cap, and none for a part nothing caps', () => {
    expect(over([sides([2]), sides([3])], [])).toEqual([]);
    expect(over([sides([2]), { ...sides([4]), target: { part: 3, kind: 'dish' } }], [sideCap])).toEqual([]);
  });

  it('a disabled cap does not count', () => {
    expect(over([sides([2]), sides([3])], [{ ...sideCap, enabled: false }])).toEqual([]);
  });

  it('on converted parts, two Always curries still block with the curry cap rule deleted', () => {
    const w = warningsOver({ id: 900, name: 'Idiyappam', part_id: 1 }, [
      { mode: 'comes', target: T.curry_dish, values: [901], strength: 'always' }, { mode: 'comes', target: T.curry_dish, values: [903], strength: 'always' },
    ], { dishes: [dish(901, 'curry', { name: 'Stew' }), dish(903, 'curry', { name: 'Egg Curry' })], rules: capRules(PARTS).slice(1).map((c, i) => rec(c as ReturnType<typeof exclusionRule>, i + 1)), parts: PARTS }, { component: (id) => ({ 901: 'Stew', 903: 'Egg Curry' } as Record<number, string>)[id] });
    expect(w.map((x) => x.message)).toEqual(['Idiyappam already always comes with Stew, and a meal holds one curry.']);
  });

  it('judges a dish in a capped part by its own part', () => {
    // Raita is a Side; a link that makes it always served with the same Main as Pickle (also a Side) clashes.
    const serves = (id: number, name: string) => rec(linkRule({ id, name }, { mode: 'serve', target: { part: 1, kind: 'dish' }, values: [1], strength: 'always' }), 60 + id);
    const w = warningsOver({ id: 2, name: 'Raita', part_id: 2 }, [{ mode: 'serve', target: { part: 1, kind: 'dish' }, values: [1], strength: 'always' }], { dishes: lib, rules: [sideCap, serves(3, 'Pickle')], parts }, nm);
    expect(w).toEqual([{ link: 0, blocking: true, message: 'Pickle is already always served with Rice, and a meal holds one side.' }]);
  });

  it('does not throw with no parts or no part for the dish', () => {
    expect(warningsOver(rice, [sides([2])], { dishes: lib, rules: [], parts: [] }, nm)).toEqual([]);
    expect(warningsOver({ name: 'New' }, [sides([2])], { dishes: lib, rules: [sideCap], parts }, nm)).toEqual([]);
  });
});
