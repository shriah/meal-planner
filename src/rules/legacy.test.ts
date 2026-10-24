import { describe, expect, it } from 'vitest';
import { all, is } from '@/planner';
import { convertLegacyRule, type ConversionContext, type LegacyRuleRow } from './legacy';
import { describeSpec, RuleSpecSchema } from './templates';

const ctx: ConversionContext = {
  known: { components: new Set([1, 5, 31]), baseCategories: new Set([10]), extraCategories: new Set([30]) },
  componentTypes: new Map([[1, 'base'], [5, 'curry'], [31, 'extra']]),
};
const row = (compiled_filter: unknown, extra: Partial<LegacyRuleRow> = {}): LegacyRuleRow =>
  ({ id: 9, name: 'Old rule', enabled: true, compiled_filter, created_at: '2026-01-01', ...extra });
const legacy = (target: unknown, effects: unknown[], scope: { days: string[] | null; slots: string[] | null } = { days: null, slots: null }) =>
  row({ type: 'rule', target, scope, effects });
const converted = (r: LegacyRuleRow) => {
  const res = convertLegacyRule(r, ctx);
  if (!res.ok) throw new Error(`dropped: ${res.dropped.reason}`);
  return res.rules;
};
const dropped = (r: LegacyRuleRow) => {
  const res = convertLegacyRule(r, ctx);
  if (res.ok) throw new Error('expected the rule to be dropped');
  return res.dropped.reason;
};

describe('legacy rule conversion', () => {
  it('maps each target mode to a matcher', () => {
    const t = (target: unknown) => converted(legacy(target, [{ kind: 'exclude' }]))[0].spec.params;
    expect(t({ mode: 'component_type', component_type: 'curry' })).toMatchObject({ match: is('componentType', 'curry') });
    expect(t({ mode: 'component', component_id: 5 })).toMatchObject({ match: is('id', 5) });
    expect(t({ mode: 'base_category', category_id: 10 })).toMatchObject({ match: all(is('componentType', 'base'), is('base_category_id', 10)) });
    expect(t({ mode: 'tag', filter: { protein_tag: 'fish' } })).toMatchObject({ match: is('protein_tag', 'fish') });
    expect(t({ mode: 'tag', filter: { dietary_tag: 'veg', regional_tag: 'south-indian' } }))
      .toMatchObject({ match: all(is('dietary_tags', 'veg'), is('regional_tags', 'south-indian')) });
  });

  it('maps each effect to a template, carrying the scope', () => {
    const fish = { mode: 'tag', filter: { protein_tag: 'fish' } };
    const scope = { days: ['friday'], slots: ['lunch'] };
    const spec = (effect: unknown, target: unknown = fish) => converted(legacy(target, [effect], scope))[0].spec;
    expect(spec({ kind: 'exclude' })).toMatchObject({ template: 'exclude', params: { scope: { days: ['friday'], meals: ['lunch'] } } });
    expect(spec({ kind: 'require_one' })).toMatchObject({ template: 'require', params: { min: 1 } });
    expect(spec({ kind: 'no_repeat' })).toMatchObject({ template: 'no_repeat', params: { within: 'week', scope: { days: ['friday'], meals: ['lunch'] } } });
    expect(spec({ kind: 'filter_pool' })).toMatchObject({ template: 'only_allow', params: { roles: ['base', 'curry', 'subzi'] } });
    expect(spec({ kind: 'filter_pool' }, { mode: 'component', component_id: 5 })).toMatchObject({ template: 'only_allow', params: { roles: ['curry'] } });
    expect(spec({ kind: 'skip_component', component_types: ['subzi'] })).toMatchObject({ template: 'skip_when', params: { when: is('protein_tag', 'fish'), skip: ['subzi'] } });
    // Allowed meals honoured the old day scope but not its meal scope.
    expect(spec({ kind: 'allowed_slots', slots: ['dinner'] })).toEqual({
      template: 'allowed_meals', params: { match: is('protein_tag', 'fish'), meals: ['dinner'], days: ['friday'], strength: 'must' },
    });
  });

  it('merges required components and extras into one rule', () => {
    const rules = converted(legacy({ mode: 'component', component_id: 1 }, [
      { kind: 'require_component', component_ids: [5] },
      { kind: 'require_extra', category_ids: [30] },
    ]));
    expect(rules).toHaveLength(1);
    expect(rules[0].spec).toMatchObject({ template: 'require_with', params: { when: is('id', 1), components: [5], extraCategories: [30] } });
  });

  it('splits a multi-effect rule into one rule per template, named after it, keeping enabled and created_at', () => {
    const rules = converted(row(
      { type: 'rule', target: { mode: 'component_type', component_type: 'base' }, scope: { days: null, slots: null }, effects: [{ kind: 'no_repeat' }, { kind: 'allowed_slots', slots: ['lunch'] }] },
      { enabled: false },
    ));
    expect(rules.map((r) => [r.name, r.enabled, r.created_at])).toEqual([
      ['Old rule — No repeats', false, '2026-01-01'],
      ['Old rule — Only at certain meals', false, '2026-01-01'],
    ]);
  });

  it('produces specs that validate and read sensibly', () => {
    for (const r of converted(legacy({ mode: 'base_category', category_id: 10 }, [{ kind: 'allowed_slots', slots: ['lunch'] }]))) {
      const spec = RuleSpecSchema.parse(r.spec);
      expect(describeSpec(spec, { baseCategory: () => 'Rice-based' })).toBe('component type is base and base category is Rice-based only at lunch');
    }
  });

  it('drops rules it cannot convert faithfully, with a reason', () => {
    expect(dropped(row({ type: 'no-repeat', component_type: 'curry' }))).toBe('it could not be read');
    expect(dropped(legacy({ mode: 'component_type', component_type: 'curry' }, []))).toBe('it has no effect');
    expect(dropped(legacy({ mode: 'tag', filter: {} }, [{ kind: 'exclude' }]))).toBe('its tag filter is empty, so it would match every component');
    expect(dropped(legacy({ mode: 'component', component_id: 77 }, [{ kind: 'exclude' }]))).toBe('it refers to component #77, which no longer exists');
    expect(dropped(legacy({ mode: 'component', component_id: 77 }, [{ kind: 'filter_pool' }]))).toBe('component #77 no longer exists');
    expect(dropped(legacy({ mode: 'base_category', category_id: 99 }, [{ kind: 'require_one' }]))).toContain('base category #99');
    expect(dropped(legacy({ mode: 'component', component_id: 1 }, [{ kind: 'require_extra', category_ids: [404] }]))).toContain('extra category #404');
    expect(dropped(legacy({ mode: 'component_type', component_type: 'curry' }, [{ kind: 'exclude' }], { days: [], slots: null }))).toBe('its days or meals select nothing');
    expect(dropped(legacy({ mode: 'component_type', component_type: 'curry' }, [{ kind: 'allowed_slots', slots: [] }]))).toBe('it allows no meals');
  });

  it('converts both shapes used by the seeded rules (category meal windows, component excluded at meals)', () => {
    const seeded = [
      legacy({ mode: 'base_category', category_id: 10 }, [{ kind: 'allowed_slots', slots: ['breakfast', 'dinner'] }]),
      legacy({ mode: 'component', component_id: 1 }, [{ kind: 'exclude' }], { days: null, slots: ['lunch', 'dinner'] }),
    ];
    expect(seeded.map((r) => convertLegacyRule(r, ctx).ok)).toEqual([true, true]);
  });
});
