import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import { RuleSpecSchema } from '@/rules';
import { db } from '@/db/client';
import { runSeed } from '@/db/seed';
import { resolveSeededCurryCompatibilityIds } from '@/db/seed-data';
import { getCategoriesByKind } from '@/services/category-db';
import { getComponentsByType, getPreferences } from '@/services/food-db';
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

    expect(sambar?.compatible_base_category_ids).toEqual([
      baseIdsByName['rice-based'],
      baseIdsByName['other'],
    ]);
    expect(sambar?.compatible_base_category_ids).toEqual(
      expect.arrayContaining([expect.any(Number)]),
    );
    expect(rasam?.compatible_base_category_ids).toEqual([]);
  });

  it('keeps extra records flat in the domain type contract', () => {
    expectTypeOf<ExtraRecord>().not.toHaveProperty('compatible_base_category_ids');
    expectTypeOf<ExtraRecord>().not.toHaveProperty('compatible_base_types');
  });

  it('keeps an explicit empty curry compatibility array distinct from legacy missing data', () => {
    const intentionallyIneligibleCurry: CurryRecord = {
      id: 1,
      name: 'Explicitly Ineligible Curry',
      componentType: 'curry',
      compatible_base_category_ids: [],
      dietary_tags: ['veg'],
      regional_tags: ['pan-indian'],
      occasion_tags: ['everyday'],
      created_at: '2026-03-20T00:00:00.000Z',
    };

    expect(intentionallyIneligibleCurry.compatible_base_category_ids).toEqual([]);
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

  it('creates preferences with per-meal extras limits and seeds base-category default rules', async () => {
    await runSeed();

    const prefs = await getPreferences();
    const rules = await db.rules.toArray();
    const categoryRuleNames = new Set([
      'Other: breakfast and dinner',
      'Rice-based: lunch only',
      'Bread-based: dinner only',
    ]);

    expect(prefs).toBeDefined();
    expect(prefs).toEqual({ id: 'prefs', extra_quantity_limits: { breakfast: 2, lunch: 3, dinner: 3 } });

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
