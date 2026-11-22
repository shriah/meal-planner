import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import { is } from '@/planner';
import { capRules, defaultRules, pairingCategories, ruleDays, RuleSpecSchema } from '@/rules';
import { db } from '@/db/client';
import { runSeed } from '@/db/seed';
import { ensurePartsAndTagGroups } from '@/db/parts-store';
import { CONVERTED_TAG_GROUP_KEYS, CONVERTED_TAG_GROUPS } from '@/db/parts';
import { resolveSeededCurryCompatibilityIds } from '@/db/seed-data';
import { getCategoriesByKind } from '@/services/category-db';
import { getComponentsByType, getOwnedRule, getOwnedRules } from '@/services/food-db';
import { getParts } from '@/services/parts-db';
import type { CurryRecord, ExtraRecord } from '@/types/component';

describe('runSeed', () => {
  beforeEach(async () => {
    await db.categories.clear();
    await db.components.clear();
    await db.preferences.clear();
    await db.rules.clear();
    await db.parts.clear();
    await db.tag_groups.clear();
  });

  it('seeds once when two calls overlap', async () => {
    await runSeed();
    const once = { components: await db.components.count(), rules: await db.rules.count(), categories: await db.categories.count() };
    await db.categories.clear();
    await db.components.clear();
    await db.rules.clear();

    await Promise.all([runSeed(), runSeed()]);

    expect({ components: await db.components.count(), rules: await db.rules.count(), categories: await db.categories.count() }).toEqual(once);
  });

  it('creates built-in base and extra category rows before seed-dependent records', async () => {
    await runSeed();

    const baseCategories = await getCategoriesByKind('base');
    const extraCategories = await getCategoriesByKind('extra');

    expect(baseCategories.map((category) => category.name)).toEqual([
      'bread-based',
      'other',
      'rice-based',
    ]);
    expect(extraCategories.map((category) => category.name)).toEqual([
      'condiment',
      'crunchy',
      'dairy',
      'liquid',
      'sweet',
    ]);
  });

  it('covers all four component types with category-backed component data', async () => {
    await runSeed();

    const bases = await getComponentsByType('base');
    const curries = await getComponentsByType('curry');
    const subzis = await getComponentsByType('subzi');
    const extras = await getComponentsByType('extra');

    expect(bases.length).toBeGreaterThanOrEqual(20);
    expect(curries.length).toBeGreaterThanOrEqual(20);
    expect(subzis.length).toBeGreaterThanOrEqual(15);
    expect(extras.length).toBeGreaterThanOrEqual(15);

    for (const base of bases) {
      expect(base.base_category_id).toEqual(expect.any(Number));
    }

    for (const extra of extras) {
      expect(extra.extra_category_id).toEqual(expect.any(Number));
      expect(extra).not.toHaveProperty('compatible_base_category_ids');
      expect(extra).not.toHaveProperty('compatible_base_types');
    }

    const baseCategories = await getCategoriesByKind('base');
    const baseIdsByName = Object.fromEntries(
      baseCategories.map((category) => [category.name, category.id]),
    );
    const sambar = curries.find((component) => component.name === 'Sambar');
    const rasam = curries.find((component) => component.name === 'Rasam');

    // Curated pairings are seeded as rules each curry owns, not as component fields.
    expect(sambar).not.toHaveProperty('compatible_base_category_ids');
    expect(pairingCategories((await getOwnedRule(sambar!.id, `with:${(await getParts())[0].id}:category`))!)).toEqual([
      baseIdsByName['rice-based'],
      baseIdsByName['other'],
    ]);
    // Rasam's curated list is empty: it is never planned automatically.
    expect(await getOwnedRule(rasam!.id, `with:${(await getParts())[0].id}:category`)).toBeUndefined();
    expect(await getOwnedRule(rasam!.id, 'exclude')).toBeDefined();
    // Every seeded curry has a curated pairing or is never planned automatically.
    for (const curry of curries) {
      const owned = (await getOwnedRules(curry.id)).filter((r) => r.spec.template !== 'allowed_days');
      expect(owned, curry.name).toHaveLength(1);
      expect(owned[0].spec).toMatchObject({ params: { match: is('id', curry.id) } });
    }
  });

  it('turns the calendar tags in the seed data into day rules each dish owns', async () => {
    await runSeed();
    const components = await db.components.toArray();
    for (const c of components) expect(c.occasion_tags.every((t) => t === 'festive' || t === 'fasting'), c.name).toBe(true);
    const dayRules = (await getOwnedRules()).filter((r) => r.spec.template === 'allowed_days');
    expect(dayRules.length).toBeGreaterThan(0);
    for (const r of dayRules) expect(ruleDays(r)).toEqual(['saturday', 'sunday']);
  });

  it('keeps extra records flat in the domain type contract', () => {
    expectTypeOf<ExtraRecord>().not.toHaveProperty('compatible_base_category_ids');
    expectTypeOf<ExtraRecord>().not.toHaveProperty('compatible_base_types');
  });

  it('keeps base compatibility out of the curry record type', () => {
    expectTypeOf<CurryRecord>().not.toHaveProperty('compatible_base_category_ids');
  });

  it('resolves curated curry compatibility only for exact seeded names', () => {
    const categoryLookup = {
      base: {
        'bread-based': 1,
        other: 2,
        'rice-based': 3,
      },
      extra: {
        condiment: 4,
        crunchy: 5,
        dairy: 6,
        liquid: 7,
        sweet: 8,
      },
    } as const;

    expect(resolveSeededCurryCompatibilityIds('Sambar', categoryLookup)).toEqual([3, 2]);
    expect(resolveSeededCurryCompatibilityIds('Rasam', categoryLookup)).toEqual([]);
    expect(resolveSeededCurryCompatibilityIds('Sambar Deluxe', categoryLookup)).toBeUndefined();
  });

  it('seeds the default rules, with the extras limits as rules, and base-category meal windows', async () => {
    await runSeed();

    const rules = await db.rules.toArray();
    const categoryRuleNames = new Set([
      'Other: breakfast and dinner',
      'Rice-based: lunch only',
      'Bread-based: dinner only',
    ]);

    expect(await db.preferences.count()).toBe(0);
    const parts = await getParts();
    for (const r of defaultRules(parts, { breakfast: 2, lunch: 3, dinner: 3 })) {
      expect(rules.find((s) => s.default_key === r.default_key), r.name).toMatchObject({ name: r.name, spec: r.spec });
    }
    expect(rules.filter((r) => r.default_key).map((r) => r.default_key).sort()).toEqual(defaultRules(parts).map((r) => r.default_key).sort());

    for (const rule of rules.filter((candidate) => categoryRuleNames.has(candidate.name))) {
      expect(rule.spec).toMatchObject({
        template: 'allowed_meals',
        params: { match: { field: 'category', op: 'eq', value: expect.any(Number) } },
      });
    }
    // Each window names a base category, which the seeded bases carry.
    const bases = (await db.components.toArray()).filter((c) => c.componentType === 'base');
    for (const rule of rules.filter((candidate) => categoryRuleNames.has(candidate.name))) {
      const category = (rule.spec.params as { match: { value: number } }).match.value;
      expect(bases.some((b) => b.category_id === category && b.base_category_id === category), rule.name).toBe(true);
    }
    expect(JSON.stringify(rules.filter((r) => r.owner_component_id === undefined).map((r) => r.spec))).not.toMatch(/componentType|base_category_id|extra_category_id|curry_category/);

    const pooriRule = rules.find((rule) => rule.name === 'Poori: breakfast only');
    expect(pooriRule?.spec).toMatchObject({ template: 'allowed_meals', params: { match: { field: 'id' }, meals: ['breakfast'] } });
    // Every seeded rule is valid and applies.
    expect(rules.every((rule) => RuleSpecSchema.safeParse(rule.spec).success)).toBe(true);
  });

  it('gives a new library one curry and one subzi per meal as two rules, right after the defaults', async () => {
    await runSeed();

    const rules = await db.rules.orderBy('id').toArray();
    const parts = await getParts();
    const defaults = defaultRules(parts).length;
    expect(rules.slice(0, defaults).every((r) => r.default_key)).toBe(true);
    const caps = rules.slice(defaults, defaults + 2);
    expect(caps.map(({ name, spec, enabled }) => ({ name, spec, enabled }))).toEqual(capRules(parts).map((r) => ({ ...r, enabled: true })));
    expect(caps.map((r) => r.name)).toEqual(['At most one Curry per meal', 'At most one Subzi per meal']);
    expect(rules.filter((r) => r.name.startsWith('At most one '))).toHaveLength(2);
  });

  it('is idempotent and does not duplicate seeded categories or components', async () => {
    await runSeed();
    const categoryCountAfterFirst = await db.categories.count();
    const componentCountAfterFirst = await db.components.count();

    await runSeed();

    expect(await db.categories.count()).toBe(categoryCountAfterFirst);
    expect(await db.components.count()).toBe(componentCountAfterFirst);
  });

  describe('parts and tag groups', () => {
    it('gives a new library the four parts and four tag groups, and every dish its part, category and tags', async () => {
      await runSeed();

      const parts = (await db.parts.toArray()).sort((a, b) => a.position - b.position);
      expect(parts.map((p) => [p.name, p.varied])).toEqual([['Base', true], ['Curry', true], ['Subzi', true], ['Extras', false]]);
      const groups = (await db.tag_groups.toArray()).sort((a, b) => a.position - b.position);
      expect(groups.map((g) => g.name)).toEqual(CONVERTED_TAG_GROUP_KEYS.map((k) => CONVERTED_TAG_GROUPS[k].name));

      const [basePart, curryPart, subziPart, extraPart] = parts.map((p) => p.id);
      const partOf = { base: basePart, curry: curryPart, subzi: subziPart, extra: extraPart };
      const components = await db.components.toArray();
      const categories = await db.categories.toArray();
      expect(components.length).toBeGreaterThan(0);
      for (const c of components) {
        expect(c.part_id).toBe(partOf[c.componentType]);
        expect(Object.keys(c.tags ?? {}).map(Number).sort()).toEqual(groups.map((g) => g.id).sort());
        if (c.componentType === 'curry' && c.curry_category) {
          const cat = categories.find((x) => x.id === c.category_id);
          expect(cat).toMatchObject({ kind: 'curry', name: c.curry_category, part_id: curryPart });
        }
      }
      expect(components.filter((c) => c.componentType === 'curry' && c.curry_category).length).toBeGreaterThan(0);
      for (const cat of categories) {
        expect(cat.part_id).toBe(cat.kind === 'base' ? basePart : cat.kind === 'extra' ? extraPart : curryPart);
      }
      expect(new Set(categories.filter((c) => c.kind === 'curry').map((c) => c.name)).size)
        .toBe(categories.filter((c) => c.kind === 'curry').length);
      expect(components.some((c) => (c.dietary_tags ?? []).length > 0 && Object.values(c.tags ?? {}).some((v) => v.length > 0))).toBe(true);
    });

    it('creates no duplicate parts, tag groups or curry categories when run twice', async () => {
      await runSeed();
      const once = { parts: await db.parts.count(), groups: await db.tag_groups.count(), categories: await db.categories.count() };
      await db.components.clear();
      await db.rules.clear();

      await runSeed();

      expect({ parts: await db.parts.count(), groups: await db.tag_groups.count(), categories: await db.categories.count() }).toEqual(once);
    });

    it('returns the parts and tag groups a database already has, unchanged', async () => {
      const first = await ensurePartsAndTagGroups();
      expect(first.parts).toHaveLength(4);
      expect(first.tagGroups).toHaveLength(4);
      await db.parts.update(first.parts[0].id, { varied: false });

      const again = await ensurePartsAndTagGroups();

      expect(again.parts.map((p) => [p.name, p.varied])).toEqual([['Base', false], ['Curry', true], ['Subzi', true], ['Extras', false]]);
      expect(await db.parts.count()).toBe(4);
      expect(await db.tag_groups.count()).toBe(4);
      expect(again.tagGroups.map((g) => g.id)).toEqual(first.tagGroups.map((g) => g.id));
    });

    it('matches stored parts by legacy: a short, reordered parts table gets the missing parts and every dish its own', async () => {
      const at = new Date().toISOString();
      const [curryId, baseId] = (await db.parts.bulkAdd([
        { name: 'Curry', position: 0, varied: true, legacy: 'curry', created_at: at },
        { name: 'Base', position: 1, varied: true, legacy: 'base', created_at: at },
      ] as never[], { allKeys: true })) as number[];

      await runSeed();

      const parts = await db.parts.toArray();
      expect(parts.map((p) => p.name).sort()).toEqual(['Base', 'Curry', 'Extras', 'Subzi']);
      expect(parts.find((p) => p.name === 'Curry')!.id).toBe(curryId);
      expect(parts.find((p) => p.name === 'Base')!.id).toBe(baseId);
      const idOf = Object.fromEntries(parts.map((p) => [p.name, p.id]));
      const partName = { base: 'Base', curry: 'Curry', subzi: 'Subzi', extra: 'Extras' } as const;
      for (const c of await db.components.toArray()) expect(c.part_id).toBe(idOf[partName[c.componentType]]);
    });

    it('creates no fifth part or fifth tag group when the converted ones were renamed', async () => {
      const { parts, tagGroups } = await ensurePartsAndTagGroups();
      await db.parts.update(parts[0].id, { name: 'Mains' });
      await db.tag_groups.update(tagGroups[2].id, { name: 'Where from' });

      await runSeed();

      expect((await db.parts.toArray()).map((p) => [p.name, p.legacy])).toEqual([
        ['Mains', 'base'], ['Curry', 'curry'], ['Subzi', 'subzi'], ['Extras', 'extra'],
      ]);
      expect(await db.tag_groups.count()).toBe(4);
      const idOfBase = parts[0].id;
      const dishes = await db.components.toArray();
      for (const c of dishes.filter((d) => d.componentType === 'base')) expect(c.part_id).toBe(idOfBase);
    });

    it('creates a missing part with its legacy set', async () => {
      await ensurePartsAndTagGroups();
      const extras = (await db.parts.toArray()).find((p) => p.legacy === 'extra')!;
      await db.parts.delete(extras.id);

      const { parts } = await ensurePartsAndTagGroups();

      expect(parts.find((p) => p.legacy === 'extra')).toMatchObject({ name: 'Extras', varied: false });
      expect(parts).toHaveLength(4);
    });

    it('creates a tag group that is missing and gives dishes its tags', async () => {
      await ensurePartsAndTagGroups();
      const region = (await db.tag_groups.toArray()).find((g) => g.name === 'Region')!;
      await db.tag_groups.delete(region.id);

      await runSeed();

      const groups = await db.tag_groups.toArray();
      expect(groups).toHaveLength(4);
      const created = groups.find((g) => g.name === 'Region')!;
      expect(created.id).not.toBe(region.id);
      const tagged = (await db.components.toArray()).filter((c) => (c.regional_tags ?? []).length > 0);
      expect(tagged.length).toBeGreaterThan(0);
      for (const c of tagged) expect(c.tags![created.id]).toHaveLength(c.regional_tags!.length);
    });
  });
});
