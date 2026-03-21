import { getAllComponents, getPreferences, getEnabledRules } from '@/services/food-db';
import type { ComponentRecord, BaseType } from '@/types/component';
import type { UserPreferencesRecord, MealSlot } from '@/types/preferences';
import type { RuleRecord } from '@/db/client';
import {
  CompiledFilterSchema,
  ALL_DAYS,
  type DayOfWeek,
  type CompiledFilter,
  type TagFilter,
  type GeneratorResult,
  type PlanSlot,
  type Warning,
} from '@/types/plan';

// ─── GenerateOptions ──────────────────────────────────────────────────────────

export interface GenerateOptions {
  lockedSlots?: Partial<Record<`${DayOfWeek}-${MealSlot}`, {
    base_id?: number;
    curry_id?: number;
    subzi_id?: number;
    extra_ids?: number[];
  }>>;
}

// ─── Occasion-day enforcement ─────────────────────────────────────────────────

const WEEKEND_DAYS: DayOfWeek[] = ['saturday', 'sunday'];
const WEEKDAY_DAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const DAY_LITERALS: DayOfWeek[] = [
  'monday', 'tuesday', 'wednesday', 'thursday',
  'friday', 'saturday', 'sunday',
];

/**
 * Returns false if the component's occasion_tags restrict it to days that
 * don't include `day`. Enforces:
 *   - weekday-only (has 'weekday', lacks 'everyday') → monday–friday only
 *   - weekend-only (has 'weekend', lacks 'everyday') → saturday/sunday only
 * Tags like 'festive' and 'fasting' have no calendar mapping and are ignored.
 */
function isOccasionAllowed(component: ComponentRecord, day: DayOfWeek): boolean {
  const tags = component.occasion_tags ?? [];
  if (tags.length === 0) return true;
  if (tags.includes('everyday')) return true;
  if (tags.includes('weekday') && !tags.includes('everyday')) {
    return WEEKDAY_DAYS.includes(day);
  }
  if (tags.includes('weekend') && !tags.includes('everyday')) {
    return WEEKEND_DAYS.includes(day);
  }
  const dayLiteralsInTags = tags.filter(t => DAY_LITERALS.includes(t as DayOfWeek));
  if (dayLiteralsInTags.length > 0) {
    return dayLiteralsInTags.includes(day);
  }
  return true;
}

// ─── Weight constants ─────────────────────────────────────────────────────────

const FREQUENCY_WEIGHT: Record<string, number> = {
  frequent: 3,
  normal: 1,
  rare: 0.3,
};

// ─── Helper: effectiveWeight ──────────────────────────────────────────────────

function effectiveWeight(
  component: ComponentRecord,
  usageCount: Map<number, number>,
): number {
  const freq = component.frequency ?? 'normal';
  const freqWeight = FREQUENCY_WEIGHT[freq] ?? 1;
  const uses = usageCount.get(component.id!) ?? 0;
  return freqWeight * Math.pow(0.5, uses);
}

// ─── Helper: weightedRandom ───────────────────────────────────────────────────

function weightedRandom<T>(items: T[], getWeight: (item: T) => number): T {
  const totalWeight = items.reduce((sum, item) => sum + getWeight(item), 0);
  let rand = Math.random() * totalWeight;
  for (const item of items) {
    rand -= getWeight(item);
    if (rand <= 0) return item;
  }
  // Fallback (floating point edge case)
  return items[items.length - 1];
}

// ─── Helper: isRuleApplicable ─────────────────────────────────────────────────

function isRuleApplicable(
  rule: CompiledFilter,
  day: DayOfWeek,
  slot: MealSlot,
): boolean {
  if (rule.type === 'day-filter') {
    if (!rule.days.includes(day)) return false;
    if (rule.slots !== null && !rule.slots.includes(slot)) return false;
    return true;
  }
  if (rule.type === 'no-repeat') {
    // no-repeat applies to all slots
    return true;
  }
  if (rule.type === 'require-component') {
    if (!rule.days.includes(day)) return false;
    if (rule.slots !== null && !rule.slots.includes(slot)) return false;
    return true;
  }
  return false;
}

// ─── Helper: matchesTagFilter ─────────────────────────────────────────────────

