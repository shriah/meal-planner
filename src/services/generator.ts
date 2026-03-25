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
  type SchedulingRule,
  type MealTemplateRule,
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
  if (rule.type === 'no-repeat') {
    // no-repeat applies to all slots
    return true;
  }
  if (rule.type === 'scheduling-rule') {
    if (rule.days !== null && !rule.days.includes(day)) return false;
    if (rule.slots !== null && !rule.slots.includes(slot)) return false;
    return true;
  }
  if (rule.type === 'meal-template') {
    if (rule.days !== null && !rule.days.includes(day)) return false;
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

// ─── Helper: getMealTemplateAllowedSlots ──────────────────────────────────────

/**
 * Returns the intersection of allowed_slots across all meal-template rules for a base type.
 * Returns null if no rules exist or all rules have allowed_slots=null (unrestricted).
 * Returns empty array if intersection is empty (triggers D-10 relaxation).
 */
function getMealTemplateAllowedSlots(
  baseType: BaseType,
  mealTemplateRules: MealTemplateRule[],
): MealSlot[] | null {
  const rulesForBase = mealTemplateRules.filter(r => r.base_type === baseType);
  if (rulesForBase.length === 0) return null; // No template = no restriction from templates
  const withAllowedSlots = rulesForBase.filter(r => r.allowed_slots !== null);
  if (withAllowedSlots.length === 0) return null; // All rules have allowed_slots=null = unrestricted
  // Intersection of all allowed_slots arrays (D-08)
  let result: MealSlot[] = withAllowedSlots[0].allowed_slots!;
  for (let i = 1; i < withAllowedSlots.length; i++) {
    result = result.filter(s => withAllowedSlots[i].allowed_slots!.includes(s));
  }
  return result;
}

// ─── Helper: getApplicableMealTemplates ───────────────────────────────────────

/**
 * Returns meal-template rules applicable for a given (baseType, day, slot) context.
 * Used for composition constraints (exclude_component_types, extras) — gated by
 * days/slots context scope per D-02/D-09.
 */
function getApplicableMealTemplates(
  baseType: BaseType,
  day: DayOfWeek,
  slot: MealSlot,
  mealTemplateRules: MealTemplateRule[],
): MealTemplateRule[] {
  return mealTemplateRules.filter(r =>
    r.base_type === baseType &&
    (r.days === null || r.days.includes(day)) &&
    (r.slots === null || r.slots.includes(slot)),
  );
}

// ─── Helper: getEligibleBases ─────────────────────────────────────────────────

function getEligibleBases(
  slot: MealSlot,
  prefs: UserPreferencesRecord,
  bases: ComponentRecord[],
  mealTemplateRules: MealTemplateRule[],
  warnings: Warning[],
  day: DayOfWeek,
): ComponentRecord[] {
  return bases.filter(base => {
    const baseType = base.base_type as BaseType | undefined;
    if (!baseType) return true; // no base_type, no restriction

    // D-07: Check if any meal-template rules exist for this base type
    const templatesForBase = mealTemplateRules.filter(r => r.base_type === baseType);
    if (templatesForBase.length > 0) {
      // D-05: meal-template overrides prefs
      const allowedSlots = getMealTemplateAllowedSlots(baseType, mealTemplateRules);
      if (allowedSlots === null) return true; // unrestricted
      if (allowedSlots.length === 0) {
        // D-10: intersection empty — relax with warning
        warnings.push({
          slot: { day, meal_slot: slot },
          rule_id: null,
          message: `meal-template allowed_slots intersection is empty for ${baseType} — constraint relaxed`,
        });
        return true;
      }
      return allowedSlots.includes(slot);
    }

    // D-06: No templates — fall through to prefs
    const restrictions = prefs.slot_restrictions.base_type_slots;
    const allowedSlots = restrictions[baseType];
    // If no restriction specified for this base_type, all slots are allowed
    if (allowedSlots === undefined) return true;
    // If restriction is empty array, base type is disabled entirely
    if (allowedSlots.length === 0) return false;
    return allowedSlots.includes(slot);
  });
}

// ─── Helper: applySchedulingFilterPool ───────────────────────────────────────

function applySchedulingFilterPool(
  pool: ComponentRecord[],
  applicableRules: SchedulingRule[],
): ComponentRecord[] {
  const filterPoolRules = applicableRules.filter(r => r.effect === 'filter-pool');
  if (filterPoolRules.length === 0) return pool;
  return pool.filter(component =>
    filterPoolRules.every(rule => {
      if (rule.match.mode === 'tag') return matchesTagFilter(component, rule.match.filter);
      if (rule.match.mode === 'component') return component.id === rule.match.component_id;
      return true;
    }),
  );
}

// ─── Helper: applySchedulingExclude ──────────────────────────────────────────

function applySchedulingExclude(
  pool: ComponentRecord[],
  fullPool: ComponentRecord[],
  applicableRules: SchedulingRule[],
  warnings: Warning[],
  day: DayOfWeek,
  slot: MealSlot,
  ruleRecords: RuleRecord[],
): ComponentRecord[] {
  const excludeRules = applicableRules.filter(r => r.effect === 'exclude');
  if (excludeRules.length === 0) return pool;
  const filtered = pool.filter(component =>
    excludeRules.every(rule => {
      if (rule.match.mode === 'tag') return !matchesTagFilter(component, rule.match.filter);
      if (rule.match.mode === 'component') return component.id !== rule.match.component_id;
      return true;
    }),
  );
  if (filtered.length === 0 && pool.length > 0) {
    for (const rule of excludeRules) {
      const rr = ruleRecords.find(r =>
        JSON.stringify(r.compiled_filter) === JSON.stringify(rule),
      );
      warnings.push({
        slot: { day, meal_slot: slot },
        rule_id: rr?.id ?? null,
        message: `scheduling-rule exclude removed all components from pool on ${day} ${slot} — constraint relaxed`,
      });
    }
    return pool;
  }
  void fullPool; // parameter kept for API symmetry with plan spec
  return filtered;
}

// ─── Helper: applyRequireOneByTag ────────────────────────────────────────────

/**
 * Two-pass require-one-by-tag (D-05).
 * If selected component doesn't match the tag criteria, override
 * from the FULL library (bypassing filter-pool rules — D-06).
 * Uses uniform random for override pick (not weighted — explicit requirement).
 */
function applyRequireOneByTag(
  selected: ComponentRecord,
  requireOneRules: SchedulingRule[],
  fullLibrary: ComponentRecord[],
  warnings: Warning[],
  day: DayOfWeek,
  slot: MealSlot,
  ruleRecords: RuleRecord[],
): ComponentRecord {
  for (const rule of requireOneRules) {
    if (rule.match.mode !== 'tag') continue;
    const tagMatch = rule.match;
    if (matchesTagFilter(selected, tagMatch.filter)) continue; // already satisfied
    // Override: pick from full library, not filtered pool (D-05, D-06)
    const candidates = fullLibrary.filter(c => matchesTagFilter(c, tagMatch.filter));
    if (candidates.length === 0) {
      // D-03: no matching component in library — warn + skip
      const rr = ruleRecords.find(r =>
        JSON.stringify(r.compiled_filter) === JSON.stringify(rule),
      );
      warnings.push({
        slot: { day, meal_slot: slot },
        rule_id: rr?.id ?? null,
        message: `scheduling-rule require-one: no component in library matches tag filter on ${day} ${slot} — skipped`,
      });
      continue;
    }
    // Uniform random (not weighted) — explicit requirement override
    return candidates[Math.floor(Math.random() * candidates.length)];
  }
  return selected;
}

// ─── Helper: applyRequireOneByComponent ──────────────────────────────────────

/**
 * Require-one-by-component (D-04).
 * Inject the required component into the slot regardless of filter-pool rules.
 * Only applies if the required component matches the expected componentType.
 */
function applyRequireOneByComponent(
  selected: ComponentRecord,
  requireOneRules: SchedulingRule[],
  allComponents: ComponentRecord[],
  expectedComponentType: string,
  warnings: Warning[],
  day: DayOfWeek,
  slot: MealSlot,
  ruleRecords: RuleRecord[],
): ComponentRecord {
  for (const rule of requireOneRules) {
    if (rule.match.mode !== 'component') continue;
    const componentId = rule.match.component_id;
    const required = allComponents.find(
      c => c.id === componentId && c.componentType === expectedComponentType,
    );
    if (!required) {
      // Component not found or wrong type — skip silently (Pitfall 2)
      // If component doesn't exist at all, warn.
      const exists = allComponents.find(c => c.id === componentId);
      if (!exists) {
        const rr = ruleRecords.find(r =>
          JSON.stringify(r.compiled_filter) === JSON.stringify(rule),
        );
        warnings.push({
          slot: { day, meal_slot: slot },
          rule_id: rr?.id ?? null,
          message: `scheduling-rule require-one: component id=${componentId} not found — skipped`,
        });
      }
      continue;
    }
    // D-04: inject regardless of filter-pool
    return required;
  }
  return selected;
}

// ─── Helper: pickFromPool ─────────────────────────────────────────────────────

/**
 * Pick a component from pool using weighted random selection.
 * Pool is already pre-filtered for no-repeat and scheduling-rule constraints by the caller.
 */
function pickFromPool(
  pool: ComponentRecord[],
  usageCount: Map<number, number>,
): ComponentRecord | null {
  if (pool.length === 0) return null;
  return weightedRandom(pool, c => effectiveWeight(c, usageCount));
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

  // Extract meal-template rules
  const mealTemplateRules = validRules.filter(
    r => r.type === 'meal-template',
  ) as MealTemplateRule[];

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

  // 5. Fill order: breakfasts, then lunches, then dinners (all 7 days each)
  const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];
  const slots: PlanSlot[] = [];

  for (const meal_slot of MEAL_SLOTS) {
    for (const day of ALL_DAYS) {
      // ── Locked slot check ───────────────────────────────────────────────────
      const lockKey = `${day}-${meal_slot}` as `${DayOfWeek}-${MealSlot}`;
      const locked = options?.lockedSlots?.[lockKey];

      // ── Scheduling-rule applicability for this (day, slot) ─────────────────
      const applicableSchedulingRules = validRules.filter(
        r => r.type === 'scheduling-rule' && isRuleApplicable(r, day, meal_slot),
      ) as SchedulingRule[];

      // ── Base selection ──────────────────────────────────────────────────────

      // Hard constraint: slot restrictions + component_slot_overrides + occasion
      let eligibleBases = getEligibleBases(meal_slot, resolvedPrefs, bases, mealTemplateRules, warnings, day).filter(b => {
        const override = resolvedPrefs.slot_restrictions.component_slot_overrides[b.id!];
        if (override !== undefined && !override.includes(meal_slot)) return false;
        return isOccasionAllowed(b, day);
      });

      let selectedBase: ComponentRecord | null = null;

      // If this slot has a locked base_id, use it directly
      if (locked?.base_id !== undefined) {
        const lockedBase = bases.find(b => b.id === locked.base_id);
        if (lockedBase) {
          selectedBase = lockedBase;
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
        let finalBasePool = basePool;

        // Apply scheduling-rule filter-pool and exclude to base pool
        const schedulingFilteredBases = applySchedulingFilterPool(finalBasePool, applicableSchedulingRules);
        if (schedulingFilteredBases.length === 0 && finalBasePool.length > 0) {
          // D-01: relax filter-pool
          for (const rule of applicableSchedulingRules.filter(r => r.effect === 'filter-pool')) {
            const rr = enabledRules.find(r => JSON.stringify(r.compiled_filter) === JSON.stringify(rule));
            warnings.push({ slot: { day, meal_slot }, rule_id: rr?.id ?? null, message: `scheduling-rule filter-pool: no bases match on ${day} ${meal_slot} — constraint relaxed` });
          }
        } else {
          finalBasePool = schedulingFilteredBases;
        }
        finalBasePool = applySchedulingExclude(finalBasePool, basePool, applicableSchedulingRules, warnings, day, meal_slot, enabledRules);

        selectedBase = weightedRandom(finalBasePool, c => effectiveWeight(c, usageCount));

        // Pass 2: require-one override (D-05)
        const baseRequireOneRules = applicableSchedulingRules.filter(r => r.effect === 'require-one');
        if (baseRequireOneRules.length > 0) {
          selectedBase = applyRequireOneByTag(selectedBase, baseRequireOneRules, bases, warnings, day, meal_slot, enabledRules);
          selectedBase = applyRequireOneByComponent(selectedBase, baseRequireOneRules, allComponents, 'base', warnings, day, meal_slot, enabledRules);
        }
      }

      // Track base usage
      const selectedBaseId = selectedBase.id!;
      usageCount.set(selectedBaseId, (usageCount.get(selectedBaseId) ?? 0) + 1);
      if (noRepeatBase) usedBaseIds.add(selectedBaseId);
      const selectedBaseType = selectedBase.base_type as BaseType | undefined;

      // ── Meal-template composition constraints for this (day, slot, baseType) ─

      const applicableTemplates = selectedBaseType
        ? getApplicableMealTemplates(selectedBaseType, day, meal_slot, mealTemplateRules)
        : [];
      const excludedComponentTypes = new Set(
        applicableTemplates.flatMap(t => t.exclude_component_types),
      );

      // ── Curry selection ─────────────────────────────────────────────────────

      let selectedCurry: ComponentRecord | undefined;
      const skipCurry = excludedComponentTypes.has('curry');
      if (locked?.curry_id !== undefined) {
        // Use locked curry directly — locked components bypass soft constraints
        const lockedCurry = curries.find(c => c.id === locked.curry_id);
        if (lockedCurry) {
          selectedCurry = lockedCurry;
          usageCount.set(lockedCurry.id!, (usageCount.get(lockedCurry.id!) ?? 0) + 1);
        }
      } else if (!skipCurry && curries.length > 0) {
        // When no-repeat is active, only use the unvisited pool (no fallback to repeats)
        const eligibleCurries = curries.filter(c => {
          const override = resolvedPrefs.slot_restrictions.component_slot_overrides[c.id!];
          if (override !== undefined && !override.includes(meal_slot)) return false;
          return isOccasionAllowed(c, day);
        });
        const curryPoolBase = noRepeatCurry
          ? eligibleCurries.filter(c => !usedCurryIds.has(c.id!))
          : eligibleCurries;

        // Apply scheduling-rule filter-pool and exclude to curry pool
        let scheduledCurryPool = applySchedulingFilterPool(curryPoolBase, applicableSchedulingRules);
        if (scheduledCurryPool.length === 0 && curryPoolBase.length > 0) {
          // D-01: relax filter-pool
          for (const rule of applicableSchedulingRules.filter(r => r.effect === 'filter-pool')) {
            const rr = enabledRules.find(r => JSON.stringify(r.compiled_filter) === JSON.stringify(rule));
            warnings.push({ slot: { day, meal_slot }, rule_id: rr?.id ?? null, message: `scheduling-rule filter-pool: no curries match on ${day} ${meal_slot} — constraint relaxed` });
          }
          scheduledCurryPool = curryPoolBase;
        }
        const curryPool = applySchedulingExclude(scheduledCurryPool, curryPoolBase, applicableSchedulingRules, warnings, day, meal_slot, enabledRules);

        if (curryPool.length > 0) {
          const picked = pickFromPool(curryPool, usageCount);
          if (picked) {
            // Pass 2: require-one override for curry (D-05)
            const curryRequireOneRules = applicableSchedulingRules.filter(r => r.effect === 'require-one');
            let finalPicked = picked;
            if (curryRequireOneRules.length > 0) {
              finalPicked = applyRequireOneByTag(finalPicked, curryRequireOneRules, curries, warnings, day, meal_slot, enabledRules);
              finalPicked = applyRequireOneByComponent(finalPicked, curryRequireOneRules, allComponents, 'curry', warnings, day, meal_slot, enabledRules);
            }
            selectedCurry = finalPicked;
            usageCount.set(finalPicked.id!, (usageCount.get(finalPicked.id!) ?? 0) + 1);
            if (noRepeatCurry) usedCurryIds.add(finalPicked.id!);
          }
        }
        // If curryPool is empty (all curries used, no-repeat active), skip curry for this slot
      }

      // ── Subzi selection ─────────────────────────────────────────────────────

      let selectedSubzi: ComponentRecord | undefined;
      const skipSubzi = excludedComponentTypes.has('subzi');
      if (locked?.subzi_id !== undefined) {
        // Use locked subzi directly — locked components bypass soft constraints
        const lockedSubzi = subzis.find(s => s.id === locked.subzi_id);
        if (lockedSubzi) {
          selectedSubzi = lockedSubzi;
          usageCount.set(lockedSubzi.id!, (usageCount.get(lockedSubzi.id!) ?? 0) + 1);
        }
      } else if (!skipSubzi && subzis.length > 0) {
        // When no-repeat is active, only use the unvisited pool (no fallback to repeats)
        const eligibleSubzis = subzis.filter(s => {
          const override = resolvedPrefs.slot_restrictions.component_slot_overrides[s.id!];
          if (override !== undefined && !override.includes(meal_slot)) return false;
          return isOccasionAllowed(s, day);
        });
        const subziPoolBase = noRepeatSubzi
          ? eligibleSubzis.filter(s => !usedSubziIds.has(s.id!))
          : eligibleSubzis;

        // Apply scheduling-rule filter-pool and exclude to subzi pool
        let scheduledSubziPool = applySchedulingFilterPool(subziPoolBase, applicableSchedulingRules);
        if (scheduledSubziPool.length === 0 && subziPoolBase.length > 0) {
          // D-01: relax filter-pool
          for (const rule of applicableSchedulingRules.filter(r => r.effect === 'filter-pool')) {
            const rr = enabledRules.find(r => JSON.stringify(r.compiled_filter) === JSON.stringify(rule));
            warnings.push({ slot: { day, meal_slot }, rule_id: rr?.id ?? null, message: `scheduling-rule filter-pool: no subzis match on ${day} ${meal_slot} — constraint relaxed` });
          }
          scheduledSubziPool = subziPoolBase;
        }
        const subziPool = applySchedulingExclude(scheduledSubziPool, subziPoolBase, applicableSchedulingRules, warnings, day, meal_slot, enabledRules);

        if (subziPool.length > 0) {
          const picked = pickFromPool(subziPool, usageCount);
          if (picked) {
            // Pass 2: require-one override for subzi (D-05)
            const subziRequireOneRules = applicableSchedulingRules.filter(r => r.effect === 'require-one');
            let finalPicked = picked;
            if (subziRequireOneRules.length > 0) {
              finalPicked = applyRequireOneByTag(finalPicked, subziRequireOneRules, subzis, warnings, day, meal_slot, enabledRules);
              finalPicked = applyRequireOneByComponent(finalPicked, subziRequireOneRules, allComponents, 'subzi', warnings, day, meal_slot, enabledRules);
            }
            selectedSubzi = finalPicked;
            usageCount.set(finalPicked.id!, (usageCount.get(finalPicked.id!) ?? 0) + 1);
            if (noRepeatSubzi) usedSubziIds.add(finalPicked.id!);
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
