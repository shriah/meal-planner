import type { FormAction, RuleFormState } from './types';

export const EXAMPLE_PRESETS: Record<string, RuleFormState> = {
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
    target: { mode: 'base_category', base_category_id: 1 },
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
