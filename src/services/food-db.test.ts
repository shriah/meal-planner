import { beforeEach, describe, expect, it } from 'vitest';
import { is } from '@/planner';
import {
  compileRules, readLink as readLinkOver, readOwned as readOwnedOver, dayRule, exclusionRule, pairingCategories, ruleDays,
  type DishLink, type LinkKind, type RuleRecord,
} from '@/rules';
import { db } from '@/db/client';
import { legacyPartIds, type LegacyParts } from '@/db/parts';
import { ensurePartsAndTagGroups } from '@/db/parts-store';
import type { PartRecord } from '@/types/part';
import type { ComponentRecord } from '@/types/component';
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
  getOwnedRules,
  getRules,
  restoreDefaultRules,
  saveComponent,
  updateComponent,
  updateRule,
} from '@/services/food-db';
import { TEST_RULE_PARTS } from '@/rules/test-parts';

// The stored parts, and the converted part of each type, as the library holds them.
let PARTS: PartRecord[] = [];
let P: LegacyParts;
const to = (type: keyof LegacyParts, kind: LinkKind) => ({ part: P[type], kind });
const readLink = (rule: Pick<RuleRecord, 'spec'>) => readLinkOver(rule, PARTS);
const readOwned = (rules: RuleRecord[]) => readOwnedOver(rules, PARTS);

