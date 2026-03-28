import type { CategoryRecord } from '@/types/category';
import { BUILT_IN_BASE_CATEGORY_NAMES } from '@/types/category';
import type { FormAction, RuleFormState } from './types';

type BuiltInBaseCategoryName = (typeof BUILT_IN_BASE_CATEGORY_NAMES)[number];

type ExamplePresetDefinition = Omit<RuleFormState, 'target'> & {
  target:
    | RuleFormState['target']
    | { mode: 'built_in_base_category'; built_in_name: BuiltInBaseCategoryName };
};

export const EXAMPLE_PRESETS: Record<string, ExamplePresetDefinition> = {
  'fish-fridays': {
    name: 'Fish Fridays',
    target: { mode: 'tag', filter: { protein_tag: 'fish' } },
    days: ['friday'],
    slots: [],
    selection: 'require_one',
    allowed_slots: [],
    skip_component_types: [],
    require_extra_category_ids: [],
  },
  'no-repeat-subzi': {
    name: 'No repeat subzi',
    target: { mode: 'component_type', component_type: 'subzi' },
    days: [],
    slots: [],
    selection: 'no_repeat',
    allowed_slots: [],
    skip_component_types: [],
    require_extra_category_ids: [],
  },
  'weekend-special': {
    name: 'Weekend special',
    target: { mode: 'tag', filter: { occasion_tag: 'weekend' } },
    days: ['saturday', 'sunday'],
    slots: [],
    selection: 'filter_pool',
    allowed_slots: [],
    skip_component_types: [],
    require_extra_category_ids: [],
  },
  'no-paneer-weekdays': {
    name: 'No paneer weekdays',
    target: { mode: 'tag', filter: { protein_tag: 'paneer' } },
    days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    slots: [],
    selection: 'exclude',
    allowed_slots: [],
    skip_component_types: [],
    require_extra_category_ids: [],
  },
  'rice-lunch-dinner': {
    name: 'Rice: lunch and dinner only',
    target: { mode: 'built_in_base_category', built_in_name: 'rice-based' },
    days: [],
    slots: [],
    selection: '',
    allowed_slots: ['lunch', 'dinner'],
    skip_component_types: [],
    require_extra_category_ids: [],
  },
};

export const EMPTY_RULE_FORM_STATE: RuleFormState = {
  name: '',
  target: { mode: '' },
  days: [],
  slots: [],
  selection: '',
  allowed_slots: [],
  skip_component_types: [],
  require_extra_category_ids: [],
};

export function resolveExamplePreset(
  presetSlug: string,
  baseCategories: CategoryRecord[],
): RuleFormState | null {
  const preset = EXAMPLE_PRESETS[presetSlug];
  if (!preset) return null;

  if (preset.target.mode !== 'built_in_base_category') {
    return preset;
  }

  const matchingCategory = baseCategories.find(
    (category) => category.kind === 'base' && category.name === preset.target.built_in_name,
  );

  if (matchingCategory?.id === undefined) {
    return null;
  }

  return {
    ...preset,
    target: { mode: 'base_category', base_category_id: matchingCategory.id },
  };
}

export function formReducer(state: RuleFormState, action: FormAction): RuleFormState {
  switch (action.type) {
    case 'SET_NAME':
      return { ...state, name: action.name };
    case 'SET_TARGET_MODE': {
      const base: Omit<RuleFormState, 'target'> = {
        name: state.name,
        days: state.days,
        slots: state.slots,
        selection: state.selection,
        allowed_slots: state.allowed_slots,
        skip_component_types: state.skip_component_types,
        require_extra_category_ids: state.require_extra_category_ids,
      };

      if (action.mode === 'component_type') {
        return { ...base, target: { mode: 'component_type', component_type: '' } };
      }

      if (action.mode === 'tag') {
        return { ...base, target: { mode: 'tag', filter: {} } };
      }

      if (action.mode === 'component') {
        return { ...base, target: { mode: 'component', component_id: null } };
      }

      return { ...base, target: { mode: 'base_category', base_category_id: null } };
    }
    case 'SET_TARGET_COMPONENT_TYPE':
      if (state.target.mode !== 'component_type') return state;
      return { ...state, target: { mode: 'component_type', component_type: action.component_type } };
    case 'SET_TARGET_TAG_FILTER':
      if (state.target.mode !== 'tag') return state;
      return { ...state, target: { mode: 'tag', filter: action.filter } };
    case 'SET_TARGET_COMPONENT_ID':
      if (state.target.mode !== 'component') return state;
      return { ...state, target: { mode: 'component', component_id: action.component_id } };
    case 'SET_TARGET_BASE_CATEGORY_ID':
      if (state.target.mode !== 'base_category') return state;
      return { ...state, target: { mode: 'base_category', base_category_id: action.base_category_id } };
    case 'SET_DAYS':
      return { ...state, days: action.days };
    case 'SET_SLOTS':
      return { ...state, slots: action.slots };
    case 'SET_SELECTION':
      return { ...state, selection: action.selection };
    case 'SET_ALLOWED_SLOTS':
      return { ...state, allowed_slots: action.allowed_slots };
    case 'SET_SKIP_COMPONENT_TYPES':
      return { ...state, skip_component_types: action.skip_component_types };
    case 'SET_REQUIRE_EXTRA_CATEGORY_IDS':
      return { ...state, require_extra_category_ids: action.category_ids };
    case 'LOAD_PRESET':
      return action.state;
    default:
      return state;
  }
}

export function isFormValid(state: RuleFormState): boolean {
  if (state.name.trim() === '') return false;

  if (state.target.mode === '') return false;
  if (state.target.mode === 'component_type' && state.target.component_type === '') return false;
  if (state.target.mode === 'tag' && !Object.values(state.target.filter).some((value) => value !== undefined)) {
    return false;
  }
  if (state.target.mode === 'component' && state.target.component_id === null) return false;
  if (state.target.mode === 'base_category' && state.target.base_category_id === null) return false;

  return (
    state.selection !== '' ||
    state.allowed_slots.length > 0 ||
    state.skip_component_types.length > 0 ||
    state.require_extra_category_ids.length > 0
  );
}
