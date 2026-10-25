import { describe, expect, it } from 'vitest';
import { all, is, TRUE, type ComponentLike } from '@/planner';
import { newSpec, previewMatches, TEMPLATE_FORMS, validateDraft } from './form';
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
      if (id === 'pairs_with') spec.params.baseCategories = [1];
      expect(RuleSpecSchema.safeParse(spec).success, id).toBe(true);
    }
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

  it('previews which components a condition matches', () => {
    const lib = [
      { id: 1, name: 'Fish Curry', componentType: 'curry', protein_tag: 'fish', dietary_tags: ['non-veg'], regional_tags: [], occasion_tags: [] },
      { id: 2, name: 'Fish Fry', componentType: 'extra', protein_tag: 'fish', dietary_tags: ['non-veg'], regional_tags: [], occasion_tags: [] },
      { id: 3, name: 'Dal', componentType: 'curry', protein_tag: 'dal', dietary_tags: ['veg'], regional_tags: [], occasion_tags: [] },
    ] satisfies ComponentLike[];
    expect(previewMatches(all(is('componentType', 'curry'), is('protein_tag', 'fish')), lib).map((c) => c.name)).toEqual(['Fish Curry']);
    expect(previewMatches(is('role', 'extra'), lib).map((c) => c.name)).toEqual(['Fish Fry']);
  });
});
