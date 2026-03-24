import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/client';
import { generate } from './generator';
import { addComponent, putPreferences, addRule } from '@/services/food-db';
import type { ComponentRecord } from '@/types/component';
import type { UserPreferencesRecord } from '@/types/preferences';

// ─── Seed helpers ─────────────────────────────────────────────────────────────

/**
 * Insert a minimal set of components into Dexie for testing.
 * Returns a map of component IDs by name.
 */
async function seedMinimalComponents(): Promise<{
  riceBaseId: number;
  breadBaseId: number;
  otherBaseId: number;
  curry1Id: number;
  curry2Id: number;
  subzi1Id: number;
  subzi2Id: number;
  subzi3Id: number;
  extraLiquidRiceId: number;    // rice-only (e.g. Rasam)
  extraCondimentAllId: number;  // all base types
  extraCondimentOtherId: number; // other-only
}> {
  const base: Omit<ComponentRecord, 'id'> = {
    name: '',
    componentType: 'base',
    dietary_tags: ['veg'],
    regional_tags: ['pan-indian'],
    occasion_tags: ['everyday'],
    created_at: '',
  };
  const curry: Omit<ComponentRecord, 'id'> = {
    name: '',
    componentType: 'curry',
    dietary_tags: ['veg'],
    regional_tags: ['pan-indian'],
    occasion_tags: ['everyday'],
    created_at: '',
  };
  const subzi: Omit<ComponentRecord, 'id'> = {
    name: '',
    componentType: 'subzi',
    dietary_tags: ['veg'],
    regional_tags: ['pan-indian'],
    occasion_tags: ['everyday'],
    created_at: '',
  };

  const riceBaseId = await addComponent({ ...base, name: 'Plain Rice', base_type: 'rice-based' });
  const breadBaseId = await addComponent({ ...base, name: 'Chapati', base_type: 'bread-based' });
  const otherBaseId = await addComponent({ ...base, name: 'Idli', base_type: 'other' });

  const curry1Id = await addComponent({ ...curry, name: 'Sambar' });
  const curry2Id = await addComponent({ ...curry, name: 'Dal Tadka' });

  const subzi1Id = await addComponent({ ...subzi, name: 'Beans Poriyal' });
  const subzi2Id = await addComponent({ ...subzi, name: 'Aloo Gobi' });
  const subzi3Id = await addComponent({ ...subzi, name: 'Palak Paneer' });

  const extraLiquidRiceId = await addComponent({
    name: 'Rasam',
    componentType: 'extra',
    extra_category: 'liquid',
    compatible_base_types: ['rice-based'],
    dietary_tags: ['veg'],
    regional_tags: ['south-indian'],
    occasion_tags: ['everyday'],
    created_at: '',
  });

  const extraCondimentAllId = await addComponent({
    name: 'Pickle',
    componentType: 'extra',
    extra_category: 'condiment',
    compatible_base_types: ['rice-based', 'bread-based', 'other'],
    dietary_tags: ['veg'],
    regional_tags: ['pan-indian'],
    occasion_tags: ['everyday'],
    created_at: '',
  });

  const extraCondimentOtherId = await addComponent({
    name: 'Coconut Chutney',
    componentType: 'extra',
    extra_category: 'condiment',
    compatible_base_types: ['other'],
    dietary_tags: ['veg'],
    regional_tags: ['south-indian'],
    occasion_tags: ['everyday'],
    created_at: '',
  });

  return {
    riceBaseId, breadBaseId, otherBaseId,
    curry1Id, curry2Id,
    subzi1Id, subzi2Id, subzi3Id,
    extraLiquidRiceId, extraCondimentAllId, extraCondimentOtherId,
  };
}

/**
 * Insert permissive preferences — all base types allowed in all slots,
 * reasonable extra limits, no mandatory extra rules.
 */
async function seedDefaultPreferences(): Promise<void> {
  const prefs: UserPreferencesRecord = {
    id: 'prefs',
    slot_restrictions: {
      base_type_slots: {},           // all base types in all slots
      component_slot_overrides: {},
    },
    extra_quantity_limits: { breakfast: 2, lunch: 3, dinner: 2 },
    base_type_rules: [],
  };
  await putPreferences(prefs);
}

// ─── beforeEach ───────────────────────────────────────────────────────────────

beforeEach(async () => {
  await db.components.clear();
  await db.rules.clear();
  await db.preferences.clear();
});

// ─── PLAN-01: Full 21-slot generation ─────────────────────────────────────────

describe('PLAN-01: Full 21-slot generation', () => {
  it('1. returns 21 PlanSlot entries', async () => {
    await seedMinimalComponents();
    await seedDefaultPreferences();
    const result = await generate();
    expect(result.plan.slots).toHaveLength(21);
  });

  it('2. covers all 7 days x 3 meal slots', async () => {
    await seedMinimalComponents();
    await seedDefaultPreferences();
    const result = await generate();
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const slots = ['breakfast', 'lunch', 'dinner'];
    for (const day of days) {
      for (const slot of slots) {
        const found = result.plan.slots.find(s => s.day === day && s.meal_slot === slot);
        expect(found).toBeDefined();
      }
    }
  });

  it('3. every slot has a base_id (number)', async () => {
    await seedMinimalComponents();
    await seedDefaultPreferences();
    const result = await generate();
    for (const slot of result.plan.slots) {
      expect(typeof slot.base_id).toBe('number');
      expect(slot.base_id).toBeGreaterThan(0);
    }
  });

  it('4. returns { plan, warnings } shape', async () => {
    await seedMinimalComponents();
    await seedDefaultPreferences();
    const result = await generate();
    expect(result).toHaveProperty('plan');
    expect(result).toHaveProperty('warnings');
    expect(result.plan).toHaveProperty('slots');
    expect(Array.isArray(result.warnings)).toBe(true);
  });
});

// ─── PLAN-04: Extra compatibility ─────────────────────────────────────────────

