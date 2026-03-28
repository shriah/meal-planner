import { describe, expect, it } from 'vitest';
import { compileRule, decompileRule } from './rule-compiler';
import type { CompiledRule } from '@/types/plan';
import type { RuleFormState } from '@/components/rules/types';

describe('compileRule', () => {
  it('compiles base-category targets with numeric category IDs', () => {
    const state: RuleFormState = {
      name: 'Rice lunch and dinner',
      target: { mode: 'base_category', base_category_id: 3 },
      days: [],
      slots: [],
      selection: '',
      allowed_slots: ['lunch', 'dinner'],
      skip_component_types: ['curry'],
      require_extra_category_ids: [7, 8],
    };

    expect(compileRule(state)).toEqual({
      type: 'rule',
      target: { mode: 'base_category', category_id: 3 },
      scope: { days: null, slots: null },
      effects: [
        { kind: 'allowed_slots', slots: ['lunch', 'dinner'] },
        { kind: 'skip_component', component_types: ['curry'] },
        { kind: 'require_extra', category_ids: [7, 8] },
      ],
    });
  });

  it('compiles scheduling rules without changing non-category targets', () => {
    const state: RuleFormState = {
      name: 'Fish Fridays',
      target: { mode: 'tag', filter: { protein_tag: 'fish' } },
      days: ['friday'],
      slots: [],
      selection: 'filter_pool',
      allowed_slots: [],
      skip_component_types: [],
      require_extra_category_ids: [],
    };

    expect(compileRule(state)).toEqual({
      type: 'rule',
      target: { mode: 'tag', filter: { protein_tag: 'fish' } },
      scope: { days: ['friday'], slots: null },
      effects: [{ kind: 'filter_pool' }],
    });
  });
});

describe('decompileRule', () => {
  it('rehydrates base-category targets and require-extra category IDs', () => {
    const compiled: CompiledRule = {
      type: 'rule',
      target: { mode: 'base_category', category_id: 4 },
      scope: { days: null, slots: null },
      effects: [
        { kind: 'allowed_slots', slots: ['lunch', 'dinner'] },
        { kind: 'skip_component', component_types: ['subzi'] },
        { kind: 'require_extra', category_ids: [9] },
      ],
    };

    expect(decompileRule(compiled, 'Rice template', { baseCategoryIds: [4], extraCategoryIds: [9] })).toEqual({
      name: 'Rice template',
      target: { mode: 'base_category', base_category_id: 4 },
      days: [],
      slots: [],
      selection: '',
      allowed_slots: ['lunch', 'dinner'],
      skip_component_types: ['subzi'],
      require_extra_category_ids: [9],
    });
  });

  it('drops deleted extra category IDs during decompile and round-trip', () => {
    const compiled: CompiledRule = {
      type: 'rule',
      target: { mode: 'base_category', category_id: 4 },
      scope: { days: null, slots: null },
      effects: [
        { kind: 'require_extra', category_ids: [9, 99] },
      ],
    };

    const state = decompileRule(compiled, 'Rice extras', {
      baseCategoryIds: [4],
      extraCategoryIds: [9],
    });

    expect(state.require_extra_category_ids).toEqual([9]);
    expect(compileRule(state)).toEqual({
      type: 'rule',
      target: { mode: 'base_category', category_id: 4 },
      scope: { days: null, slots: null },
      effects: [{ kind: 'require_extra', category_ids: [9] }],
    });
  });

  it('returns an inert empty target when the referenced base category has been deleted', () => {
    const compiled: CompiledRule = {
      type: 'rule',
      target: { mode: 'base_category', category_id: 4 },
      scope: { days: ['monday'], slots: ['dinner'] },
      effects: [{ kind: 'allowed_slots', slots: ['dinner'] }],
    };

    expect(decompileRule(compiled, 'Deleted base', { baseCategoryIds: [3], extraCategoryIds: [] })).toEqual({
      name: 'Deleted base',
      target: { mode: '' },
      days: ['monday'],
      slots: ['dinner'],
      selection: '',
      allowed_slots: ['dinner'],
      skip_component_types: [],
      require_extra_category_ids: [],
    });
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