beforeEach(async () => {
  PARTS = (await ensurePartsAndTagGroups()).parts;
  P = legacyPartIds(PARTS);
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
    }, {}, [{ kind: 'add', link: { mode: 'with', target: to('base', 'category'), values: [breadId, riceId], strength: 'always' } }]);

    const choleId = await saveComponent(undefined, {
      name: 'Chole',
      componentType: 'curry',
      dietary_tags: ['veg'],
      regional_tags: ['north-indian'],
      occasion_tags: [],
      created_at: '',
    }, {}, [{ kind: 'add', link: { mode: 'with', target: to('base', 'category'), values: [breadId], strength: 'always' } }]);

    await addRule({
      name: 'Bread dinner',
      enabled: true,
      created_at: new Date().toISOString(),
      spec: {
        template: 'require_with',
        params: { when: is('base_category_id', breadId), categories: [condimentId], scope: { days: ['friday'], meals: ['dinner'] } },
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
    expect(pairingCategories((await getOwnedRule(mixedVegCurryId, `with:${P.base}:category`))!)).toEqual([riceId]);
    expect(await getOwnedRule(choleId, `with:${P.base}:category`)).toBeUndefined();
    expect(extraComponent).not.toHaveProperty('compatible_base_category_ids');
    expect(extraComponent).not.toHaveProperty('compatible_base_types');
    // The rule is kept unchanged; compiling it now reports the deleted category instead of applying it.
    expect(rule.enabled).toBe(true);
    const known = { components: new Set<number>(), categories: new Set([riceId, condimentId]), parts: new Set([1, 2, 3, 4]) };
    expect(compileRules([rule], known, TEST_RULE_PARTS).issues).toEqual([
      expect.objectContaining({ name: 'Bread dinner', message: `refers to category #${breadId}, which no longer exists` }),
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
    }, {}, [{ kind: 'add', link: { mode: 'with', target: to('base', 'category'), values: [breadId, riceId], strength: 'always' } }]);
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
    }, {}, [{ kind: 'add', link: { mode: 'with', target: to('base', 'category'), values: [breadId], strength: 'always' } }]);

    await renameCategory(breadId, 'flatbread');

    const pairedWith = async (name: string) => {
      const curry = (await getComponentsByType('curry')).find((component) => component.name === name)!;
      const rule = await getOwnedRule(curry.id, `with:${P.base}:category`);
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
    const id = await saveComponent(undefined, curry, {}, [{ kind: 'add', link: { mode: 'with', target: to('base', 'category'), values: [riceId], strength: 'always' } }]);

    const rule = await getOwnedRule(id, `with:${P.base}:category`);
    expect(rule).toMatchObject({
      name: 'Sambar: base pairing',
      enabled: true,
      owner_component_id: id,
      spec: { template: 'pairs_with', params: { match: is('id', id), categories: [riceId] } },
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
    expect((await getOwnedRule(id, `with:${P.base}:category`))?.name).toBe('Tiffin Sambar: base pairing');

    await saveComponent(id, curry, {}, [{ kind: 'remove', ruleId: rule!.id }]);
    expect(await getOwnedRule(id, `with:${P.base}:category`)).toBeUndefined();

    await saveComponent(id, curry, {}, [{ kind: 'add', link: { mode: 'with', target: to('base', 'category'), values: [riceId], strength: 'always' } }]);
    await deleteComponent(id);
    expect(await getRules()).toEqual([]);
  });

  it('lets subzis own a base pairing and extras own a curry clash, kept in step with renames and deletes', async () => {
    const riceId = await addCategory({ kind: 'base', name: 'rice-based' });
    const breadId = await addCategory({ kind: 'base', name: 'bread-based' });
    const dish = (name: string, componentType: 'curry' | 'subzi' | 'extra') =>
      ({ name, componentType, dietary_tags: [], regional_tags: [], occasion_tags: [], created_at: '' });
    const subziId = await saveComponent(undefined, dish('Bhindi', 'subzi'), {}, [{ kind: 'add', link: { mode: 'with', target: to('base', 'category'), values: [riceId], strength: 'always' } }]);
    const curryId = await saveComponent(undefined, dish('Bread Curry', 'curry'), {}, [{ kind: 'add', link: { mode: 'with', target: to('base', 'category'), values: [breadId], strength: 'always' } }]);
    // The curry type soup is a category of the Curry part.
    const soup = await addCategory({ kind: 'curry', name: 'soup' });
    const extraId = await saveComponent(undefined, dish('Papad', 'extra'), {}, [{ kind: 'add', link: { mode: 'never', target: to('curry', 'category'), values: [soup], strength: 'always' } }]);

    expect(readLink((await getOwnedRule(extraId, `never:${P.curry}:category`))!)?.values).toEqual([soup]);
    await updateComponent(extraId, { name: 'Masala Papad' });
    expect((await getOwnedRule(extraId, `never:${P.curry}:category`))?.name).toBe('Masala Papad: not with these curries');

    // A pairing left with no categories is removed, for curries and subzis alike.
    await deleteCategory(riceId);
    await deleteCategory(breadId);
    expect(await getOwnedRule(subziId, `with:${P.base}:category`)).toBeUndefined();
    expect(await getOwnedRule(curryId, `with:${P.base}:category`)).toBeUndefined();

    await deleteComponent(extraId);
    expect(await getOwnedRule(extraId, `never:${P.curry}:category`)).toBeUndefined();
  });

  it('drops a deleted extra category from a link, and the link when none is left', async () => {
    const liquid = await addCategory({ kind: 'extra', name: 'Liquid' });
    const crunchy = await addCategory({ kind: 'extra', name: 'Crunchy' });
    const base = { componentType: 'base' as const, dietary_tags: [], regional_tags: [], occasion_tags: [], created_at: '' };
    const scope = { days: ['monday' as const], meals: ['lunch' as const] };
    const idli = await saveComponent(undefined, { ...base, name: 'Idli' }, {}, [
      { kind: 'add', link: { mode: 'never', target: to('extra', 'category'), values: [liquid, crunchy], strength: 'moderately', scope } },
    ]);

    await deleteCategory(liquid);
    expect(readLink((await getOwnedRule(idli, `never:${P.extra}:category`))!)).toEqual({ mode: 'never', target: to('extra', 'category'), values: [crunchy], strength: 'moderately', scope });
    await deleteCategory(crunchy);
    expect(await getOwnedRule(idli, `never:${P.extra}:category`)).toBeUndefined();
  });

  it('drops a deleted dish from other dishes\' links, and the link when none is left', async () => {
    const tags = { dietary_tags: [], regional_tags: [], occasion_tags: [], created_at: '' };
    const idli = await saveComponent(undefined, { ...tags, name: 'Idli', componentType: 'base' });
    const dosa = await saveComponent(undefined, { ...tags, name: 'Dosa', componentType: 'base' });
    const sambar = await saveComponent(undefined, { ...tags, name: 'Sambar', componentType: 'curry' }, {}, [
      { kind: 'add', link: { mode: 'with', target: to('base', 'dish'), values: [idli, dosa], strength: 'sometimes', scope: { days: ['friday'] } } },
    ]);

    await deleteComponent(idli);
    expect(readLink((await getOwnedRule(sambar, `with:${P.base}:dish`))!)).toEqual({ mode: 'with', target: to('base', 'dish'), values: [dosa], strength: 'sometimes', scope: { days: ['friday'] } });
    await deleteComponent(dosa);
    expect(await getOwnedRule(sambar, `with:${P.base}:dish`)).toBeUndefined();
  });

  it('drops a deleted curry or subzi from the conditions of comes-with links, and a link left with an empty part', async () => {
    const tags = { dietary_tags: [], regional_tags: [], occasion_tags: [], created_at: '' };
    const papad = await saveComponent(undefined, { ...tags, name: 'Papad', componentType: 'extra' });
    const sambar = await saveComponent(undefined, { ...tags, name: 'Sambar', componentType: 'curry' });
    const rasam = await saveComponent(undefined, { ...tags, name: 'Rasam', componentType: 'curry' });
    const beans = await saveComponent(undefined, { ...tags, name: 'Beans Poriyal', componentType: 'subzi' });
    const comes = (when: DishLink['when']): DishLink => ({ mode: 'comes', target: to('extra', 'dish'), values: [papad], strength: 'usually', scope: { meals: ['lunch'] }, when });
    const rice = await saveComponent(undefined, { ...tags, name: 'Rice', componentType: 'base' }, {}, [
      { kind: 'add', link: comes({ [P.curry]: [sambar, rasam] }) },
      { kind: 'add', link: comes({ [P.curry]: [sambar], [P.subzi]: [beans] }) },
      { kind: 'add', link: comes({ [P.curry]: [rasam], [P.subzi]: [beans] }) },
    ]);
    const [either, both, rasamBeans] = await getOwnedRules(rice);

    await deleteComponent(sambar);
    expect(readLink((await db.rules.get(either.id))!)).toEqual(comes({ [P.curry]: [rasam] }));
    // Losing Sambar must not widen "Sambar and Beans Poriyal" to "Beans Poriyal": the link goes.
    expect(await db.rules.get(both.id)).toBeUndefined();
    expect(await db.rules.get(rasamBeans.id)).toEqual(rasamBeans);

    await deleteComponent(beans);
    expect(await db.rules.get(rasamBeans.id)).toBeUndefined();
    expect(readLink((await db.rules.get(either.id))!)).toEqual(comes({ [P.curry]: [rasam] }));
    await deleteComponent(rasam);
    expect(await getOwnedRules(rice)).toEqual([]);
  });

  it('drops a deleted dish from a condition on any part, not only the curry and subzi', async () => {
    const tags = { dietary_tags: [], regional_tags: [], occasion_tags: [], created_at: '' };
    const papad = await saveComponent(undefined, { ...tags, name: 'Papad', componentType: 'extra' });
    const pickle = await saveComponent(undefined, { ...tags, name: 'Pickle', componentType: 'extra' });
    const beans = await saveComponent(undefined, { ...tags, name: 'Beans Poriyal', componentType: 'subzi' });
    const link: DishLink = { mode: 'comes', target: to('subzi', 'dish'), values: [beans], strength: 'always', when: { [P.extra]: [papad, pickle] } };
    const rice = await saveComponent(undefined, { ...tags, name: 'Rice', componentType: 'base' }, {}, [{ kind: 'add', link }]);
    const [rule] = await getOwnedRules(rice);

    await deleteComponent(papad);
    expect(readLink((await db.rules.get(rule.id))!)).toEqual({ ...link, when: { [P.extra]: [pickle] } });
    await deleteComponent(pickle);
    expect(await db.rules.get(rule.id)).toBeUndefined();
  });

  it('drops a deleted category from every link to categories: curry types, served with and comes with', async () => {
    const tags = { dietary_tags: [], regional_tags: [], occasion_tags: [], created_at: '' };
    const soup = await addCategory({ kind: 'curry', name: 'soup' });
    const lentil = await addCategory({ kind: 'curry', name: 'lentil' });
    const rice = await addCategory({ kind: 'base', name: 'rice-based' });
    const tiffin = await addCategory({ kind: 'base', name: 'tiffin' });
    const liquid = await addCategory({ kind: 'extra', name: 'Liquid' });
    const raita = await saveComponent(undefined, { ...tags, name: 'Raita', componentType: 'extra' }, {}, [
      { kind: 'add', link: { mode: 'never', target: to('curry', 'category'), values: [soup, lentil], strength: 'always' } },
      { kind: 'add', link: { mode: 'serve', target: to('base', 'category'), values: [rice, tiffin], strength: 'always' } },
    ]);
    const idli = await saveComponent(undefined, { ...tags, name: 'Idli', componentType: 'base' }, {}, [
      { kind: 'add', link: { mode: 'comes', target: to('extra', 'category'), values: [liquid], strength: 'always' } },
    ]);
    const before = await getOwnedRules(raita);

    await deleteCategory(soup);
    await deleteCategory(tiffin);
    expect(readOwned(await getOwnedRules(raita)).links.map((l) => [l.mode, l.values])).toEqual([['never', [lentil]], ['serve', [rice]]]);
    expect((await getOwnedRules(raita)).map((r) => r.id)).toEqual(before.map((r) => r.id));
    await deleteCategory(lentil);
    await deleteCategory(liquid);
    expect(readOwned(await getOwnedRules(raita)).links.map((l) => l.mode)).toEqual(['serve']);
    expect(await getOwnedRules(idli)).toEqual([]);
  });

  it('two comes-with links are saved, edited and removed on their own', async () => {
    const tags = { dietary_tags: [], regional_tags: [], occasion_tags: [], created_at: '' };
    const coconut = await saveComponent(undefined, { ...tags, name: 'Coconut Chutney', componentType: 'extra' });
    const tomato = await saveComponent(undefined, { ...tags, name: 'Tomato Chutney', componentType: 'extra' });
    const comes = (values: number[]): DishLink => ({ mode: 'comes', target: to('extra', 'dish'), values, strength: 'always' });
    const idli = await saveComponent(undefined, { ...tags, name: 'Idli', componentType: 'base' }, {}, [
      { kind: 'add', link: comes([coconut]) }, { kind: 'add', link: comes([tomato]) },
    ]);
    const stored = await getOwnedRules(idli);
    expect(stored).toHaveLength(2);
    const [first, second] = stored;
    expect(readOwned(stored).links.map((l) => l.ruleId)).toEqual([first.id, second.id]);

    await saveComponent(idli, { ...tags, name: 'Idli', componentType: 'base' }, {}, [{ kind: 'update', ruleId: first.id, link: comes([coconut, tomato]) }]);
    expect(readLink((await db.rules.get(first.id))!)?.values).toEqual([coconut, tomato]);
    expect(await db.rules.get(second.id)).toEqual(second);

    await saveComponent(idli, { ...tags, name: 'Idli', componentType: 'base' }, {}, [{ kind: 'remove', ruleId: first.id }]);
    expect(await getOwnedRules(idli)).toEqual([second]);
  });

  it('a saved link update switches the rule on', async () => {
    const tags = { dietary_tags: [], regional_tags: [], occasion_tags: [], created_at: '' };
    const coconut = await saveComponent(undefined, { ...tags, name: 'Coconut Chutney', componentType: 'extra' });
    const link: DishLink = { mode: 'comes', target: to('extra', 'dish'), values: [coconut], strength: 'always' };
    const idli = await saveComponent(undefined, { ...tags, name: 'Idli', componentType: 'base' }, {}, [{ kind: 'add', link }]);
    const [rule] = await getOwnedRules(idli);
    await db.rules.update(rule.id, { enabled: false });
    await saveComponent(idli, { ...tags, name: 'Idli', componentType: 'base' }, {}, [{ kind: 'update', ruleId: rule.id, link: { ...link, strength: 'usually' } }]);
    expect(await db.rules.get(rule.id)).toMatchObject({ enabled: true, created_at: rule.created_at });
  });

  it('deleting a dish keeps every link of the same kind on other dishes', async () => {
    const tags = { dietary_tags: [], regional_tags: [], occasion_tags: [], created_at: '' };
    const coconut = await saveComponent(undefined, { ...tags, name: 'Coconut Chutney', componentType: 'extra' });
    const tomato = await saveComponent(undefined, { ...tags, name: 'Tomato Chutney', componentType: 'extra' });
    const pickle = await saveComponent(undefined, { ...tags, name: 'Pickle', componentType: 'extra' });
    const comes = (values: number[]): DishLink => ({ mode: 'comes', target: to('extra', 'dish'), values, strength: 'always' });
    const idli = await saveComponent(undefined, { ...tags, name: 'Idli', componentType: 'base' }, {}, [
      { kind: 'add', link: comes([coconut]) }, { kind: 'add', link: comes([tomato, pickle]) },
    ]);

    await deleteComponent(pickle);
    expect(readOwned(await getOwnedRules(idli)).links.map((l) => l.values)).toEqual([[coconut], [tomato]]);

    await updateComponent(idli, { name: 'Ghee Idli' });
    expect((await getOwnedRules(idli)).map((r) => r.name)).toEqual(['Ghee Idli: comes with', 'Ghee Idli: comes with']);
    await updateComponent(idli, { name: 'Idli' });
    expect((await getOwnedRules(idli)).map((r) => r.name)).toEqual(['Idli: comes with', 'Idli: comes with']);
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

describe('saving a dish keeps part, category and tags in step', () => {
  const curry = (curry_category: 'lentil' | 'legume' | 'paneer'): Omit<ComponentRecord, 'id'> => ({
    name: 'Dal', componentType: 'curry', curry_category, dietary_tags: ['veg'], regional_tags: [], occasion_tags: [], created_at: '',
  });
  const partId = async (name: string) => (await db.parts.toArray()).find((p) => p.name === name)!.id;
  const curryCategory = async (name: string) => (await db.categories.toArray()).find((c) => c.kind === 'curry' && c.name === name);

  it('adding a curry creates its Curry category and sets part_id and category_id', async () => {
    expect(await curryCategory('paneer')).toBeUndefined();
    const id = await addComponent(curry('paneer'));
    const category = await curryCategory('paneer');
    const stored = await db.components.get(id);
    expect(category?.part_id).toBe(await partId('Curry'));
    expect(stored?.part_id).toBe(await partId('Curry'));
    expect(stored?.category_id).toBe(category?.id);
  });

  it('editing a curry type moves its category_id (the dish was converted by the upgrade)', async () => {
    const id = await addComponent(curry('lentil'));
    const lentil = await curryCategory('lentil');
    expect((await db.components.get(id))?.category_id).toBe(lentil?.id);
    await updateComponent(id, { curry_category: 'legume' });
    const legume = await curryCategory('legume');
    expect(legume).toBeDefined();
    expect((await db.components.get(id))?.category_id).toBe(legume?.id);
  });

  it('saveComponent moves category_id and ignores a stale one carried by the form', async () => {
    const id = await saveComponent(undefined, curry('lentil'));
    const stale = (await db.components.get(id))!;
    await saveComponent(id, { ...stale, curry_category: 'legume' } as Omit<ComponentRecord, 'id'>);
    expect((await db.components.get(id))?.category_id).toBe((await curryCategory('legume'))?.id);
  });

  it('updating only notes leaves part_id, category_id and tags exactly as stored', async () => {
    const id = await addComponent(curry('lentil'));
    // A stored state the derivation would not produce: a save that changes nothing derived must not touch it.
    await db.components.update(id, { part_id: 1234, tags: { 99: [1] } });
    const before = (await db.components.get(id))!;
    await updateComponent(id, { notes: 'more garlic' });
    const after = (await db.components.get(id))!;
    expect(after.notes).toBe('more garlic');
    expect(after.part_id).toBe(before.part_id);
    expect(after.category_id).toBe(before.category_id);
    expect(after.tags).toEqual(before.tags);
  });

  it('a form save with no edits leaves part_id, category_id and tags as stored', async () => {
    const id = await addComponent({ ...curry('lentil'), protein_tag: 'dal', regional_tags: ['south-indian'] });
    // A stored state the derivation would not produce: a save that changes nothing must not touch it.
    await db.components.update(id, { part_id: 1234, category_id: 4321, tags: { 99: [1] } });
    const stored = (await db.components.get(id))!;
    // What ComponentForm sends for an unchanged curry: the form's fields over the stored record's id-free copy.
    const payload: Omit<ComponentRecord, 'id'> = {
      name: stored.name, componentType: 'curry', notes: stored.notes, dietary_tags: stored.dietary_tags,
      protein_tag: stored.protein_tag, regional_tags: stored.regional_tags, occasion_tags: stored.occasion_tags,
      frequency: stored.frequency, created_at: stored.created_at, curry_category: stored.curry_category,
    };
    await saveComponent(id, payload);
    const after = (await db.components.get(id))!;
    expect(after.part_id).toBe(1234);
    expect(after.category_id).toBe(4321);
    expect(after.tags).toEqual({ 99: [1] });
  });

  it('editing a tag field rewrites tags (updateComponent and saveComponent)', async () => {
    const id = await addComponent(curry('lentil'));
    const region = (await db.tag_groups.toArray()).find((g) => g.name === 'Region')!;
    const valueId = (name: string) => region.values.find((v) => v.name === name)!.id;
    expect((await db.components.get(id))?.tags?.[region.id]).toEqual([]);

    await updateComponent(id, { regional_tags: ['south-indian'] });
    expect((await db.components.get(id))?.tags?.[region.id]).toEqual([valueId('south-indian')]);

    const stored = (await db.components.get(id))!;
    await saveComponent(id, { ...stored, regional_tags: ['south-indian', 'pan-indian'] });
    expect((await db.components.get(id))?.tags?.[region.id]).toEqual([valueId('south-indian'), valueId('pan-indian')]);
  });

  it('a curry type outside the known list gets no Curry category', async () => {
    const id = await addComponent({ ...curry('lentil'), curry_category: 'mystery' as never });
    expect(await curryCategory('mystery')).toBeUndefined();
    expect((await db.components.get(id))?.category_id).toBeUndefined();
  });

  it('addCategory sets part_id from its kind', async () => {
    const extra = await db.categories.get(await addCategory({ kind: 'extra', name: 'pickle' }));
    const base = await db.categories.get(await addCategory({ kind: 'base', name: 'millet' }));
    expect(extra?.part_id).toBe(await partId('Extras'));
    expect(base?.part_id).toBe(await partId('Base'));
  });

  it('deleting a category clears category_id with the base reference', async () => {
    const categoryId = await addCategory({ kind: 'base', name: 'rice-based' });
    const id = await addComponent({
      name: 'Rice', componentType: 'base', base_category_id: categoryId, base_type: 'rice-based',
      dietary_tags: [], regional_tags: [], occasion_tags: [], created_at: '',
    });
    expect((await db.components.get(id))?.category_id).toBe(categoryId);
    await deleteCategory(categoryId);
    const stored = (await db.components.get(id))!;
    expect(stored.base_category_id).toBeNull();
    expect(stored.category_id ?? null).toBeNull();
  });
});
