import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/client';
import {
  getAllComponents,
  getComponentsByType,
  getExtrasByBaseType,
  addComponent,
  updateComponent,
  deleteComponent,
  getAllMeals,
  addMeal,
  deleteMeal,
  getMealExtras,
  getPreferences,
  putPreferences,
  addRule,
  getRules,
  getEnabledRules,
  updateRule,
  deleteRule,
} from '@/services/food-db';

beforeEach(async () => {
  await db.components.clear();
  await db.meals.clear();
  await db.meal_extras.clear();
  await db.preferences.clear();
  await db.rules.clear();
});

describe('DATA-01: componentType discriminator', () => {
  it('stores and retrieves all four component types correctly', async () => {
    await addComponent({
      name: 'Plain Rice',
      componentType: 'base',
      base_type: 'rice-based',
      dietary_tags: ['veg'],
      regional_tags: ['pan-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });
    await addComponent({
      name: 'Sambar',
      componentType: 'curry',
      dietary_tags: ['veg'],
      regional_tags: ['south-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });
    await addComponent({
      name: 'Beans Poriyal',
      componentType: 'subzi',
      compatible_base_types: ['rice-based'],
      dietary_tags: ['veg'],
      regional_tags: ['south-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });
    await addComponent({
      name: 'Rasam',
      componentType: 'extra',
      extra_category: 'liquid',
      compatible_base_types: ['rice-based'],
      dietary_tags: ['veg'],
      regional_tags: ['south-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });

    const bases = await getComponentsByType('base');
    expect(bases).toHaveLength(1);
    expect(bases[0].name).toBe('Plain Rice');

    const curries = await getComponentsByType('curry');
    expect(curries).toHaveLength(1);
    expect(curries[0].name).toBe('Sambar');

    const subzis = await getComponentsByType('subzi');
    expect(subzis).toHaveLength(1);

    const extras = await getComponentsByType('extra');
    expect(extras).toHaveLength(1);

    const all = await getAllComponents();
    expect(all).toHaveLength(4);
  });
});

describe('DATA-02: base_type on Base records', () => {
  it('stores and retrieves base_type for all three BaseType values', async () => {
    await addComponent({
      name: 'Plain Rice',
      componentType: 'base',
      base_type: 'rice-based',
      dietary_tags: ['veg'],
      regional_tags: ['pan-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });
    await addComponent({
      name: 'Chapati',
      componentType: 'base',
      base_type: 'bread-based',
      dietary_tags: ['veg'],
      regional_tags: ['north-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });
    await addComponent({
      name: 'Idli',
      componentType: 'base',
      base_type: 'other',
      dietary_tags: ['veg'],
      regional_tags: ['south-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });

    const bases = await getComponentsByType('base');
    expect(bases).toHaveLength(3);
    expect(bases[0].base_type).toBe('rice-based');
    expect(bases[1].base_type).toBe('bread-based');
    expect(bases[2].base_type).toBe('other');
  });
});

describe('DATA-03: extra_category on Extra records', () => {
  it('stores and retrieves all five ExtraCategory values', async () => {
    const categories = ['liquid', 'crunchy', 'condiment', 'dairy', 'sweet'] as const;
    for (const cat of categories) {
      await addComponent({
        name: `Extra ${cat}`,
        componentType: 'extra',
        extra_category: cat,
        compatible_base_types: ['rice-based'],
        dietary_tags: ['veg'],
        regional_tags: ['pan-indian'],
        occasion_tags: ['everyday'],
        created_at: '',
      });
    }

    const extras = await getComponentsByType('extra');
    expect(extras).toHaveLength(5);
    const retrievedCategories = extras.map(e => e.extra_category);
    for (const cat of categories) {
      expect(retrievedCategories).toContain(cat);
    }
  });
});

describe('DATA-04: compatible_base_types filtering', () => {
  it('getExtrasByBaseType returns only matching extras', async () => {
    await addComponent({
      name: 'Rasam',
      componentType: 'extra',
      extra_category: 'liquid',
      compatible_base_types: ['rice-based'],
      dietary_tags: ['veg'],
      regional_tags: ['south-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });
    await addComponent({
      name: 'Pickle',
      componentType: 'extra',
      extra_category: 'condiment',
      compatible_base_types: ['rice-based', 'bread-based'],
      dietary_tags: ['veg'],
      regional_tags: ['pan-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });
    await addComponent({
      name: 'Coconut Chutney',
      componentType: 'extra',
      extra_category: 'condiment',
      compatible_base_types: ['other'],
      dietary_tags: ['veg'],
      regional_tags: ['south-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });

    const riceExtras = await getExtrasByBaseType('rice-based');
    expect(riceExtras).toHaveLength(2);
    const riceNames = riceExtras.map(e => e.name);
    expect(riceNames).toContain('Rasam');
    expect(riceNames).toContain('Pickle');

    const breadExtras = await getExtrasByBaseType('bread-based');
    expect(breadExtras).toHaveLength(1);
    expect(breadExtras[0].name).toBe('Pickle');

    const otherExtras = await getExtrasByBaseType('other');
    expect(otherExtras).toHaveLength(1);
    expect(otherExtras[0].name).toBe('Coconut Chutney');
  });
});

describe('DATA-05: tag catalog', () => {
  it('stores and retrieves all four tag arrays intact', async () => {
    const id = await addComponent({
      name: 'Paneer Butter Masala',
      componentType: 'curry',
      dietary_tags: ['veg', 'jain'],
      protein_tag: 'paneer',
      regional_tags: ['south-indian', 'coastal-konkan'],
      occasion_tags: ['everyday', 'festive'],
      created_at: '',
    });

    const all = await getAllComponents();
    const retrieved = all.find(c => c.id === id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.dietary_tags).toEqual(['veg', 'jain']);
    expect(retrieved!.protein_tag).toBe('paneer');
    expect(retrieved!.regional_tags).toEqual(['south-indian', 'coastal-konkan']);
    expect(retrieved!.occasion_tags).toEqual(['everyday', 'festive']);
  });
});

describe('Meal CRUD with extras', () => {
  it('creates a meal with extras, retrieves extras, and deletes cleanly', async () => {
    const baseId = await addComponent({
      name: 'Plain Rice',
      componentType: 'base',
      base_type: 'rice-based',
      dietary_tags: ['veg'],
      regional_tags: ['pan-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });
    const extra1Id = await addComponent({
      name: 'Rasam',
      componentType: 'extra',
      extra_category: 'liquid',
      compatible_base_types: ['rice-based'],
      dietary_tags: ['veg'],
      regional_tags: ['south-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });
    const extra2Id = await addComponent({
      name: 'Pickle',
      componentType: 'extra',
      extra_category: 'condiment',
      compatible_base_types: ['rice-based', 'bread-based'],
      dietary_tags: ['veg'],
      regional_tags: ['pan-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });

    const mealId = await addMeal(
      { base_id: baseId, created_at: '' },
      [extra1Id, extra2Id],
    );
    expect(typeof mealId).toBe('number');

    const mealExtras = await getMealExtras(mealId);
    expect(mealExtras).toHaveLength(2);

    await deleteMeal(mealId);

    const allMeals = await getAllMeals();
    expect(allMeals).toHaveLength(0);

    const deletedExtras = await getMealExtras(mealId);
    expect(deletedExtras).toHaveLength(0);
  });
});

describe('EDIT-03: updateRule overwrite semantics', () => {
  it('preserves row count, id, and created_at while overwriting mutable rule fields', async () => {
    const createdAt = '2026-03-27T00:00:00.000Z';
    const id = await addRule({
      name: 'Fish Fridays',
      enabled: true,
      created_at: createdAt,
      compiled_filter: {
        type: 'rule',
        target: { mode: 'tag', filter: { protein_tag: 'fish' } },
        scope: { days: ['friday'], slots: ['dinner'] },
        effects: [{ kind: 'require_one' }],
      },
    });

    const before = await getRules();

    await updateRule(id, {
      name: 'Friday fish dinner',
      compiled_filter: {
        type: 'rule',
        target: { mode: 'tag', filter: { protein_tag: 'fish' } },
        scope: { days: ['friday'], slots: ['dinner'] },
        effects: [{ kind: 'exclude' }],
      },
    });

    const after = await getRules();

    expect(before.length).toBe(1);
    expect(after.length).toBe(1);
    expect(after[0].id === before[0].id).toBe(true);
    expect(after[0].name).toBe('Friday fish dinner');
    expect(after[0].compiled_filter).toEqual({
      type: 'rule',
      target: { mode: 'tag', filter: { protein_tag: 'fish' } },
      scope: { days: ['friday'], slots: ['dinner'] },
      effects: [{ kind: 'exclude' }],
    });
    expect(after[0].created_at).toBe(createdAt);
  });
});

describe('Preferences singleton', () => {
  it('returns undefined initially, then stores and retrieves prefs', async () => {
    const initial = await getPreferences();
    expect(initial).toBeUndefined();

    await putPreferences({
      id: 'prefs',
      slot_restrictions: {
        base_type_slots: {},
        component_slot_overrides: {},
      },
      extra_quantity_limits: { breakfast: 1, lunch: 3, dinner: 2 },
      base_type_rules: [],
    });

    const saved = await getPreferences();
    expect(saved).toBeDefined();
    expect(saved!.id).toBe('prefs');
    expect(saved!.extra_quantity_limits.lunch).toBe(3);
  });
});

describe('Rule CRUD', () => {
  it('addRule stores a rule and getRules retrieves it', async () => {
    const id = await addRule({
      name: 'Friday fish',
      enabled: true,
      compiled_filter: { type: 'rule', target: { mode: 'tag', filter: { protein_tag: 'fish' } }, scope: { days: ['friday'], slots: null }, effects: [{ kind: 'filter_pool' }] },
      created_at: new Date().toISOString(),
    });
    expect(typeof id).toBe('number');
    const rules = await getRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].name).toBe('Friday fish');
    expect(rules[0].compiled_filter.type).toBe('rule');
  });

  it('getEnabledRules filters out disabled rules', async () => {
    await addRule({ name: 'Active', enabled: true, compiled_filter: { type: 'rule', target: { mode: 'component_type', component_type: 'subzi' }, scope: { days: null, slots: null }, effects: [{ kind: 'no_repeat' }] }, created_at: '' });
    await addRule({ name: 'Inactive', enabled: false, compiled_filter: { type: 'rule', target: { mode: 'component_type', component_type: 'curry' }, scope: { days: null, slots: null }, effects: [{ kind: 'no_repeat' }] }, created_at: '' });
    const enabled = await getEnabledRules();
    expect(enabled).toHaveLength(1);
    expect(enabled[0].name).toBe('Active');
  });

  it('updateRule changes enabled flag', async () => {
    const id = await addRule({ name: 'Test', enabled: true, compiled_filter: { type: 'rule', target: { mode: 'component_type', component_type: 'base' }, scope: { days: null, slots: null }, effects: [{ kind: 'no_repeat' }] }, created_at: '' });
    await updateRule(id, { enabled: false });
    const rules = await getRules();
    expect(rules[0].enabled).toBe(false);
  });

  it('deleteRule removes the rule', async () => {
    const id = await addRule({ name: 'Temp', enabled: true, compiled_filter: { type: 'rule', target: { mode: 'component_type', component_type: 'subzi' }, scope: { days: null, slots: null }, effects: [{ kind: 'no_repeat' }] }, created_at: '' });
    await deleteRule(id);
    const rules = await getRules();
    expect(rules).toHaveLength(0);
  });
});
