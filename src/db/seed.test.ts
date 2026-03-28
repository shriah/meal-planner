import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { runSeed } from '@/db/seed';
import { getCategoriesByKind } from '@/services/category-db';
import { getComponentsByType, getPreferences } from '@/services/food-db';

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
      expect(extra.compatible_base_category_ids).toBeDefined();
      expect(extra.compatible_base_category_ids!.length).toBeGreaterThan(0);
    }
  });

  it('creates preferences with empty slot_restrictions and seeds base-category default rules', async () => {
    await runSeed();

    const prefs = await getPreferences();
    const rules = await db.rules.toArray();
    const categoryRuleNames = new Set([
      'Other: breakfast and dinner',
      'Rice-based: lunch only',
      'Bread-based: dinner only',
    ]);

    expect(prefs).toBeDefined();
    expect(prefs!.slot_restrictions.base_type_slots).toEqual({});
    expect(prefs!.slot_restrictions.component_slot_overrides).toEqual({});

    for (const rule of rules.filter((candidate) => categoryRuleNames.has(candidate.name))) {
      expect(rule.compiled_filter.target.mode).toBe('base_category');
      if (rule.compiled_filter.target.mode === 'base_category') {
        expect(rule.compiled_filter.target.category_id).toEqual(expect.any(Number));
      }
    }

    const pooriRule = rules.find((rule) => rule.name === 'Poori: breakfast only');
    expect(pooriRule?.compiled_filter.target.mode).toBe('component');
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
