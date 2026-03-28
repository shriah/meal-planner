import { describe, it, expect } from 'vitest';
import { compileRule, decompileRule } from './rule-compiler';
import type { CompiledRule } from '@/types/plan';
import type { RuleFormState } from '@/components/rules/types';

describe('compileRule', () => {
  it('compiles a no-repeat rule', () => {
    const state: RuleFormState = {
      name: 'No repeat base',
      target: { mode: 'component_type', component_type: 'base' },
      days: [], slots: [],
      selection: 'no_repeat',
      allowed_slots: [], skip_component_types: [],
      require_extra_categories: [],
    };
    expect(compileRule(state)).toEqual({
      type: 'rule',
      target: { mode: 'component_type', component_type: 'base' },
      scope: { days: null, slots: null },
      effects: [{ kind: 'no_repeat' }],
    });
  });

  it('compiles a filter_pool rule with days scope', () => {
    const state: RuleFormState = {
      name: 'Fish Fridays',
      target: { mode: 'tag', filter: { protein_tag: 'fish' } },
      days: ['friday'], slots: [],
      selection: 'filter_pool',
      allowed_slots: [], skip_component_types: [],
      require_extra_categories: [],
    };
    expect(compileRule(state)).toEqual({
      type: 'rule',
      target: { mode: 'tag', filter: { protein_tag: 'fish' } },
      scope: { days: ['friday'], slots: null },
      effects: [{ kind: 'filter_pool' }],
    });
  });

  it('compiles a rice template with multiple effects', () => {
    const state: RuleFormState = {
      name: 'Rice rules',
      target: { mode: 'base_type', base_type: 'rice-based' },
      days: [], slots: [],
      selection: '',
      allowed_slots: ['lunch', 'dinner'],
      skip_component_types: ['curry'],
      require_extra_categories: ['condiment', 'liquid'],
    };
    expect(compileRule(state)).toEqual({
      type: 'rule',
      target: { mode: 'base_type', base_type: 'rice-based' },
      scope: { days: null, slots: null },
      effects: [
        { kind: 'allowed_slots', slots: ['lunch', 'dinner'] },
        { kind: 'skip_component', component_types: ['curry'] },
        { kind: 'require_extra', categories: ['condiment', 'liquid'] },
      ],
    });
  });
});

describe('decompileRule', () => {
  it('rehydrates a scheduling-style rule into form state', () => {
    const compiled: CompiledRule = {
      type: 'rule',
      target: { mode: 'tag', filter: { protein_tag: 'fish' } },
      scope: { days: ['friday'], slots: ['dinner'] },
      effects: [{ kind: 'require_one' }],
    };

    expect(decompileRule(compiled, 'Fish Fridays')).toEqual({
      name: 'Fish Fridays',
      target: { mode: 'tag', filter: { protein_tag: 'fish' } },
      days: ['friday'],
      slots: ['dinner'],
      selection: 'require_one',
      allowed_slots: [],
      skip_component_types: [],
      require_extra_categories: [],
    });
  });

  it('rehydrates a meal-template rule into form state', () => {
    const compiled: CompiledRule = {
      type: 'rule',
      target: { mode: 'base_type', base_type: 'rice-based' },
      scope: { days: null, slots: null },
      effects: [
        { kind: 'allowed_slots', slots: ['lunch', 'dinner'] },
        { kind: 'skip_component', component_types: ['curry'] },
        { kind: 'require_extra', categories: ['condiment', 'liquid'] },
      ],
    };

    expect(decompileRule(compiled, 'Rice lunch+dinner')).toEqual({
      name: 'Rice lunch+dinner',
      target: { mode: 'base_type', base_type: 'rice-based' },
      days: [],
      slots: [],
      selection: '',
      allowed_slots: ['lunch', 'dinner'],
      skip_component_types: ['curry'],
      require_extra_categories: ['condiment', 'liquid'],
    });
  });

  it('drops legacy exclude_extra effects during decompile and recompile', () => {
    const compiled = {
      type: 'rule',
      target: { mode: 'base_type', base_type: 'rice-based' },
      scope: { days: null, slots: null },
      effects: [
        { kind: 'exclude_extra', categories: ['sweet'] },
        { kind: 'require_extra', categories: ['condiment'] },
      ],
    } as CompiledRule;

    const state = decompileRule(compiled, 'Rice extras');

    expect(state.require_extra_categories).toEqual(['condiment']);
    expect(compileRule(state)).toEqual({
      type: 'rule',
      target: { mode: 'base_type', base_type: 'rice-based' },
      scope: { days: null, slots: null },
      effects: [{ kind: 'require_extra', categories: ['condiment'] }],
    });
  });

  it('round-trips scheduling and meal-template compiled rules', () => {
    const schedulingRule: CompiledRule = {
      type: 'rule',
      target: { mode: 'tag', filter: { protein_tag: 'fish' } },
      scope: { days: ['friday'], slots: ['dinner'] },
      effects: [{ kind: 'filter_pool' }],
    };
    const templateRule: CompiledRule = {
      type: 'rule',
      target: { mode: 'base_type', base_type: 'rice-based' },
      scope: { days: null, slots: null },
      effects: [
        { kind: 'allowed_slots', slots: ['lunch', 'dinner'] },
        { kind: 'skip_component', component_types: ['subzi'] },
        { kind: 'require_extra', categories: ['condiment'] },
      ],
    };

    expect(compileRule(decompileRule(schedulingRule, 'Fish Fridays'))).toEqual(schedulingRule);
    expect(compileRule(decompileRule(templateRule, 'Rice lunch+dinner'))).toEqual(templateRule);
  });

  it('maps null scope fields back to empty arrays', () => {
    const compiled: CompiledRule = {
      type: 'rule',
      target: { mode: 'component_type', component_type: 'subzi' },
      scope: { days: null, slots: null },
      effects: [{ kind: 'no_repeat' }],
    };

    const state = decompileRule(compiled, 'No repeat subzi');
    expect(state.days).toEqual([]);
    expect(state.slots).toEqual([]);
  });
});
