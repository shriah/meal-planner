import Dexie, { type EntityTable } from 'dexie';
import type { ComponentRecord } from '@/types/component';
import type { MealRecord, MealExtraRecord } from '@/types/meal';
import type { UserPreferencesRecord } from '@/types/preferences';
import type { CompiledFilter, WeeklyPlan } from '@/types/plan';

// Rule record — typed CompiledFilter DSL for Phase 3
export interface RuleRecord {
  id?: number;
  name: string;
  enabled: boolean;
  compiled_filter: CompiledFilter;
  created_at: string;
}

export interface SavedPlanRecord {
  id?: number;
  week_start: string;    // ISO date "YYYY-MM-DD" (Monday of the week)
  slots: WeeklyPlan;     // typed — was: unknown
  locks: Record<string, boolean>;
  created_at: string;
}

export interface ActivePlanRecord {
  id: 'current';
  plan: WeeklyPlan;
  locks: Record<string, boolean>;
  updated_at: string;
}

const db = new Dexie('FoodPlannerDB') as Dexie & {
  components: EntityTable<ComponentRecord, 'id'>;
  meals: EntityTable<MealRecord, 'id'>;
  meal_extras: EntityTable<MealExtraRecord, 'meal_id'>;
  rules: EntityTable<RuleRecord, 'id'>;
  saved_plans: EntityTable<SavedPlanRecord, 'id'>;
  preferences: EntityTable<UserPreferencesRecord, 'id'>;
  active_plan: EntityTable<ActivePlanRecord, 'id'>;
};

db.version(1).stores({
  components: '++id, componentType, base_type, extra_category, *dietary_tags, *regional_tags, *occasion_tags',
  meals: '++id, base_id, curry_id, subzi_id',
  meal_extras: '[meal_id+component_id], meal_id, component_id',
  rules: '++id, is_active',
  saved_plans: '++id',
  preferences: 'id',
});

db.version(2).stores({
  components: '++id, componentType, base_type, extra_category, *dietary_tags, *regional_tags, *occasion_tags',
  meals: '++id, base_id, curry_id, subzi_id',
  meal_extras: '[meal_id+component_id], meal_id, component_id',
  rules: '++id',
  saved_plans: '++id',
  preferences: 'id',
}).upgrade(tx => {
  return tx.table('rules').toCollection().modify(rule => {
    if ('is_active' in rule) {
      rule.enabled = rule.is_active;
      delete rule.is_active;
    }
    if ('text' in rule && !('name' in rule)) {
      rule.name = rule.text;
      delete rule.text;
    }
  });
});

db.version(3).stores({
  components: '++id, componentType, base_type, extra_category, *dietary_tags, *regional_tags, *occasion_tags',
  meals: '++id, base_id, curry_id, subzi_id',
  meal_extras: '[meal_id+component_id], meal_id, component_id',
  rules: '++id',
  saved_plans: '++id',
  preferences: 'id',
  active_plan: 'id',
});

db.version(4).stores({
  components: '++id, componentType, base_type, extra_category, *dietary_tags, *regional_tags, *occasion_tags',
  meals: '++id, base_id, curry_id, subzi_id',
  meal_extras: '[meal_id+component_id], meal_id, component_id',
  rules: '++id',
  saved_plans: '++id, week_start',
  preferences: 'id',
  active_plan: 'id',
});

/**
 * Migrate a compiled_filter from v4 (day-filter/require-component) to v5 (scheduling-rule).
 * Pure function — used by Dexie upgrade and testable independently.
 */
export function migrateCompiledFilter(cf: unknown): unknown {
  if (!cf || typeof cf !== 'object' || !('type' in cf)) return cf;
  const record = cf as Record<string, unknown>;

  if (record.type === 'day-filter') {
    return {
      type: 'scheduling-rule',
      effect: 'filter-pool',
      days: record.days,
      slots: record.slots ?? null,
      match: { mode: 'tag', filter: record.filter },
    };
  }

  if (record.type === 'require-component') {
    return {
      type: 'scheduling-rule',
      effect: 'require-one',
      days: record.days,
      slots: record.slots ?? null,
      match: { mode: 'component', component_id: record.component_id },
    };
  }

  return cf; // Unknown types pass through unchanged
}

db.version(5).stores({
  components: '++id, componentType, base_type, extra_category, *dietary_tags, *regional_tags, *occasion_tags',
  meals: '++id, base_id, curry_id, subzi_id',
  meal_extras: '[meal_id+component_id], meal_id, component_id',
  rules: '++id',
  saved_plans: '++id, week_start',
  preferences: 'id',
  active_plan: 'id',
}).upgrade(tx => {
  return tx.table('rules').toCollection().modify(rule => {
    rule.compiled_filter = migrateCompiledFilter(rule.compiled_filter);
  });
});

export { db };
