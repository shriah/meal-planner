import type { DayOfWeek, TagFilter } from '@/types/plan';
import type { MealSlot } from '@/types/preferences';

// ─── Form State (discriminated union) ─────────────────────────────────────────

export type DayFilterFormState = {
  name: string;
  ruleType: 'day-filter';
  days: DayOfWeek[];
  slots: MealSlot[];
  filter: TagFilter;
};

export type NoRepeatFormState = {
  name: string;
  ruleType: 'no-repeat';
  component_type: '' | 'base' | 'curry' | 'subzi';
};

export type RequireComponentFormState = {
  name: string;
  ruleType: 'require-component';
  component_id: number | null;
  days: DayOfWeek[];
  slots: MealSlot[];
};

export type EmptyFormState = {
  name: string;
  ruleType: '';
};

export type FormState =
  | DayFilterFormState
  | NoRepeatFormState
  | RequireComponentFormState
  | EmptyFormState;

// ─── Form Actions ─────────────────────────────────────────────────────────────

export type FormAction =
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_RULE_TYPE'; ruleType: 'day-filter' | 'no-repeat' | 'require-component' }
  | { type: 'SET_DAYS'; days: DayOfWeek[] }
  | { type: 'SET_SLOTS'; slots: MealSlot[] }
  | { type: 'SET_FILTER'; filter: TagFilter }
  | { type: 'SET_COMPONENT_TYPE'; component_type: 'base' | 'curry' | 'subzi' }
  | { type: 'SET_COMPONENT_ID'; component_id: number | null }
  | { type: 'LOAD_PRESET'; state: FormState };
