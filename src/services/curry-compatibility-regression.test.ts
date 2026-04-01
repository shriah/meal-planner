import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/client';
import { addCategory } from '@/services/category-db';
import { addComponent, addRule, putPreferences } from '@/services/food-db';
import { generate } from './generator';

async function seedBackboneFixture() {
  const riceBaseCategoryId = await addCategory({ kind: 'base', name: 'rice-based' });
  const breadBaseCategoryId = await addCategory({ kind: 'base', name: 'bread-based' });
  const otherBaseCategoryId = await addCategory({ kind: 'base', name: 'other' });

  const riceBaseId = await addComponent({
    name: 'Plain Rice',
    componentType: 'base',
    base_type: 'rice-based',
    base_category_id: riceBaseCategoryId,
    dietary_tags: ['veg'],
    regional_tags: ['pan-indian'],
    occasion_tags: ['everyday'],
    created_at: '',
  });

  const sambarId = await addComponent({
    name: 'Sambar',
    componentType: 'curry',
    compatible_base_category_ids: [riceBaseCategoryId, otherBaseCategoryId],
    dietary_tags: ['veg'],
    protein_tag: 'dal',
    regional_tags: ['south-indian'],
    occasion_tags: ['everyday'],
    created_at: '',
  });
  const fallbackCurryId = await addComponent({
    name: 'House Special Curry',
    componentType: 'curry',
    compatible_base_category_ids: [riceBaseCategoryId, breadBaseCategoryId, otherBaseCategoryId],
    dietary_tags: ['veg'],
    protein_tag: 'paneer',
    regional_tags: ['pan-indian'],
    occasion_tags: ['everyday'],
    created_at: '',
  });
  const breadOnlyCurryId = await addComponent({
    name: 'Paneer Butter Masala',
    componentType: 'curry',
    compatible_base_category_ids: [breadBaseCategoryId],
    dietary_tags: ['veg'],
    protein_tag: 'paneer',
    regional_tags: ['north-indian'],
    occasion_tags: ['everyday'],
    created_at: '',
  });
  const zeroCompatibleCurryId = await addComponent({
    name: 'Never Auto Pick',
    componentType: 'curry',
    compatible_base_category_ids: [],
    dietary_tags: ['veg'],
    regional_tags: ['pan-indian'],
    occasion_tags: ['everyday'],
    created_at: '',
  });

  await putPreferences({
    id: 'prefs',
    slot_restrictions: {
      base_type_slots: {},
      component_slot_overrides: {},
    },
    extra_quantity_limits: { breakfast: 0, lunch: 0, dinner: 0 },
    base_type_rules: [],
  });

  return {
    riceBaseId,
    riceBaseCategoryId,
    sambarId,
    fallbackCurryId,
    breadOnlyCurryId,
    zeroCompatibleCurryId,
  };
}

beforeEach(async () => {
  await db.categories.clear();
  await db.components.clear();
  await db.rules.clear();
  await db.preferences.clear();
  vi.restoreAllMocks();
});

describe('CURRY-08 backbone regression', () => {
  it('keeps default generation, explicit require_one, and locked manual preservation on the same compatibility contract', async () => {
    const ids = await seedBackboneFixture();

    vi.spyOn(Math, 'random').mockReturnValue(0);
    const defaultResult = await generate();
    expect(defaultResult.plan.slots).toHaveLength(21);
    for (const slot of defaultResult.plan.slots) {
      expect(slot.base_id).toBe(ids.riceBaseId);
      expect(slot.curry_id).toBe(ids.sambarId);
      expect(slot.curry_id).not.toBe(ids.breadOnlyCurryId);
      expect(slot.curry_id).not.toBe(ids.zeroCompatibleCurryId);
    }

    await addRule({
      name: 'Force an incompatible curry on monday breakfast only',
      enabled: true,
      compiled_filter: {
        type: 'rule',
        target: { mode: 'component', component_id: ids.breadOnlyCurryId },
        scope: { days: ['monday'], slots: ['breakfast'] },
        effects: [{ kind: 'require_one' }],
      },
      created_at: '',
    });

    const overrideResult = await generate();
    const mondayBreakfast = overrideResult.plan.slots.find(
      (slot) => slot.day === 'monday' && slot.meal_slot === 'breakfast',
    );

    expect(mondayBreakfast?.base_id).toBe(ids.riceBaseId);
    expect(mondayBreakfast?.curry_id).toBe(ids.breadOnlyCurryId);
    for (const slot of overrideResult.plan.slots.filter(
      (candidate) => !(candidate.day === 'monday' && candidate.meal_slot === 'breakfast'),
    )) {
      expect(slot.curry_id).toBe(ids.sambarId);
    }

    const lockedResult = await generate({
      lockedSlots: {
        'monday-breakfast': {
          base_id: ids.riceBaseId,
          curry_id: ids.breadOnlyCurryId,
        },
      },
    });

    expect(
      lockedResult.plan.slots.find((slot) => slot.day === 'monday' && slot.meal_slot === 'breakfast')?.curry_id,
    ).toBe(ids.breadOnlyCurryId);
  });

  it('keeps migrated fallback curries usable without reintroducing permissive incompatible defaults', async () => {
    const ids = await seedBackboneFixture();

    await db.components.delete(ids.sambarId);
    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    const fallbackResult = await generate();
    for (const slot of fallbackResult.plan.slots) {
      expect(slot.base_id).toBe(ids.riceBaseId);
      expect(slot.curry_id).toBe(ids.fallbackCurryId);
      expect(slot.curry_id).not.toBe(ids.breadOnlyCurryId);
      expect(slot.curry_id).not.toBe(ids.zeroCompatibleCurryId);
    }

    await db.components.delete(ids.fallbackCurryId);

    const warningResult = await generate();
    for (const slot of warningResult.plan.slots) {
      expect(slot.curry_id).toBeUndefined();
    }
    expect(warningResult.warnings.some((warning) => warning.message.includes('no compatible curry'))).toBe(true);
  });
});
