import { beforeEach, describe, expect, it } from 'vitest';
import { is } from '@/planner';
import {
  clashCurryCategories, compileRules, linkRule, readLink, curryClashRule, dayRule, exclusionRule, pairingCategories, pairingRule, ruleDays,
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
  setCategoryPairings,
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
    }, { 'with:base_category': (c) => pairingRule(c, [breadId, riceId]) });

    const choleId = await saveComponent(undefined, {
      name: 'Chole',
      componentType: 'curry',
      dietary_tags: ['veg'],
      regional_tags: ['north-indian'],
      occasion_tags: [],
      created_at: '',
    }, { 'with:base_category': (c) => pairingRule(c, [breadId]) });

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
    expect(pairingCategories((await getOwnedRule(mixedVegCurryId, 'with:base_category'))!)).toEqual([riceId]);
    expect(await getOwnedRule(choleId, 'with:base_category')).toBeUndefined();
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
    }, { 'with:base_category': (c) => pairingRule(c, [breadId, riceId]) });
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
    }, { 'with:base_category': (c) => pairingRule(c, [breadId]) });

    await renameCategory(breadId, 'flatbread');

    const pairedWith = async (name: string) => {
      const curry = (await getComponentsByType('curry')).find((component) => component.name === name)!;
      const rule = await getOwnedRule(curry.id, 'with:base_category');
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
    const id = await saveComponent(undefined, curry, { 'with:base_category': (c) => pairingRule(c, [riceId]) });

    const rule = await getOwnedRule(id, 'with:base_category');
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
    expect((await getOwnedRule(id, 'with:base_category'))?.name).toBe('Tiffin Sambar: base pairing');

    await saveComponent(id, curry, { 'with:base_category': null });
    expect(await getOwnedRule(id, 'with:base_category')).toBeUndefined();

    await saveComponent(id, curry, { 'with:base_category': (c) => pairingRule(c, [riceId]) });
    await deleteComponent(id);
    expect(await getRules()).toEqual([]);
  });

  it('lets subzis own a base pairing and extras own a curry clash, kept in step with renames and deletes', async () => {
    const riceId = await addCategory({ kind: 'base', name: 'rice-based' });
    const breadId = await addCategory({ kind: 'base', name: 'bread-based' });
    const dish = (name: string, componentType: 'curry' | 'subzi' | 'extra') =>
      ({ name, componentType, dietary_tags: [], regional_tags: [], occasion_tags: [], created_at: '' });
    const subziId = await saveComponent(undefined, dish('Bhindi', 'subzi'), { 'with:base_category': (c) => pairingRule(c, [riceId]) });
    const curryId = await saveComponent(undefined, dish('Bread Curry', 'curry'), { 'with:base_category': (c) => pairingRule(c, [breadId]) });
    const extraId = await saveComponent(undefined, dish('Papad', 'extra'), { 'never:curry_category': (c) => curryClashRule(c, ['soup']) });

    expect(clashCurryCategories((await getOwnedRule(extraId, 'never:curry_category'))!)).toEqual(['soup']);
    await updateComponent(extraId, { name: 'Masala Papad' });
    expect((await getOwnedRule(extraId, 'never:curry_category'))?.name).toBe('Masala Papad: not with these curries');

    // A pairing left with no categories is removed, for curries and subzis alike.
    await deleteCategory(riceId);
    await deleteCategory(breadId);
    expect(await getOwnedRule(subziId, 'with:base_category')).toBeUndefined();
    expect(await getOwnedRule(curryId, 'with:base_category')).toBeUndefined();

    await deleteComponent(extraId);
    expect(await getOwnedRule(extraId, 'never:curry_category')).toBeUndefined();
  });

  it('drops a deleted extra category from a link, and the link when none is left', async () => {
    const liquid = await addCategory({ kind: 'extra', name: 'Liquid' });
    const crunchy = await addCategory({ kind: 'extra', name: 'Crunchy' });
    const base = { componentType: 'base' as const, dietary_tags: [], regional_tags: [], occasion_tags: [], created_at: '' };
    const scope = { days: ['monday' as const], meals: ['lunch' as const] };
    const idli = await saveComponent(undefined, { ...base, name: 'Idli' }, {
      'never:extra_category': (c) => linkRule(c, { mode: 'never', target: 'extra_category', values: [liquid, crunchy], strength: 'moderately', scope }),
    });

    await deleteCategory(liquid);
    expect(readLink((await getOwnedRule(idli, 'never:extra_category'))!)).toEqual({ mode: 'never', target: 'extra_category', values: [crunchy], strength: 'moderately', scope });
    await deleteCategory(crunchy);
    expect(await getOwnedRule(idli, 'never:extra_category')).toBeUndefined();
  });

  it('drops a deleted dish from other dishes\' links, and the link when none is left', async () => {
    const tags = { dietary_tags: [], regional_tags: [], occasion_tags: [], created_at: '' };
    const idli = await saveComponent(undefined, { ...tags, name: 'Idli', componentType: 'base' });
    const dosa = await saveComponent(undefined, { ...tags, name: 'Dosa', componentType: 'base' });
    const sambar = await saveComponent(undefined, { ...tags, name: 'Sambar', componentType: 'curry' }, {
      'with:base_dish': (c) => linkRule(c, { mode: 'with', target: 'base_dish', values: [idli, dosa], strength: 'sometimes', scope: { days: ['friday'] } }),
    });

    await deleteComponent(idli);
    expect(readLink((await getOwnedRule(sambar, 'with:base_dish'))!)).toEqual({ mode: 'with', target: 'base_dish', values: [dosa], strength: 'sometimes', scope: { days: ['friday'] } });
    await deleteComponent(dosa);
    expect(await getOwnedRule(sambar, 'with:base_dish')).toBeUndefined();
  });

  it('restores deleted default rules without touching ones that are still there, edited or not', async () => {
    await runSeed();
    const byKey = async (key: string) => (await getRules()).find((r) => r.default_key === key);
    await deleteRule((await byKey('variety'))!.id);
    await deleteRule((await byKey('spacing'))!.id);
    const avoidRare = (await byKey('avoid-rare'))!;
    await updateRule(avoidRare.id, { name: 'My rare wish', enabled: false });
    const before = (await getRules()).length;

    expect(await restoreDefaultRules()).toBe(2);
    expect(await getRules()).toHaveLength(before + 2);
    expect((await byKey('variety'))?.name).toBe('Vary dishes across the week');
    expect(await byKey('avoid-rare')).toMatchObject({ name: 'My rare wish', enabled: false });

    expect(await restoreDefaultRules()).toBe(0);
    expect(await getRules()).toHaveLength(before + 2);
  });
});