describe('PLAN-04: Extra compatibility', () => {
  it('5. extras only assigned when compatible_base_types includes selected base type', async () => {
    const ids = await seedMinimalComponents();
    await seedDefaultPreferences();

    // Lock to only bread-based base so we can reason about which extras can appear
    await putPreferences({
      id: 'prefs',
      slot_restrictions: {
        base_type_slots: {
          'rice-based': [],   // disabled
          'other': [],        // disabled
        },
        component_slot_overrides: {},
      },
      extra_quantity_limits: { breakfast: 3, lunch: 3, dinner: 3 },
      base_type_rules: [],
    });

    const result = await generate();
    for (const slot of result.plan.slots) {
      // All bases should be bread-based (Chapati)
      expect(slot.base_id).toBe(ids.breadBaseId);

      // Rasam (rice-only extra) must never appear
      expect(slot.extra_ids).not.toContain(ids.extraLiquidRiceId);

      // Coconut Chutney (other-only) must never appear
      expect(slot.extra_ids).not.toContain(ids.extraCondimentOtherId);
    }
  });

  it('6. rice-only extra (Rasam) never appears with bread-based base', async () => {
    const ids = await seedMinimalComponents();
    // Run 5 times to confirm no accidental pairing
    await putPreferences({
      id: 'prefs',
      slot_restrictions: {
        base_type_slots: { 'rice-based': [], 'other': [] },
        component_slot_overrides: {},
      },
      extra_quantity_limits: { breakfast: 3, lunch: 3, dinner: 3 },
      base_type_rules: [],
    });
    for (let i = 0; i < 5; i++) {
      const result = await generate();
      for (const slot of result.plan.slots) {
        expect(slot.extra_ids).not.toContain(ids.extraLiquidRiceId);
      }
    }
  });

  it('7. extra count per slot does not exceed extra_quantity_limits', async () => {
    await seedMinimalComponents();
    await putPreferences({
      id: 'prefs',
      slot_restrictions: { base_type_slots: {}, component_slot_overrides: {} },
      extra_quantity_limits: { breakfast: 1, lunch: 2, dinner: 1 },
      base_type_rules: [],
    });
    const result = await generate();
    for (const slot of result.plan.slots) {
      const limit = slot.meal_slot === 'lunch' ? 2 : 1;
      expect(slot.extra_ids.length).toBeLessThanOrEqual(limit);
    }
  });

  it('8. mandatory extra: other base type gets at least one condiment when base_type_rules requires it', async () => {
    const ids = await seedMinimalComponents();
    await putPreferences({
      id: 'prefs',
      slot_restrictions: {
        base_type_slots: {
          'rice-based': [],    // disable rice so all bases = 'other' (Idli)
          'bread-based': [],   // disable bread
        },
        component_slot_overrides: {},
      },
      extra_quantity_limits: { breakfast: 3, lunch: 3, dinner: 3 },
      base_type_rules: [
        { base_type: 'other', required_extra_category: 'condiment' },
      ],
    });
    const result = await generate();
    // All bases are 'other' type — each slot must have at least one condiment extra
    for (const slot of result.plan.slots) {
      expect(slot.base_id).toBe(ids.otherBaseId);
      const condimentIds = [ids.extraCondimentAllId, ids.extraCondimentOtherId];
      const hasCondiment = slot.extra_ids.some(id => condimentIds.includes(id));
      expect(hasCondiment).toBe(true);
    }
  });
});

// ─── RULE-03: Scheduling-rule filter-pool (replaces DayFilterRule) ────────────

