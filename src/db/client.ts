import Dexie, { type EntityTable } from 'dexie';
import type { ComponentRecord } from '@/types/component';
import type { MealRecord, MealExtraRecord } from '@/types/meal';
import type { UserPreferencesRecord } from '@/types/preferences';

// Rule and SavedPlan stubs for future phases
export interface RuleRecord {
  id?: number;
  text: string;
  compiled_filter?: unknown;
  is_active: boolean;
  created_at: string;
}

export interface SavedPlanRecord {
  id?: number;
  name: string;
  slots: unknown;
  created_at: string;
}

const db = new Dexie('FoodPlannerDB') as Dexie & {
  components: EntityTable<ComponentRecord, 'id'>;
  meals: EntityTable<MealRecord, 'id'>;
  meal_extras: EntityTable<MealExtraRecord, 'meal_id'>;
  rules: EntityTable<RuleRecord, 'id'>;
  saved_plans: EntityTable<SavedPlanRecord, 'id'>;
  preferences: EntityTable<UserPreferencesRecord, 'id'>;
};

db.version(1).stores({
  components: '++id, componentType, base_type, extra_category, *dietary_tags, *regional_tags, *occasion_tags',
  meals: '++id, base_id, curry_id, subzi_id',
  meal_extras: '[meal_id+component_id], meal_id, component_id',
  rules: '++id, is_active',
  saved_plans: '++id',
  preferences: 'id',
});

export { db };