describe('setCategoryPairings', () => {
  const dish = (name: string, componentType: 'curry' | 'subzi' = 'curry') =>
    saveComponent(undefined, { name, componentType, dietary_tags: ['veg'], regional_tags: [], occasion_tags: [], created_at: new Date().toISOString() });
  const bases = async (id: number) => {
    const rule = await getOwnedRule(id, 'with:base_category');
    return rule && pairingCategories(rule);
  };

  it('starts a dish that goes with any base as going with every other base, so ticking is exclusive', async () => {
    const rice = await addCategory({ kind: 'base', name: 'Rice' });
    const bread = await addCategory({ kind: 'base', name: 'Bread' });
    const sambar = await dish('Sambar');
    const dal = await dish('Dal');

    // Only Sambar goes with Rice: Dal stops going with it.
    await setCategoryPairings(rice, [sambar]);
    expect(await bases(sambar)).toBeUndefined();
    expect(await bases(dal)).toEqual([bread]);
  });

  it('adds and removes one base, and drops the rule when the dish goes with every base again', async () => {
    const rice = await addCategory({ kind: 'base', name: 'Rice' });
    const bread = await addCategory({ kind: 'base', name: 'Bread' });
    const sambar = await dish('Sambar');
    await setCategoryPairings(rice, []);
    expect(await bases(sambar)).toEqual([bread]);
    await setCategoryPairings(rice, [sambar]);
    expect(await getOwnedRule(sambar, 'with:base_category')).toBeUndefined();
  });

  it('keeps the strength of a dish\'s pairing when the base side changes it', async () => {
    const rice = await addCategory({ kind: 'base', name: 'Rice' });
    await addCategory({ kind: 'base', name: 'Bread' });
    await addCategory({ kind: 'base', name: 'Other' });
    const sambar = await dish('Sambar');
    await saveComponent(sambar, { name: 'Sambar', componentType: 'curry', dietary_tags: ['veg'], regional_tags: [], occasion_tags: [], created_at: '' }, {
      'with:base_category': (c) => pairingRule(c, [rice], 'usually'),
    });
    const bread = (await getCategoriesByKind('base')).find((c) => c.name === 'Bread')!.id;
    await setCategoryPairings(bread, [sambar]);
    expect(readLink((await getOwnedRule(sambar, 'with:base_category'))!)).toMatchObject({ values: expect.arrayContaining([rice, bread]), strength: 'usually' });
  });

  it('keeps a pairing\'s scope and strength when the base side changes it', async () => {
    const rice = await addCategory({ kind: 'base', name: 'Rice' });
    const bread = await addCategory({ kind: 'base', name: 'Bread' });
    const sambar = await dish('Sambar');
    const scope = { days: ['monday' as const], meals: ['lunch' as const] };
    await saveComponent(sambar, { name: 'Sambar', componentType: 'curry', dietary_tags: ['veg'], regional_tags: [], occasion_tags: [], created_at: '' }, {
      'with:base_category': (c) => linkRule(c, { mode: 'with', target: 'base_category', values: [rice], strength: 'moderately', scope }),
    });
    // Every base ticked: a scoped pairing still means something, so it stays.
    await setCategoryPairings(bread, [sambar]);
    expect(readLink((await getOwnedRule(sambar, 'with:base_category'))!)).toEqual({ mode: 'with', target: 'base_category', values: [rice, bread], strength: 'moderately', scope });
    await setCategoryPairings(rice, []);
    expect(readLink((await getOwnedRule(sambar, 'with:base_category'))!)).toEqual({ mode: 'with', target: 'base_category', values: [bread], strength: 'moderately', scope });
  });

  it('refuses to leave a dish with no base, and ignores bases and extras', async () => {
    const rice = await addCategory({ kind: 'base', name: 'Rice' });
    const sambar = await dish('Sambar');
    await expect(setCategoryPairings(rice, [])).rejects.toThrow(/at least one base/);
    expect(await getOwnedRule(sambar, 'with:base_category')).toBeUndefined();
  });
});
