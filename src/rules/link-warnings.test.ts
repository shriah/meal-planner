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
      { link: 0, message: 'Rasam is also always served with one of these, and a meal holds one curry.' },
    ]);
    expect(linkWarnings(self, links, { dishes: [...dishes, rasam], rules: [theirs('usually')] }, names)).toEqual([]);
  });
});
