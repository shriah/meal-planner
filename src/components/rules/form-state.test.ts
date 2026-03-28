import { describe, expect, it } from 'vitest';
import type { CategoryRecord } from '@/types/category';
import type { RuleFormState } from './types';
import {
  EMPTY_RULE_FORM_STATE,
  EXAMPLE_PRESETS,
  formReducer,
  isFormValid,
  resolveExamplePreset,
} from './form-state';

describe('formReducer', () => {
  it('SET_TARGET_MODE preserves non-target fields and resets only target branch', () => {
    const state: RuleFormState = {
      name: 'Fish Fridays',
      target: { mode: 'tag', filter: { protein_tag: 'fish' } },
      days: ['friday'],
      slots: ['dinner'],
      selection: 'exclude',
      allowed_slots: ['lunch'],
      skip_component_types: ['subzi'],
      require_extra_category_ids: [42],
    };

    expect(formReducer(state, { type: 'SET_TARGET_MODE', mode: 'base_category' })).toEqual({
      name: 'Fish Fridays',
      target: { mode: 'base_category', base_category_id: null },
      days: ['friday'],
      slots: ['dinner'],
      selection: 'exclude',
      allowed_slots: ['lunch'],
      skip_component_types: ['subzi'],
      require_extra_category_ids: [42],
    });
  });

  it('updates require-extra IDs without relying on legacy category names', () => {
    expect(
      formReducer(EMPTY_RULE_FORM_STATE, {
        type: 'SET_REQUIRE_EXTRA_CATEGORY_IDS',
        category_ids: [3, 5],
      }),
    ).toMatchObject({
      require_extra_category_ids: [3, 5],
    });
  });

  it('LOAD_PRESET replaces the entire form state', () => {
    const nextState = resolveExamplePreset('fish-fridays', []);

    expect(
      formReducer(EMPTY_RULE_FORM_STATE, {
        type: 'LOAD_PRESET',
        state: nextState!,
      }),
    ).toEqual(nextState);
  });
});

describe('isFormValid', () => {
  it('returns true only for complete target and at least one configured effect', () => {
    expect(isFormValid(EMPTY_RULE_FORM_STATE)).toBe(false);
    expect(
      isFormValid({
        ...EMPTY_RULE_FORM_STATE,
        name: 'Incomplete target',
        target: { mode: 'component_type', component_type: '' },
        selection: 'no_repeat',
      }),
    ).toBe(false);
    expect(
      isFormValid({
        ...EMPTY_RULE_FORM_STATE,
        name: 'No effect',
        target: { mode: 'component_type', component_type: 'subzi' },
      }),
    ).toBe(false);
    expect(
      isFormValid({
        ...EMPTY_RULE_FORM_STATE,
        name: 'Valid rule',
        target: { mode: 'component_type', component_type: 'subzi' },
        selection: 'no_repeat',
      }),
    ).toBe(true);
  });

  it('requires a real base-category ID before a category-targeted rule is valid', () => {
    expect(
      isFormValid({
        ...EMPTY_RULE_FORM_STATE,
        name: 'Missing base category',
        target: { mode: 'base_category', base_category_id: null },
        allowed_slots: ['lunch'],
      }),
    ).toBe(false);

    expect(
      isFormValid({
        ...EMPTY_RULE_FORM_STATE,
        name: 'Rice template',
        target: { mode: 'base_category', base_category_id: 7 },
        require_extra_category_ids: [],
      }),
    ).toBe(false);

    expect(
      isFormValid({
        ...EMPTY_RULE_FORM_STATE,
        name: 'Rice template',
        target: { mode: 'base_category', base_category_id: 7 },
        allowed_slots: ['lunch'],
        require_extra_category_ids: [],
      }),
    ).toBe(true);
  });
});

describe('resolveExamplePreset', () => {
  const baseCategories: CategoryRecord[] = [
    { id: 9, kind: 'base', name: 'bread-based', created_at: '2026-03-28T00:00:00.000Z' },
    { id: 14, kind: 'base', name: 'rice-based', created_at: '2026-03-28T00:00:00.000Z' },
  ];

  it('resolves rice-lunch-dinner against the live built-in rice category row', () => {
    expect(resolveExamplePreset('rice-lunch-dinner', baseCategories)).toMatchObject({
      name: 'Rice: lunch and dinner only',
      target: { mode: 'base_category', base_category_id: 14 },
      allowed_slots: ['lunch', 'dinner'],
    });
  });

  it('returns null until the required base category row is available', () => {
    expect(resolveExamplePreset('rice-lunch-dinner', [])).toBeNull();
    expect(
      resolveExamplePreset('rice-lunch-dinner', [
        { id: 21, kind: 'base', name: 'bread-based', created_at: '2026-03-28T00:00:00.000Z' },
      ]),
    ).toBeNull();
  });
});
