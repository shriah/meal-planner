import Dexie, { type EntityTable } from 'dexie';
import { resolveSeededCurryCompatibilityIds } from '@/db/seed-data';
import type { CategoryKind, CategoryRecord } from '@/types/category';
import type { ComponentRecord } from '@/types/component';
import type { MealRecord, MealExtraRecord } from '@/types/meal';
import type { UserPreferencesRecord } from '@/types/preferences';
import type { CompiledRule, WeeklyPlan } from '@/types/plan';

// Rule record — stores unified CompiledRule
export interface RuleRecord {
  id?: number;
  name: string;
  enabled: boolean;
  compiled_filter: CompiledRule;
  created_at: string;
}

export interface SavedPlanRecord {
  id?: number;
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

export interface LegacyCategoryMigrationFixture {
  components: ComponentRecord[];
  rules: RuleRecord[];
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
        .filter(
          (category): category is CategoryRecord & { id: number } =>
            category.kind === 'base' && category.id !== undefined,
        )
        .map((category) => [category.name, category.id]),
    ),
    extra: new Map(
      categories
        .filter(
          (category): category is CategoryRecord & { id: number } =>
            category.kind === 'extra' && category.id !== undefined,
        )
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
  component: ComponentRecord,
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
  };

  return resolveSeededCurryCompatibilityIds(component.name, seedCategoryLookup)
    ?? [...categoryLookup.base.values()];
}

function normalizeComponentCategoryRefs(
  component: ComponentRecord,
  category: CategoryRecord & { id: number },
): ComponentRecord {
  const nextComponent: ComponentRecord = { ...component };

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

function normalizeRuleCategoryRefs(rule: RuleRecord, category: CategoryRecord & { id: number }): RuleRecord {
  const compiledFilter = rule.compiled_filter;
  if (!compiledFilter || typeof compiledFilter !== 'object') {
    return rule;
  }

  const record = compiledFilter as Record<string, unknown>;
  if (record.type !== 'rule') {
    return rule;
  }

  let enabled = rule.enabled;
  let effectsChanged = false;
  const nextRule: Record<string, unknown> = { ...record };

  if (record.target && typeof record.target === 'object') {
    const target = record.target as Record<string, unknown>;
    const targetHitsById = target.mode === 'base_category' && target.category_id === category.id;
    const targetHitsByLegacyName = category.kind === 'base' && target.mode === 'base_type' && target.base_type === category.name;

    if (targetHitsById || targetHitsByLegacyName) {
      enabled = false;
    }
  }

  if (Array.isArray(record.effects)) {
    const effects = record.effects.flatMap((effect) => {
      if (!effect || typeof effect !== 'object') {
        return [effect];
      }

      const effectRecord = effect as Record<string, unknown>;
      if (effectRecord.kind !== 'require_extra') {
        return [effect];
      }

      const nextEffect = { ...effectRecord };
      if (Array.isArray(effectRecord.category_ids)) {
        nextEffect.category_ids = effectRecord.category_ids.filter((id) => id !== category.id);
      }
      if (Array.isArray(effectRecord.categories)) {
        nextEffect.categories = effectRecord.categories.filter((name) => name !== category.name);
      }

      const hasIds = Array.isArray(nextEffect.category_ids) && nextEffect.category_ids.length > 0;
      const hasNames = Array.isArray(nextEffect.categories) && nextEffect.categories.length > 0;
      if (!hasIds && !hasNames) {
        effectsChanged = true;
        return [];
      }

      effectsChanged = true;
      return [nextEffect];
    });

    nextRule.effects = effects;
    if (effects.length === 0 && effectsChanged) {
      enabled = false;
    }
  }

  return {
    ...rule,
    enabled,
    compiled_filter: nextRule as CompiledRule,
  };
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
    const nextComponent: ComponentRecord = {
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

  const rules = fixture.rules.map((rule) => ({
    ...rule,
    compiled_filter: migrateRuleCategoryRefs(rule.compiled_filter, categoryLookup) as CompiledRule,
  }));

  return {
    categories,
    components,
    rules,
    normalizeDeletedCategory(deletedCategoryId: number) {
      const category = categories.find((candidate) => candidate.id === deletedCategoryId);
      if (!category?.id) {
        return { categories, components, rules };
      }

      return {
        categories: categories.filter((candidate) => candidate.id !== deletedCategoryId),
        components: components.map((component) => normalizeComponentCategoryRefs(component, category)),
        rules: rules.map((rule) => normalizeRuleCategoryRefs(rule, category)),
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
        occasion_tags: ['everyday'],
        created_at: '',
      },
      {
        name: 'Roti',
        componentType: 'base',
        base_type: 'bread-based',
        dietary_tags: ['veg'],
        regional_tags: ['north-indian'],
        occasion_tags: ['everyday'],
        created_at: '',
      },
      {
        name: 'Rasam',
        componentType: 'extra',
        extra_category: 'liquid',
        compatible_base_types: ['rice-based'],
        dietary_tags: ['veg'],
        regional_tags: ['south-indian'],
        occasion_tags: ['everyday'],
        created_at: '',
      },
      {
        name: 'Pickle',
        componentType: 'extra',
        extra_category: 'condiment',
        compatible_base_types: ['rice-based', 'bread-based'],
        dietary_tags: ['veg'],
        regional_tags: ['pan-indian'],
        occasion_tags: ['everyday'],
        created_at: '',
      },
    ],
    rules: [
      {
        name: 'Bread dinner',
        enabled: true,
        compiled_filter: {
          type: 'rule',
          target: { mode: 'base_type', base_type: 'bread-based' },
          scope: { days: ['friday'], slots: ['dinner'] },
          effects: [{ kind: 'require_extra', categories: ['condiment'] }],
        } as CompiledRule,
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

export { db, normalizeComponentCategoryRefs, normalizeRuleCategoryRefs };