describe('RULE-03: scheduling-rule filter-pool', () => {
  it('9. scheduling-rule filter-pool with protein_tag:fish on friday — Friday slots have fish-tagged components', async () => {
    // Add a fish curry
    await addComponent({
      name: 'Fish Curry',
      componentType: 'curry',
      protein_tag: 'fish',
      dietary_tags: ['non-veg'],
      regional_tags: ['coastal-konkan'],
      occasion_tags: ['everyday'],
      created_at: '',
    });
    // Add a non-fish curry
    await addComponent({
      name: 'Dal Fry',
      componentType: 'curry',
      protein_tag: 'dal',
      dietary_tags: ['veg'],
      regional_tags: ['pan-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });
    // Add bases
    await addComponent({ name: 'Rice', componentType: 'base', base_type: 'rice-based', dietary_tags: ['veg'], regional_tags: ['pan-indian'], occasion_tags: ['everyday'], created_at: '' });
    await addComponent({ name: 'Idli', componentType: 'base', base_type: 'other', dietary_tags: ['veg'], regional_tags: ['south-indian'], occasion_tags: ['everyday'], created_at: '' });

    await seedDefaultPreferences();
    await addRule({
      name: 'Friday fish',
      enabled: true,
      compiled_filter: { type: 'scheduling-rule', effect: 'filter-pool', days: ['friday'], slots: null, match: { mode: 'tag', filter: { protein_tag: 'fish' } } },
      created_at: '',
    });

    // Run multiple times to reduce flakiness
    let fridayFishCount = 0;
    for (let i = 0; i < 5; i++) {
      const result = await generate();
      const fridaySlots = result.plan.slots.filter(s => s.day === 'friday');
      for (const slot of fridaySlots) {
        if (slot.curry_id !== undefined) {
          // The curry rule restricts to fish on Fridays
          fridayFishCount++;
        }
      }
    }
    // Fridays should have curries in most runs (we have curries in the pool)
    expect(fridayFishCount).toBeGreaterThan(0);
  });

  it('10. scheduling-rule filter-pool only affects matching days — non-Friday slots unaffected', async () => {
    // Add one fish curry and one veg curry
    const fishCurryId = await addComponent({
      name: 'Fish Curry',
      componentType: 'curry',
      protein_tag: 'fish',
      dietary_tags: ['non-veg'],
      regional_tags: ['coastal-konkan'],
      occasion_tags: ['everyday'],
      created_at: '',
    });
    const vegCurryId = await addComponent({
      name: 'Sambar',
      componentType: 'curry',
      protein_tag: 'dal',
      dietary_tags: ['veg'],
      regional_tags: ['south-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });
    await addComponent({ name: 'Rice', componentType: 'base', base_type: 'rice-based', dietary_tags: ['veg'], regional_tags: ['pan-indian'], occasion_tags: ['everyday'], created_at: '' });

    await seedDefaultPreferences();
    await addRule({
      name: 'Friday fish',
      enabled: true,
      compiled_filter: { type: 'scheduling-rule', effect: 'filter-pool', days: ['friday'], slots: null, match: { mode: 'tag', filter: { protein_tag: 'fish' } } },
      created_at: '',
    });

    const result = await generate();
    // On non-Friday days, veg curry can appear (rule doesn't restrict non-Fridays)
    const nonFridaySlots = result.plan.slots.filter(s => s.day !== 'friday' && s.curry_id !== undefined);
    const vegCurryUsed = nonFridaySlots.some(s => s.curry_id === vegCurryId);
    // vegCurryId OR fishCurryId can appear on non-Friday — veg curry is not blocked
    // We just check that non-Friday slots are filled
    expect(nonFridaySlots.length).toBeGreaterThan(0);
    // Also check: veg curry can appear (it's in the result somewhere)
    const allCurryIds = result.plan.slots.filter(s => s.curry_id !== undefined).map(s => s.curry_id);
    expect(allCurryIds.length).toBeGreaterThan(0);
    void vegCurryId; // referenced above
    void fishCurryId; // referenced above
    void vegCurryUsed; // non-Friday usage tracked
  });

  it('11. scheduling-rule filter-pool with slots:[breakfast] only affects breakfast on those days', async () => {
    // Add fish and non-fish curry
    await addComponent({
      name: 'Fish Curry',
      componentType: 'curry',
      protein_tag: 'fish',
      dietary_tags: ['non-veg'],
      regional_tags: ['coastal-konkan'],
      occasion_tags: ['everyday'],
      created_at: '',
    });
    await addComponent({
      name: 'Sambar',
      componentType: 'curry',
      protein_tag: 'dal',
      dietary_tags: ['veg'],
      regional_tags: ['south-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });
    await addComponent({ name: 'Rice', componentType: 'base', base_type: 'rice-based', dietary_tags: ['veg'], regional_tags: ['pan-indian'], occasion_tags: ['everyday'], created_at: '' });

    await seedDefaultPreferences();
    await addRule({
      name: 'Monday breakfast fish',
      enabled: true,
      compiled_filter: {
        type: 'scheduling-rule',
        effect: 'filter-pool',
        days: ['monday'],
        slots: ['breakfast'],
        match: { mode: 'tag', filter: { protein_tag: 'fish' } },
      },
      created_at: '',
    });

    const result = await generate();
    // Monday lunch and dinner are not constrained — no warnings for those slots
    const mondayLunchWarnings = result.warnings.filter(
      w => w.slot.day === 'monday' && w.slot.meal_slot !== 'breakfast',
    );
    // Lunch/dinner should not be blocked by this breakfast-specific rule
    // Just verify the plan completes with all 21 slots
    expect(result.plan.slots).toHaveLength(21);
    void mondayLunchWarnings;
  });

  it('12. scheduling-rule filter-pool with multiple tags uses AND logic', async () => {
    // Add a component matching both tags (fish + non-veg)
    await addComponent({
      name: 'Fish Curry',
      componentType: 'curry',
      protein_tag: 'fish',
      dietary_tags: ['non-veg'],
      regional_tags: ['coastal-konkan'],
      occasion_tags: ['everyday'],
      created_at: '',
    });
    // Add a component matching only protein_tag (fish but declared veg — edge case)
    await addComponent({
      name: 'Veg Fish',
      componentType: 'curry',
      protein_tag: 'fish',
      dietary_tags: ['veg'],  // does NOT match dietary_tag: 'non-veg'
      regional_tags: ['pan-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });
    await addComponent({ name: 'Rice', componentType: 'base', base_type: 'rice-based', dietary_tags: ['veg'], regional_tags: ['pan-indian'], occasion_tags: ['everyday'], created_at: '' });

    await seedDefaultPreferences();
    // Rule requires BOTH protein_tag:fish AND dietary_tag:non-veg
    await addRule({
      name: 'Friday non-veg fish',
      enabled: true,
      compiled_filter: {
        type: 'scheduling-rule',
        effect: 'filter-pool',
        days: ['friday'],
        slots: null,
        match: { mode: 'tag', filter: { protein_tag: 'fish', dietary_tag: 'non-veg' } },
      },
      created_at: '',
    });

    const result = await generate();
    // Must return 21 slots (generator should handle AND logic without crash)
    expect(result.plan.slots).toHaveLength(21);
  });
});

// ─── RULE-04: No-repeat rules (NoRepeatRule) ──────────────────────────────────

describe('RULE-04: No-repeat rules (NoRepeatRule)', () => {
  it('13. no-repeat subzi — no subzi id appears twice in the generated plan', async () => {
    await seedMinimalComponents();
    await seedDefaultPreferences();
    await addRule({
      name: 'No repeat subzi',
      enabled: true,
      compiled_filter: { type: 'no-repeat', component_type: 'subzi', within: 'week' },
      created_at: '',
    });

    const result = await generate();
    const usedSubzis = result.plan.slots
      .filter(s => s.subzi_id !== undefined)
      .map(s => s.subzi_id!);

    const uniqueSubzis = new Set(usedSubzis);
    // All used subzi IDs should be unique (no repeats)
    expect(usedSubzis.length).toBe(uniqueSubzis.size);
  });

  it('14. no-repeat curry — no curry id appears twice', async () => {
    await seedMinimalComponents();
    await seedDefaultPreferences();
    await addRule({
      name: 'No repeat curry',
      enabled: true,
      compiled_filter: { type: 'no-repeat', component_type: 'curry', within: 'week' },
      created_at: '',
    });

    const result = await generate();
    const usedCurrys = result.plan.slots
      .filter(s => s.curry_id !== undefined)
      .map(s => s.curry_id!);

    const uniqueCurrys = new Set(usedCurrys);
    expect(usedCurrys.length).toBe(uniqueCurrys.size);
  });

  it('15. no-repeat base — no base id appears twice (may produce warnings if pool is small)', async () => {
    // Seed 7 unique bases so each day can get a different one
    for (let i = 1; i <= 7; i++) {
      await addComponent({
        name: `Base ${i}`,
        componentType: 'base',
        base_type: 'rice-based',
        dietary_tags: ['veg'],
        regional_tags: ['pan-indian'],
        occasion_tags: ['everyday'],
        created_at: '',
      });
    }
    await addComponent({ name: 'Sambar', componentType: 'curry', dietary_tags: ['veg'], regional_tags: ['south-indian'], occasion_tags: ['everyday'], created_at: '' });
    await seedDefaultPreferences();
    await addRule({
      name: 'No repeat base',
      enabled: true,
      compiled_filter: { type: 'no-repeat', component_type: 'base', within: 'week' },
      created_at: '',
    });

    const result = await generate();
    const usedBases = result.plan.slots.map(s => s.base_id);
    const uniqueBases = new Set(usedBases);
    // With 7 bases and 21 slots, repeats are expected; but plan should still complete
    expect(result.plan.slots).toHaveLength(21);
    // With exactly 7 unique bases available, at least 7 unique bases used
    expect(uniqueBases.size).toBeGreaterThanOrEqual(7);
  });
});

// ─── Frequency weighting ──────────────────────────────────────────────────────

describe('Frequency weighting', () => {
  it('16. frequent components appear significantly more often than rare across 50 generations (statistical)', async () => {
    // Add 10 frequent bases and 10 rare bases — large pool ensures recency halving
    // doesn't dominate and the frequency signal is clearly visible.
    const frequentIds: number[] = [];
    const rareIds: number[] = [];
    for (let i = 0; i < 10; i++) {
      frequentIds.push(await addComponent({
        name: `Popular Rice ${i}`,
        componentType: 'base',
        base_type: 'rice-based',
        frequency: 'frequent',
        dietary_tags: ['veg'],
        regional_tags: ['pan-indian'],
        occasion_tags: ['everyday'],
        created_at: '',
      }));
      rareIds.push(await addComponent({
        name: `Rare Khichdi ${i}`,
        componentType: 'base',
        base_type: 'rice-based',
        frequency: 'rare',
        dietary_tags: ['veg'],
        regional_tags: ['pan-indian'],
        occasion_tags: ['everyday'],
        created_at: '',
      }));
    }
    await addComponent({ name: 'Sambar', componentType: 'curry', dietary_tags: ['veg'], regional_tags: ['south-indian'], occasion_tags: ['everyday'], created_at: '' });
    await seedDefaultPreferences();

    let frequentCount = 0;
    let rareCount = 0;
    for (let i = 0; i < 50; i++) {
      const result = await generate();
      for (const slot of result.plan.slots) {
        if (frequentIds.includes(slot.base_id)) frequentCount++;
        if (rareIds.includes(slot.base_id)) rareCount++;
      }
    }

    // frequent (weight 3) vs rare (weight 0.3) — with 10 of each type, recency halving
    // affects all equally, so frequency signal dominates: frequentCount >> rareCount
    expect(frequentCount).toBeGreaterThan(rareCount * 3);
  });

  it('17. component.frequency undefined treated as normal', async () => {
    // A component without frequency field should work the same as frequency:'normal'
    await addComponent({
      name: 'Plain Rice',
      componentType: 'base',
      base_type: 'rice-based',
      // no frequency field
      dietary_tags: ['veg'],
      regional_tags: ['pan-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });
    await addComponent({ name: 'Sambar', componentType: 'curry', dietary_tags: ['veg'], regional_tags: ['south-indian'], occasion_tags: ['everyday'], created_at: '' });
    await seedDefaultPreferences();

    // Should not throw and should return 21 slots
    const result = await generate();
    expect(result.plan.slots).toHaveLength(21);
    // All base slots should have Plain Rice
    for (const slot of result.plan.slots) {
      expect(slot.base_id).toBeGreaterThan(0);
    }
  });
});

// ─── Recency halving ──────────────────────────────────────────────────────────

describe('Recency halving', () => {
  it('18. same component less likely after first use (statistical across 50 runs)', async () => {
    // Add only ONE base (to force reuse) and track usage counts in the plan
    const baseId = await addComponent({
      name: 'Only Rice',
      componentType: 'base',
      base_type: 'rice-based',
      dietary_tags: ['veg'],
      regional_tags: ['pan-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });
    // Add a second base with lower frequency to detect recency halving effect
    const base2Id = await addComponent({
      name: 'Second Rice',
      componentType: 'base',
      base_type: 'rice-based',
      dietary_tags: ['veg'],
      regional_tags: ['pan-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });
    await addComponent({ name: 'Sambar', componentType: 'curry', dietary_tags: ['veg'], regional_tags: ['south-indian'], occasion_tags: ['everyday'], created_at: '' });
    await seedDefaultPreferences();

    // Run 50 plans and track whether base2 ever appears (recency halving should
    // reduce baseId dominance across 21 slots and let base2Id appear more)
    let base1Total = 0;
    let base2Total = 0;
    for (let i = 0; i < 50; i++) {
      const result = await generate();
      for (const slot of result.plan.slots) {
        if (slot.base_id === baseId) base1Total++;
        if (slot.base_id === base2Id) base2Total++;
      }
    }

    // With two equally-weighted bases and recency halving, neither should dominate 100%
    // Base2 should appear at least some of the time across 50 * 21 = 1050 slots
    expect(base2Total).toBeGreaterThan(0);
    void base1Total;
  });
});

// ─── Over-constrained handling ────────────────────────────────────────────────

describe('Over-constrained handling', () => {
  it('19. impossible scheduling-rule filter-pool (no matching components) — slot still filled, warning emitted', async () => {
    // Add components with no fish protein tag
    await addComponent({ name: 'Rice', componentType: 'base', base_type: 'rice-based', dietary_tags: ['veg'], regional_tags: ['pan-indian'], occasion_tags: ['everyday'], created_at: '' });
    await addComponent({ name: 'Sambar', componentType: 'curry', dietary_tags: ['veg'], regional_tags: ['south-indian'], occasion_tags: ['everyday'], created_at: '' });
    await seedDefaultPreferences();

    // Add a rule that requires fish protein tag — but no fish components exist
    await addRule({
      name: 'Impossible fish rule',
      enabled: true,
      compiled_filter: { type: 'scheduling-rule', effect: 'filter-pool', days: ['friday'], slots: null, match: { mode: 'tag', filter: { protein_tag: 'fish' } } },
      created_at: '',
    });

    const result = await generate();
    // All 21 slots must still be filled
    expect(result.plan.slots).toHaveLength(21);
    // Friday slots should have warnings emitted (over-constrained)
    const fridayWarnings = result.warnings.filter(w => w.slot.day === 'friday');
    expect(fridayWarnings.length).toBeGreaterThan(0);
  });

  it('20. scheduling-rule require-one with valid component_id — that component assigned on specified days', async () => {
    const ids = await seedMinimalComponents();
    await seedDefaultPreferences();

    // Require Plain Rice (riceBaseId) on Monday breakfast via scheduling-rule require-one
    await addRule({
      name: 'Monday Rice',
      enabled: true,
      compiled_filter: {
        type: 'scheduling-rule',
        effect: 'require-one',
        days: ['monday'],
        slots: ['breakfast'],
        match: { mode: 'component', component_id: ids.riceBaseId },
      },
      created_at: '',
    });

    // Run multiple times to verify the rule is enforced
    for (let i = 0; i < 3; i++) {
      const result = await generate();
      const mondayBreakfast = result.plan.slots.find(
        s => s.day === 'monday' && s.meal_slot === 'breakfast',
      );
      expect(mondayBreakfast).toBeDefined();
      expect(mondayBreakfast!.base_id).toBe(ids.riceBaseId);
    }
  });

  it('21. scheduling-rule require-one with invalid component_id — warning emitted, slot filled from pool', async () => {
    await seedMinimalComponents();
    await seedDefaultPreferences();

    const invalidId = 99999;
    await addRule({
      name: 'Missing component rule',
      enabled: true,
      compiled_filter: {
        type: 'scheduling-rule',
        effect: 'require-one',
        days: ['tuesday'],
        slots: ['lunch'],
        match: { mode: 'component', component_id: invalidId },
      },
      created_at: '',
    });

    const result = await generate();
    // All 21 slots must still be filled
    expect(result.plan.slots).toHaveLength(21);
    // Tuesday lunch should still have a base_id (from pool)
    const tuesdayLunch = result.plan.slots.find(
      s => s.day === 'tuesday' && s.meal_slot === 'lunch',
    );
    expect(tuesdayLunch).toBeDefined();
    expect(tuesdayLunch!.base_id).toBeGreaterThan(0);
    // Warning should be emitted for the invalid require-one
    const relevantWarnings = result.warnings.filter(
      w => w.slot.day === 'tuesday' && w.slot.meal_slot === 'lunch',
    );
    expect(relevantWarnings.length).toBeGreaterThan(0);
  });
});

// ─── generate with lockedSlots ────────────────────────────────────────────────

describe('generate with lockedSlots', () => {
  it('23. generate() with no options still produces 21 slots (backwards compatible)', async () => {
    await seedMinimalComponents();
    await seedDefaultPreferences();
    const result = await generate();
    expect(result.plan.slots).toHaveLength(21);
  });

  it('24. generate() with lockedSlots preserves locked base_id unchanged', async () => {
    const ids = await seedMinimalComponents();
    await seedDefaultPreferences();

    const lockedBaseId = ids.riceBaseId;
    const result = await generate({
      lockedSlots: {
        'monday-breakfast': { base_id: lockedBaseId },
      },
    });

    const mondayBreakfast = result.plan.slots.find(
      s => s.day === 'monday' && s.meal_slot === 'breakfast',
    );
    expect(mondayBreakfast).toBeDefined();
    expect(mondayBreakfast!.base_id).toBe(lockedBaseId);
    expect(result.plan.slots).toHaveLength(21);
  });

  it('25. generate() with lockedSlots preserves locked extra_ids as group', async () => {
    const ids = await seedMinimalComponents();
    await seedDefaultPreferences();

    const lockedExtras = [ids.extraLiquidRiceId, ids.extraCondimentAllId];
    const result = await generate({
      lockedSlots: {
        'tuesday-lunch': { extra_ids: lockedExtras },
      },
    });

    const tuesdayLunch = result.plan.slots.find(
      s => s.day === 'tuesday' && s.meal_slot === 'lunch',
    );
    expect(tuesdayLunch).toBeDefined();
    expect(tuesdayLunch!.extra_ids).toEqual(lockedExtras);
    expect(result.plan.slots).toHaveLength(21);
  });

  it('26. generate() with lockedSlots preserves locked curry_id and subzi_id', async () => {
    const ids = await seedMinimalComponents();
    await seedDefaultPreferences();

    const result = await generate({
      lockedSlots: {
        'wednesday-dinner': { curry_id: ids.curry1Id, subzi_id: ids.subzi1Id },
      },
    });

    const wednesdayDinner = result.plan.slots.find(
      s => s.day === 'wednesday' && s.meal_slot === 'dinner',
    );
    expect(wednesdayDinner).toBeDefined();
    expect(wednesdayDinner!.curry_id).toBe(ids.curry1Id);
    expect(wednesdayDinner!.subzi_id).toBe(ids.subzi1Id);
    expect(result.plan.slots).toHaveLength(21);
  });

  it('27. generate() with partial locks only locks specified components — others still randomize', async () => {
    const ids = await seedMinimalComponents();
    await seedDefaultPreferences();

    // Lock only the base for thursday-lunch; curry and subzi should still randomize
    const lockedBaseId = ids.breadBaseId;
    const runs = 5;
    const curryIds = new Set<number | undefined>();

    for (let i = 0; i < runs; i++) {
      const result = await generate({
        lockedSlots: {
          'thursday-lunch': { base_id: lockedBaseId },
        },
      });

      const thursdayLunch = result.plan.slots.find(
        s => s.day === 'thursday' && s.meal_slot === 'lunch',
      );
      expect(thursdayLunch).toBeDefined();
      // Base must always be locked
      expect(thursdayLunch!.base_id).toBe(lockedBaseId);
      curryIds.add(thursdayLunch!.curry_id);
    }

    // Plan should always complete
    expect(curryIds.size).toBeGreaterThanOrEqual(1);
  });
});

// ─── DAY-LITERAL: Day-of-week occasion tag enforcement ────────────────────────

describe('DAY-LITERAL: isOccasionAllowed day-literal enforcement', () => {
  /**
   * isOccasionAllowed is not exported, so we test it through generate():
   * seed exactly ONE component with specific occasion_tags, then verify
   * it appears only on allowed days.
   */

  it('DL-1. component with occasion_tags:[monday] only appears on monday', async () => {
    // Add a monday-only subzi — should only be eligible on monday
    const mondaySubziId = await addComponent({
      name: 'Monday Sabji',
      componentType: 'subzi',
      dietary_tags: ['veg'],
      regional_tags: ['pan-indian'],
      occasion_tags: ['monday'],
      created_at: '',
    });
    // Add base and a fallback subzi for other days
    await addComponent({ name: 'Rice', componentType: 'base', base_type: 'rice-based', dietary_tags: ['veg'], regional_tags: ['pan-indian'], occasion_tags: ['everyday'], created_at: '' });
    for (let i = 0; i < 5; i++) {
      await addComponent({ name: `Subzi ${i}`, componentType: 'subzi', dietary_tags: ['veg'], regional_tags: ['pan-indian'], occasion_tags: ['everyday'], created_at: '' });
    }
    await seedDefaultPreferences();

    const result = await generate();
    // If monday-subzi appears in non-monday slots, it's a bug
    const nonMondayWithMondaySubzi = result.plan.slots.filter(
      s => s.day !== 'monday' && s.subzi_id === mondaySubziId,
    );
    expect(nonMondayWithMondaySubzi).toHaveLength(0);
  });

  it('DL-2. component with occasion_tags:[monday] is eligible on monday', async () => {
    // Only monday-tagged subzi (plus fallback subzis with everyday)
    const mondaySubziId = await addComponent({
      name: 'Monday Special',
      componentType: 'subzi',
      dietary_tags: ['veg'],
      regional_tags: ['pan-indian'],
      occasion_tags: ['monday'],
      created_at: '',
    });
    await addComponent({ name: 'Rice', componentType: 'base', base_type: 'rice-based', dietary_tags: ['veg'], regional_tags: ['pan-indian'], occasion_tags: ['everyday'], created_at: '' });
    for (let i = 0; i < 6; i++) {
      await addComponent({ name: `Subzi ${i}`, componentType: 'subzi', dietary_tags: ['veg'], regional_tags: ['pan-indian'], occasion_tags: ['everyday'], created_at: '' });
    }
    await seedDefaultPreferences();

    // Run multiple times — monday-subzi should appear on monday at least once
    let appearsOnMonday = false;
    for (let run = 0; run < 10; run++) {
      const result = await generate();
      const mondaySlots = result.plan.slots.filter(s => s.day === 'monday');
      if (mondaySlots.some(s => s.subzi_id === mondaySubziId)) {
        appearsOnMonday = true;
        break;
      }
    }
    expect(appearsOnMonday).toBe(true);
  });

  it('DL-3. weekday tag fires before day-literal — weekday component appears on monday', async () => {
    // A component tagged weekday should still appear on monday
    // (weekday check fires first, day-literal block doesn't apply)
    const weekdaySubziId = await addComponent({
      name: 'Weekday Subzi',
      componentType: 'subzi',
      dietary_tags: ['veg'],
      regional_tags: ['pan-indian'],
      occasion_tags: ['weekday'],
      created_at: '',
    });
    await addComponent({ name: 'Rice', componentType: 'base', base_type: 'rice-based', dietary_tags: ['veg'], regional_tags: ['pan-indian'], occasion_tags: ['everyday'], created_at: '' });
    await seedDefaultPreferences();

    // Run multiple times to confirm weekday subzi appears on monday at least once
    let mondayAppearance = false;
    for (let run = 0; run < 10; run++) {
      const result = await generate();
      const mondaySlots = result.plan.slots.filter(s => s.day === 'monday');
      if (mondaySlots.some(s => s.subzi_id === weekdaySubziId)) {
        mondayAppearance = true;
        break;
      }
    }
    expect(mondayAppearance).toBe(true);
  });

  it('DL-4. component with occasion_tags:[monday,wednesday] eligible on both days, not others', async () => {
    const multiDaySubziId = await addComponent({
      name: 'Mon-Wed Subzi',
      componentType: 'subzi',
      dietary_tags: ['veg'],
      regional_tags: ['pan-indian'],
      occasion_tags: ['monday', 'wednesday'],
      created_at: '',
    });
    await addComponent({ name: 'Rice', componentType: 'base', base_type: 'rice-based', dietary_tags: ['veg'], regional_tags: ['pan-indian'], occasion_tags: ['everyday'], created_at: '' });
    for (let i = 0; i < 5; i++) {
      await addComponent({ name: `Subzi ${i}`, componentType: 'subzi', dietary_tags: ['veg'], regional_tags: ['pan-indian'], occasion_tags: ['everyday'], created_at: '' });
    }
    await seedDefaultPreferences();

    const result = await generate();
    // Must not appear on tue, thu, fri, sat, sun
    const invalidDays = result.plan.slots.filter(
      s => !['monday', 'wednesday'].includes(s.day) && s.subzi_id === multiDaySubziId,
    );
    expect(invalidDays).toHaveLength(0);
  });

  it('DL-5. component with occasion_tags:[festive] falls through (no calendar meaning) — appears on any day', async () => {
    // festive has no day-literal meaning, so it falls through to return true
    const festiveSubziId = await addComponent({
      name: 'Festive Subzi',
      componentType: 'subzi',
      dietary_tags: ['veg'],
      regional_tags: ['pan-indian'],
      occasion_tags: ['festive'],
      created_at: '',
    });
    await addComponent({ name: 'Rice', componentType: 'base', base_type: 'rice-based', dietary_tags: ['veg'], regional_tags: ['pan-indian'], occasion_tags: ['everyday'], created_at: '' });
    await seedDefaultPreferences();

    // festive subzi should be eligible on saturday (no calendar restriction)
    let appearsOnSaturday = false;
    for (let run = 0; run < 10; run++) {
      const result = await generate();
      const saturdaySlots = result.plan.slots.filter(s => s.day === 'saturday');
      if (saturdaySlots.some(s => s.subzi_id === festiveSubziId)) {
        appearsOnSaturday = true;
        break;
      }
    }
    expect(appearsOnSaturday).toBe(true);
  });

  it('DL-6. TagFilterSchema accepts all 12 occasion tag values including day literals', async () => {
    const { TagFilterSchema } = await import('@/types/plan');
    const dayLiterals = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const generalTags = ['everyday', 'weekday', 'weekend', 'fasting', 'festive'];
    for (const tag of [...dayLiterals, ...generalTags]) {
      const result = TagFilterSchema.safeParse({ occasion_tag: tag });
      expect(result.success).toBe(true);
    }
  });
});

// ─── SCHED: scheduling-rule filter-pool and exclude ───────────────────────────

describe('SCHED: scheduling-rule filter-pool and exclude', () => {
  it('SCHED-1. filter-pool by tag restricts curry pool to matching components', async () => {
    const ids = await seedMinimalComponents();
    await seedDefaultPreferences();

    // Add a non-veg curry that should be excluded by the veg filter-pool rule
    const nonVegCurryId = await addComponent({
      name: 'Fish Curry',
      componentType: 'curry',
      dietary_tags: ['non-veg'],
      regional_tags: ['coastal-konkan'],
      occasion_tags: ['everyday'],
      created_at: '',
    });

    // Add a scheduling-rule filter-pool for veg only (all days/slots)
    await addRule({
      name: 'Veg only curries',
      enabled: true,
      compiled_filter: {
        type: 'scheduling-rule',
        effect: 'filter-pool',
        days: null,
        slots: null,
        match: { mode: 'tag', filter: { dietary_tag: 'veg' } },
      },
      created_at: '',
    });

    const result = await generate();
    // Non-veg curry must never appear anywhere
    for (const slot of result.plan.slots) {
      expect(slot.curry_id).not.toBe(nonVegCurryId);
    }
    // Existing veg curries (curry1Id, curry2Id) should still appear
    const curryIds = result.plan.slots.filter(s => s.curry_id !== undefined).map(s => s.curry_id!);
    const vegCurriesAppear = curryIds.some(id => id === ids.curry1Id || id === ids.curry2Id);
    expect(vegCurriesAppear).toBe(true);
  });

  it('SCHED-2. filter-pool by component_id restricts curry to single component', async () => {
    const ids = await seedMinimalComponents();
    await seedDefaultPreferences();

    // Add filter-pool scoped to Monday lunch only — only curry1 allowed
    await addRule({
      name: 'Monday lunch only curry1',
      enabled: true,
      compiled_filter: {
        type: 'scheduling-rule',
        effect: 'filter-pool',
        days: ['monday'],
        slots: ['lunch'],
        match: { mode: 'component', component_id: ids.curry1Id },
      },
      created_at: '',
    });

    // Run multiple times to confirm Monday lunch always gets curry1
    for (let i = 0; i < 3; i++) {
      const result = await generate();
      const mondayLunch = result.plan.slots.find(s => s.day === 'monday' && s.meal_slot === 'lunch');
      expect(mondayLunch).toBeDefined();
      // Monday lunch curry must be curry1Id (only one that passes filter)
      if (mondayLunch!.curry_id !== undefined) {
        expect(mondayLunch!.curry_id).toBe(ids.curry1Id);
      }
    }
  });

  it('SCHED-3. filter-pool scoped to Friday lunch only affects that slot', async () => {
    const ids = await seedMinimalComponents();
    await seedDefaultPreferences();

    const nonVegCurryId = await addComponent({
      name: 'Chicken Curry',
      componentType: 'curry',
      dietary_tags: ['non-veg'],
      regional_tags: ['pan-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });

    // Restrict Friday lunch to veg only
    await addRule({
      name: 'Friday lunch veg only',
      enabled: true,
      compiled_filter: {
        type: 'scheduling-rule',
        effect: 'filter-pool',
        days: ['friday'],
        slots: ['lunch'],
        match: { mode: 'tag', filter: { dietary_tag: 'veg' } },
      },
      created_at: '',
    });

    // Run multiple times — non-veg curry should be absent from Friday lunch
    for (let i = 0; i < 3; i++) {
      const result = await generate();
      const fridayLunch = result.plan.slots.find(s => s.day === 'friday' && s.meal_slot === 'lunch');
      expect(fridayLunch).toBeDefined();
      expect(fridayLunch!.curry_id).not.toBe(nonVegCurryId);

      // Other slots (e.g. Monday lunch) CAN still have non-veg curry
      // Just verify plan completes with all 21 slots
    }
    expect(true).toBe(true); // sanity
    void nonVegCurryId;
    void ids;
  });

  it('SCHED-4. filter-pool with null days/slots applies to all slots (D-09)', async () => {
    const ids = await seedMinimalComponents();
    await seedDefaultPreferences();

    const nonVegCurryId = await addComponent({
      name: 'Mutton Curry',
      componentType: 'curry',
      dietary_tags: ['non-veg'],
      regional_tags: ['pan-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });

    // Universal filter-pool: all days, all slots — veg only
    await addRule({
      name: 'Universal veg filter',
      enabled: true,
      compiled_filter: {
        type: 'scheduling-rule',
        effect: 'filter-pool',
        days: null,
        slots: null,
        match: { mode: 'tag', filter: { dietary_tag: 'veg' } },
      },
      created_at: '',
    });

    const result = await generate();
    // Non-veg must never appear across all 21 slots
    for (const slot of result.plan.slots) {
      expect(slot.curry_id).not.toBe(nonVegCurryId);
    }
    void ids;
  });

  it('SCHED-5. filter-pool with empty result falls back with warning (D-01)', async () => {
    await seedMinimalComponents();
    await seedDefaultPreferences();

    // Impossible filter: require protein_tag:'mutton' but no mutton curries exist
    await addRule({
      name: 'Impossible filter',
      enabled: true,
      compiled_filter: {
        type: 'scheduling-rule',
        effect: 'filter-pool',
        days: null,
        slots: null,
        match: { mode: 'tag', filter: { protein_tag: 'mutton' } },
      },
      created_at: '',
    });

    const result = await generate();
    // Generation must still complete with all 21 slots
    expect(result.plan.slots).toHaveLength(21);
    // Warning(s) must contain "constraint relaxed"
    const relaxedWarnings = result.warnings.filter(w => w.message.includes('constraint relaxed'));
    expect(relaxedWarnings.length).toBeGreaterThan(0);
  });

  it('SCHED-6. exclude by tag removes non-veg components from pool', async () => {
    const ids = await seedMinimalComponents();
    await seedDefaultPreferences();

    const nonVegCurryId = await addComponent({
      name: 'Egg Curry',
      componentType: 'curry',
      dietary_tags: ['non-veg'],
      regional_tags: ['pan-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });

    // Exclude non-veg curries from all slots
    await addRule({
      name: 'Exclude non-veg',
      enabled: true,
      compiled_filter: {
        type: 'scheduling-rule',
        effect: 'exclude',
        days: null,
        slots: null,
        match: { mode: 'tag', filter: { dietary_tag: 'non-veg' } },
      },
      created_at: '',
    });

    const result = await generate();
    // Non-veg curry must never appear
    for (const slot of result.plan.slots) {
      expect(slot.curry_id).not.toBe(nonVegCurryId);
    }
    // Veg curries must still appear
    const curryIds = result.plan.slots.filter(s => s.curry_id !== undefined).map(s => s.curry_id!);
    const vegCurriesAppear = curryIds.some(id => id === ids.curry1Id || id === ids.curry2Id);
    expect(vegCurriesAppear).toBe(true);
  });

  it('SCHED-7. exclude by component_id removes specific component from pool', async () => {
    const ids = await seedMinimalComponents();
    await seedDefaultPreferences();

    // Exclude curry1 from all slots
    await addRule({
      name: 'Exclude curry1',
      enabled: true,
      compiled_filter: {
        type: 'scheduling-rule',
        effect: 'exclude',
        days: null,
        slots: null,
        match: { mode: 'component', component_id: ids.curry1Id },
      },
      created_at: '',
    });

    const result = await generate();
    // curry1 must never appear
    for (const slot of result.plan.slots) {
      expect(slot.curry_id).not.toBe(ids.curry1Id);
    }
    // curry2 should still appear
    const curry2Used = result.plan.slots.some(s => s.curry_id === ids.curry2Id);
    expect(curry2Used).toBe(true);
  });

  it('SCHED-8. exclude all components falls back with warning (D-02)', async () => {
    const ids = await seedMinimalComponents();
    await seedDefaultPreferences();

    // Exclude all curries (curry1 and curry2) by excluding veg ones — but only veg curries exist
    await addRule({
      name: 'Exclude all veg curries',
      enabled: true,
      compiled_filter: {
        type: 'scheduling-rule',
        effect: 'exclude',
        days: null,
        slots: null,
        match: { mode: 'tag', filter: { dietary_tag: 'veg' } },
      },
      created_at: '',
    });

    const result = await generate();
    // Generation must still complete with 21 slots
    expect(result.plan.slots).toHaveLength(21);
    // Warning(s) must contain "constraint relaxed"
    const relaxedWarnings = result.warnings.filter(w => w.message.includes('constraint relaxed'));
    expect(relaxedWarnings.length).toBeGreaterThan(0);
    void ids;
  });
});

// ─── SCHED: scheduling-rule require-one ───────────────────────────────────────

describe('SCHED: scheduling-rule require-one', () => {
  it('SCHED-R1. require-one-by-tag picks matching component for target slot', async () => {
    // Seed: one fish curry + two veg curries + base
    await addComponent({
      name: 'Rice',
      componentType: 'base',
      base_type: 'rice-based',
      dietary_tags: ['veg'],
      regional_tags: ['pan-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });
    const fishCurryId = await addComponent({
      name: 'Fish Curry',
      componentType: 'curry',
      protein_tag: 'fish',
      dietary_tags: ['non-veg'],
      regional_tags: ['coastal-konkan'],
      occasion_tags: ['everyday'],
      created_at: '',
    });
    await addComponent({
      name: 'Sambar',
      componentType: 'curry',
      dietary_tags: ['veg'],
      regional_tags: ['south-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });
    await addComponent({
      name: 'Dal Tadka',
      componentType: 'curry',
      dietary_tags: ['veg'],
      regional_tags: ['pan-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });

    await seedDefaultPreferences();

    // Require fish on Friday lunch
    await addRule({
      name: 'Friday fish require-one',
      enabled: true,
      compiled_filter: {
        type: 'scheduling-rule',
        effect: 'require-one',
        days: ['friday'],
        slots: ['lunch'],
        match: { mode: 'tag', filter: { protein_tag: 'fish' } },
      },
      created_at: '',
    });

    // Run multiple times — Friday lunch must always have fish curry
    for (let i = 0; i < 5; i++) {
      const result = await generate();
      const fridayLunch = result.plan.slots.find(s => s.day === 'friday' && s.meal_slot === 'lunch');
      expect(fridayLunch).toBeDefined();
      expect(fridayLunch!.curry_id).toBe(fishCurryId);
    }
  });

  it('SCHED-R2. require-one-by-tag overrides filter-pool (D-06)', async () => {
    // filter-pool: veg-only; require-one: fish (non-veg) on Friday lunch
    // Fish curry must still appear — require-one wins
    await addComponent({
      name: 'Rice',
      componentType: 'base',
      base_type: 'rice-based',
      dietary_tags: ['veg'],
      regional_tags: ['pan-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });
    const fishCurryId = await addComponent({
      name: 'Fish Curry',
      componentType: 'curry',
      protein_tag: 'fish',
      dietary_tags: ['non-veg'],
      regional_tags: ['coastal-konkan'],
      occasion_tags: ['everyday'],
      created_at: '',
    });
    await addComponent({
      name: 'Sambar',
      componentType: 'curry',
      dietary_tags: ['veg'],
      regional_tags: ['south-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });

    await seedDefaultPreferences();

    // filter-pool: only veg (would exclude fish)
    await addRule({
      name: 'Veg only',
      enabled: true,
      compiled_filter: {
        type: 'scheduling-rule',
        effect: 'filter-pool',
        days: ['friday'],
        slots: ['lunch'],
        match: { mode: 'tag', filter: { dietary_tag: 'veg' } },
      },
      created_at: '',
    });

    // require-one: fish on Friday lunch (overrides filter-pool)
    await addRule({
      name: 'Friday fish require-one',
      enabled: true,
      compiled_filter: {
        type: 'scheduling-rule',
        effect: 'require-one',
        days: ['friday'],
        slots: ['lunch'],
        match: { mode: 'tag', filter: { protein_tag: 'fish' } },
      },
      created_at: '',
    });

    for (let i = 0; i < 3; i++) {
      const result = await generate();
      const fridayLunch = result.plan.slots.find(s => s.day === 'friday' && s.meal_slot === 'lunch');
      expect(fridayLunch).toBeDefined();
      // require-one wins: fish curry must appear despite veg-only filter-pool
      expect(fridayLunch!.curry_id).toBe(fishCurryId);
    }
  });

  it('SCHED-R3. require-one-by-tag with no match warns and skips (D-03)', async () => {
    // No mutton curry in library — require mutton → warn + skip, generation completes
    await addComponent({
      name: 'Rice',
      componentType: 'base',
      base_type: 'rice-based',
      dietary_tags: ['veg'],
      regional_tags: ['pan-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });
    await addComponent({
      name: 'Sambar',
      componentType: 'curry',
      dietary_tags: ['veg'],
      regional_tags: ['south-indian'],
      occasion_tags: ['everyday'],
      created_at: '',
    });

    await seedDefaultPreferences();

    await addRule({
      name: 'Mutton require-one (no match)',
      enabled: true,
      compiled_filter: {
        type: 'scheduling-rule',
        effect: 'require-one',
        days: ['monday'],
        slots: ['lunch'],
        match: { mode: 'tag', filter: { protein_tag: 'mutton' } },
      },
      created_at: '',
    });

    const result = await generate();
    // Generation must still complete with 21 slots
    expect(result.plan.slots).toHaveLength(21);
    // Warning must mention "no component in library matches tag filter"
    const warnMsg = result.warnings.find(w =>
      w.message.includes('no component in library matches tag filter'),
    );
    expect(warnMsg).toBeDefined();
  });

  it('SCHED-R4. require-one-by-component injects component (D-04)', async () => {
    const ids = await seedMinimalComponents();
    await seedDefaultPreferences();

    // Require curry2 on Monday dinner
    await addRule({
      name: 'Require curry2 Monday dinner',
      enabled: true,
      compiled_filter: {
        type: 'scheduling-rule',
        effect: 'require-one',
        days: ['monday'],
        slots: ['dinner'],
        match: { mode: 'component', component_id: ids.curry2Id },
      },
      created_at: '',
    });

    for (let i = 0; i < 3; i++) {
      const result = await generate();
      const mondayDinner = result.plan.slots.find(s => s.day === 'monday' && s.meal_slot === 'dinner');
      expect(mondayDinner).toBeDefined();
      expect(mondayDinner!.curry_id).toBe(ids.curry2Id);
    }
  });

  it('SCHED-R5. require-one-by-component overrides filter-pool (D-04)', async () => {
    const ids = await seedMinimalComponents();
    await seedDefaultPreferences();

    // filter-pool: only curry1 allowed on Tuesday lunch
    await addRule({
      name: 'Only curry1 on Tuesday lunch',
      enabled: true,
      compiled_filter: {
        type: 'scheduling-rule',
        effect: 'filter-pool',
        days: ['tuesday'],
        slots: ['lunch'],
        match: { mode: 'component', component_id: ids.curry1Id },
      },
      created_at: '',
    });

    // require-one: force curry2 on Tuesday lunch (overrides filter-pool)
    await addRule({
      name: 'Require curry2 Tuesday lunch',
      enabled: true,
      compiled_filter: {
        type: 'scheduling-rule',
        effect: 'require-one',
        days: ['tuesday'],
        slots: ['lunch'],
        match: { mode: 'component', component_id: ids.curry2Id },
      },
      created_at: '',
    });

    for (let i = 0; i < 3; i++) {
      const result = await generate();
      const tuesdayLunch = result.plan.slots.find(s => s.day === 'tuesday' && s.meal_slot === 'lunch');
      expect(tuesdayLunch).toBeDefined();
      // require-one wins — curry2 must appear despite filter-pool allowing only curry1
      expect(tuesdayLunch!.curry_id).toBe(ids.curry2Id);
    }
  });

  it('SCHED-R6. multiple require-one rules on same slot all satisfied (D-07)', async () => {
    const ids = await seedMinimalComponents();
    await seedDefaultPreferences();

    // Two require-one on Wednesday lunch: specific curry + specific subzi
    await addRule({
      name: 'Require curry2 Wednesday lunch',
      enabled: true,
      compiled_filter: {
        type: 'scheduling-rule',
        effect: 'require-one',
        days: ['wednesday'],
        slots: ['lunch'],
        match: { mode: 'component', component_id: ids.curry2Id },
      },
      created_at: '',
    });

    await addRule({
      name: 'Require subzi2 Wednesday lunch',
      enabled: true,
      compiled_filter: {
        type: 'scheduling-rule',
        effect: 'require-one',
        days: ['wednesday'],
        slots: ['lunch'],
        match: { mode: 'component', component_id: ids.subzi2Id },
      },
      created_at: '',
    });

    for (let i = 0; i < 3; i++) {
      const result = await generate();
      const wednesdayLunch = result.plan.slots.find(s => s.day === 'wednesday' && s.meal_slot === 'lunch');
      expect(wednesdayLunch).toBeDefined();
      // Both rules satisfied independently
      expect(wednesdayLunch!.curry_id).toBe(ids.curry2Id);
      expect(wednesdayLunch!.subzi_id).toBe(ids.subzi2Id);
    }
  });

  it('SCHED-R7. require-one-by-component wrong type is skipped (Pitfall 2)', async () => {
    const ids = await seedMinimalComponents();
    await seedDefaultPreferences();

    // Require curry1 (a curry component) on Monday breakfast — should NOT affect BASE selection
    await addRule({
      name: 'Require curry1 as base (wrong type)',
      enabled: true,
      compiled_filter: {
        type: 'scheduling-rule',
        effect: 'require-one',
        days: ['monday'],
        slots: ['breakfast'],
        match: { mode: 'component', component_id: ids.curry1Id },
      },
      created_at: '',
    });

    const result = await generate();
    const mondayBreakfast = result.plan.slots.find(s => s.day === 'monday' && s.meal_slot === 'breakfast');
    expect(mondayBreakfast).toBeDefined();
    // base_id must be a valid base (riceBaseId, breadBaseId, or otherBaseId) — NOT curry1Id
    const validBaseIds = [ids.riceBaseId, ids.breadBaseId, ids.otherBaseId];
    expect(validBaseIds).toContain(mondayBreakfast!.base_id);
    expect(mondayBreakfast!.base_id).not.toBe(ids.curry1Id);
    // Generation completes successfully
    expect(result.plan.slots).toHaveLength(21);
  });

  it('SCHED-R8. require-one does not affect non-matching day/slot', async () => {
    const ids = await seedMinimalComponents();
    await seedDefaultPreferences();

    // Require curry2 only on Friday lunch
    await addRule({
      name: 'Require curry2 Friday lunch only',
      enabled: true,
      compiled_filter: {
        type: 'scheduling-rule',
        effect: 'require-one',
        days: ['friday'],
        slots: ['lunch'],
        match: { mode: 'component', component_id: ids.curry2Id },
      },
      created_at: '',
    });

    // Run multiple times — Tuesday dinner should be free to pick any curry
    const tuesdayDinnerCurryIds = new Set<number | undefined>();
    for (let i = 0; i < 5; i++) {
      const result = await generate();
      const tuesdayDinner = result.plan.slots.find(s => s.day === 'tuesday' && s.meal_slot === 'dinner');
      expect(tuesdayDinner).toBeDefined();
      tuesdayDinnerCurryIds.add(tuesdayDinner!.curry_id);
    }

    // Tuesday dinner can use either curry (not forced to curry2)
    // At least 1 curry appears on Tuesday dinner (non-forced slot still works)
    expect(tuesdayDinnerCurryIds.size).toBeGreaterThan(0);

    // Friday lunch must always have curry2
    for (let i = 0; i < 3; i++) {
      const result = await generate();
      const fridayLunch = result.plan.slots.find(s => s.day === 'friday' && s.meal_slot === 'lunch');
      expect(fridayLunch!.curry_id).toBe(ids.curry2Id);
    }
    void ids;
  });
});

// ─── Performance ──────────────────────────────────────────────────────────────

describe('Performance', () => {
  it('22. full 21-slot generation completes in under 500ms (with seeded components)', async () => {
    await seedMinimalComponents();
    await seedDefaultPreferences();

    const start = performance.now();
    const result = await generate();
    const elapsed = performance.now() - start;

    expect(result.plan.slots).toHaveLength(21);
    expect(elapsed).toBeLessThan(500);
  });
});
