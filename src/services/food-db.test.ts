import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { buildCategoryMap, getBaseCategoryLabel, getExtraCategoryLabel } from '@/lib/category-labels';
import {
  addCategory,
  deleteCategory,
  getCategoriesByKind,
  renameCategory,
} from '@/services/category-db';
import {
  addComponent,
  addRule,
  getComponentsByType,
  getExtrasByBaseType,
  getRules,
} from '@/services/food-db';

beforeEach(async () => {
  await db.components.clear();
  await db.meals.clear();
  await db.meal_extras.clear();
  await db.preferences.clear();
  await db.rules.clear();
  await db.categories.clear();
});

describe('Phase 14 category services', () => {
  it('persists base and extra categories as records and uses IDs in component storage', async () => {
    const riceId = await addCategory({ kind: 'base', name: 'rice-based' });
    const liquidId = await addCategory({ kind: 'extra', name: 'liquid' });

    await addComponent({
      name: 'Plain Rice',
      componentType: 'base',
      base_category_id: riceId,
      base_type: 'rice-based',
      dietary_tags: ['veg'],
      regional_tags: ['pan-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });

    await addComponent({
      name: 'Rasam',
      componentType: 'extra',
      extra_category_id: liquidId,
      extra_category: 'liquid',
      compatible_base_category_ids: [riceId],
      compatible_base_types: ['rice-based'],
      dietary_tags: ['veg'],
      regional_tags: ['south-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });

    const bases = await getCategoriesByKind('base');
    const extras = await getCategoriesByKind('extra');
    const storedExtras = await getComponentsByType('extra');
    const compatibleExtras = await getExtrasByBaseType(riceId);

    expect(bases.map((category) => category.id)).toContain(riceId);
    expect(extras.map((category) => category.id)).toContain(liquidId);
    expect(storedExtras[0].extra_category_id).toBe(liquidId);
    expect(storedExtras[0].compatible_base_category_ids).toEqual([riceId]);
    expect(compatibleExtras.map((component) => component.name)).toEqual(['Rasam']);
  });

  it('rename resolves via labels without stored ID churn', async () => {
    const liquidId = await addCategory({ kind: 'extra', name: 'liquid' });
    const renamed = 'soupy';

    await renameCategory(liquidId, renamed);

    const categories = await getCategoriesByKind('extra');
    const categoriesById = buildCategoryMap(categories);

    expect(getExtraCategoryLabel(categoriesById, liquidId)).toBe(renamed);
    expect(getBaseCategoryLabel(categoriesById, 999_999)).toBe('Deleted base category');
  });

  it('delete normalization strips deleted IDs, clears direct refs, and disables invalid rules', async () => {
    const breadId = await addCategory({ kind: 'base', name: 'bread-based' });
    const condimentId = await addCategory({ kind: 'extra', name: 'condiment' });

    const rotiId = await addComponent({
      name: 'Roti',
      componentType: 'base',
      base_category_id: breadId,
      base_type: 'bread-based',
      dietary_tags: ['veg'],
      regional_tags: ['north-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });

    await addComponent({
      name: 'Pickle',
      componentType: 'extra',
      extra_category_id: condimentId,
      extra_category: 'condiment',
      compatible_base_category_ids: [breadId],
      compatible_base_types: ['bread-based'],
      dietary_tags: ['veg'],
      regional_tags: ['pan-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });

    await addRule({
      name: 'Bread dinner',
      enabled: true,
      created_at: new Date().toISOString(),
      compiled_filter: {
        type: 'rule',
        target: { mode: 'base_category', category_id: breadId },
        scope: { days: ['friday'], slots: ['dinner'] },
        effects: [{ kind: 'require_extra', category_ids: [condimentId] }],
      },
    });

    await deleteCategory(breadId);

    const [baseComponent] = await db.components.bulkGet([rotiId]);
    const [extraComponent] = await getComponentsByType('extra');
    const [rule] = await getRules();

    expect(baseComponent?.base_category_id).toBeNull();
    expect(extraComponent.compatible_base_category_ids).toEqual([]);
    expect(rule.enabled).toBe(false);
  });
});
