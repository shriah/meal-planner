import Dexie, { type EntityTable } from 'dexie';
import { resolveSeededCurryCompatibilityIds, type SeedCategoryLookup } from '@/db/seed-data';
import type { CategoryKind, CategoryRecord } from '@/types/category';
import { CURRY_CATEGORIES, type BaseType, type ComponentRecord, type CurryCategory } from '@/types/component';
import type { MealRecord, MealExtraRecord } from '@/types/meal';
import type { LegacyPreferencesRecord } from '@/types/preferences';
import type { WeeklyPlan } from '@/types/plan';
import {
  convertLegacyRule, curryClashRule, dayRule, defaultRules, exclusionRule, legacyOccasionDays, pairingCategories, pairingRule,
  DEFAULT_EXTRA_LIMITS, LEGACY_CALENDAR_TAGS, type ConvertedRule, type DroppedRule, type RuleRecord } from '@/rules';

export type { RuleRecord };

/** One-time messages for the user, e.g. which old rules could not be converted. */
export interface NoticeRecord {
  id: string;
  kind: 'rule-migration';
  converted: number;
  dropped: DroppedRule[];
  created_at: string;
  dismissed: boolean;
}

export interface SavedPlanRecord {
  id: number;
  week_start: string;
  slots: WeeklyPlan;
  locks: Record<string, boolean>;
  created_at: string;
}

export interface ActivePlanRecord {
  id: 'current';
  plan: WeeklyPlan;
  locks: Record<string, boolean>;
  updated_at: string;
}

export interface CategorySeedInput {
  kind: CategoryKind;
  name: string;
}

// Pre-insert shapes: the migration fixture is plain data that has not been assigned ids by Dexie yet.
// Before v15, components carried their own compatibility lists.
type LegacyComponent = Omit<ComponentRecord, 'id' | 'occasion_tags'> & {
  /** Before v16 these included calendar tags (`everyday`, `weekday`, `weekend`, `monday` …). */
  occasion_tags: string[];
  compatible_base_category_ids?: number[];
  compatible_base_types?: BaseType[];
  incompatible_curry_categories?: string[];
};
export interface LegacyCategoryMigrationFixture {
  components: LegacyComponent[];
}

type CategoryLookup = Record<CategoryKind, Map<string, number>>;

const BUILT_IN_CATEGORY_SEEDS: CategorySeedInput[] = [
  { kind: 'base', name: 'rice-based' },
  { kind: 'base', name: 'bread-based' },
  { kind: 'base', name: 'other' },
  { kind: 'extra', name: 'liquid' },
  { kind: 'extra', name: 'crunchy' },
  { kind: 'extra', name: 'condiment' },
  { kind: 'extra', name: 'dairy' },
  { kind: 'extra', name: 'sweet' },
];

