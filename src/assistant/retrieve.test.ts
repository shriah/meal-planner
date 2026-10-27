import { describe, expect, it } from 'vitest';
import { is } from '@/planner';
import { TEMPLATE_IDS, type RuleRecord } from '@/rules';
import type { CategoryRecord } from '@/types/category';
import type { ComponentRecord } from '@/types/component';
import { MAX_LIST_ITEMS } from './limits';
import { buildSlice, type AssistantData } from './retrieve';

const dish = (id: number, name: string, extra: Partial<ComponentRecord> = {}): ComponentRecord =>
  ({ id, name, componentType: 'curry', dietary_tags: [], regional_tags: [], occasion_tags: [], created_at: '', ...extra });
const rule = (id: number, spec: unknown, extra: Partial<RuleRecord> = {}): RuleRecord =>
  ({ id, name: `Rule ${id}`, enabled: true, spec: spec as RuleRecord['spec'], created_at: '', ...extra });
const exclude = (componentId: number) => ({ template: 'exclude', params: { match: is('id', componentId) } });
const data = (over: Partial<AssistantData> = {}): AssistantData => ({ library: [], categories: [], rules: [], ...over });

describe('buildSlice', () => {
  it('returns a named dish with the rules that reference it and the rules it owns', () => {
    const slice = buildSlice('why no Pulao on Monday', data({
      library: [dish(1, 'Pulao'), dish(2, 'Dal')],
      rules: [rule(10, exclude(1)), rule(11, exclude(2)), rule(12, exclude(2), { owner_component_id: 1 })],
    }));
    expect(slice.dishes).toEqual([{ id: 1, name: 'Pulao', type: 'curry' }]);
    expect(slice.rules.map((r) => r.id).sort()).toEqual([10, 12]);
    expect(slice.rules.find((r) => r.id === 12)?.ownerComponentId).toBe(1);
    expect(slice.rules.find((r) => r.id === 10)?.description).toContain('Pulao');
    expect(slice.mentionsAnything).toBe(true);
  });

  it('matches case-insensitively, and by tag or category name', () => {
    const library = [dish(1, 'Palak', { protein_tag: 'paneer' }), dish(2, 'Dal'), dish(3, 'Poori', { componentType: 'base', base_category_id: 5 })];
    const categories: CategoryRecord[] = [{ id: 5, kind: 'base', name: 'Bread-based', created_at: '' }];
    expect(buildSlice('ANY PANEER dishes?', data({ library })).dishes.map((d) => d.id)).toEqual([1]);
    expect(buildSlice('too much bread-based', data({ library, categories })).dishes.map((d) => d.id)).toEqual([3]);
  });

  it('matches one word of a Devanagari dish name', () => {
    const slice = buildSlice('आज पनीर क्यों नहीं', data({ library: [dish(1, 'पनीर मखनी'), dish(2, 'दाल')] }));
    expect(slice.dishes.map((d) => d.id)).toEqual([1]);
  });

  it('matches one word of an accented dish name without splitting at the accent', () => {
    const library = [dish(1, 'Crème brûlée'), dish(2, 'Brule')];
    expect(buildSlice('any crème tonight', data({ library })).dishes.map((d) => d.id)).toEqual([1]);
    expect(buildSlice('any brûlée tonight', data({ library })).dishes.map((d) => d.id)).toEqual([1]);
  });

  it('still matches a whole name with brackets', () => {
    expect(buildSlice('is dal (tadka) planned', data({ library: [dish(1, 'Dal (Tadka)')] })).dishes.map((d) => d.id)).toEqual([1]);
  });

  it('returns both a short dish name and a longer one containing it', () => {
    const slice = buildSlice('can I have rice twice', data({ library: [dish(1, 'Rice'), dish(2, 'Rice kheer'), dish(3, 'Dal')] }));
    expect(slice.dishes.map((d) => d.id).sort()).toEqual([1, 2]);
  });

  it('caps dishes and rules, keeping rules owned by a matched dish first', () => {
    const library = [dish(1, 'Pulao'), ...Array.from({ length: 30 }, (_, i) => dish(100 + i, `Pulao ${i}`))];
    const rules = [
      ...Array.from({ length: 30 }, (_, i) => rule(200 + i, exclude(1))),
      rule(999, exclude(500), { owner_component_id: 1 }),
    ];
    const slice = buildSlice('pulao', data({ library, rules }));
    expect(slice.dishes).toHaveLength(MAX_LIST_ITEMS);
    expect(slice.dishes[0].id).toBe(1);
    expect(slice.rules).toHaveLength(MAX_LIST_ITEMS);
    expect(slice.rules[0].id).toBe(999);
  });

  it('is empty for empty data', () => {
    const slice = buildSlice('hello', data());
    expect(slice).toEqual({
      dishes: [], rules: [],
      summary: { categories: [], dishCount: 0, ruleCount: 0, templates: TEMPLATE_IDS },
      mentionsAnything: false,
    });
  });

  it('summarises categories and counts without listing every dish', () => {
    const slice = buildSlice('hello', data({
      library: [dish(1, 'Dal'), dish(2, 'Rice')],
      categories: [{ id: 5, kind: 'base', name: 'rice-based', created_at: '' }],
      rules: [rule(1, exclude(1))],
    }));
    expect(slice.dishes).toEqual([]);
    expect(slice.summary).toMatchObject({ categories: ['rice-based'], dishCount: 2, ruleCount: 1 });
    expect(slice.mentionsAnything).toBe(false);
  });
});
