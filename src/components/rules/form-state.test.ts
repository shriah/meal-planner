import { describe, expect, it } from 'vitest';
import type { RuleFormState } from './types';
import { EMPTY_RULE_FORM_STATE, EXAMPLE_PRESETS, formReducer, isFormValid } from './form-state';

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
      require_extra_categories: ['condiment'],
    };

    expect(formReducer(state, { type: 'SET_TARGET_MODE', mode: 'base_type' })).toEqual({
      name: 'Fish Fridays',
      target: { mode: 'base_type', base_type: '' },
      days: ['friday'],
      slots: ['dinner'],
      selection: 'exclude',
      allowed_slots: ['lunch'],
      skip_component_types: ['subzi'],
      require_extra_categories: ['condiment'],
    });
  });

  it('LOAD_PRESET replaces the entire form state', () => {
    const nextState = EXAMPLE_PRESETS['fish-fridays'];

    expect(
      formReducer(EMPTY_RULE_FORM_STATE, {
        type: 'LOAD_PRESET',
        state: nextState,
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

  it('treats empty require_extra_categories as the no-extras-logic state', () => {
    expect(
      isFormValid({
        ...EMPTY_RULE_FORM_STATE,
        name: 'Rice template',
        target: { mode: 'base_type', base_type: 'rice-based' },
        require_extra_categories: [],
      }),
    ).toBe(false);

    expect(
      isFormValid({
        ...EMPTY_RULE_FORM_STATE,
        name: 'Rice template',
        target: { mode: 'base_type', base_type: 'rice-based' },
        allowed_slots: ['lunch'],
        require_extra_categories: [],
      }),
    ).toBe(true);
  });
});
