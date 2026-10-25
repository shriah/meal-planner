import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import { is } from '@/planner';
import { defaultRules, pairingCategories, ruleDays, RuleSpecSchema } from '@/rules';
import { db } from '@/db/client';
import { runSeed } from '@/db/seed';
import { resolveSeededCurryCompatibilityIds } from '@/db/seed-data';
import { getCategoriesByKind } from '@/services/category-db';
import { getComponentsByType, getOwnedRule, getOwnedRules } from '@/services/food-db';
import type { CurryRecord, ExtraRecord } from '@/types/component';

describe('runSeed', () => {
  beforeEach(async () => {
    await db.categories.clear();
    await db.components.clear();
    await db.preferences.clear();
    await db.rules.clear();
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
    expect(pairingCategories((await getOwnedRule(sambar!.id, 'pairs_with'))!)).toEqual([
      baseIdsByName['rice-based'],
      baseIdsByName['other'],
    ]);
    // Rasam's curated list is empty: it is never planned automatically.
    expect(await getOwnedRule(rasam!.id, 'pairs_with')).toBeUndefined();
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
    const names = new Set(rules.map((r) => r.name));
    for (const r of defaultRules({ breakfast: 2, lunch: 3, dinner: 3 })) expect(names, r.name).toContain(r.name);

    for (const rule of rules.filter((candidate) => categoryRuleNames.has(candidate.name))) {
      expect(rule.spec).toMatchObject({
        template: 'allowed_meals',
        params: { match: { field: 'base_category_id', op: 'eq', value: expect.any(Number) } },
      });
    }

    const pooriRule = rules.find((rule) => rule.name === 'Poori: breakfast only');
    expect(pooriRule?.spec).toMatchObject({ template: 'allowed_meals', params: { match: { field: 'id' }, meals: ['breakfast'] } });
    // Every seeded rule is valid and applies.
    expect(rules.every((rule) => RuleSpecSchema.safeParse(rule.spec).success)).toBe(true);
  });

  it('is idempotent and does not duplicate seeded categories or components', async () => {
    await runSeed();
    const categoryCountAfterFirst = await db.categories.count();
    const componentCountAfterFirst = await db.components.count();

    await runSeed();

    expect(await db.categories.count()).toBe(categoryCountAfterFirst);
    expect(await db.components.count()).toBe(componentCountAfterFirst);
  });
});
