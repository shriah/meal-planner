import { getAllComponents, getEnabledRules } from '@/services/food-db';
import type { ComponentRecord } from '@/types/component';
import type { MealSlot } from '@/types/preferences';
import {
  CompiledRuleSchema,
  ALL_DAYS,
  type DayOfWeek,
  type CompiledRule,
  type Target,
  type RuleScope,
  type AnyEffect,
  type AllowedSlotsEffect,
  type SkipComponentEffect,
  type RequireComponentEffect,
  type RequireExtraEffect,
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

// ─── ValidatedRule ────────────────────────────────────────────────────────────

interface ValidatedRule {
  compiled: CompiledRule;
  id: number;
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
  const uses = usageCount.get(component.id) ?? 0;
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

// ─── Helper: targetMatches ────────────────────────────────────────────────────

function targetMatches(target: Target, component: ComponentRecord): boolean {
  switch (target.mode) {
    case 'component_type':
      return component.componentType === target.component_type;
    case 'tag':
      return matchesTagFilter(component, target.filter);
    case 'component':
      return component.id === target.component_id;
    case 'base_category':
      return component.componentType === 'base' && component.base_category_id === target.category_id;
  }
}

function isCurryCompatibleWithBase(
  curry: ComponentRecord,
  base: ComponentRecord,
): boolean {
  if (base.base_category_id === undefined || base.base_category_id === null) {
    return curry.compatible_base_category_ids === undefined;
  }

  if (curry.compatible_base_category_ids === undefined) {
    return true;
  }

  return curry.compatible_base_category_ids.includes(base.base_category_id);
}

// ─── Helper: scopeMatches ─────────────────────────────────────────────────────

function scopeMatches(scope: RuleScope, day: DayOfWeek, slot: MealSlot): boolean {
  if (scope.days !== null && !scope.days.includes(day)) return false;
  if (scope.slots !== null && !scope.slots.includes(slot)) return false;
  return true;
}

// ─── Helper: getAllowedSlotsForBase ───────────────────────────────────────────

/**
 * Returns intersection of allowed_slots across all rules that target `base` and
 * have an allowed_slots effect. Ignores scope.slots (placement is not slot-conditional).
 * Returns null if no such rules exist (no restriction).
 */
function getAllowedSlotsForBase(
  base: ComponentRecord,
  rules: ValidatedRule[],
  day: DayOfWeek,
): MealSlot[] | null {
  const arrays = rules
    .filter(r =>
      (r.compiled.scope.days === null || r.compiled.scope.days.includes(day)) &&
      targetMatches(r.compiled.target, base) &&
      r.compiled.effects.some(e => e.kind === 'allowed_slots'),
    )
    .flatMap(r =>
      r.compiled.effects
        .filter((e): e is AllowedSlotsEffect => e.kind === 'allowed_slots')
        .map(e => e.slots),
    );

  if (arrays.length === 0) return null;
  let result = arrays[0];
  for (let i = 1; i < arrays.length; i++) {
    result = result.filter(s => arrays[i].includes(s));
  }
  return result;
}

// ─── Helper: applyFilterPool ──────────────────────────────────────────────────

function applyFilterPool(
  pool: ComponentRecord[],
  rules: ValidatedRule[],
  day: DayOfWeek,
  slot: MealSlot,
  warnings: Warning[],
): ComponentRecord[] {
  const filterRules = rules.filter(r =>
    scopeMatches(r.compiled.scope, day, slot) &&
    r.compiled.effects.some(e => e.kind === 'filter_pool'),
  );
  if (filterRules.length === 0) return pool;
  const filtered = pool.filter(component =>
    filterRules.every(r => targetMatches(r.compiled.target, component)),
  );
  if (filtered.length === 0 && pool.length > 0) {
    for (const r of filterRules) {
      warnings.push({
        slot: { day, meal_slot: slot },
        rule_id: r.id,
        message: `filter_pool: no components match on ${day} ${slot} — constraint relaxed`,
      });
    }
    return pool; // relax
  }
  return filtered;
}

// ─── Helper: applyExclude ─────────────────────────────────────────────────────

function applyExclude(
  pool: ComponentRecord[],
  rules: ValidatedRule[],
  day: DayOfWeek,
  slot: MealSlot,
  warnings: Warning[],
): ComponentRecord[] {
  const excludeRules = rules.filter(r =>
    scopeMatches(r.compiled.scope, day, slot) &&
    r.compiled.effects.some(e => e.kind === 'exclude'),
  );
  if (excludeRules.length === 0) return pool;
  const filtered = pool.filter(component =>
    excludeRules.every(r => !targetMatches(r.compiled.target, component)),
  );
  if (filtered.length === 0 && pool.length > 0) {
    for (const r of excludeRules) {
      warnings.push({
        slot: { day, meal_slot: slot },
        rule_id: r.id,
        message: `exclude: removed all components from pool on ${day} ${slot} — constraint relaxed`,
      });
    }
    return pool; // relax
  }
  return filtered;
}

// ─── Helper: applyRequireOne ──────────────────────────────────────────────────

/**
 * Two-pass require-one: if selected component doesn't satisfy any require_one rule,
 * override from the FULL library (bypassing filter_pool — D-06).
 * Uses uniform random for override pick.
 */
function canOverrideCurryCompatibility(target: Target): boolean {
  return target.mode === 'component' || target.mode === 'tag';
}

function applyRequireOne(
  selected: ComponentRecord | undefined,
  rules: ValidatedRule[],
  preferredLibrary: ComponentRecord[],
  day: DayOfWeek,
  slot: MealSlot,
  warnings: Warning[],
  options?: {
    componentType?: ComponentRecord['componentType'];
    overrideLibrary?: ComponentRecord[];
  },
): ComponentRecord | undefined {
  const requireRules = rules.filter(r =>
    scopeMatches(r.compiled.scope, day, slot) &&
    r.compiled.effects.some(e => e.kind === 'require_one'),
  );
  for (const r of requireRules) {
    if (selected && targetMatches(r.compiled.target, selected)) continue;

    const candidates = preferredLibrary.filter(c => targetMatches(r.compiled.target, c));
    if (candidates.length > 0) {
      selected = candidates[Math.floor(Math.random() * candidates.length)];
      continue;
    }

    const canUseOverride =
      options?.componentType === 'curry' &&
      options.overrideLibrary !== undefined &&
      canOverrideCurryCompatibility(r.compiled.target);

    if (canUseOverride) {
      const overrideCandidates = options.overrideLibrary!.filter(c => targetMatches(r.compiled.target, c));
      if (overrideCandidates.length > 0) {
        selected = overrideCandidates[Math.floor(Math.random() * overrideCandidates.length)];
        continue;
      }
    }

    warnings.push({
      slot: { day, meal_slot: slot },
      rule_id: r.id,
      message: `require_one: no component in library matches target on ${day} ${slot} — skipped`,
    });
  }
  return selected;
}

// ─── Helper: compositionEffectsFirstPass ─────────────────────────────────────

/**
 * First pass (after base selection): find skip_component effects from rules
 * whose target matches the selected base. Component-mode rules excluded
 * (they require knowing the full slot components).
 */
function compositionEffectsFirstPass(
  rules: ValidatedRule[],
  base: ComponentRecord,
  day: DayOfWeek,
  slot: MealSlot,
): AnyEffect[] {
  return rules
    .filter(r => {
      if (!scopeMatches(r.compiled.scope, day, slot)) return false;
      const t = r.compiled.target;
      if (t.mode === 'component') return false; // skip — needs full slot context
      return targetMatches(t, base);
    })
    .flatMap(r => r.compiled.effects)
    .filter(e => e.kind === 'skip_component');
}

// ─── Helper: compositionEffectsSecondPass ────────────────────────────────────

/**
 * Second pass (after all components selected): find require_extra
 * effects from rules whose target matches ANY component in the slot.
 */
function compositionEffectsSecondPass(
  rules: ValidatedRule[],
  slotComponents: ComponentRecord[],
  day: DayOfWeek,
  slot: MealSlot,
): AnyEffect[] {
  return rules
    .filter(r => {
      if (!scopeMatches(r.compiled.scope, day, slot)) return false;
      return slotComponents.some((component) => targetMatches(r.compiled.target, component));
    })
    .flatMap(r => r.compiled.effects)
    .filter(e => e.kind === 'require_extra');
}

function getRequiredComponentEntries(
  rules: ValidatedRule[],
  slotComponents: ComponentRecord[],
  day: DayOfWeek,
  slot: MealSlot,
): { ruleId: number; componentId: number }[] {
  return rules
    .filter(r =>
      scopeMatches(r.compiled.scope, day, slot) &&
      slotComponents.some((component) => targetMatches(r.compiled.target, component)),
    )
    .flatMap(r =>
      r.compiled.effects
        .filter((effect): effect is RequireComponentEffect => effect.kind === 'require_component')
        .flatMap((effect) => effect.component_ids.map((componentId) => ({
          ruleId: r.id,
          componentId,
        }))),
    );
}

function warnRequiredComponentSkipped(
  warnings: Warning[],
  day: DayOfWeek,
  slot: MealSlot,
  ruleId: number,
  componentId: number,
  reason: string,
) {
  warnings.push({
    slot: { day, meal_slot: slot },
    rule_id: ruleId,
    message: `require_component component_id '${componentId}' ${reason} on ${day} ${slot} — skipped`,
  });
}

// ─── Helper: getEligibleBases ─────────────────────────────────────────────────

function getEligibleBases(
  slot: MealSlot,
  bases: ComponentRecord[],
  rules: ValidatedRule[],
  warnings: Warning[],
  day: DayOfWeek,
): ComponentRecord[] {
  return bases.filter(base => {
    // Occasion hard constraint
    if (!isOccasionAllowed(base, day)) return false;
    // allowed_slots from rules (replaces prefs.base_type_slots and meal-template allowed_slots)
    const allowedSlots = getAllowedSlotsForBase(base, rules, day);
    if (allowedSlots === null) return true; // no restriction
    if (allowedSlots.length === 0) {
      warnings.push({
        slot: { day, meal_slot: slot },
        rule_id: null,
        message: `allowed_slots intersection is empty for base "${base.name}" — constraint relaxed`,
      });
      return true; // relax
    }
    return allowedSlots.includes(slot);
  });
}

// ─── Helper: pickFromPool ─────────────────────────────────────────────────────

/**
 * Pick a component from pool using weighted random selection.
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
  const [allComponents, enabledRules] = await Promise.all([
    getAllComponents(),
    getEnabledRules(),
  ]);

  // 2. Validate rules with Zod — skip invalid ones with a warning
  const warnings: Warning[] = [];
  const validatedRules: ValidatedRule[] = [];

  for (const ruleRecord of enabledRules) {
    const parsed = CompiledRuleSchema.safeParse(ruleRecord.compiled_filter);
    if (parsed.success) {
      validatedRules.push({ compiled: parsed.data, id: ruleRecord.id });
    } else {
      warnings.push({
        slot: { day: 'monday', meal_slot: 'breakfast' },
        rule_id: ruleRecord.id ?? null,
        message: `Invalid rule "${ruleRecord.name}" skipped — Zod validation failed`,
      });
    }
  }

  // 3. Partition components by type
  const bases = allComponents.filter(c => c.componentType === 'base');
  const curries = allComponents.filter(c => c.componentType === 'curry');
  const subzis = allComponents.filter(c => c.componentType === 'subzi');
  const extras = allComponents.filter(c => c.componentType === 'extra');

  // 4. Initialize tracking state
  const usageCount = new Map<number, number>();

  // no_repeat applies to every component matched by the rule's target (any target mode):
  // such a component may appear at most once per plan. Rule scope is ignored, and only
  // bases, curries and subzis are tracked (extras are placed by require_extra rules).
  const noRepeatRules = validatedRules.filter(r =>
    r.compiled.effects.some(e => e.kind === 'no_repeat'),
  );
  const usedNoRepeatIds = new Set<number>();
  const withoutRepeats = (pool: ComponentRecord[]) =>
    noRepeatRules.length === 0 ? pool : pool.filter(c => !usedNoRepeatIds.has(c.id));
  const markUsed = (component: ComponentRecord) => {
    if (noRepeatRules.some(r => targetMatches(r.compiled.target, component))) {
      usedNoRepeatIds.add(component.id);
    }
  };

  // 5. Fill order: breakfasts, then lunches, then dinners (all 7 days each)
  const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];
  const slots: PlanSlot[] = [];

  for (const meal_slot of MEAL_SLOTS) {
    for (const day of ALL_DAYS) {
      // ── Locked slot check ───────────────────────────────────────────────────
      const lockKey = `${day}-${meal_slot}` as `${DayOfWeek}-${MealSlot}`;
      const locked = options?.lockedSlots?.[lockKey];

      // ── Base selection ──────────────────────────────────────────────────────

      let eligibleBases = getEligibleBases(meal_slot, bases, validatedRules, warnings, day);
      let selectedBase: ComponentRecord | undefined;

      if (locked?.base_id !== undefined) {
        const lockedBase = bases.find(b => b.id === locked.base_id);
        if (lockedBase) selectedBase = lockedBase;
      }

      if (!selectedBase) {
        if (eligibleBases.length === 0) {
          warnings.push({
            slot: { day, meal_slot },
            rule_id: null,
            message: `No eligible bases for ${day} ${meal_slot} after slot restrictions — using full base pool`,
          });
          eligibleBases = bases;
        }

        if (eligibleBases.length === 0) {
          warnings.push({
            slot: { day, meal_slot },
            rule_id: null,
            message: `No bases available at all for ${day} ${meal_slot} — slot skipped`,
          });
          continue;
        }

        // No-repeat filter
        const noRepeatPool = withoutRepeats(eligibleBases);
        let basePool = noRepeatPool.length > 0 ? noRepeatPool : eligibleBases;

        // Selection effects
        basePool = applyFilterPool(basePool, validatedRules, day, meal_slot, warnings);
        basePool = applyExclude(basePool, validatedRules, day, meal_slot, warnings);

        selectedBase = weightedRandom(basePool, c => effectiveWeight(c, usageCount));
        selectedBase = applyRequireOne(selectedBase, validatedRules, bases, day, meal_slot, warnings);
      }

      if (!selectedBase) {
        warnings.push({
          slot: { day, meal_slot },
          rule_id: null,
          message: `No base selected for ${day} ${meal_slot} — slot skipped`,
        });
        continue;
      }
      const initialSelectedBase = selectedBase;

      // Track base usage
      let selectedBaseId = selectedBase.id;
      usageCount.set(selectedBaseId, (usageCount.get(selectedBaseId) ?? 0) + 1);
      markUsed(selectedBase);

      // ── Meal composition constraints (first pass) ────────────────────────────

      const firstPassEffects = compositionEffectsFirstPass(
        validatedRules, initialSelectedBase, day, meal_slot,
      );
      const skippedComponentTypes = new Set(
        firstPassEffects
          .filter((e): e is SkipComponentEffect => e.kind === 'skip_component')
          .flatMap(e => e.component_types),
      );
      const skipCurry = skippedComponentTypes.has('curry');
      const skipSubzi = skippedComponentTypes.has('subzi');
      const skipExtras = skippedComponentTypes.has('extra');

      // ── Curry selection ─────────────────────────────────────────────────────

      let selectedCurry: ComponentRecord | undefined;
      if (locked?.curry_id !== undefined) {
        const lockedCurry = curries.find(c => c.id === locked.curry_id);
        if (lockedCurry) {
          selectedCurry = lockedCurry;
          usageCount.set(lockedCurry.id, (usageCount.get(lockedCurry.id) ?? 0) + 1);
        }
      } else if (!skipCurry && curries.length > 0) {
        const eligibleCurries = curries.filter(c => isOccasionAllowed(c, day));
        const compatibleCurries = eligibleCurries.filter(
          c => isCurryCompatibleWithBase(c, initialSelectedBase),
        );

        if (compatibleCurries.length > 0) {
          const curryPoolBase = withoutRepeats(compatibleCurries);
          let curryPool = applyFilterPool(curryPoolBase, validatedRules, day, meal_slot, warnings);
          curryPool = applyExclude(curryPool, validatedRules, day, meal_slot, warnings);

          if (curryPool.length > 0) {
            selectedCurry = pickFromPool(curryPool, usageCount)!;
          }
        }

        selectedCurry = applyRequireOne(
          selectedCurry,
          validatedRules,
          compatibleCurries,
          day,
          meal_slot,
          warnings,
          {
            componentType: 'curry',
            overrideLibrary: eligibleCurries,
          },
        );

        if (selectedCurry) {
          usageCount.set(selectedCurry.id, (usageCount.get(selectedCurry.id) ?? 0) + 1);
          markUsed(selectedCurry);
        } else if (compatibleCurries.length === 0) {
          warnings.push({
            slot: { day, meal_slot },
            rule_id: null,
            message: `no compatible curry available for base "${initialSelectedBase.name}" on ${day} ${meal_slot} — skipped`,
          });
        }
      }

      // ── Subzi selection ─────────────────────────────────────────────────────

      let selectedSubzi: ComponentRecord | undefined;
      if (locked?.subzi_id !== undefined) {
        const lockedSubzi = subzis.find(s => s.id === locked.subzi_id);
        if (lockedSubzi) {
          selectedSubzi = lockedSubzi;
          usageCount.set(lockedSubzi.id, (usageCount.get(lockedSubzi.id) ?? 0) + 1);
        }
      } else if (!skipSubzi && subzis.length > 0) {
        const eligible = subzis.filter(s => isOccasionAllowed(s, day));
        const subziPoolBase = withoutRepeats(eligible);
        let subziPool = applyFilterPool(subziPoolBase, validatedRules, day, meal_slot, warnings);
        subziPool = applyExclude(subziPool, validatedRules, day, meal_slot, warnings);

        if (subziPool.length > 0) {
          const picked = applyRequireOne(
            pickFromPool(subziPool, usageCount) ?? undefined,
            validatedRules,
            subzis,
            day,
            meal_slot,
            warnings,
          );
          if (picked) {
            selectedSubzi = picked;
            usageCount.set(picked.id, (usageCount.get(picked.id) ?? 0) + 1);
            markUsed(picked);
          }
        }
      }

      // ── Required specific components ────────────────────────────────────────

      const triggerComponents = [selectedBase, selectedCurry, selectedSubzi].filter(
        (component): component is ComponentRecord => component !== undefined,
      );
      const requiredComponentEntries = getRequiredComponentEntries(
        validatedRules,
        triggerComponents,
        day,
        meal_slot,
      );
      const requiredExtraComponentIds: number[] = [];

      for (const entry of requiredComponentEntries) {
        const requiredComponent = allComponents.find((component) => component.id === entry.componentId);
        if (!requiredComponent) {
          warnRequiredComponentSkipped(
            warnings,
            day,
            meal_slot,
            entry.ruleId,
            entry.componentId,
            'was not found',
          );
          continue;
        }

        if (!isOccasionAllowed(requiredComponent, day)) {
          warnRequiredComponentSkipped(
            warnings,
            day,
            meal_slot,
            entry.ruleId,
            entry.componentId,
            'is not eligible',
          );
          continue;
        }

        if (requiredComponent.componentType === 'base') {
          if (locked?.base_id !== undefined && locked.base_id !== requiredComponent.id) {
            warnRequiredComponentSkipped(
              warnings,
              day,
              meal_slot,
              entry.ruleId,
              entry.componentId,
              'was blocked by a locked base',
            );
            continue;
          }
          selectedBase = requiredComponent;
          selectedBaseId = requiredComponent.id;
          usageCount.set(selectedBaseId, (usageCount.get(selectedBaseId) ?? 0) + 1);
          markUsed(requiredComponent);
          continue;
        }

        if (requiredComponent.componentType === 'curry') {
          if (locked?.curry_id !== undefined && locked.curry_id !== requiredComponent.id) {
            warnRequiredComponentSkipped(
              warnings,
              day,
              meal_slot,
              entry.ruleId,
              entry.componentId,
              'was blocked by a locked curry',
            );
            continue;
          }
          selectedCurry = requiredComponent;
          usageCount.set(requiredComponent.id, (usageCount.get(requiredComponent.id) ?? 0) + 1);
          markUsed(requiredComponent);
          continue;
        }

        if (requiredComponent.componentType === 'subzi') {
          if (locked?.subzi_id !== undefined && locked.subzi_id !== requiredComponent.id) {
            warnRequiredComponentSkipped(
              warnings,
              day,
              meal_slot,
              entry.ruleId,
              entry.componentId,
              'was blocked by a locked subzi',
            );
            continue;
          }
          selectedSubzi = requiredComponent;
          usageCount.set(requiredComponent.id, (usageCount.get(requiredComponent.id) ?? 0) + 1);
          markUsed(requiredComponent);
          continue;
        }

        if (locked?.extra_ids !== undefined && !locked.extra_ids.includes(requiredComponent.id)) {
          warnRequiredComponentSkipped(
            warnings,
            day,
            meal_slot,
            entry.ruleId,
            entry.componentId,
            'was blocked by locked extras',
          );
          continue;
        }
        if (!requiredExtraComponentIds.includes(requiredComponent.id)) {
          requiredExtraComponentIds.push(requiredComponent.id);
        }
      }

      // ── Second pass: composition effects for extras ──────────────────────────

      const finalSlotComponents = [selectedBase, selectedCurry, selectedSubzi].filter(
        (component): component is ComponentRecord => component !== undefined,
      );

      const secondPassEffects = compositionEffectsSecondPass(
        validatedRules, finalSlotComponents, day, meal_slot,
      );

      const requiredExtraCategories = [
        ...new Set(
          secondPassEffects
            .filter((e): e is RequireExtraEffect => e.kind === 'require_extra')
            .flatMap(e => e.category_ids)
            .filter((categoryId) => Number.isFinite(categoryId)),
        ),
      ];

      // ── Extras selection ────────────────────────────────────────────────────

      const eligibleExtras = extras.filter((extra) => isOccasionAllowed(extra, day));

      const selectedExtraIds: number[] = [];

      if (locked?.extra_ids !== undefined) {
        selectedExtraIds.push(...locked.extra_ids);
      } else if (!skipExtras) {
        // Fill required extra categories first
        for (const categoryId of requiredExtraCategories) {
          const candidates = eligibleExtras.filter(
            (extra) => extra.extra_category_id === categoryId && !selectedExtraIds.includes(extra.id),
          );
          if (candidates.length > 0) {
            const picked = weightedRandom(candidates, c => effectiveWeight(c, usageCount));
            selectedExtraIds.push(picked.id);
            usageCount.set(picked.id, (usageCount.get(picked.id) ?? 0) + 1);
          } else {
            warnings.push({
              slot: { day, meal_slot },
              rule_id: null,
              message: `require_extra category_id '${categoryId}' has no eligible extras on ${day} ${meal_slot} — skipped`,
            });
          }
        }

        for (const extraId of requiredExtraComponentIds) {
          if (!selectedExtraIds.includes(extraId)) {
            selectedExtraIds.push(extraId);
            usageCount.set(extraId, (usageCount.get(extraId) ?? 0) + 1);
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
      if (selectedCurry) planSlot.curry_id = selectedCurry.id;
      if (selectedSubzi) planSlot.subzi_id = selectedSubzi.id;

      slots.push(planSlot);
    }
  }

  return { plan: { slots }, warnings };
}
