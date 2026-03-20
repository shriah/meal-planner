import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/client';
import { runSeed } from '@/db/seed';
import { getComponentsByType, getPreferences } from '@/services/food-db';

describe('runSeed', () => {
  beforeEach(async () => {
    await db.components.clear();
    await db.preferences.clear();
  });

  it('inserts 80-100 components when DB is empty', async () => {
    await runSeed();
    const count = await db.components.count();
    expect(count).toBeGreaterThanOrEqual(80);
    expect(count).toBeLessThanOrEqual(100);
  });

  it('covers all four component types with minimum counts', async () => {
    await runSeed();
    const bases = await getComponentsByType('base');
    const curries = await getComponentsByType('curry');
    const subzis = await getComponentsByType('subzi');
    const extras = await getComponentsByType('extra');

    expect(bases.length).toBeGreaterThanOrEqual(20);
    expect(curries.length).toBeGreaterThanOrEqual(20);
    expect(subzis.length).toBeGreaterThanOrEqual(15);
    expect(extras.length).toBeGreaterThanOrEqual(15);
  });

  it('creates UserPreferences with correct slot defaults', async () => {
    await runSeed();
    const prefs = await getPreferences();
    expect(prefs).toBeDefined();
    expect(prefs!.slot_restrictions.base_type_slots).toEqual({
      other: ['breakfast', 'dinner'],
      'rice-based': ['lunch'],
      'bread-based': ['dinner'],
    });
  });

  it('sets Poori override to breakfast only', async () => {
    await runSeed();
    const all = await db.components.toArray();
    const poori = all.find(c => c.name === 'Poori');
    expect(poori).toBeDefined();
    const pooriId = poori!.id!;
    const prefs = await getPreferences();
    expect(prefs).toBeDefined();
    const overrides = prefs!.slot_restrictions.component_slot_overrides;
    expect(overrides[pooriId]).toEqual(['breakfast']);
  });

  it('is idempotent — does not re-seed if count > 0', async () => {
    await runSeed();
    const countAfterFirst = await db.components.count();
    await runSeed();
    const countAfterSecond = await db.components.count();
    expect(countAfterSecond).toBe(countAfterFirst);
  });

  it('all extras have compatible_base_types set', async () => {
    await runSeed();
    const extras = await getComponentsByType('extra');
    for (const extra of extras) {
      expect(extra.compatible_base_types).toBeDefined();
      expect(extra.compatible_base_types!.length).toBeGreaterThan(0);
    }
  });

  it('all bases have base_type set to a valid value', async () => {
    await runSeed();
    const bases = await getComponentsByType('base');
    const validBaseTypes = ['rice-based', 'bread-based', 'other'];
    for (const base of bases) {
      expect(base.base_type).toBeDefined();
      expect(validBaseTypes).toContain(base.base_type);
    }
  });
});