const db = new Dexie('FoodPlannerDB') as Dexie & {
  categories: EntityTable<CategoryRecord, 'id'>;
  components: EntityTable<ComponentRecord, 'id'>;
  meals: EntityTable<MealRecord, 'id'>;
  meal_extras: EntityTable<MealExtraRecord, 'meal_id'>;
  rules: EntityTable<RuleRecord, 'id'>;
  saved_plans: EntityTable<SavedPlanRecord, 'id'>;
  preferences: EntityTable<LegacyPreferencesRecord, 'id'>;
  active_plan: EntityTable<ActivePlanRecord, 'id'>;
  notices: EntityTable<NoticeRecord, 'id'>;
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
}).upgrade((tx) => {
  return tx.table('rules').toCollection().modify((rule) => {
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

  return cf;
}

db.version(5).stores({
  components: '++id, componentType, base_type, extra_category, *dietary_tags, *regional_tags, *occasion_tags',
  meals: '++id, base_id, curry_id, subzi_id',
  meal_extras: '[meal_id+component_id], meal_id, component_id',
  rules: '++id',
  saved_plans: '++id, week_start',
  preferences: 'id',
  active_plan: 'id',
}).upgrade((tx) => {
  return tx.table('rules').toCollection().modify((rule) => {
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
}).upgrade(async (tx) => {
  const prefsTable = tx.table('preferences');
  const rulesTable = tx.table('rules');
  const componentsTable = tx.table('components');

  const prefs = await prefsTable.get('prefs');
  if (!prefs) return;

  const now = new Date().toISOString();
  const allSlots = ['breakfast', 'lunch', 'dinner'];

  const overrides = prefs.slot_restrictions?.component_slot_overrides ?? {};
  for (const [idStr, allowedSlots] of Object.entries(overrides)) {
    const componentId = Number(idStr);
    const excluded = allSlots.filter((slot) => !(allowedSlots as string[]).includes(slot));
    if (excluded.length === 0) continue;

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

  const baseTypeRules = prefs.base_type_rules ?? [];
  for (const rule of baseTypeRules) {
    if (!rule.required_extra_category) continue;
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

  await prefsTable.update('prefs', {
    'slot_restrictions.base_type_slots': {},
    'slot_restrictions.component_slot_overrides': {},
    base_type_rules: [],
  });
});

export function migrateMealTemplateSelector(cf: unknown): unknown {
  if (!cf || typeof cf !== 'object' || !('type' in cf)) return cf;
  const record = cf as Record<string, unknown>;

  if (record.type === 'meal-template' && 'base_type' in record && !('selector' in record)) {
    const { base_type, ...rest } = record;
    return {
      ...rest,
      selector: { mode: 'base', base_type },
    };
  }

  return cf;
}

db.version(8).stores({
  components: '++id, componentType, base_type, extra_category, *dietary_tags, *regional_tags, *occasion_tags',
  meals: '++id, base_id, curry_id, subzi_id',
  meal_extras: '[meal_id+component_id], meal_id, component_id',
  rules: '++id',
  saved_plans: '++id, week_start',
  preferences: 'id',
  active_plan: 'id',
}).upgrade((tx) => {
  return tx.table('rules').toCollection().modify((rule) => {
    rule.compiled_filter = migrateMealTemplateSelector(rule.compiled_filter);
  });
});

export function migrateToCompiledRule(cf: unknown): unknown {
  if (!cf || typeof cf !== 'object' || !('type' in cf)) return cf;
  const record = cf as Record<string, unknown>;

  if (record.type === 'rule') return cf;

  if (record.type === 'no-repeat') {
    return {
      type: 'rule',
      target: { mode: 'component_type', component_type: record.component_type },
      scope: { days: null, slots: null },
      effects: [{ kind: 'no_repeat' }],
    };
  }

  if (record.type === 'scheduling-rule') {
    const match = record.match as Record<string, unknown>;
    const target = match.mode === 'tag'
      ? { mode: 'tag', filter: match.filter }
      : { mode: 'component', component_id: match.component_id };
    const effectKind = record.effect === 'filter-pool'
      ? 'filter_pool'
      : record.effect === 'require-one'
        ? 'require_one'
        : 'exclude';

    return {
      type: 'rule',
      target,
      scope: { days: record.days ?? null, slots: record.slots ?? null },
      effects: [{ kind: effectKind }],
    };
  }

  if (record.type === 'meal-template') {
    const selector = record.selector as Record<string, unknown>;
    const target = selector.mode === 'base'
      ? { mode: 'base_type', base_type: selector.base_type }
      : selector.mode === 'tag'
        ? { mode: 'tag', filter: selector.filter }
        : { mode: 'component', component_id: selector.component_id };

    const effects: unknown[] = [];
    const allowedSlots = record.allowed_slots as string[] | null;
    if (allowedSlots !== null && Array.isArray(allowedSlots) && allowedSlots.length > 0) {
      effects.push({ kind: 'allowed_slots', slots: allowedSlots });
    }

    const excludeTypes = (record.exclude_component_types as string[] | undefined) ?? [];
    if (excludeTypes.length > 0) {
      effects.push({ kind: 'skip_component', component_types: excludeTypes });
    }

    if (record.require_extra_category !== null && record.require_extra_category !== undefined) {
      effects.push({ kind: 'require_extra', categories: [record.require_extra_category] });
    }

    return {
      type: 'rule',
      target,
      scope: { days: record.days ?? null, slots: record.slots ?? null },
      effects,
    };
  }

  return cf;
}

export function stripLegacyExcludeExtra(cf: unknown): unknown {
  if (!cf || typeof cf !== 'object' || !('type' in cf)) return cf;

  const record = cf as Record<string, unknown>;
  if (record.type !== 'rule' || !Array.isArray(record.effects)) return cf;

  return {
    ...record,
    effects: record.effects.filter((effect) => {
      if (!effect || typeof effect !== 'object' || !('kind' in effect)) return true;
      return (effect as { kind?: unknown }).kind !== 'exclude_extra';
    }),
  };
}

function buildCategoryLookup(categories: CategoryRecord[]): CategoryLookup {
  return {
    base: new Map(
      categories
        .filter((category) => category.kind === 'base')
        .map((category) => [category.name, category.id]),
    ),
    extra: new Map(
      categories
        .filter((category) => category.kind === 'extra')
        .map((category) => [category.name, category.id]),
    ),
  };
}

function migrateRuleCategoryRefs(compiledFilter: unknown, categoryLookup: CategoryLookup): unknown {
  if (!compiledFilter || typeof compiledFilter !== 'object') {
    return compiledFilter;
  }

  const rule = compiledFilter as Record<string, unknown>;
  if (rule.type !== 'rule') {
    return compiledFilter;
  }

  const nextRule: Record<string, unknown> = { ...rule };
  if (rule.target && typeof rule.target === 'object') {
    const target = rule.target as Record<string, unknown>;
    if (target.mode === 'base_type' && typeof target.base_type === 'string') {
      nextRule.target = {
        mode: 'base_category',
        category_id: categoryLookup.base.get(target.base_type) ?? null,
      };
    }
  }

  if (Array.isArray(rule.effects)) {
    nextRule.effects = rule.effects.map((effect) => {
      if (!effect || typeof effect !== 'object') {
        return effect;
      }

      const effectRecord = effect as Record<string, unknown>;
      if (effectRecord.kind !== 'require_extra' || !Array.isArray(effectRecord.categories)) {
        return effect;
      }

      return {
        ...effectRecord,
        category_ids: effectRecord.categories
          .map((name) => (typeof name === 'string' ? categoryLookup.extra.get(name) ?? null : null))
          .filter((id): id is number => id !== null),
      };
    });
  }

  return nextRule;
}

function backfillLegacyCurryCompatibility(
  component: LegacyComponent,
  categoryLookup: CategoryLookup,
): number[] | undefined {
  if (component.compatible_base_category_ids !== undefined) {
    return component.compatible_base_category_ids;
  }

  if (component.componentType === 'subzi') {
    return component.compatible_base_types
      ?.map((name) => categoryLookup.base.get(name) ?? null)
      .filter((id): id is number => id !== null);
  }

  if (component.componentType !== 'curry') {
    return undefined;
  }

  const seedCategoryLookup = {
    base: Object.fromEntries(categoryLookup.base.entries()),
    extra: Object.fromEntries(categoryLookup.extra.entries()),
  } as SeedCategoryLookup;

  return resolveSeededCurryCompatibilityIds(component.name, seedCategoryLookup)
    ?? [...categoryLookup.base.values()];
}

function normalizeComponentCategoryRefs(
  component: LegacyComponent,
  category: CategoryRecord & { id: number },
): LegacyComponent {
  const nextComponent: LegacyComponent = { ...component };

  if (nextComponent.componentType === 'extra') {
    delete nextComponent.compatible_base_category_ids;
    delete nextComponent.compatible_base_types;
  }

  if (category.kind === 'base') {
    if (nextComponent.base_category_id === category.id) {
      nextComponent.base_category_id = null;
      delete nextComponent.base_type;
    }

    if (
      nextComponent.componentType === 'curry'
      && Array.isArray(nextComponent.compatible_base_category_ids)
    ) {
      nextComponent.compatible_base_category_ids = nextComponent.compatible_base_category_ids.filter(
        (id) => id !== category.id,
      );
    } else if (Array.isArray(nextComponent.compatible_base_category_ids)) {
      nextComponent.compatible_base_category_ids = nextComponent.compatible_base_category_ids.filter(
        (id) => id !== category.id,
      );
    }

    if (Array.isArray(nextComponent.compatible_base_types)) {
      nextComponent.compatible_base_types = nextComponent.compatible_base_types.filter(
        (name) => name !== category.name,
      );
    }
  }

  if (category.kind === 'extra' && nextComponent.extra_category_id === category.id) {
    nextComponent.extra_category_id = null;
    delete nextComponent.extra_category;
  }

  return nextComponent;
}

function seedBuiltInCategories(now: string): CategoryRecord[] {
  return BUILT_IN_CATEGORY_SEEDS.map((seed, index) => ({
    id: index + 1,
    kind: seed.kind,
    name: seed.name,
    created_at: now,
  }));
}

export function migrateLegacyCategoryData(fixture: LegacyCategoryMigrationFixture) {
  const categories = seedBuiltInCategories(new Date().toISOString());
  const categoryLookup = buildCategoryLookup(categories);

  const components = fixture.components.map((component) => {
    const nextComponent: LegacyComponent = {
      ...component,
      base_category_id:
        component.base_category_id
        ?? (component.base_type ? categoryLookup.base.get(component.base_type) ?? null : undefined),
      extra_category_id:
        component.extra_category_id
        ?? (component.extra_category ? categoryLookup.extra.get(component.extra_category) ?? null : undefined),
    };

    if (component.componentType === 'extra') {
      delete nextComponent.compatible_base_category_ids;
      delete nextComponent.compatible_base_types;
      return nextComponent;
    }

    const compatibleBaseCategoryIds = backfillLegacyCurryCompatibility(component, categoryLookup);
    if (compatibleBaseCategoryIds !== undefined) {
      nextComponent.compatible_base_category_ids = compatibleBaseCategoryIds;
    }

    return nextComponent;
  });

  return {
    categories,
    components,
    normalizeDeletedCategory(deletedCategoryId: number) {
      const category = categories.find((candidate) => candidate.id === deletedCategoryId);
      if (!category?.id) {
        return { categories, components };
      }
      const deletedCategory = category as CategoryRecord & { id: number };

      return {
        categories: categories.filter((candidate) => candidate.id !== deletedCategoryId),
        components: components.map((component) => normalizeComponentCategoryRefs(component, deletedCategory)),
      };
    },
  };
}

export function buildCategoryMigrationFixture(): LegacyCategoryMigrationFixture {
  return {
    components: [
      {
        name: 'Lemon Rice',
        componentType: 'base',
        base_type: 'rice-based',
        dietary_tags: ['veg'],
        regional_tags: ['south-indian'],
        occasion_tags: [],
        created_at: '',
      },
      {
        name: 'Roti',
        componentType: 'base',
        base_type: 'bread-based',
        dietary_tags: ['veg'],
        regional_tags: ['north-indian'],
        occasion_tags: [],
        created_at: '',
      },
      {
        name: 'Rasam',
        componentType: 'extra',
        extra_category: 'liquid',
        compatible_base_types: ['rice-based'],
        dietary_tags: ['veg'],
        regional_tags: ['south-indian'],
        occasion_tags: [],
        created_at: '',
      },
      {
        name: 'Pickle',
        componentType: 'extra',
        extra_category: 'condiment',
        compatible_base_types: ['rice-based', 'bread-based'],
        dietary_tags: ['veg'],
        regional_tags: ['pan-indian'],
        occasion_tags: [],
        created_at: '',
      },
    ],
  };
}

db.version(9).stores({
  components: '++id, componentType, base_type, extra_category, *dietary_tags, *regional_tags, *occasion_tags',
  meals: '++id, base_id, curry_id, subzi_id',
  meal_extras: '[meal_id+component_id], meal_id, component_id',
  rules: '++id',
  saved_plans: '++id, week_start',
  preferences: 'id',
  active_plan: 'id',
}).upgrade((tx) => {
  return tx.table('rules').toCollection().modify((rule) => {
    rule.compiled_filter = migrateToCompiledRule(rule.compiled_filter);
  });
});

db.version(10).stores({
  components: '++id, componentType, base_type, extra_category, *dietary_tags, *regional_tags, *occasion_tags',
  meals: '++id, base_id, curry_id, subzi_id',
  meal_extras: '[meal_id+component_id], meal_id, component_id',
  rules: '++id',
  saved_plans: '++id, week_start',
  preferences: 'id',
  active_plan: 'id',
}).upgrade((tx) => {
  return tx.table('rules').toCollection().modify((rule) => {
    rule.compiled_filter = stripLegacyExcludeExtra(rule.compiled_filter);
  });
});

db.version(11).stores({
  categories: '++id, kind, name',
  components: '++id, componentType, base_type, base_category_id, extra_category, extra_category_id, *compatible_base_types, *compatible_base_category_ids, *dietary_tags, *regional_tags, *occasion_tags',
  meals: '++id, base_id, curry_id, subzi_id',
  meal_extras: '[meal_id+component_id], meal_id, component_id',
  rules: '++id',
  saved_plans: '++id, week_start',
  preferences: 'id',
  active_plan: 'id',
}).upgrade(async (tx) => {
  const categoriesTable = tx.table('categories');
  const componentsTable = tx.table('components');
  const rulesTable = tx.table('rules');
  const now = new Date().toISOString();

  const categoryIds = await Promise.all(
    BUILT_IN_CATEGORY_SEEDS.map((seed) =>
      categoriesTable.add({
        kind: seed.kind,
        name: seed.name,
        created_at: now,
      }),
    ),
  );

  const categories = BUILT_IN_CATEGORY_SEEDS.map((seed, index) => ({
    id: Number(categoryIds[index]),
    kind: seed.kind,
    name: seed.name,
    created_at: now,
  }));
  const categoryLookup = buildCategoryLookup(categories);

  await componentsTable.toCollection().modify((component) => {
    Object.assign(component, {
      base_category_id:
        component.base_category_id
        ?? (component.base_type ? categoryLookup.base.get(component.base_type) ?? null : component.base_category_id),
      extra_category_id:
        component.extra_category_id
        ?? (component.extra_category ? categoryLookup.extra.get(component.extra_category) ?? null : component.extra_category_id),
      compatible_base_category_ids:
        component.compatible_base_category_ids
        ?? component.compatible_base_types
          ?.map((name: string) => categoryLookup.base.get(name) ?? null)
          .filter((id: number | null): id is number => id !== null),
    });
  });

  await rulesTable.toCollection().modify((rule) => {
    rule.compiled_filter = migrateRuleCategoryRefs(rule.compiled_filter, categoryLookup);
  });
});

db.version(12).stores({
  categories: '++id, kind, name',
  components: '++id, componentType, base_type, base_category_id, extra_category, extra_category_id, *compatible_base_types, *compatible_base_category_ids, *dietary_tags, *regional_tags, *occasion_tags',
  meals: '++id, base_id, curry_id, subzi_id',
  meal_extras: '[meal_id+component_id], meal_id, component_id',
  rules: '++id',
  saved_plans: '++id, week_start',
  preferences: 'id',
  active_plan: 'id',
}).upgrade(async (tx) => {
  const categoryLookup = buildCategoryLookup(await tx.table('categories').toArray());

  await tx.table('components')
    .where('componentType')
    .equals('curry')
    .modify((component) => {
      component.compatible_base_category_ids = backfillLegacyCurryCompatibility(
        component as ComponentRecord,
        categoryLookup,
      );
    });
});

db.version(13).stores({
  categories: '++id, kind, name',
  components: '++id, componentType, base_type, base_category_id, extra_category, extra_category_id, *compatible_base_types, *compatible_base_category_ids, *dietary_tags, *regional_tags, *occasion_tags',
  meals: '++id, base_id, curry_id, subzi_id',
  meal_extras: '[meal_id+component_id], meal_id, component_id',
  rules: '++id',
  saved_plans: '++id, week_start',
  preferences: 'id',
  active_plan: 'id',
}).upgrade(async (tx) => {
  await tx.table('components')
    .where('componentType')
    .equals('extra')
    .modify((component) => {
      delete component.compatible_base_category_ids;
      delete component.compatible_base_types;
    });
});

// v14: rules move from compiled_filter to rule templates. Rules are converted by the meaning the old
// form stated; any that cannot be converted faithfully are dropped and listed in a notice.
export const RULE_MIGRATION_NOTICE_ID = 'rule-migration-v14';

db.version(14).stores({
  categories: '++id, kind, name',
  components: '++id, componentType, base_type, base_category_id, extra_category, extra_category_id, *compatible_base_types, *compatible_base_category_ids, *dietary_tags, *regional_tags, *occasion_tags',
  meals: '++id, base_id, curry_id, subzi_id',
  meal_extras: '[meal_id+component_id], meal_id, component_id',
  rules: '++id',
  saved_plans: '++id, week_start',
  preferences: 'id',
  active_plan: 'id',
  notices: 'id',
}).upgrade(async (tx) => {
  const categories: CategoryRecord[] = await tx.table('categories').toArray();
  const components: ComponentRecord[] = await tx.table('components').toArray();
  const oldRules: { id: number; name: string; enabled: boolean; compiled_filter: unknown; created_at: string }[] =
    await tx.table('rules').toArray();
  if (oldRules.length === 0) return;

  const ctx = {
    known: {
      components: new Set(components.map((c) => c.id)),
      baseCategories: new Set(categories.filter((c) => c.kind === 'base').map((c) => c.id)),
      extraCategories: new Set(categories.filter((c) => c.kind === 'extra').map((c) => c.id)),
    },
    componentTypes: new Map(components.map((c) => [c.id, c.componentType])),
  };
  const converted: ConvertedRule[] = [];
  const dropped: DroppedRule[] = [];
  for (const row of oldRules) {
    const result = convertLegacyRule(row, ctx);
    if (result.ok) converted.push(...result.rules);
    else dropped.push(result.dropped);
  }

  await tx.table('rules').clear();
  await tx.table('rules').bulkAdd(converted);
  const notice: NoticeRecord = {
    id: RULE_MIGRATION_NOTICE_ID,
    kind: 'rule-migration',
    converted: converted.length,
    dropped,
    created_at: new Date().toISOString(),
    dismissed: dropped.length === 0,
  };
  await tx.table('notices').put(notice);
});

// v15: compatibility lists on components become rules the component owns. A curry's or subzi's
// compatible base categories become `pairs_with`; an extra's incompatible curry types become
// `avoid_with`. An empty subzi list was never enforced, so it stays unrestricted rather than
// becoming "never planned" as an empty curry list is.
db.version(15).stores({
  categories: '++id, kind, name',
  components: '++id, componentType, base_type, base_category_id, extra_category, extra_category_id, *dietary_tags, *regional_tags, *occasion_tags',
  meals: '++id, base_id, curry_id, subzi_id',
  meal_extras: '[meal_id+component_id], meal_id, component_id',
  rules: '++id, owner_component_id',
  saved_plans: '++id, week_start',
  preferences: 'id',
  active_plan: 'id',
  notices: 'id',
}).upgrade(async (tx) => {
  const baseCategories = new Set(
    (await tx.table('categories').toArray() as CategoryRecord[]).filter((c) => c.kind === 'base').map((c) => c.id),
  );
  const now = new Date().toISOString();
  const pairings: Omit<RuleRecord, 'id'>[] = [];
  const isCurryCategory = (c: string): c is CurryCategory => (CURRY_CATEGORIES as readonly string[]).includes(c);
  await tx.table('components').toCollection().modify((component: LegacyComponent & { id: number }) => {
    const ids = component.compatible_base_category_ids?.filter((id) => baseCategories.has(id));
    if (ids && (component.componentType === 'curry' || (component.componentType === 'subzi' && ids.length > 0))) {
      pairings.push({ ...pairingRule(component, ids), enabled: true, created_at: now });
    }
    const clashes = component.incompatible_curry_categories?.filter(isCurryCategory) ?? [];
    if (component.componentType === 'extra' && clashes.length > 0) {
      pairings.push({ ...curryClashRule(component, clashes), enabled: true, created_at: now });
    }
    delete component.compatible_base_category_ids;
    delete component.compatible_base_types;
    delete component.incompatible_curry_categories;
  });
  await tx.table('rules').bulkAdd(pairings);
});

// v16: what the planner used to apply by itself becomes stored rules. The per-meal extras limits
// (preferences) and the default preferences (a curry and subzi in each meal, variety, frequency)
// become ordinary rules; calendar occasion tags (`everyday`, `weekday`, `weekend`, `monday` …)
// become an `allowed_days` rule the dish owns; an empty base pairing ("never planned") becomes an
// explicit `exclude` rule the dish owns. An earlier v15 may have run already, so this also converts
// whatever it left on components, and never gives a dish a second owned rule of the same type.
db.version(16).stores({
  categories: '++id, kind, name',
  components: '++id, componentType, base_type, base_category_id, extra_category, extra_category_id, *dietary_tags, *regional_tags, *occasion_tags',
  meals: '++id, base_id, curry_id, subzi_id',
  meal_extras: '[meal_id+component_id], meal_id, component_id',
  rules: '++id, owner_component_id',
  saved_plans: '++id, week_start',
  preferences: 'id',
  active_plan: 'id',
  notices: 'id',
}).upgrade(async (tx) => {
  const now = new Date().toISOString();
  const rulesTable = tx.table('rules');
  const added: Omit<RuleRecord, 'id'>[] = [];
  const add = (r: Omit<RuleRecord, 'id' | 'enabled' | 'created_at'>) => added.push({ ...r, enabled: true, created_at: now });

  // A library that was never seeded gets the defaults from runSeed instead.
  if ((await tx.table('components').count()) > 0) {
    const prefs = await tx.table('preferences').get('prefs');
    defaultRules({ ...DEFAULT_EXTRA_LIMITS, ...prefs?.extra_quantity_limits }).forEach(add);
  }
  await tx.table('preferences').clear();

  const rules: RuleRecord[] = await rulesTable.toArray();
  const names = new Map((await tx.table('components').toArray() as ComponentRecord[]).map((c) => [c.id, c.name]));
  const owns = (id: number, template: string) => rules.some((r) => r.owner_component_id === id && r.spec.template === template);

  for (const rule of rules) {
    if (rule.owner_component_id !== undefined && pairingCategories(rule)?.length === 0) {
      await rulesTable.delete(rule.id);
      if (!owns(rule.owner_component_id, 'exclude')) {
        add(exclusionRule({ id: rule.owner_component_id, name: names.get(rule.owner_component_id) ?? rule.name }));
      }
    }
  }

  const isCurryCategory = (c: string): c is CurryCategory => (CURRY_CATEGORIES as readonly string[]).includes(c);
  await tx.table('components').toCollection().modify((component: LegacyComponent & { id: number }) => {
    const tags = component.occasion_tags ?? [];
    const days = legacyOccasionDays(tags);
    if (days && !owns(component.id, 'allowed_days')) add(dayRule(component, days));
    component.occasion_tags = tags.filter((t) => !LEGACY_CALENDAR_TAGS.includes(t));

    const clashes = component.incompatible_curry_categories?.filter(isCurryCategory) ?? [];
    if (component.componentType === 'extra' && clashes.length > 0 && !owns(component.id, 'avoid_with')) {
      add(curryClashRule(component, clashes));
    }
    const bases = component.compatible_base_category_ids;
    if (component.componentType === 'curry' && Array.isArray(bases) && !owns(component.id, 'pairs_with') && !owns(component.id, 'exclude')) {
      add(bases.length ? pairingRule(component, bases) : exclusionRule(component));
    }
    delete component.compatible_base_category_ids;
    delete component.compatible_base_types;
    delete component.incompatible_curry_categories;
  });

  await rulesTable.bulkAdd(added);
});

export { db, normalizeComponentCategoryRefs };
