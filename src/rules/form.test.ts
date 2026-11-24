import { describe, expect, it } from 'vitest';
import { all, is, TRUE } from '@/planner';
import { categoryChoices, newSpec, type FormContext, previewMatches, TEMPLATE_FORMS, validateDraft, type StoredDish } from './form';
import { RuleSpecSchema, TEMPLATE_IDS } from './templates';

describe('rule forms', () => {
  it('has a form for every template whose fields are real params', () => {
    for (const id of TEMPLATE_IDS) {
      const form = TEMPLATE_FORMS[id];
      const params = form.defaults() as Record<string, unknown>;
      for (const field of form.fields) {
        if (!field.optional) expect(params, `${id}.${field.key}`).toHaveProperty(field.key);
      }
    }
  });

  it('defaults only need a condition (and for require_with and pairs_with, something to choose) to become valid', () => {
    for (const id of TEMPLATE_IDS) {
      const spec = newSpec(id) as { template: string; params: Record<string, unknown> };
      for (const key of ['match', 'when']) if (key in spec.params) spec.params[key] = is('protein_tag', 'fish');
      if (id === 'require_with') spec.params.components = [1];
      if (id === 'pairs_with') spec.params.categories = [1];
      if (id === 'only_allow') spec.params.parts = [2];
      if (id === 'skip_when') spec.params.skip = [3];
      if (id === 'comes_with') spec.params.of = all(is('part', 2), is('id', 1));
      expect(RuleSpecSchema.safeParse(spec).success, id).toBe(true);
    }
  });

  it('chooses parts by id: which an only-allow covers, which a leave-out drops, which a no-repeat counts', () => {
    const kinds = (id: 'only_allow' | 'skip_when' | 'no_repeat') => TEMPLATE_FORMS[id].fields.map((f) => [f.key, f.kind]);
    expect(kinds('only_allow')).toContainEqual(['parts', 'parts']);
    expect(kinds('skip_when')).toContainEqual(['skip', 'skip']);
    expect(kinds('no_repeat')).toContainEqual(['parts', 'parts']);
    expect(TEMPLATE_FORMS.no_repeat.fields.find((f) => f.key === 'parts')?.optional).toBe(true);
    expect(newSpec('only_allow').params).toMatchObject({ parts: [] });
    expect(newSpec('skip_when').params).toMatchObject({ skip: [] });
    expect(newSpec('no_repeat').params).not.toHaveProperty('parts');
  });

  it('reports errors against the field they belong to', () => {
    const r = validateDraft({ name: ' ', spec: { template: 'limit', params: { match: TRUE, per: 'week', min: 3, max: 1 } } });
    expect(r).toEqual({ ok: false, errors: { name: 'Give the rule a name', match: 'Add at least one condition', min: 'minimum must not exceed maximum' } });
  });

  it('requires a value in every condition', () => {
    const r = validateDraft({ name: 'x', spec: { template: 'exclude', params: { match: { field: 'protein_tag', op: 'in', value: [] } } } });
    expect(r.ok).toBe(false);
  });

  it('returns the parsed spec with defaults and a trimmed name', () => {
    const r = validateDraft({ name: ' No fish ', spec: { template: 'exclude', params: { match: is('protein_tag', 'fish') } } });
    expect(r).toEqual({ ok: true, name: 'No fish', spec: { template: 'exclude', params: { match: is('protein_tag', 'fish'), strength: 'must' } } });
  });

  it('edits a pairing\'s days and meals, and keeps them through the form', () => {
    const keys = TEMPLATE_FORMS.pairs_with.fields.map((f) => f.key);
    expect(keys).toContain('scope');
    expect(keys.indexOf('scope')).toBe(keys.indexOf('strength') - 1);
    const scope = { days: ['monday' as const], meals: ['lunch' as const] };
    const r = validateDraft({ name: 'Sambar with rice', spec: { template: 'pairs_with', params: { match: is('id', 12), categories: [1], scope, strength: 'prefer', cost: 6 } } });
    expect(r).toEqual({ ok: true, name: 'Sambar with rice', spec: { template: 'pairs_with', params: { match: is('id', 12), categories: [1], scope, strength: 'prefer', cost: 6 } } });
  });

  it('previews which components a condition matches', () => {
    const lib = [
      { id: 1, name: 'Fish Curry', componentType: 'curry', protein_tag: 'fish', dietary_tags: ['non-veg'], regional_tags: [], occasion_tags: [] },
      { id: 2, name: 'Fish Fry', componentType: 'extra', protein_tag: 'fish', dietary_tags: ['non-veg'], regional_tags: [], occasion_tags: [] },
      { id: 3, name: 'Dal', componentType: 'curry', protein_tag: 'dal', dietary_tags: ['veg'], regional_tags: [], occasion_tags: [] },
    ] satisfies StoredDish[];
    expect(previewMatches(all(is('componentType', 'curry'), is('protein_tag', 'fish')), lib).map((c) => c.name)).toEqual(['Fish Curry']);
    expect(previewMatches(is('role', 'extra'), lib).map((c) => c.name)).toEqual(['Fish Fry']);
  });

  describe('a new rule on the converted parts', () => {
    // Base, Curry, Subzi, Extras in meal order; Curry and Subzi capped at one per meal; Extras not varied.
    const ctx: FormContext = {
      parts: [{ id: 1, varied: true }, { id: 2, varied: true }, { id: 3, varied: true }, { id: 4, varied: false }],
      capped: new Set([2, 3]),
    };

    it("counts the varied parts for a don't-repeat rule", () => {
      expect(newSpec('no_repeat', ctx).params).toMatchObject({ parts: [1, 2, 3] });
    });

    it('limits an only-allow rule to the first capped part after the first (Curry)', () => {
      expect(newSpec('only_allow', ctx).params).toMatchObject({ parts: [2] });
    });

    it('leaves out the last capped part after the first (Subzi)', () => {
      expect(newSpec('skip_when', ctx).params).toMatchObject({ skip: [3] });
    });

    it('starts the part lists empty when the parts are not known', () => {
      expect(newSpec('no_repeat').params).not.toHaveProperty('parts');
      expect(newSpec('only_allow').params).toMatchObject({ parts: [] });
      expect(newSpec('skip_when').params).toMatchObject({ skip: [] });
    });

    it('never preselects a part the rules do not cap', () => {
      const none = { ...ctx, capped: new Set<number>() };
      expect(newSpec('only_allow', none).params).toMatchObject({ parts: [] });
      expect(newSpec('skip_when', none).params).toMatchObject({ skip: [] });
    });
  });

  describe('category fields', () => {
    const parts = [
      { id: 7, name: 'Main' },
      { id: 8, name: 'Side' },
      { id: 9, name: 'Dessert' },
    ];
    const categories = [
      { id: 1, name: 'Rice-based', part_id: 7 },
      { id: 2, name: 'Crunchy', part_id: 8 },
      { id: 3, name: 'Bread-based', part_id: 7 },
      { id: 4, name: 'Sweet', part_id: 9 },
    ];

    it('has the pairing and requirement fields choose categories by part', () => {
      expect(TEMPLATE_FORMS.pairs_with.fields.find((f) => f.key === 'categories')).toMatchObject({ kind: 'categories', part: 'first', label: 'Only with a base from' });
      expect(TEMPLATE_FORMS.require_with.fields.find((f) => f.key === 'categories')).toMatchObject({ kind: 'categories', part: 'any', label: 'And an extra from' });
    });

    it('offers the first part\'s categories as they are named', () => {
      expect(categoryChoices('first', parts, categories)).toEqual([{ id: 1, label: 'Rice-based' }, { id: 3, label: 'Bread-based' }]);
    });

    it('offers every part\'s categories labelled by part, in meal order', () => {
      expect(categoryChoices('any', parts, categories)).toEqual([
        { id: 1, label: 'Rice-based (Main)' }, { id: 3, label: 'Bread-based (Main)' },
        { id: 2, label: 'Crunchy (Side)' }, { id: 4, label: 'Sweet (Dessert)' },
      ]);
    });

    it('offers nothing before the parts are known', () => {
      expect(categoryChoices('first', [], categories)).toEqual([]);
      expect(categoryChoices('any', [], categories)).toEqual([]);
    });
  });
});