function matchesTagFilter(component: ComponentRecord, filter: TagFilter): boolean {
  if (filter.dietary_tag !== undefined) {
    if (!component.dietary_tags.includes(filter.dietary_tag)) return false;
  }
  if (filter.protein_tag !== undefined) {
    if (component.protein_tag !== filter.protein_tag) return false;
  }
  if (filter.regional_tag !== undefined) {
    if (!component.regional_tags.includes(filter.regional_tag)) return false;
  }
  if (filter.occasion_tag !== undefined) {
    if (!component.occasion_tags.includes(filter.occasion_tag)) return false;
  }
  return true;
}

// ─── Helper: getEligibleBases ─────────────────────────────────────────────────

function getEligibleBases(
  slot: MealSlot,
  prefs: UserPreferencesRecord,
  bases: ComponentRecord[],
): ComponentRecord[] {
  const restrictions = prefs.slot_restrictions.base_type_slots;
  return bases.filter(base => {
    const baseType = base.base_type as BaseType | undefined;
    if (!baseType) return true; // no base_type, no restriction
    const allowedSlots = restrictions[baseType];
    // If no restriction specified for this base_type, all slots are allowed
    if (allowedSlots === undefined) return true;
    // If restriction is empty array, base type is disabled entirely
    if (allowedSlots.length === 0) return false;
    return allowedSlots.includes(slot);
  });
}

// ─── Helper: applyDayFilterToPool ─────────────────────────────────────────────

/**
 * Apply day-filter rules to a component pool.
 * Returns filtered pool (may be empty — caller handles relaxation).
 */
function applyDayFilterToPool(
  pool: ComponentRecord[],
  rules: CompiledFilter[],
  day: DayOfWeek,
  slot: MealSlot,
): ComponentRecord[] {
  const applicableDayFilters = rules.filter(
    r => r.type === 'day-filter' && isRuleApplicable(r, day, slot),
  ) as Extract<CompiledFilter, { type: 'day-filter' }>[];

  if (applicableDayFilters.length === 0) return pool;

  return pool.filter(component =>
    applicableDayFilters.every(rule => matchesTagFilter(component, rule.filter)),
  );
}

// ─── Helper: pickFromPool ─────────────────────────────────────────────────────

/**
 * Pick a component from pool, applying soft rules and recency.
 * If filtered pool is empty, falls back to full pool (emits warnings).
 */
function pickFromPool(
  pool: ComponentRecord[],
  rules: CompiledFilter[],
  _usedIds: Set<number>,
  usageCount: Map<number, number>,
  day: DayOfWeek,
  slot: MealSlot,
  warnings: Warning[],
  ruleRecords: RuleRecord[],
): ComponentRecord | null {
  if (pool.length === 0) return null;

  // Pool is already pre-filtered for no-repeat by the caller.
  // Apply day-filter rules (soft constraint) to the provided pool.
  let filtered = pool;

  const withTagFilter = applyDayFilterToPool(filtered, rules, day, slot);
  if (withTagFilter.length > 0) {
    filtered = withTagFilter;
  } else if (filtered.length > 0) {
    // Over-constrained: relax day-filter, emit warnings
    const applicableDayFilters = rules.filter(
      r => r.type === 'day-filter' && isRuleApplicable(r, day, slot),
    );
    for (const rule of applicableDayFilters) {
      const ruleRecord = ruleRecords.find(r =>
        JSON.stringify(r.compiled_filter) === JSON.stringify(rule),
      );
      warnings.push({
        slot: { day, meal_slot: slot },
        rule_id: ruleRecord?.id ?? null,
        message: `No components match day-filter rule on ${day} ${slot} — constraint relaxed`,
      });
    }
  }

  return weightedRandom(filtered, c => effectiveWeight(c, usageCount));
}

// ─── Main generator function ──────────────────────────────────────────────────

