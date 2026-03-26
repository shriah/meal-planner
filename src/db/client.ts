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

db.version(6).stores({
  components: '++id, componentType, base_type, extra_category, *dietary_tags, *regional_tags, *occasion_tags',
  meals: '++id, base_id, curry_id, subzi_id',
  meal_extras: '[meal_id+component_id], meal_id, component_id',
  rules: '++id',
  saved_plans: '++id, week_start',
  preferences: 'id',
  active_plan: 'id',
});

db.version(7).stores({
  components: '++id, componentType, base_type, extra_category, *dietary_tags, *regional_tags, *occasion_tags',
  meals: '++id, base_id, curry_id, subzi_id',
  meal_extras: '[meal_id+component_id], meal_id, component_id',
  rules: '++id',
  saved_plans: '++id, week_start',
  preferences: 'id',
  active_plan: 'id',
}).upgrade(async tx => {
  const prefsTable = tx.table('preferences');
  const rulesTable = tx.table('rules');
  const componentsTable = tx.table('components');

  const prefs = await prefsTable.get('prefs');
  if (!prefs) return;

  const now = new Date().toISOString();
  const ALL_SLOTS = ['breakfast', 'lunch', 'dinner'];

  // D-09: component_slot_overrides -> scheduling-rule exclude records
  const overrides = prefs.slot_restrictions?.component_slot_overrides ?? {};
  for (const [idStr, allowedSlots] of Object.entries(overrides)) {
    const componentId = Number(idStr);
    const excluded = ALL_SLOTS.filter(s => !(allowedSlots as string[]).includes(s));
    if (excluded.length === 0) continue; // unrestricted, no rule needed

    // Look up component name for friendlier rule name
    const comp = await componentsTable.get(componentId);
    const compName = comp?.name ?? String(componentId);

    await rulesTable.add({
      name: `${compName} slot restriction (migrated)`,
      enabled: true,
      compiled_filter: {
        type: 'scheduling-rule',
        effect: 'exclude',
        days: null,
        slots: excluded,
        match: { mode: 'component', component_id: componentId },
      },
      created_at: now,
    });
  }

  // D-10: base_type_slots -> meal-template records
  const baseTypeSlots = prefs.slot_restrictions?.base_type_slots ?? {};
  for (const [baseType, allowedSlots] of Object.entries(baseTypeSlots)) {
    await rulesTable.add({
      name: `${baseType} slot assignment (migrated)`,
      enabled: true,
      compiled_filter: {
        type: 'meal-template',
        base_type: baseType,
        days: null,
        slots: null,
        allowed_slots: allowedSlots,
        exclude_component_types: [],
        exclude_extra_categories: [],
        require_extra_category: null,
      },
      created_at: now,
    });
  }

  // D-11: base_type_rules -> meal-template records
  const baseTypeRules = prefs.base_type_rules ?? [];
  for (const rule of baseTypeRules) {
    if (!rule.required_extra_category) continue; // skip entries with no requirement
    await rulesTable.add({
      name: `${rule.base_type} required ${rule.required_extra_category} (migrated)`,
      enabled: true,
      compiled_filter: {
        type: 'meal-template',
        base_type: rule.base_type,
        days: null,
        slots: null,
        allowed_slots: null,
        exclude_component_types: [],
        exclude_extra_categories: [],
        require_extra_category: rule.required_extra_category,
      },
      created_at: now,
    });
  }

  // D-12: Clear migrated prefs data
  await prefsTable.update('prefs', {
    'slot_restrictions.base_type_slots': {},
    'slot_restrictions.component_slot_overrides': {},
    base_type_rules: [],
  });
});

export { db };
