import type { DayOfWeek, TagFilter } from '@/types/plan';
import type { MealSlot } from '@/types/preferences';
import type { ExtraCategory } from '@/types/component';

// ─── Target form state ────────────────────────────────────────────────────────

export type TargetFormState =
  | { mode: 'component_type'; component_type: '' | 'base' | 'curry' | 'subzi' }
  | { mode: 'tag'; filter: TagFilter }
  | { mode: 'component'; component_id: number | null }
  | { mode: 'base_type'; base_type: '' | 'rice-based' | 'bread-based' | 'other' }
  | { mode: '' };

// ─── Unified Rule Form State ──────────────────────────────────────────────────

export type RuleFormState = {
  name: string;
  target: TargetFormState;
  // Scope
  days: DayOfWeek[];
  slots: MealSlot[];
  // Selection effect (at most one)
  selection: 'filter_pool' | 'require_one' | 'exclude' | 'no_repeat' | '';
  // Composition effects
  allowed_slots: MealSlot[];
  skip_component_types: ('curry' | 'subzi')[];
  exclude_extra_categories: ExtraCategory[];
  require_extra_categories: ExtraCategory[];
};

// ─── Form Actions ─────────────────────────────────────────────────────────────

export type FormAction =
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_TARGET_MODE'; mode: 'component_type' | 'tag' | 'component' | 'base_type' }
  | { type: 'SET_TARGET_COMPONENT_TYPE'; component_type: 'base' | 'curry' | 'subzi' }
  | { type: 'SET_TARGET_TAG_FILTER'; filter: TagFilter }
  | { type: 'SET_TARGET_COMPONENT_ID'; component_id: number | null }
  | { type: 'SET_TARGET_BASE_TYPE'; base_type: 'rice-based' | 'bread-based' | 'other' }
  | { type: 'SET_DAYS'; days: DayOfWeek[] }
  | { type: 'SET_SLOTS'; slots: MealSlot[] }
  | { type: 'SET_SELECTION'; selection: 'filter_pool' | 'require_one' | 'exclude' | 'no_repeat' | '' }
  | { type: 'SET_ALLOWED_SLOTS'; allowed_slots: MealSlot[] }
  | { type: 'SET_SKIP_COMPONENT_TYPES'; skip_component_types: ('curry' | 'subzi')[] }
  | { type: 'SET_EXCLUDE_EXTRA_CATEGORIES'; categories: ExtraCategory[] }
  | { type: 'SET_REQUIRE_EXTRA_CATEGORIES'; categories: ExtraCategory[] }
  | { type: 'LOAD_PRESET'; state: RuleFormState };