export async function generate(options?: GenerateOptions): Promise<GeneratorResult> {
  // 1. Load data
  const [allComponents, prefs, enabledRules] = await Promise.all([
    getAllComponents(),
    getPreferences(),
    getEnabledRules(),
  ]);

  // 2. Validate rules with Zod — skip invalid ones with a warning
  const warnings: Warning[] = [];
  const validRules: CompiledFilter[] = [];

  for (const ruleRecord of enabledRules) {
    const parsed = CompiledFilterSchema.safeParse(ruleRecord.compiled_filter);
    if (parsed.success) {
      validRules.push(parsed.data);
    } else {
      warnings.push({
        slot: { day: 'monday', meal_slot: 'breakfast' },
        rule_id: ruleRecord.id ?? null,
        message: `Invalid rule "${ruleRecord.name}" skipped — Zod validation failed`,
      });
    }
  }

  // Default permissive preferences if none exist
  const resolvedPrefs: UserPreferencesRecord = prefs ?? {
    id: 'prefs',
    slot_restrictions: {
      base_type_slots: {},
      component_slot_overrides: {},
    },
    extra_quantity_limits: { breakfast: 2, lunch: 3, dinner: 2 },
    base_type_rules: [],
  };

  // 3. Partition components by type
  const bases = allComponents.filter(c => c.componentType === 'base');
  const curries = allComponents.filter(c => c.componentType === 'curry');
  const subzis = allComponents.filter(c => c.componentType === 'subzi');
  const extras = allComponents.filter(c => c.componentType === 'extra');

  // 4. Initialize tracking state
  const usageCount = new Map<number, number>();
  const usedBaseIds = new Set<number>();
  const usedCurryIds = new Set<number>();
  const usedSubziIds = new Set<number>();

  // Extract per-type no-repeat rules
  const noRepeatBase = validRules.some(
    r => r.type === 'no-repeat' && r.component_type === 'base',
  );
  const noRepeatCurry = validRules.some(
    r => r.type === 'no-repeat' && r.component_type === 'curry',
  );
  const noRepeatSubzi = validRules.some(
    r => r.type === 'no-repeat' && r.component_type === 'subzi',
  );

  // Extract require-component rules
  const requireRules = validRules.filter(r => r.type === 'require-component') as Extract<
    CompiledFilter,
    { type: 'require-component' }
  >[];

  // 5. Fill order: breakfasts, then lunches, then dinners (all 7 days each)
  const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];
  const slots: PlanSlot[] = [];

  for (const meal_slot of MEAL_SLOTS) {
    for (const day of ALL_DAYS) {
      // ── Locked slot check ───────────────────────────────────────────────────
      const lockKey = `${day}-${meal_slot}` as `${DayOfWeek}-${MealSlot}`;
      const locked = options?.lockedSlots?.[lockKey];

      // ── Base selection ──────────────────────────────────────────────────────

      // Hard constraint: slot restrictions + component_slot_overrides + occasion
      let eligibleBases = getEligibleBases(meal_slot, resolvedPrefs, bases).filter(b => {
        const override = resolvedPrefs.slot_restrictions.component_slot_overrides[b.id!];
        if (override !== undefined && !override.includes(meal_slot)) return false;
        return isOccasionAllowed(b, day);
      });

      // Check require-component rules that target this (day, slot)
      const applicableRequireRules = requireRules.filter(r =>
        isRuleApplicable(r, day, meal_slot),
      );

      let selectedBase: ComponentRecord | null = null;

      // If this slot has a locked base_id, use it directly
      if (locked?.base_id !== undefined) {
        const lockedBase = bases.find(b => b.id === locked.base_id);
        if (lockedBase) {
          selectedBase = lockedBase;
        }
      }

      if (!selectedBase && applicableRequireRules.length > 0) {
        // Try to honor require-component for base
        for (const rule of applicableRequireRules) {
          const required = eligibleBases.find(c => c.id === rule.component_id);
          if (required) {
            selectedBase = required;
            break;
          } else {
            // Required component not found or not in eligible pool
            warnings.push({
              slot: { day, meal_slot },
              rule_id: enabledRules.find(r =>
                r.compiled_filter.type === 'require-component' &&
                (r.compiled_filter as Extract<CompiledFilter, { type: 'require-component' }>).component_id === rule.component_id,
              )?.id ?? null,
              message: `Required component id=${rule.component_id} not found or not eligible for ${day} ${meal_slot}`,
            });
          }
        }
      }

      if (!selectedBase) {
        if (eligibleBases.length === 0) {
          // No bases available — warn and try full pool
          warnings.push({
            slot: { day, meal_slot },
            rule_id: null,
            message: `No eligible bases for ${day} ${meal_slot} after slot restrictions — using full base pool`,
          });
          eligibleBases = bases;
        }

        if (eligibleBases.length === 0) {
          // Truly no bases — skip slot (shouldn't happen with seeded data)
          warnings.push({
            slot: { day, meal_slot },
            rule_id: null,
            message: `No bases available at all for ${day} ${meal_slot} — slot skipped`,
          });
          continue;
        }

        // Apply no-repeat to base pool
        const noRepeatFilteredBases = noRepeatBase
          ? eligibleBases.filter(b => !usedBaseIds.has(b.id!))
          : eligibleBases;

        const basePool = noRepeatFilteredBases.length > 0 ? noRepeatFilteredBases : eligibleBases;

        // Apply day-filter soft constraints
        const dayFilteredBases = applyDayFilterToPool(basePool, validRules, day, meal_slot);
        let finalBasePool = dayFilteredBases.length > 0 ? dayFilteredBases : basePool;
        if (dayFilteredBases.length === 0 && basePool.length > 0) {
          // Over-constrained: emit warnings for applicable day-filter rules
          const applicableDayFilters = validRules.filter(
            r => r.type === 'day-filter' && isRuleApplicable(r, day, meal_slot),
          );
          for (const rule of applicableDayFilters) {
            const ruleRecord = enabledRules.find(r =>
              JSON.stringify(r.compiled_filter) === JSON.stringify(rule),
            );
            warnings.push({
              slot: { day, meal_slot },
              rule_id: ruleRecord?.id ?? null,
              message: `No bases match day-filter rule on ${day} ${meal_slot} — constraint relaxed`,
            });
          }
          finalBasePool = basePool;
        }

        selectedBase = weightedRandom(finalBasePool, c => effectiveWeight(c, usageCount));
      }

      // Track base usage
      const selectedBaseId = selectedBase.id!;
      usageCount.set(selectedBaseId, (usageCount.get(selectedBaseId) ?? 0) + 1);
      if (noRepeatBase) usedBaseIds.add(selectedBaseId);
      const selectedBaseType = selectedBase.base_type as BaseType | undefined;

      // ── Curry selection ─────────────────────────────────────────────────────

      let selectedCurry: ComponentRecord | undefined;
      if (locked?.curry_id !== undefined) {
        // Use locked curry directly
        const lockedCurry = curries.find(c => c.id === locked.curry_id);
        if (lockedCurry) {
          selectedCurry = lockedCurry;
          usageCount.set(lockedCurry.id!, (usageCount.get(lockedCurry.id!) ?? 0) + 1);
        }
      } else if (curries.length > 0) {
        // When no-repeat is active, only use the unvisited pool (no fallback to repeats)
        const eligibleCurries = curries.filter(c => {
          const override = resolvedPrefs.slot_restrictions.component_slot_overrides[c.id!];
          if (override !== undefined && !override.includes(meal_slot)) return false;
          return isOccasionAllowed(c, day);
        });
        const curryPool = noRepeatCurry
          ? eligibleCurries.filter(c => !usedCurryIds.has(c.id!))
          : eligibleCurries;

        if (curryPool.length > 0) {
          const picked = pickFromPool(
            curryPool,
            validRules,
            usedCurryIds,
            usageCount,
            day,
            meal_slot,
            warnings,
            enabledRules,
          );
          if (picked) {
            selectedCurry = picked;
            usageCount.set(picked.id!, (usageCount.get(picked.id!) ?? 0) + 1);
            if (noRepeatCurry) usedCurryIds.add(picked.id!);
          }
        }
        // If curryPool is empty (all curries used, no-repeat active), skip curry for this slot
      }

      // ── Subzi selection ─────────────────────────────────────────────────────

      let selectedSubzi: ComponentRecord | undefined;
      if (locked?.subzi_id !== undefined) {
        // Use locked subzi directly
        const lockedSubzi = subzis.find(s => s.id === locked.subzi_id);
        if (lockedSubzi) {
          selectedSubzi = lockedSubzi;
          usageCount.set(lockedSubzi.id!, (usageCount.get(lockedSubzi.id!) ?? 0) + 1);
        }
      } else if (subzis.length > 0) {
        // When no-repeat is active, only use the unvisited pool (no fallback to repeats)
        const eligibleSubzis = subzis.filter(s => {
          const override = resolvedPrefs.slot_restrictions.component_slot_overrides[s.id!];
          if (override !== undefined && !override.includes(meal_slot)) return false;
          return isOccasionAllowed(s, day);
        });
        const subziPool = noRepeatSubzi
          ? eligibleSubzis.filter(s => !usedSubziIds.has(s.id!))
          : eligibleSubzis;

        if (subziPool.length > 0) {
          const picked = pickFromPool(
            subziPool,
            validRules,
            usedSubziIds,
            usageCount,
            day,
            meal_slot,
            warnings,
            enabledRules,
          );
          if (picked) {
            selectedSubzi = picked;
            usageCount.set(picked.id!, (usageCount.get(picked.id!) ?? 0) + 1);
            if (noRepeatSubzi) usedSubziIds.add(picked.id!);
          }
        }
        // If subziPool is empty (all subzis used, no-repeat active), skip subzi for this slot
      }

      // ── Extras selection ────────────────────────────────────────────────────

      const maxExtras = resolvedPrefs.extra_quantity_limits[meal_slot] ?? 2;

      // Filter extras by compatible_base_types of selected base
      let eligibleExtras = extras.filter(e => {
        if (!selectedBaseType) return true;
        return (e.compatible_base_types ?? []).includes(selectedBaseType);
      });

      // Also filter by component_slot_overrides + occasion (hard constraints)
      eligibleExtras = eligibleExtras.filter(e => {
        const override = resolvedPrefs.slot_restrictions.component_slot_overrides[e.id!];
        if (override !== undefined && !override.includes(meal_slot)) return false;
        return isOccasionAllowed(e, day);
      });

      // Check mandatory extras from base_type_rules (skip if extras are locked)
      const selectedExtraIds: number[] = [];
      if (locked?.extra_ids !== undefined) {
        // Use locked extras directly — preserve the exact array
        selectedExtraIds.push(...locked.extra_ids);
      } else {
        if (selectedBaseType) {
          const baseTypeRule = resolvedPrefs.base_type_rules.find(
            r => r.base_type === selectedBaseType,
          );
          if (baseTypeRule?.required_extra_category) {
            const requiredCategory = baseTypeRule.required_extra_category;
            const mandatoryExtras = eligibleExtras.filter(
              e => e.extra_category === requiredCategory,
            );
            if (mandatoryExtras.length > 0) {
              const mandatory = weightedRandom(mandatoryExtras, c => effectiveWeight(c, usageCount));
              selectedExtraIds.push(mandatory.id!);
              usageCount.set(mandatory.id!, (usageCount.get(mandatory.id!) ?? 0) + 1);
            }
          }
        }

        // Fill remaining extra slots (up to limit)
        const remainingSlots = maxExtras - selectedExtraIds.length;
        if (remainingSlots > 0 && eligibleExtras.length > 0) {
          const availableExtras = eligibleExtras.filter(e => !selectedExtraIds.includes(e.id!));
          // Use weighted random selection without replacement
          const tempPool = [...availableExtras];
          for (let i = 0; i < remainingSlots && tempPool.length > 0; i++) {
            const picked = weightedRandom(tempPool, c => effectiveWeight(c, usageCount));
            selectedExtraIds.push(picked.id!);
            usageCount.set(picked.id!, (usageCount.get(picked.id!) ?? 0) + 1);
            // Remove from temp pool to avoid duplicate in same slot
            const idx = tempPool.findIndex(c => c.id === picked.id);
            if (idx !== -1) tempPool.splice(idx, 1);
          }
        }
      }

      // ── Build PlanSlot ──────────────────────────────────────────────────────

      const planSlot: PlanSlot = {
        day,
        meal_slot,
        base_id: selectedBaseId,
        extra_ids: selectedExtraIds,
      };
      if (selectedCurry) planSlot.curry_id = selectedCurry.id!;
      if (selectedSubzi) planSlot.subzi_id = selectedSubzi.id!;

      slots.push(planSlot);
    }
  }

  return { plan: { slots }, warnings };
}
