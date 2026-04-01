import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_BASE_CATEGORY_NAMES,
  BUILT_IN_EXTRA_CATEGORY_NAMES,
} from '@/types/category';
import {
  buildCategoryMigrationFixture,
  migrateLegacyCategoryData,
} from './client';

describe('Phase 14 categories table migration', () => {
  it('creates base and extra category records for built-in labels', () => {
    const fixture = buildCategoryMigrationFixture();
    const migrated = migrateLegacyCategoryData(fixture);

    expect(migrated.categories.filter((category) => category.kind === 'base').map((category) => category.name))
      .toEqual([...BUILT_IN_BASE_CATEGORY_NAMES]);
    expect(migrated.categories.filter((category) => category.kind === 'extra').map((category) => category.name))
      .toEqual([...BUILT_IN_EXTRA_CATEGORY_NAMES]);
  });

  it('rewrites literal component category fields to numeric IDs in one categories table', () => {
    const migrated = migrateLegacyCategoryData(buildCategoryMigrationFixture());
    const lemonRice = migrated.components.find((component) => component.name === 'Lemon Rice');
    const rasam = migrated.components.find((component) => component.name === 'Rasam');

    expect(lemonRice?.base_category_id).toEqual(expect.any(Number));
    expect(lemonRice?.base_type).toBe('rice-based');
    expect(rasam?.extra_category_id).toEqual(expect.any(Number));
    expect(rasam?.compatible_base_category_ids).toEqual(
      expect.arrayContaining([expect.any(Number)]),
    );
  });

  it('delete normalization clears component references and disables rules with deleted category targets', () => {
    const fixture = buildCategoryMigrationFixture();
    const migrated = migrateLegacyCategoryData(fixture);
    const deletedBaseCategoryId = migrated.categories.find((category) => category.name === 'bread-based')?.id;

    expect(deletedBaseCategoryId).toBeDefined();

    const normalized = migrated.normalizeDeletedCategory(deletedBaseCategoryId!);
    const roti = normalized.components.find((component) => component.name === 'Roti');
    const pickle = normalized.components.find((component) => component.name === 'Pickle');
    const breadRule = normalized.rules.find((rule) => rule.name === 'Bread dinner');

    expect(roti?.base_category_id).toBeNull();
    expect(pickle?.compatible_base_category_ids).not.toContain(deletedBaseCategoryId);
    expect(breadRule?.enabled).toBe(false);
  });

  it('backfills legacy seeded curries with curated compatible base category IDs', () => {
    const fixture = buildCategoryMigrationFixture();
    fixture.components.push({
      name: 'Sambar',
      componentType: 'curry',
      dietary_tags: ['veg'],
      regional_tags: ['south-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });

    const migrated = migrateLegacyCategoryData(fixture);
    const sambar = migrated.components.find(
      (component) => component.componentType === 'curry' && component.name === 'Sambar',
    );
    const riceBaseId = migrated.categories.find((category) => category.name === 'rice-based')?.id;
    const otherBaseId = migrated.categories.find((category) => category.name === 'other')?.id;

    expect(sambar?.compatible_base_category_ids).toEqual([riceBaseId, otherBaseId]);
  });

  it('backfills unmatched legacy curries to all current base category IDs', () => {
    const fixture = buildCategoryMigrationFixture();
    fixture.components.push({
      name: 'House Special Curry',
      componentType: 'curry',
      dietary_tags: ['veg'],
      regional_tags: ['pan-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });

    const migrated = migrateLegacyCategoryData(fixture);
    const customCurry = migrated.components.find(
      (component) => component.componentType === 'curry' && component.name === 'House Special Curry',
    );
    const allBaseIds = migrated.categories
      .filter((category) => category.kind === 'base')
      .map((category) => category.id);

    expect(customCurry?.compatible_base_category_ids).toEqual(allBaseIds);
  });

  it('preserves explicit empty curry compatibility arrays during migration', () => {
    const fixture = buildCategoryMigrationFixture();
    fixture.components.push({
      name: 'Rasam',
      componentType: 'curry',
      compatible_base_category_ids: [],
      dietary_tags: ['veg'],
      regional_tags: ['south-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });

    const migrated = migrateLegacyCategoryData(fixture);
    const rasam = migrated.components.find(
      (component) => component.componentType === 'curry' && component.name === 'Rasam',
    );

    expect(rasam?.compatible_base_category_ids).toEqual([]);
  });

  it('keeps curated backfill, unmatched fallback, and explicit empty arrays intact in one migrated runtime fixture', () => {
    const fixture = buildCategoryMigrationFixture();
    fixture.components.push(
      {
        name: 'Sambar',
        componentType: 'curry',
        dietary_tags: ['veg'],
        regional_tags: ['south-indian'],
        occasion_tags: ['everyday'],
        created_at: '',
      },
      {
        name: 'House Special Curry',
        componentType: 'curry',
        dietary_tags: ['veg'],
        regional_tags: ['pan-indian'],
        occasion_tags: ['everyday'],
        created_at: '',
      },
      {
        name: 'Never Auto Pick',
        componentType: 'curry',
        compatible_base_category_ids: [],
        dietary_tags: ['veg'],
        regional_tags: ['pan-indian'],
        occasion_tags: ['everyday'],
        created_at: '',
      },
    );

    const migrated = migrateLegacyCategoryData(fixture);
    const riceBaseId = migrated.categories.find((category) => category.name === 'rice-based')?.id;
    const breadBaseId = migrated.categories.find((category) => category.name === 'bread-based')?.id;
    const otherBaseId = migrated.categories.find((category) => category.name === 'other')?.id;
    const allBaseIds = migrated.categories
      .filter((category) => category.kind === 'base')
      .map((category) => category.id);

    expect(migrated.components.find((component) => component.name === 'Sambar')?.compatible_base_category_ids)
      .toEqual([riceBaseId, otherBaseId]);
    expect(
      migrated.components.find((component) => component.name === 'House Special Curry')?.compatible_base_category_ids,
    ).toEqual(allBaseIds);
    expect(
      migrated.components.find((component) => component.name === 'Never Auto Pick')?.compatible_base_category_ids,
    ).toEqual([]);

    const normalized = migrated.normalizeDeletedCategory(breadBaseId!);

    expect(normalized.components.find((component) => component.name === 'Sambar')?.compatible_base_category_ids)
      .toEqual([riceBaseId, otherBaseId]);
    expect(
      normalized.components.find((component) => component.name === 'House Special Curry')?.compatible_base_category_ids,
    ).toEqual([riceBaseId, otherBaseId]);
    expect(
      normalized.components.find((component) => component.name === 'Never Auto Pick')?.compatible_base_category_ids,
    ).toEqual([]);
  });
});
