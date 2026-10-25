import { beforeEach, describe, expect, it } from 'vitest';
import { is } from '@/planner';
import {
  clashCurryCategories, compileRules, curryClashRule, dayRule, exclusionRule, pairingCategories, pairingRule, ruleDays,
} from '@/rules';
import { db } from '@/db/client';
import { runSeed } from '@/db/seed';
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
  deleteComponent,
  deleteRule,
  getComponentsByType,
  getOwnedRule,
  getRules,
  restoreDefaultRules,
  saveComponent,
  updateComponent,
  updateRule,
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
      occasion_tags: [],
      created_at: '',
    });

    await addComponent({
      name: 'Rasam',
      componentType: 'extra',
      extra_category_id: liquidId,
      extra_category: 'liquid',
      dietary_tags: ['veg'],
      regional_tags: ['south-indian'],
      occasion_tags: [],
      created_at: '',
    });

    const bases = await getCategoriesByKind('base');
    const extras = await getCategoriesByKind('extra');
    const storedExtras = await getComponentsByType('extra');

    expect(bases.map((category) => category.id)).toContain(riceId);
    expect(extras.map((category) => category.id)).toContain(liquidId);
    expect(storedExtras[0].extra_category_id).toBe(liquidId);
    expect(storedExtras[0]).not.toHaveProperty('compatible_base_category_ids');
    expect(storedExtras[0]).not.toHaveProperty('compatible_base_types');
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

  it('delete normalization strips deleted IDs and clears direct refs, leaving rules for planning to flag', async () => {
    const breadId = await addCategory({ kind: 'base', name: 'bread-based' });
    const riceId = await addCategory({ kind: 'base', name: 'rice-based' });
    const condimentId = await addCategory({ kind: 'extra', name: 'condiment' });

    const rotiId = await addComponent({
      name: 'Roti',
      componentType: 'base',
      base_category_id: breadId,
      base_type: 'bread-based',
      dietary_tags: ['veg'],
      regional_tags: ['north-indian'],
      occasion_tags: [],
      created_at: '',
    });

    await addComponent({
      name: 'Pickle',
      componentType: 'extra',
      extra_category_id: condimentId,
      extra_category: 'condiment',
      dietary_tags: ['veg'],
      regional_tags: ['pan-indian'],
      occasion_tags: [],
      created_at: '',
    });

    const mixedVegCurryId = await saveComponent(undefined, {
      name: 'Mixed Veg Curry',
      componentType: 'curry',
      dietary_tags: ['veg'],
      regional_tags: ['pan-indian'],
      occasion_tags: [],
      created_at: '',
    }, { pairs_with: (c) => pairingRule(c, [breadId, riceId]) });

    const choleId = await saveComponent(undefined, {
      name: 'Chole',
      componentType: 'curry',
      dietary_tags: ['veg'],
      regional_tags: ['north-indian'],
      occasion_tags: [],
      created_at: '',
    }, { pairs_with: (c) => pairingRule(c, [breadId]) });

    await addRule({
      name: 'Bread dinner',
      enabled: true,
      created_at: new Date().toISOString(),
      spec: {
        template: 'require_with',
        params: { when: is('base_category_id', breadId), extraCategories: [condimentId], scope: { days: ['friday'], meals: ['dinner'] } },
      },
    });

    await renameCategory(breadId, 'flatbread');
    await deleteCategory(breadId);

    const baseComponent = await db.components.get(rotiId);
    const [extraComponent] = await getComponentsByType('extra');
    const [rule] = (await getRules()).filter((r) => r.owner_component_id === undefined);

    expect(baseComponent?.base_category_id).toBeNull();
    // Pairings owned by curries drop the deleted category instead of being skipped; one left with
    // no category is removed, so the curry goes with any base.
    expect(pairingCategories((await getOwnedRule(mixedVegCurryId, 'pairs_with'))!)).toEqual([riceId]);
    expect(await getOwnedRule(choleId, 'pairs_with')).toBeUndefined();
    expect(extraComponent).not.toHaveProperty('compatible_base_category_ids');
    expect(extraComponent).not.toHaveProperty('compatible_base_types');
    // The rule is kept unchanged; compiling it now reports the deleted category instead of applying it.
    expect(rule.enabled).toBe(true);
    const known = { components: new Set<number>(), baseCategories: new Set([riceId]), extraCategories: new Set([condimentId]) };
    expect(compileRules([rule], known).issues).toEqual([
      expect.objectContaining({ name: 'Bread dinner', message: `refers to base category #${breadId}, which no longer exists` }),
    ]);
  });

  it('rename keeps category-ID compatibility stable; delete removes emptied pairings but keeps never-planned curries', async () => {
    const breadId = await addCategory({ kind: 'base', name: 'bread-based' });
    const riceId = await addCategory({ kind: 'base', name: 'rice-based' });

    await saveComponent(undefined, {
      name: 'Mixed Veg Curry',
      componentType: 'curry',
      dietary_tags: ['veg'],
      regional_tags: ['pan-indian'],
      occasion_tags: [],
      created_at: '',
    }, { pairs_with: (c) => pairingRule(c, [breadId, riceId]) });
    await saveComponent(undefined, {
      name: 'Never Auto Pick',
      componentType: 'curry',
      dietary_tags: ['veg'],
      regional_tags: ['pan-indian'],
      occasion_tags: [],
      created_at: '',
    }, { exclude: (c) => exclusionRule(c) });
    await saveComponent(undefined, {
      name: 'Bread Only Curry',
      componentType: 'curry',
      dietary_tags: ['veg'],
      regional_tags: ['north-indian'],
      occasion_tags: [],
      created_at: '',
    }, { pairs_with: (c) => pairingRule(c, [breadId]) });

    await renameCategory(breadId, 'flatbread');

    const pairedWith = async (name: string) => {
      const curry = (await getComponentsByType('curry')).find((component) => component.name === name)!;
      const rule = await getOwnedRule(curry.id, 'pairs_with');
      return rule && pairingCategories(rule);
    };
    const neverAuto = (await getComponentsByType('curry')).find((c) => c.name === 'Never Auto Pick')!;
    expect(await pairedWith('Mixed Veg Curry')).toEqual([breadId, riceId]);
    expect(await pairedWith('Bread Only Curry')).toEqual([breadId]);

    await deleteCategory(breadId);

    expect(await pairedWith('Mixed Veg Curry')).toEqual([riceId]);
    expect(await pairedWith('Bread Only Curry')).toBeUndefined();
    expect(await getOwnedRule(neverAuto.id, 'exclude')).toBeDefined();
  });

  it('stores a curry pairing as a rule the curry owns, renamed and deleted with it', async () => {
    const riceId = await addCategory({ kind: 'base', name: 'rice-based' });
    const curry = { name: 'Sambar', componentType: 'curry' as const, dietary_tags: [], regional_tags: [], occasion_tags: [], created_at: '' };
    const id = await saveComponent(undefined, curry, { pairs_with: (c) => pairingRule(c, [riceId]) });

    const rule = await getOwnedRule(id, 'pairs_with');
    expect(rule).toMatchObject({
      name: 'Sambar: base pairing',
      enabled: true,
      owner_component_id: id,
      spec: { template: 'pairs_with', params: { match: is('id', id), baseCategories: [riceId] } },
    });
    expect(await db.components.get(id)).not.toHaveProperty('compatible_base_category_ids');

    // Several rules of different types, one of each.
    await saveComponent(id, curry, { exclude: (c) => exclusionRule(c), allowed_days: (c) => dayRule(c, ['sunday']) });
    await saveComponent(id, curry, { allowed_days: (c) => dayRule(c, ['monday']) });
    expect((await getRules()).map((r) => r.spec.template)).toEqual(['pairs_with', 'exclude', 'allowed_days']);
    expect(ruleDays((await getOwnedRule(id, 'allowed_days'))!)).toEqual(['monday']);
    await saveComponent(id, curry, { exclude: null, allowed_days: null });

    expect(await getRules()).toHaveLength(1);
    await updateComponent(id, { name: 'Tiffin Sambar' });
    expect((await getOwnedRule(id, 'pairs_with'))?.name).toBe('Tiffin Sambar: base pairing');

    await saveComponent(id, curry, { pairs_with: null });
    expect(await getOwnedRule(id, 'pairs_with')).toBeUndefined();

    await saveComponent(id, curry, { pairs_with: (c) => pairingRule(c, [riceId]) });
    await deleteComponent(id);
    expect(await getRules()).toEqual([]);
  });

  it('lets subzis own a base pairing and extras own a curry clash, kept in step with renames and deletes', async () => {
    const riceId = await addCategory({ kind: 'base', name: 'rice-based' });
    const breadId = await addCategory({ kind: 'base', name: 'bread-based' });
    const dish = (name: string, componentType: 'curry' | 'subzi' | 'extra') =>
      ({ name, componentType, dietary_tags: [], regional_tags: [], occasion_tags: [], created_at: '' });
    const subziId = await saveComponent(undefined, dish('Bhindi', 'subzi'), { pairs_with: (c) => pairingRule(c, [riceId]) });
    const curryId = await saveComponent(undefined, dish('Bread Curry', 'curry'), { pairs_with: (c) => pairingRule(c, [breadId]) });
    const extraId = await saveComponent(undefined, dish('Papad', 'extra'), { avoid_with: (c) => curryClashRule(c, ['soup']) });

    expect(clashCurryCategories((await getOwnedRule(extraId, 'avoid_with'))!)).toEqual(['soup']);
    await updateComponent(extraId, { name: 'Masala Papad' });
    expect((await getOwnedRule(extraId, 'avoid_with'))?.name).toBe('Masala Papad: not with these curries');

    // A pairing left with no categories is removed, for curries and subzis alike.
    await deleteCategory(riceId);
    await deleteCategory(breadId);
    expect(await getOwnedRule(subziId, 'pairs_with')).toBeUndefined();
    expect(await getOwnedRule(curryId, 'pairs_with')).toBeUndefined();

    await deleteComponent(extraId);
    expect(await getOwnedRule(extraId, 'avoid_with')).toBeUndefined();
  });

  it('restores deleted default rules without touching ones that are still there, edited or not', async () => {
    await runSeed();
    const byKey = async (key: string) => (await getRules()).find((r) => r.default_key === key);
    await deleteRule((await byKey('variety'))!.id);
    await deleteRule((await byKey('spacing'))!.id);
    const wantCurry = (await byKey('want-curry'))!;
    await updateRule(wantCurry.id, { name: 'My curry wish', enabled: false });
    const before = (await getRules()).length;

    expect(await restoreDefaultRules()).toBe(2);
    expect(await getRules()).toHaveLength(before + 2);
    expect((await byKey('variety'))?.name).toBe('Vary dishes across the week');
    expect(await byKey('want-curry')).toMatchObject({ name: 'My curry wish', enabled: false });

    expect(await restoreDefaultRules()).toBe(0);
    expect(await getRules()).toHaveLength(before + 2);
  });
});
