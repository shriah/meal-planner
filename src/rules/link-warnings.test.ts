import { describe, expect, it } from 'vitest';
import type { ComponentRecord, ComponentType } from '@/types/component';
import { exclusionRule, linkRule, mealRule, dayRule, type DishLink } from './owned';
import { linkWarnings } from './link-warnings';
import type { RuleRecord } from './record';

const names = {
  component: (id: number) => ({ 1: 'Idli', 2: 'Dosa', 3: 'Poori', 10: 'Sambar' } as Record<number, string>)[id],
  baseCategory: (id: number) => ({ 1: 'Rice-based' } as Record<number, string>)[id],
};
const dish = (id: number, componentType: ComponentType, over: Partial<ComponentRecord> = {}): ComponentRecord =>
  ({ id, name: names.component(id) ?? `Dish ${id}`, componentType, dietary_tags: [], regional_tags: [], occasion_tags: [], created_at: '', ...over }) as ComponentRecord;
const rec = (rule: ReturnType<typeof exclusionRule>, id: number, enabled = true): RuleRecord => ({ ...rule, id, enabled, created_at: '' }) as RuleRecord;
const self = { id: 10, name: 'Sambar', componentType: 'curry' as ComponentType };
const link = (over: Partial<DishLink>): DishLink => ({ mode: 'with', target: 'base_dish', values: [1], strength: 'always', ...over });
const dishes = [dish(1, 'base', { base_category_id: 1 }), dish(2, 'base', { base_category_id: 1 }), dish(3, 'base')];
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
    expect(linkWarnings(self, [link({ target: 'base_category', values: [1] }), ], { dishes: [dishes[0]], rules }, names)).toEqual([
      { link: 0, message: 'No dish in Rice-based can be planned, so Sambar would never be planned.' },
    ]);
  });

  it('counts deleted dishes as missing, ignores disabled exclusions and the dish itself', () => {
    expect(linkWarnings(self, [link({ values: [99] })], { dishes, rules: [] }, names)).toHaveLength(1);
    expect(linkWarnings(self, [link({})], { dishes, rules: [rec(exclusionRule(idli), 1, false)] }, names)).toEqual([]);
    expect(linkWarnings({ id: 1, componentType: 'base' }, [link({ mode: 'with', target: 'extra_dish', values: [1] })], { dishes, rules: [] }, names)).toHaveLength(1);
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
    const theirs = (strength: 'always' | 'usually') => rec(linkRule({ id: 11, name: 'Rasam' }, { mode: 'serve', target: 'base_dish', values: [1], strength }), 50);
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
  const comes = (values: (number | string)[], over: Partial<DishLink> = {}): DishLink => ({ mode: 'comes', target: 'curry_dish', values, strength: 'always', ...over });
  const servedWith = (id: number, name: string) =>
    rec(linkRule({ id, name }, { mode: 'serve', target: 'base_dish', values: [900], strength: 'always' }), 70 + id);

  it('two Always comes-with links needing the one curry block Save', () => {
    const w = linkWarnings(idiyappam, [comes([901]), comes([903])], { dishes: lib, rules: [] }, nm);
    expect(w).toEqual([{ link: 1, blocking: true, message: 'Idiyappam already always comes with Kerala Stew (Veg), and a meal holds one curry.' }]);
    expect(linkWarnings(idiyappam, [comes([901, 902]), comes([902, 903])], { dishes: lib, rules: [] }, nm)).toEqual([]);
    expect(linkWarnings(idiyappam, [comes([901]), comes([903], { strength: 'usually' })], { dishes: lib, rules: [] }, nm)).toEqual([]);
    expect(linkWarnings(idiyappam, [comes([901]), comes([903], { target: 'extra_dish' })], { dishes: lib, rules: [] }, nm)).toEqual([]);
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
    const sub = (values: number[]): DishLink => comes(values, { target: 'subzi_dish' });
    expect(linkWarnings(idiyappam, [sub([905]), sub([906])], { dishes: subzis, rules: [] }, nm)).toMatchObject([{ link: 1, blocking: true }]);
    expect(linkWarnings(idiyappam, [sub([905]), comes([901])], { dishes: subzis, rules: [] }, nm)).toEqual([]);
  });

  it('resolves a curry type link to its curries when judging disjoint', () => {
    const typed = [...lib, dish(907, 'curry', { name: 'Stew B', curry_category: 'stew' } as Partial<ComponentRecord>), dish(908, 'curry', { name: 'Dal', curry_category: 'lentil' } as Partial<ComponentRecord>)];
    const byType: DishLink = comes(['stew'], { target: 'curry_category' });
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
  const curry = (values: number[], over: Partial<DishLink> = {}): DishLink => ({ mode: 'comes', target: 'curry_dish', values, strength: 'always', ...over });
  const subzi = (values: number[], over: Partial<DishLink> = {}): DishLink => ({ mode: 'comes', target: 'subzi_dish', values, strength: 'always', ...over });
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
