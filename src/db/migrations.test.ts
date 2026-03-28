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
});
