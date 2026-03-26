import type { DayOfWeek, TagFilter } from '@/types/plan';
import type { MealSlot } from '@/types/preferences';
import type { ExtraCategory } from '@/types/component';

// ─── Form State (discriminated union) ─────────────────────────────────────────

export type NoRepeatFormState = {
  name: string;
  ruleType: 'no-repeat';
  component_type: '' | 'base' | 'curry' | 'subzi';
};

export type SchedulingRuleFormState = {
  name: string;
  ruleType: 'scheduling-rule';
  effect: 'filter-pool' | 'require-one' | 'exclude' | '';
  days: DayOfWeek[];
  slots: MealSlot[];
  match:
    | { mode: 'tag'; filter: TagFilter }
    | { mode: 'component'; component_id: number | null }
    | { mode: '' };
};

export type MealTemplateFormState = {
  name: string;
  ruleType: 'meal-template';
  base_type: '' | 'rice-based' | 'bread-based' | 'other';
  allowed_slots: MealSlot[];
  exclude_component_types: ('curry' | 'subzi')[];
  exclude_extra_categories: ExtraCategory[];
  require_extra_category: ExtraCategory | null;
  days: DayOfWeek[];
  slots: MealSlot[];
};

export type EmptyFormState = {
  name: string;
  ruleType: '';
};

export type FormState =
  | NoRepeatFormState
  | SchedulingRuleFormState
  | MealTemplateFormState
  | EmptyFormState;

// ─── Form Actions ─────────────────────────────────────────────────────────────

export type FormAction =
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_RULE_TYPE'; ruleType: 'no-repeat' | 'scheduling-rule' | 'meal-template' }
  | { type: 'SET_DAYS'; days: DayOfWeek[] }
  | { type: 'SET_SLOTS'; slots: MealSlot[] }
  | { type: 'SET_COMPONENT_TYPE'; component_type: 'base' | 'curry' | 'subzi' }
  | { type: 'SET_EFFECT'; effect: 'filter-pool' | 'require-one' | 'exclude' }
  | { type: 'SET_MATCH_MODE'; mode: 'tag' | 'component' }
  | { type: 'SET_SCHEDULING_TAG_FILTER'; filter: TagFilter }
  | { type: 'SET_SCHEDULING_COMPONENT_ID'; component_id: number | null }
  | { type: 'SET_BASE_TYPE'; base_type: 'rice-based' | 'bread-based' | 'other' }
  | { type: 'SET_ALLOWED_SLOTS'; allowed_slots: MealSlot[] }
  | { type: 'SET_EXCLUDE_COMPONENT_TYPES'; exclude_component_types: ('curry' | 'subzi')[] }
  | { type: 'SET_EXCLUDE_EXTRA_CATEGORIES'; exclude_extra_categories: ExtraCategory[] }
  | { type: 'SET_REQUIRE_EXTRA_CATEGORY'; require_extra_category: ExtraCategory | null }
  | { type: 'SET_TEMPLATE_DAYS'; days: DayOfWeek[] }
  | { type: 'SET_TEMPLATE_SLOTS'; slots: MealSlot[] }
  | { type: 'LOAD_PRESET'; state: FormState };
