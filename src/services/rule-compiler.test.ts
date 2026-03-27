import { describe, it, expect } from 'vitest';
import { compileRule } from './rule-compiler';
import type { RuleFormState } from '@/components/rules/types';

describe('compileRule', () => {
  it('compiles a no-repeat rule', () => {
    const state: RuleFormState = {
      name: 'No repeat base',
      target: { mode: 'component_type', component_type: 'base' },
      days: [], slots: [],
      selection: 'no_repeat',
      allowed_slots: [], skip_component_types: [],
      exclude_extra_categories: [], require_extra_categories: [],
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
      exclude_extra_categories: [], require_extra_categories: [],
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
      exclude_extra_categories: [],
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
