# Unified Rule System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the three CompiledFilter rule types (no-repeat, scheduling-rule, meal-template) into one unified `CompiledRule` type with a target-first form UX, updating all consumers and adding a Dexie v9 migration.

**Architecture:** New `CompiledRule` type with `Target | RuleScope | AnyEffect[]` replaces the three-variant `CompiledFilter` discriminated union. The generator shifts from type-partitioned buckets to two context functions (`selectionEffectsFor`, `compositionEffectsFor`) operating on `ValidatedRule[]`. The form collapses three field components into one `RuleFields` with target → scope → effects flow.

**Tech Stack:** TypeScript, Next.js 16, Dexie.js v8 (IndexedDB), Zod, React useReducer, shadcn/ui (RadioGroup, Toggle, Checkbox, Combobox)

---

## File Map

| Action | File |
|--------|------|
| Modify | `src/types/plan.ts` — add new types, remove old in Task 10 |
| Modify | `src/db/client.ts` — add Dexie v9 migration, update `RuleRecord` type |
| Modify | `src/services/rule-compiler.ts` — new signature |
| Modify | `src/services/generator.ts` — full refactor |
| Modify | `src/components/rules/types.ts` — new FormState/FormAction |
| Modify | `src/components/rules/RuleForm.tsx` — new reducer, save, presets |
| Modify | `src/components/rules/ruleDescriptions.ts` — handle CompiledRule |
| Modify | `src/components/rules/RuleImpactPreview.tsx` — handle new FormState |
| Create | `src/components/rules/RuleFormFields/RuleFields.tsx` — unified form |
| Delete | `src/components/rules/RuleFormFields/NoRepeatFields.tsx` |
| Delete | `src/components/rules/RuleFormFields/SchedulingRuleFields.tsx` |
| Delete | `src/components/rules/RuleFormFields/MealTemplateFields.tsx` |
| Create | `src/db/migrations.test.ts` — migration unit tests |

---

## Task 1: Add new types to plan.ts

**Files:**
- Modify: `src/types/plan.ts`

- [ ] **Step 1: Write failing type test**

Create `src/types/plan.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { CompiledRuleSchema } from './plan';

describe('CompiledRuleSchema', () => {
  it('validates a no-repeat rule', () => {
    const rule = {
      type: 'rule',
      target: { mode: 'component_type', component_type: 'base' },
      scope: { days: null, slots: null },
      effects: [{ kind: 'no_repeat' }],
    };
    expect(CompiledRuleSchema.safeParse(rule).success).toBe(true);
  });

  it('validates a filter_pool rule with tag target', () => {
    const rule = {
      type: 'rule',
      target: { mode: 'tag', filter: { protein_tag: 'fish' } },
      scope: { days: ['friday'], slots: null },
      effects: [{ kind: 'filter_pool' }],
    };
    expect(CompiledRuleSchema.safeParse(rule).success).toBe(true);
  });

  it('validates a rice template rule with composition effects', () => {
    const rule = {
      type: 'rule',
      target: { mode: 'base_type', base_type: 'rice-based' },
      scope: { days: null, slots: null },
      effects: [
        { kind: 'allowed_slots', slots: ['lunch', 'dinner'] },
        { kind: 'skip_component', component_types: ['curry'] },
        { kind: 'require_extra', categories: ['condiment'] },
      ],
    };
    expect(CompiledRuleSchema.safeParse(rule).success).toBe(true);
  });

  it('rejects unknown effect kind', () => {
    const rule = {
      type: 'rule',
      target: { mode: 'component_type', component_type: 'base' },
      scope: { days: null, slots: null },
      effects: [{ kind: 'unknown_effect' }],
    };
    expect(CompiledRuleSchema.safeParse(rule).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/types/plan.test.ts --reporter verbose
```

Expected: FAIL — `CompiledRuleSchema` is not exported

- [ ] **Step 3: Add new types to plan.ts**

In `src/types/plan.ts`, after the existing `TagFilterSchema` block and before the `CompiledFilter` block, add:

```typescript
// ─── ExtraCategoryEnum (shared) ───────────────────────────────────────────────

const ExtraCategoryEnum = z.enum(['liquid', 'crunchy', 'condiment', 'dairy', 'sweet']);

// ─── Target ───────────────────────────────────────────────────────────────────

export const TargetSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('component_type'), component_type: z.enum(['base', 'curry', 'subzi']) }),
  z.object({ mode: z.literal('tag'), filter: TagFilterSchema }),
  z.object({ mode: z.literal('component'), component_id: z.number() }),
  z.object({ mode: z.literal('base_type'), base_type: z.enum(['rice-based', 'bread-based', 'other']) }),
]);

export type Target = z.infer<typeof TargetSchema>;

// ─── RuleScope ────────────────────────────────────────────────────────────────

export const RuleScopeSchema = z.object({
  days:  z.array(DayOfWeekEnum).nullable(),
  slots: z.array(MealSlotEnum).nullable(),
});

export type RuleScope = z.infer<typeof RuleScopeSchema>;

// ─── Effects ──────────────────────────────────────────────────────────────────

export const EffectSchema = z.discriminatedUnion('kind', [
  // Selection effects (mutually exclusive — at most one per rule)
  z.object({ kind: z.literal('filter_pool') }),
  z.object({ kind: z.literal('require_one') }),
  z.object({ kind: z.literal('exclude') }),
  z.object({ kind: z.literal('no_repeat') }),
  // Placement effect
  z.object({ kind: z.literal('allowed_slots'), slots: z.array(MealSlotEnum) }),
  // Component shape
  z.object({ kind: z.literal('skip_component'), component_types: z.array(z.enum(['curry', 'subzi'])) }),
  // Extra effects
  z.object({ kind: z.literal('exclude_extra'), categories: z.array(ExtraCategoryEnum) }),
  z.object({ kind: z.literal('require_extra'), categories: z.array(ExtraCategoryEnum) }),
]);

export type AnyEffect = z.infer<typeof EffectSchema>;

// Concrete types for each effect variant
export type FilterPoolEffect   = Extract<AnyEffect, { kind: 'filter_pool' }>;
export type RequireOneEffect   = Extract<AnyEffect, { kind: 'require_one' }>;
export type ExcludeEffect      = Extract<AnyEffect, { kind: 'exclude' }>;
export type NoRepeatEffect     = Extract<AnyEffect, { kind: 'no_repeat' }>;
export type AllowedSlotsEffect = Extract<AnyEffect, { kind: 'allowed_slots' }>;
export type SkipComponentEffect = Extract<AnyEffect, { kind: 'skip_component' }>;
export type ExcludeExtraEffect = Extract<AnyEffect, { kind: 'exclude_extra' }>;
export type RequireExtraEffect = Extract<AnyEffect, { kind: 'require_extra' }>;

export type SelectionEffect = FilterPoolEffect | RequireOneEffect | ExcludeEffect | NoRepeatEffect;
export type CompositionEffect = AllowedSlotsEffect | SkipComponentEffect | ExcludeExtraEffect | RequireExtraEffect;

// ─── CompiledRule (unified) ───────────────────────────────────────────────────

export const CompiledRuleSchema = z.object({
  type:    z.literal('rule'),
  target:  TargetSchema,
  scope:   RuleScopeSchema,
  effects: z.array(EffectSchema),
});

export type CompiledRule = z.infer<typeof CompiledRuleSchema>;
```

**Keep all existing `CompiledFilter` types untouched** — they will be removed in Task 10.

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx vitest run src/types/plan.test.ts --reporter verbose
```

Expected: PASS (4 tests)

- [ ] **Step 5: Confirm no TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors (new types are additions only)

- [ ] **Step 6: Commit**

```bash
git add src/types/plan.ts src/types/plan.test.ts
git commit -m "feat: add CompiledRule unified type with Target, RuleScope, AnyEffect"
```

---

## Task 2: Dexie v9 migration

**Files:**
- Modify: `src/db/client.ts`
- Create: `src/db/migrations.test.ts`

- [ ] **Step 1: Write failing migration tests**

Create `src/db/migrations.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { migrateToCompiledRule } from './client';

describe('migrateToCompiledRule', () => {
  it('migrates no-repeat to component_type target + no_repeat effect', () => {
    const input = { type: 'no-repeat', component_type: 'base', within: 'week' };
    expect(migrateToCompiledRule(input)).toEqual({
      type: 'rule',
      target: { mode: 'component_type', component_type: 'base' },
      scope: { days: null, slots: null },
      effects: [{ kind: 'no_repeat' }],
    });
  });

  it('migrates scheduling-rule filter-pool with tag match', () => {
    const input = {
      type: 'scheduling-rule',
      effect: 'filter-pool',
      days: ['friday'],
      slots: null,
      match: { mode: 'tag', filter: { protein_tag: 'fish' } },
    };
    expect(migrateToCompiledRule(input)).toEqual({
      type: 'rule',
      target: { mode: 'tag', filter: { protein_tag: 'fish' } },
      scope: { days: ['friday'], slots: null },
      effects: [{ kind: 'filter_pool' }],
    });
  });

  it('migrates scheduling-rule require-one with component match', () => {
    const input = {
      type: 'scheduling-rule',
      effect: 'require-one',
      days: ['saturday', 'sunday'],
      slots: ['lunch'],
      match: { mode: 'component', component_id: 42 },
    };
    expect(migrateToCompiledRule(input)).toEqual({
      type: 'rule',
      target: { mode: 'component', component_id: 42 },
      scope: { days: ['saturday', 'sunday'], slots: ['lunch'] },
      effects: [{ kind: 'require_one' }],
    });
  });

  it('migrates scheduling-rule exclude with tag match', () => {
    const input = {
      type: 'scheduling-rule',
      effect: 'exclude',
      days: null,
      slots: null,
      match: { mode: 'tag', filter: { dietary_tag: 'non-veg' } },
    };
    expect(migrateToCompiledRule(input)).toEqual({
      type: 'rule',
      target: { mode: 'tag', filter: { dietary_tag: 'non-veg' } },
      scope: { days: null, slots: null },
      effects: [{ kind: 'exclude' }],
    });
  });

  it('migrates meal-template base selector with composition effects', () => {
    const input = {
      type: 'meal-template',
      selector: { mode: 'base', base_type: 'rice-based' },
      days: null,
      slots: null,
      allowed_slots: ['lunch', 'dinner'],
      exclude_component_types: ['curry'],
      exclude_extra_categories: ['sweet'],
      require_extra_category: 'condiment',
    };
    expect(migrateToCompiledRule(input)).toEqual({
      type: 'rule',
      target: { mode: 'base_type', base_type: 'rice-based' },
      scope: { days: null, slots: null },
      effects: [
        { kind: 'allowed_slots', slots: ['lunch', 'dinner'] },
        { kind: 'skip_component', component_types: ['curry'] },
        { kind: 'exclude_extra', categories: ['sweet'] },
        { kind: 'require_extra', categories: ['condiment'] },
      ],
    });
  });

  it('migrates meal-template with null allowed_slots (no placement effect)', () => {
    const input = {
      type: 'meal-template',
      selector: { mode: 'base', base_type: 'bread-based' },
      days: null,
      slots: null,
      allowed_slots: null,
      exclude_component_types: [],
      exclude_extra_categories: [],
      require_extra_category: null,
    };
    const result = migrateToCompiledRule(input) as { effects: unknown[] };
    expect(result.effects).toEqual([]);
  });

  it('migrates meal-template tag selector', () => {
    const input = {
      type: 'meal-template',
      selector: { mode: 'tag', filter: { regional_tag: 'south-indian' } },
      days: null,
      slots: null,
      allowed_slots: null,
      exclude_component_types: ['subzi'],
      exclude_extra_categories: [],
      require_extra_category: null,
    };
    expect(migrateToCompiledRule(input)).toEqual({
      type: 'rule',
      target: { mode: 'tag', filter: { regional_tag: 'south-indian' } },
      scope: { days: null, slots: null },
      effects: [{ kind: 'skip_component', component_types: ['subzi'] }],
    });
  });

  it('passes through already-migrated CompiledRule unchanged', () => {
    const rule = {
      type: 'rule',
      target: { mode: 'component_type', component_type: 'base' },
      scope: { days: null, slots: null },
      effects: [{ kind: 'no_repeat' }],
    };
    expect(migrateToCompiledRule(rule)).toEqual(rule);
  });

  it('passes through unknown types unchanged', () => {
    const unknown = { type: 'unknown-type', data: 'preserved' };
    expect(migrateToCompiledRule(unknown)).toEqual(unknown);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run src/db/migrations.test.ts --reporter verbose
```

Expected: FAIL — `migrateToCompiledRule` not exported from `./client`

- [ ] **Step 3: Add migration function and Dexie v9 to client.ts**

In `src/db/client.ts`, update the import at the top to include `CompiledRule`:

```typescript
import type { CompiledFilter, CompiledRule, WeeklyPlan } from '@/types/plan';
```

Update `RuleRecord` to accept both types during migration transition:

```typescript
export interface RuleRecord {
  id?: number;
  name: string;
  enabled: boolean;
  compiled_filter: CompiledRule;  // changed from CompiledFilter
  created_at: string;
}
```

Add the migration function after `migrateMealTemplateSelector` (before the `export { db }` line):

```typescript
/**
 * Migrate a compiled_filter from v8 (3-variant CompiledFilter) to v9 (unified CompiledRule).
 * Pure function — used by Dexie upgrade and testable independently.
 */
export function migrateToCompiledRule(cf: unknown): unknown {
  if (!cf || typeof cf !== 'object' || !('type' in cf)) return cf;
  const r = cf as Record<string, unknown>;

  // Already migrated
  if (r.type === 'rule') return cf;

  if (r.type === 'no-repeat') {
    return {
      type: 'rule',
      target: { mode: 'component_type', component_type: r.component_type },
      scope: { days: null, slots: null },
      effects: [{ kind: 'no_repeat' }],
    };
  }

  if (r.type === 'scheduling-rule') {
    const match = r.match as Record<string, unknown>;
    const target = match.mode === 'tag'
      ? { mode: 'tag', filter: match.filter }
      : { mode: 'component', component_id: match.component_id };
    const effectKind =
      r.effect === 'filter-pool' ? 'filter_pool' :
      r.effect === 'require-one' ? 'require_one' :
      'exclude';
    return {
      type: 'rule',
      target,
      scope: { days: r.days ?? null, slots: r.slots ?? null },
      effects: [{ kind: effectKind }],
    };
  }

  if (r.type === 'meal-template') {
    const selector = r.selector as Record<string, unknown>;
    const target = selector.mode === 'base'
      ? { mode: 'base_type', base_type: selector.base_type }
      : selector.mode === 'tag'
        ? { mode: 'tag', filter: selector.filter }
        : { mode: 'component', component_id: selector.component_id };

    const effects: unknown[] = [];

    const allowedSlots = r.allowed_slots as string[] | null;
    if (allowedSlots !== null && Array.isArray(allowedSlots) && allowedSlots.length > 0) {
      effects.push({ kind: 'allowed_slots', slots: allowedSlots });
    }

    const excludeTypes = (r.exclude_component_types as string[] | undefined) ?? [];
    if (excludeTypes.length > 0) {
      effects.push({ kind: 'skip_component', component_types: excludeTypes });
    }

    const excludeExtras = (r.exclude_extra_categories as string[] | undefined) ?? [];
    if (excludeExtras.length > 0) {
      effects.push({ kind: 'exclude_extra', categories: excludeExtras });
    }

    if (r.require_extra_category !== null && r.require_extra_category !== undefined) {
      effects.push({ kind: 'require_extra', categories: [r.require_extra_category] });
    }

    return {
      type: 'rule',
      target,
      scope: { days: r.days ?? null, slots: r.slots ?? null },
      effects,
    };
  }

  return cf; // Unknown type — pass through
}

db.version(9).stores({
  components: '++id, componentType, base_type, extra_category, *dietary_tags, *regional_tags, *occasion_tags',
  meals: '++id, base_id, curry_id, subzi_id',
  meal_extras: '[meal_id+component_id], meal_id, component_id',
  rules: '++id',
  saved_plans: '++id, week_start',
  preferences: 'id',
  active_plan: 'id',
}).upgrade(tx => {
  return tx.table('rules').toCollection().modify(rule => {
    rule.compiled_filter = migrateToCompiledRule(rule.compiled_filter);
  });
});
```

- [ ] **Step 4: Run migration tests**

```bash
npx vitest run src/db/migrations.test.ts --reporter verbose
```

Expected: PASS (9 tests)

- [ ] **Step 5: Check TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: Errors in `generator.ts` because it now receives `CompiledRule` but still references `CompiledFilter` types. These are expected and fixed in Tasks 3–4.

- [ ] **Step 6: Commit**

```bash
git add src/db/client.ts src/db/migrations.test.ts
git commit -m "feat: Dexie v9 migration — convert all rules to unified CompiledRule format"
```

---

## Task 3: Refactor generator — infrastructure

**Files:**
- Modify: `src/services/generator.ts`

The generator currently uses `CompiledFilter` and `CompiledFilterSchema`. This task updates the validation loop, introduces `ValidatedRule`, and adds the two core matching helpers. It does **not** yet change the selection/composition logic.

- [ ] **Step 1: Write failing helper tests**

In `src/services/generator.test.ts`, add at the top of the file inside the existing describe block (or at the end of the file):

```typescript
// ─── targetMatches tests ──────────────────────────────────────────────────────
describe('targetMatches', () => {
  // targetMatches is not exported — test via generate() behavior in existing tests
  // These tests validate via integration: see existing "filter-pool" and "no-repeat" tests
});
```

(The helpers will be tested through existing integration tests after the refactor.)

- [ ] **Step 2: Update generator imports and types**

Replace the import block at the top of `src/services/generator.ts`:

```typescript
import { getAllComponents, getPreferences, getEnabledRules } from '@/services/food-db';
import type { ComponentRecord, BaseType } from '@/types/component';
import type { UserPreferencesRecord, MealSlot } from '@/types/preferences';
import type { RuleRecord } from '@/db/client';
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
  type ExcludeExtraEffect,
  type RequireExtraEffect,
  type TagFilter,
  type GeneratorResult,
  type PlanSlot,
  type Warning,
} from '@/types/plan';
```

Add the `ValidatedRule` type after the imports:

```typescript
// ─── ValidatedRule ────────────────────────────────────────────────────────────

interface ValidatedRule {
  compiled: CompiledRule;
  id: number;
}
```

- [ ] **Step 3: Add targetMatches and scopeMatches helpers**

Replace the `isRuleApplicable` function with two new helpers:

```typescript
// ─── Helper: targetMatches ────────────────────────────────────────────────────

function targetMatches(target: Target, component: ComponentRecord): boolean {
  switch (target.mode) {
    case 'component_type':
      return component.componentType === target.component_type;
    case 'tag':
      return matchesTagFilter(component, target.filter);
    case 'component':
      return component.id === target.component_id;
    case 'base_type':
      return component.componentType === 'base' && component.base_type === target.base_type;
  }
}

// ─── Helper: scopeMatches ─────────────────────────────────────────────────────

function scopeMatches(scope: RuleScope, day: DayOfWeek, slot: MealSlot): boolean {
  if (scope.days !== null && !scope.days.includes(day)) return false;
  if (scope.slots !== null && !scope.slots.includes(slot)) return false;
  return true;
}
```

- [ ] **Step 4: Update the validation loop**

In the `generate()` function, replace:

```typescript
// Old:
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
```

With:

```typescript
// New:
const validatedRules: ValidatedRule[] = [];
for (const ruleRecord of enabledRules) {
  const parsed = CompiledRuleSchema.safeParse(ruleRecord.compiled_filter);
  if (parsed.success) {
    validatedRules.push({ compiled: parsed.data, id: ruleRecord.id! });
  } else {
    warnings.push({
      slot: { day: 'monday', meal_slot: 'breakfast' },
      rule_id: ruleRecord.id ?? null,
      message: `Invalid rule "${ruleRecord.name}" skipped — Zod validation failed`,
    });
  }
}
```

- [ ] **Step 5: Update the rule bucket extraction**

Replace the old partitioning block:

```typescript
// Old:
const mealTemplateRules = validRules.filter(r => r.type === 'meal-template') as MealTemplateRule[];
const noRepeatBase  = validRules.some(r => r.type === 'no-repeat' && r.component_type === 'base');
const noRepeatCurry = validRules.some(r => r.type === 'no-repeat' && r.component_type === 'curry');
const noRepeatSubzi = validRules.some(r => r.type === 'no-repeat' && r.component_type === 'subzi');
```

With:

```typescript
// New:
const noRepeatBase = validatedRules.some(r =>
  r.compiled.target.mode === 'component_type' &&
  r.compiled.target.component_type === 'base' &&
  r.compiled.effects.some(e => e.kind === 'no_repeat'),
);
const noRepeatCurry = validatedRules.some(r =>
  r.compiled.target.mode === 'component_type' &&
  r.compiled.target.component_type === 'curry' &&
  r.compiled.effects.some(e => e.kind === 'no_repeat'),
);
const noRepeatSubzi = validatedRules.some(r =>
  r.compiled.target.mode === 'component_type' &&
  r.compiled.target.component_type === 'subzi' &&
  r.compiled.effects.some(e => e.kind === 'no_repeat'),
);
```

- [ ] **Step 6: Run existing generator tests to check baseline**

```bash
npx vitest run src/services/generator.test.ts --reporter verbose 2>&1 | tail -30
```

Expected: Some tests fail (expected — `applicableSchedulingRules` still references old types). Note how many pass vs fail to track progress.

- [ ] **Step 7: Commit**

```bash
git add src/services/generator.ts
git commit -m "refactor(generator): introduce ValidatedRule, targetMatches, scopeMatches"
```

---

## Task 4: Refactor generator — selection effects

**Files:**
- Modify: `src/services/generator.ts`

Replace the five selection-effect helpers (`applySchedulingFilterPool`, `applySchedulingExclude`, `applyRequireOneByTag`, `applyRequireOneByComponent`, `getMealTemplateAllowedSlots`) with three new ones, and rewrite the per-slot selection loops.

- [ ] **Step 1: Add new selection effect helpers**

Replace `applySchedulingFilterPool`, `applySchedulingExclude`, `applyRequireOneByTag`, `applyRequireOneByComponent` with:

```typescript
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
function applyRequireOne(
  selected: ComponentRecord,
  rules: ValidatedRule[],
  fullLibrary: ComponentRecord[],
  day: DayOfWeek,
  slot: MealSlot,
  warnings: Warning[],
): ComponentRecord {
  const requireRules = rules.filter(r =>
    scopeMatches(r.compiled.scope, day, slot) &&
    r.compiled.effects.some(e => e.kind === 'require_one'),
  );
  for (const r of requireRules) {
    if (targetMatches(r.compiled.target, selected)) continue; // already satisfied
    const candidates = fullLibrary.filter(c => targetMatches(r.compiled.target, c));
    if (candidates.length === 0) {
      warnings.push({
        slot: { day, meal_slot: slot },
        rule_id: r.id,
        message: `require_one: no component in library matches target on ${day} ${slot} — skipped`,
      });
      continue;
    }
    // Uniform random (not weighted) — explicit requirement override
    return candidates[Math.floor(Math.random() * candidates.length)];
  }
  return selected;
}
```

- [ ] **Step 2: Rewrite getEligibleBases**

Replace the existing `getEligibleBases` function:

```typescript
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
    // allowed_slots from rules (replaces both prefs.base_type_slots and meal-template allowed_slots)
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
```

- [ ] **Step 3: Rewrite the base selection block in the main loop**

Find the base selection block (from `// ── Base selection ──` to just before `// Track base usage`) and replace with:

```typescript
      // ── Base selection ──────────────────────────────────────────────────────

      let eligibleBases = getEligibleBases(meal_slot, bases, validatedRules, warnings, day);
      let selectedBase: ComponentRecord | null = null;

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
        const noRepeatPool = noRepeatBase
          ? eligibleBases.filter(b => !usedBaseIds.has(b.id!))
          : eligibleBases;
        let basePool = noRepeatPool.length > 0 ? noRepeatPool : eligibleBases;

        // Selection effects
        basePool = applyFilterPool(basePool, validatedRules, day, meal_slot, warnings);
        basePool = applyExclude(basePool, validatedRules, day, meal_slot, warnings);

        selectedBase = weightedRandom(basePool, c => effectiveWeight(c, usageCount));
        selectedBase = applyRequireOne(selectedBase, validatedRules, bases, day, meal_slot, warnings);
      }
```

- [ ] **Step 4: Rewrite the curry selection block**

Replace the curry selection block (from `// ── Curry selection ──` to `// ── Subzi selection ──`) with:

```typescript
      // ── Curry selection ─────────────────────────────────────────────────────

      let selectedCurry: ComponentRecord | undefined;
      if (locked?.curry_id !== undefined) {
        const lockedCurry = curries.find(c => c.id === locked.curry_id);
        if (lockedCurry) {
          selectedCurry = lockedCurry;
          usageCount.set(lockedCurry.id!, (usageCount.get(lockedCurry.id!) ?? 0) + 1);
        }
      } else if (!skipCurry && curries.length > 0) {
        const eligible = curries.filter(c => isOccasionAllowed(c, day));
        const curryPoolBase = noRepeatCurry
          ? eligible.filter(c => !usedCurryIds.has(c.id!))
          : eligible;
        let curryPool = applyFilterPool(curryPoolBase, validatedRules, day, meal_slot, warnings);
        curryPool = applyExclude(curryPool, validatedRules, day, meal_slot, warnings);

        if (curryPool.length > 0) {
          let picked = pickFromPool(curryPool, usageCount)!;
          picked = applyRequireOne(picked, validatedRules, curries, day, meal_slot, warnings);
          selectedCurry = picked;
          usageCount.set(picked.id!, (usageCount.get(picked.id!) ?? 0) + 1);
          if (noRepeatCurry) usedCurryIds.add(picked.id!);
        }
      }
```

- [ ] **Step 5: Rewrite the subzi selection block**

Replace the subzi selection block (from `// ── Subzi selection ──` to `// ── Second pass: match component-mode templates ──`) with:

```typescript
      // ── Subzi selection ─────────────────────────────────────────────────────

      let selectedSubzi: ComponentRecord | undefined;
      if (locked?.subzi_id !== undefined) {
        const lockedSubzi = subzis.find(s => s.id === locked.subzi_id);
        if (lockedSubzi) {
          selectedSubzi = lockedSubzi;
          usageCount.set(lockedSubzi.id!, (usageCount.get(lockedSubzi.id!) ?? 0) + 1);
        }
      } else if (!skipSubzi && subzis.length > 0) {
        const eligible = subzis.filter(s => isOccasionAllowed(s, day));
        const subziPoolBase = noRepeatSubzi
          ? eligible.filter(s => !usedSubziIds.has(s.id!))
          : eligible;
        let subziPool = applyFilterPool(subziPoolBase, validatedRules, day, meal_slot, warnings);
        subziPool = applyExclude(subziPool, validatedRules, day, meal_slot, warnings);

        if (subziPool.length > 0) {
          let picked = pickFromPool(subziPool, usageCount)!;
          picked = applyRequireOne(picked, validatedRules, subzis, day, meal_slot, warnings);
          selectedSubzi = picked;
          usageCount.set(picked.id!, (usageCount.get(picked.id!) ?? 0) + 1);
          if (noRepeatSubzi) usedSubziIds.add(picked.id!);
        }
      }
```

- [ ] **Step 6: Run generator tests**

```bash
npx vitest run src/services/generator.test.ts --reporter verbose 2>&1 | tail -30
```

Expected: Selection effect tests pass; composition effect tests may still fail.

- [ ] **Step 7: Commit**

```bash
git add src/services/generator.ts
git commit -m "refactor(generator): replace scheduling-rule helpers with unified selection effects"
```

---

## Task 5: Refactor generator — composition effects

**Files:**
- Modify: `src/services/generator.ts`

Replace `getApplicableMealTemplates`, `selectorMatches`, `selectorMatchesForSlotAssignment` with two composition context helpers, then rewrite the composition and extras blocks.

- [ ] **Step 1: Add composition context helpers**

Replace `selectorMatches`, `selectorMatchesForSlotAssignment`, `getApplicableMealTemplates` with:

```typescript
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
 * Second pass (after all components selected): find exclude_extra and require_extra
 * effects from rules whose target matches ANY component in the slot.
 */
function compositionEffectsSecondPass(
  rules: ValidatedRule[],
  base: ComponentRecord,
  slotComponentIds: number[],
  day: DayOfWeek,
  slot: MealSlot,
): AnyEffect[] {
  return rules
    .filter(r => {
      if (!scopeMatches(r.compiled.scope, day, slot)) return false;
      const t = r.compiled.target;
      if (t.mode === 'component') {
        return slotComponentIds.includes(t.component_id);
      }
      return targetMatches(t, base);
    })
    .flatMap(r => r.compiled.effects)
    .filter(e => e.kind === 'exclude_extra' || e.kind === 'require_extra');
}
```

- [ ] **Step 2: Update the skip_component block**

The `skipCurry` / `skipSubzi` flags are currently derived from `baseTemplates.flatMap(t => t.exclude_component_types)`. Replace with:

```typescript
      // ── Meal composition constraints (first pass) ────────────────────────────

      const firstPassEffects = compositionEffectsFirstPass(
        validatedRules, selectedBase, day, meal_slot,
      );
      const skippedComponentTypes = new Set(
        firstPassEffects
          .filter((e): e is SkipComponentEffect => e.kind === 'skip_component')
          .flatMap(e => e.component_types),
      );
      const skipCurry = skippedComponentTypes.has('curry');
      const skipSubzi = skippedComponentTypes.has('subzi');
```

- [ ] **Step 3: Update the second pass and extras block**

Replace the second-pass template block and extras selection:

```typescript
      // ── Second pass: composition effects for extras ──────────────────────────

      const slotComponentIds: number[] = [selectedBase.id!];
      if (selectedCurry?.id !== undefined) slotComponentIds.push(selectedCurry.id);
      if (selectedSubzi?.id !== undefined) slotComponentIds.push(selectedSubzi.id);

      const secondPassEffects = compositionEffectsSecondPass(
        validatedRules, selectedBase, slotComponentIds, day, meal_slot,
      );

      const excludedExtraCategories = new Set(
        secondPassEffects
          .filter((e): e is ExcludeExtraEffect => e.kind === 'exclude_extra')
          .flatMap(e => e.categories),
      );

      const requiredExtraCategories = [
        ...new Set(
          secondPassEffects
            .filter((e): e is RequireExtraEffect => e.kind === 'require_extra')
            .flatMap(e => e.categories),
        ),
      ];

      // ── Extras selection ────────────────────────────────────────────────────

      const maxExtras = resolvedPrefs.extra_quantity_limits[meal_slot] ?? 2;
      const selectedBaseType = selectedBase.base_type as BaseType | undefined;

      let eligibleExtras = extras.filter(e => {
        if (!selectedBaseType) return true;
        if (!(e.compatible_base_types ?? []).includes(selectedBaseType)) return false;
        return isOccasionAllowed(e, day);
      });

      if (excludedExtraCategories.size > 0) {
        const filtered = eligibleExtras.filter(e => !excludedExtraCategories.has(e.extra_category!));
        if (filtered.length === 0 && eligibleExtras.length > 0) {
          warnings.push({
            slot: { day, meal_slot },
            rule_id: null,
            message: `exclude_extra removed all eligible extras for ${selectedBaseType ?? 'unknown'} on ${day} ${meal_slot} — constraint relaxed`,
          });
        } else {
          eligibleExtras = filtered;
        }
      }

      const selectedExtraIds: number[] = [];

      if (locked?.extra_ids !== undefined) {
        selectedExtraIds.push(...locked.extra_ids);
      } else {
        // Fill required extra categories first
        for (const category of requiredExtraCategories) {
          const candidates = eligibleExtras.filter(
            e => e.extra_category === category && !selectedExtraIds.includes(e.id!),
          );
          if (candidates.length > 0) {
            const picked = weightedRandom(candidates, c => effectiveWeight(c, usageCount));
            selectedExtraIds.push(picked.id!);
            usageCount.set(picked.id!, (usageCount.get(picked.id!) ?? 0) + 1);
          } else {
            warnings.push({
              slot: { day, meal_slot },
              rule_id: null,
              message: `require_extra category '${category}' has no eligible extras on ${day} ${meal_slot} — skipped`,
            });
          }
        }

        // Random fill remaining slots
        const remaining = maxExtras - selectedExtraIds.length;
        if (remaining > 0 && eligibleExtras.length > 0) {
          const pool = eligibleExtras.filter(e => !selectedExtraIds.includes(e.id!));
          const tempPool = [...pool];
          for (let i = 0; i < remaining && tempPool.length > 0; i++) {
            const picked = weightedRandom(tempPool, c => effectiveWeight(c, usageCount));
            selectedExtraIds.push(picked.id!);
            usageCount.set(picked.id!, (usageCount.get(picked.id!) ?? 0) + 1);
            tempPool.splice(tempPool.findIndex(c => c.id === picked.id), 1);
          }
        }
      }
```

- [ ] **Step 4: Remove the now-unused `selectedBaseType` declaration at the old location**

In the old code, `selectedBaseType` was declared after tracking base usage:
```typescript
const selectedBaseType = selectedBase.base_type as BaseType | undefined;
```
This must be removed since it's now declared inside the extras block. The `Track base usage` block becomes:

```typescript
      // Track base usage
      const selectedBaseId = selectedBase.id!;
      usageCount.set(selectedBaseId, (usageCount.get(selectedBaseId) ?? 0) + 1);
      if (noRepeatBase) usedBaseIds.add(selectedBaseId);
```

- [ ] **Step 5: Run full generator tests**

```bash
npx vitest run src/services/generator.test.ts --reporter verbose
```

Expected: All generator tests pass.

- [ ] **Step 6: Run full test suite**

```bash
npx vitest run --reporter verbose 2>&1 | tail -20
```

Expected: All previously passing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add src/services/generator.ts
git commit -m "refactor(generator): replace meal-template helpers with unified composition effects"
```

---

## Task 6: Update form types and rule compiler

**Files:**
- Modify: `src/components/rules/types.ts`
- Modify: `src/services/rule-compiler.ts`

- [ ] **Step 1: Write failing compiler test**

In `src/services/rule-compiler.test.ts` (create if it doesn't exist):

```typescript
import { describe, it, expect } from 'vitest';
import { compileRule } from './rule-compiler';
import type { RuleFormState } from '@/components/rules/types';

describe('compileRule', () => {
  it('compiles a no-repeat rule', () => {
    const state: RuleFormState = {
      name: 'No repeat base',
      target: { mode: 'component_type', component_type: 'base' },
      days: [], slots: [],
      selection: 'no_repeat',
      allowed_slots: [], skip_component_types: [],
      exclude_extra_categories: [], require_extra_categories: [],
    };
    expect(compileRule(state)).toEqual({
      type: 'rule',
      target: { mode: 'component_type', component_type: 'base' },
      scope: { days: null, slots: null },
      effects: [{ kind: 'no_repeat' }],
    });
  });

  it('compiles a filter_pool rule with days scope', () => {
    const state: RuleFormState = {
      name: 'Fish Fridays',
      target: { mode: 'tag', filter: { protein_tag: 'fish' } },
      days: ['friday'], slots: [],
      selection: 'filter_pool',
      allowed_slots: [], skip_component_types: [],
      exclude_extra_categories: [], require_extra_categories: [],
    };
    expect(compileRule(state)).toEqual({
      type: 'rule',
      target: { mode: 'tag', filter: { protein_tag: 'fish' } },
      scope: { days: ['friday'], slots: null },
      effects: [{ kind: 'filter_pool' }],
    });
  });

  it('compiles a rice template with multiple effects', () => {
    const state: RuleFormState = {
      name: 'Rice rules',
      target: { mode: 'base_type', base_type: 'rice-based' },
      days: [], slots: [],
      selection: '',
      allowed_slots: ['lunch', 'dinner'],
      skip_component_types: ['curry'],
      exclude_extra_categories: [],
      require_extra_categories: ['condiment', 'liquid'],
    };
    expect(compileRule(state)).toEqual({
      type: 'rule',
      target: { mode: 'base_type', base_type: 'rice-based' },
      scope: { days: null, slots: null },
      effects: [
        { kind: 'allowed_slots', slots: ['lunch', 'dinner'] },
        { kind: 'skip_component', component_types: ['curry'] },
        { kind: 'require_extra', categories: ['condiment', 'liquid'] },
      ],
    });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run src/services/rule-compiler.test.ts --reporter verbose
```

Expected: FAIL — `RuleFormState` not found, `compileRule` signature mismatch

- [ ] **Step 3: Replace types.ts**

Replace the entire contents of `src/components/rules/types.ts`:

```typescript
import type { DayOfWeek, TagFilter } from '@/types/plan';
import type { MealSlot } from '@/types/preferences';
import type { ExtraCategory } from '@/types/component';

// ─── Target form state ────────────────────────────────────────────────────────

export type TargetFormState =
  | { mode: 'component_type'; component_type: '' | 'base' | 'curry' | 'subzi' }
  | { mode: 'tag'; filter: TagFilter }
  | { mode: 'component'; component_id: number | null }
  | { mode: 'base_type'; base_type: '' | 'rice-based' | 'bread-based' | 'other' }
  | { mode: '' };

// ─── Unified Rule Form State ──────────────────────────────────────────────────

export type RuleFormState = {
  name: string;
  target: TargetFormState;
  // Scope
  days: DayOfWeek[];
  slots: MealSlot[];
  // Selection effect (at most one)
  selection: 'filter_pool' | 'require_one' | 'exclude' | 'no_repeat' | '';
  // Composition effects
  allowed_slots: MealSlot[];
  skip_component_types: ('curry' | 'subzi')[];
  exclude_extra_categories: ExtraCategory[];
  require_extra_categories: ExtraCategory[];
};

// Keep FormState as alias for backwards compat with RuleImpactPreview (removed in Task 9)
export type FormState = RuleFormState;

// ─── Form Actions ─────────────────────────────────────────────────────────────

export type FormAction =
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_TARGET_MODE'; mode: 'component_type' | 'tag' | 'component' | 'base_type' }
  | { type: 'SET_TARGET_COMPONENT_TYPE'; component_type: 'base' | 'curry' | 'subzi' }
  | { type: 'SET_TARGET_TAG_FILTER'; filter: TagFilter }
  | { type: 'SET_TARGET_COMPONENT_ID'; component_id: number | null }
  | { type: 'SET_TARGET_BASE_TYPE'; base_type: 'rice-based' | 'bread-based' | 'other' }
  | { type: 'SET_DAYS'; days: DayOfWeek[] }
  | { type: 'SET_SLOTS'; slots: MealSlot[] }
  | { type: 'SET_SELECTION'; selection: 'filter_pool' | 'require_one' | 'exclude' | 'no_repeat' | '' }
  | { type: 'SET_ALLOWED_SLOTS'; allowed_slots: MealSlot[] }
  | { type: 'SET_SKIP_COMPONENT_TYPES'; skip_component_types: ('curry' | 'subzi')[] }
  | { type: 'SET_EXCLUDE_EXTRA_CATEGORIES'; categories: ExtraCategory[] }
  | { type: 'SET_REQUIRE_EXTRA_CATEGORIES'; categories: ExtraCategory[] }
  | { type: 'LOAD_PRESET'; state: RuleFormState };
```

- [ ] **Step 4: Replace rule-compiler.ts**

Replace the entire contents of `src/services/rule-compiler.ts`:

```typescript
import type { RuleFormState } from '@/components/rules/types';
import type { CompiledRule, Target } from '@/types/plan';

export function compileRule(state: RuleFormState): CompiledRule {
  // Build target
  const tf = state.target;
  let target: Target;
  if (tf.mode === 'component_type') {
    target = { mode: 'component_type', component_type: tf.component_type as 'base' | 'curry' | 'subzi' };
  } else if (tf.mode === 'tag') {
    target = { mode: 'tag', filter: tf.filter };
  } else if (tf.mode === 'component') {
    target = { mode: 'component', component_id: tf.component_id! };
  } else if (tf.mode === 'base_type') {
    target = { mode: 'base_type', base_type: tf.base_type as 'rice-based' | 'bread-based' | 'other' };
  } else {
    throw new Error('compileRule called with empty target mode');
  }

  const effects: CompiledRule['effects'] = [];

  if (state.selection !== '') {
    effects.push({ kind: state.selection });
  }

  if (state.allowed_slots.length > 0) {
    effects.push({ kind: 'allowed_slots', slots: state.allowed_slots });
  }

  if (state.skip_component_types.length > 0) {
    effects.push({ kind: 'skip_component', component_types: state.skip_component_types });
  }

  if (state.exclude_extra_categories.length > 0) {
    effects.push({ kind: 'exclude_extra', categories: state.exclude_extra_categories });
  }

  if (state.require_extra_categories.length > 0) {
    effects.push({ kind: 'require_extra', categories: state.require_extra_categories });
  }

  return {
    type: 'rule',
    target,
    scope: {
      days:  state.days.length  > 0 ? state.days  : null,
      slots: state.slots.length > 0 ? state.slots : null,
    },
    effects,
  };
}
```

- [ ] **Step 5: Run compiler tests**

```bash
npx vitest run src/services/rule-compiler.test.ts --reporter verbose
```

Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/rules/types.ts src/services/rule-compiler.ts src/services/rule-compiler.test.ts
git commit -m "feat: unified RuleFormState and updated compileRule for CompiledRule"
```

---

## Task 7: Create unified RuleFields component

**Files:**
- Create: `src/components/rules/RuleFormFields/RuleFields.tsx`

- [ ] **Step 1: Create the file**

Create `src/components/rules/RuleFormFields/RuleFields.tsx`:

```tsx
'use client';

import * as React from 'react';
import type { Dispatch } from 'react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Toggle } from '@/components/ui/toggle';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronsUpDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLiveQuery } from 'dexie-react-hooks';
import { getAllComponents } from '@/services/food-db';
import { ALL_DAYS } from '@/types/plan';
import type { RuleFormState, FormAction, TargetFormState } from '../types';
import type { TagFilter } from '@/types/plan';
import type { MealSlot } from '@/types/preferences';
import type { ExtraCategory } from '@/types/component';

const ALL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];
const EXTRA_CATEGORIES: ExtraCategory[] = ['liquid', 'crunchy', 'condiment', 'dairy', 'sweet'];
const TAG_DIETARY = ['veg', 'non-veg', 'vegan', 'jain', 'eggetarian'] as const;
const TAG_PROTEIN = ['fish', 'chicken', 'mutton', 'egg', 'paneer', 'dal', 'none'] as const;
const TAG_REGIONAL = ['south-indian', 'north-indian', 'coastal-konkan', 'pan-indian'] as const;
const TAG_OCCASION = ['everyday', 'weekday', 'weekend', 'fasting', 'festive', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

interface Props {
  state: RuleFormState;
  dispatch: Dispatch<FormAction>;
}

// ─── Tag filter grid ──────────────────────────────────────────────────────────

function TagFilterGrid({ filter, onChange }: { filter: TagFilter; onChange: (f: TagFilter) => void }) {
  return (
    <div className="space-y-3">
      {/* Dietary */}
      <div>
        <p className="text-xs text-muted-foreground mb-1">Dietary</p>
        <div className="flex flex-wrap gap-1">
          {TAG_DIETARY.map(t => (
            <Toggle key={t} size="sm" pressed={filter.dietary_tag === t}
              onPressedChange={p => onChange({ ...filter, dietary_tag: p ? t : undefined })}>
              {t}
            </Toggle>
          ))}
        </div>
      </div>
      {/* Protein */}
      <div>
        <p className="text-xs text-muted-foreground mb-1">Protein</p>
        <div className="flex flex-wrap gap-1">
          {TAG_PROTEIN.map(t => (
            <Toggle key={t} size="sm" pressed={filter.protein_tag === t}
              onPressedChange={p => onChange({ ...filter, protein_tag: p ? t : undefined })}>
              {t}
            </Toggle>
          ))}
        </div>
      </div>
      {/* Regional */}
      <div>
        <p className="text-xs text-muted-foreground mb-1">Regional</p>
        <div className="flex flex-wrap gap-1">
          {TAG_REGIONAL.map(t => (
            <Toggle key={t} size="sm" pressed={filter.regional_tag === t}
              onPressedChange={p => onChange({ ...filter, regional_tag: p ? t : undefined })}>
              {t}
            </Toggle>
          ))}
        </div>
      </div>
      {/* Occasion */}
      <div>
        <p className="text-xs text-muted-foreground mb-1">Occasion</p>
        <div className="flex flex-wrap gap-1">
          {TAG_OCCASION.map(t => (
            <Toggle key={t} size="sm" pressed={filter.occasion_tag === t}
              onPressedChange={p => onChange({ ...filter, occasion_tag: p ? t : undefined })}>
              {t}
            </Toggle>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Component picker ─────────────────────────────────────────────────────────

function ComponentPicker({ value, onChange }: { value: number | null; onChange: (id: number | null) => void }) {
  const [open, setOpen] = React.useState(false);
  const allComponents = useLiveQuery(() => getAllComponents()) ?? [];
  const selected = allComponents.find(c => c.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between">
          {selected ? selected.name : 'Select component...'}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0">
        <Command>
          <CommandInput placeholder="Search components..." />
          <CommandEmpty>No component found.</CommandEmpty>
          <CommandGroup className="max-h-64 overflow-y-auto">
            {allComponents.map(c => (
              <CommandItem key={c.id} value={c.name}
                onSelect={() => { onChange(c.id!); setOpen(false); }}>
                <Check className={cn('mr-2 h-4 w-4', value === c.id ? 'opacity-100' : 'opacity-0')} />
                <span>{c.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">{c.componentType}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── Target section ───────────────────────────────────────────────────────────

function TargetSection({ state, dispatch }: Props) {
  const target = state.target;

  return (
    <div className="space-y-3">
      <Label>Target — what are you constraining?</Label>
      <RadioGroup
        value={target.mode}
        onValueChange={v => dispatch({ type: 'SET_TARGET_MODE', mode: v as 'component_type' | 'tag' | 'component' | 'base_type' })}
        className="space-y-1"
      >
        {(['component_type', 'tag', 'component', 'base_type'] as const).map(mode => (
          <div key={mode} className="flex items-center space-x-2">
            <RadioGroupItem value={mode} id={`target-${mode}`} />
            <Label htmlFor={`target-${mode}`} className="font-normal cursor-pointer">
              {mode === 'component_type' && 'All bases / curries / subzis'}
              {mode === 'tag' && 'By tag'}
              {mode === 'component' && 'Specific component'}
              {mode === 'base_type' && 'Base type'}
            </Label>
          </div>
        ))}
      </RadioGroup>

      {/* Sub-options */}
      {target.mode === 'component_type' && (
        <RadioGroup
          value={target.component_type}
          onValueChange={v => dispatch({ type: 'SET_TARGET_COMPONENT_TYPE', component_type: v as 'base' | 'curry' | 'subzi' })}
          className="flex gap-4 pt-1"
        >
          {(['base', 'curry', 'subzi'] as const).map(ct => (
            <div key={ct} className="flex items-center space-x-2">
              <RadioGroupItem value={ct} id={`ct-${ct}`} />
              <Label htmlFor={`ct-${ct}`} className="font-normal cursor-pointer capitalize">{ct}</Label>
            </div>
          ))}
        </RadioGroup>
      )}

      {target.mode === 'tag' && (
        <TagFilterGrid
          filter={target.filter}
          onChange={f => dispatch({ type: 'SET_TARGET_TAG_FILTER', filter: f })}
        />
      )}

      {target.mode === 'component' && (
        <ComponentPicker
          value={target.component_id}
          onChange={id => dispatch({ type: 'SET_TARGET_COMPONENT_ID', component_id: id })}
        />
      )}

      {target.mode === 'base_type' && (
        <RadioGroup
          value={target.base_type}
          onValueChange={v => dispatch({ type: 'SET_TARGET_BASE_TYPE', base_type: v as 'rice-based' | 'bread-based' | 'other' })}
          className="flex gap-4 pt-1"
        >
          {(['rice-based', 'bread-based', 'other'] as const).map(bt => (
            <div key={bt} className="flex items-center space-x-2">
              <RadioGroupItem value={bt} id={`bt-${bt}`} />
              <Label htmlFor={`bt-${bt}`} className="font-normal cursor-pointer">{bt}</Label>
            </div>
          ))}
        </RadioGroup>
      )}
    </div>
  );
}

// ─── Scope section ────────────────────────────────────────────────────────────

function ScopeSection({ state, dispatch }: Props) {
  const allDaysActive = state.days.length === 0;
  const allSlotsActive = state.slots.length === 0;

  return (
    <div className="space-y-3">
      <Label>Scope <span className="text-muted-foreground font-normal">(defaults to all days, all slots)</span></Label>

      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Days</p>
        <div className="flex flex-wrap gap-1">
          {ALL_DAYS.map(d => (
            <Toggle key={d} size="sm"
              pressed={state.days.includes(d)}
              onPressedChange={p => {
                const next = p ? [...state.days, d] : state.days.filter(x => x !== d);
                dispatch({ type: 'SET_DAYS', days: next });
              }}>
              {d.slice(0, 3)}
            </Toggle>
          ))}
        </div>
        {!allDaysActive && (
          <button className="text-xs text-muted-foreground underline" onClick={() => dispatch({ type: 'SET_DAYS', days: [] })}>
            Clear (all days)
          </button>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Slots</p>
        <div className="flex gap-1">
          {ALL_SLOTS.map(s => (
            <Toggle key={s} size="sm"
              pressed={state.slots.includes(s)}
              onPressedChange={p => {
                const next = p ? [...state.slots, s] : state.slots.filter(x => x !== s);
                dispatch({ type: 'SET_SLOTS', slots: next });
              }}>
              {s}
            </Toggle>
          ))}
        </div>
        {!allSlotsActive && (
          <button className="text-xs text-muted-foreground underline" onClick={() => dispatch({ type: 'SET_SLOTS', slots: [] })}>
            Clear (all slots)
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Effects section ──────────────────────────────────────────────────────────

function EffectsSection({ state, dispatch }: Props) {
  const SELECTION_OPTIONS = [
    { value: '', label: 'None' },
    { value: 'filter_pool', label: 'Filter pool — only allow matching components in scope' },
    { value: 'require_one', label: 'Require one — always include a matching component' },
    { value: 'exclude', label: 'Exclude — never include matching components' },
    { value: 'no_repeat', label: 'No-repeat — don\'t reuse the same component across the week' },
  ] as const;

  const toggleSkipType = (ct: 'curry' | 'subzi') => {
    const next = state.skip_component_types.includes(ct)
      ? state.skip_component_types.filter(x => x !== ct)
      : [...state.skip_component_types, ct];
    dispatch({ type: 'SET_SKIP_COMPONENT_TYPES', skip_component_types: next });
  };

  const toggleExcludeExtra = (cat: ExtraCategory) => {
    const next = state.exclude_extra_categories.includes(cat)
      ? state.exclude_extra_categories.filter(x => x !== cat)
      : [...state.exclude_extra_categories, cat];
    dispatch({ type: 'SET_EXCLUDE_EXTRA_CATEGORIES', categories: next });
  };

  const toggleRequireExtra = (cat: ExtraCategory) => {
    const next = state.require_extra_categories.includes(cat)
      ? state.require_extra_categories.filter(x => x !== cat)
      : [...state.require_extra_categories, cat];
    dispatch({ type: 'SET_REQUIRE_EXTRA_CATEGORIES', categories: next });
  };

  return (
    <div className="space-y-5">
      {/* Selection */}
      <div className="space-y-2">
        <Label>Selection</Label>
        <RadioGroup
          value={state.selection}
          onValueChange={v => dispatch({ type: 'SET_SELECTION', selection: v as RuleFormState['selection'] })}
          className="space-y-1"
        >
          {SELECTION_OPTIONS.map(opt => (
            <div key={opt.value} className="flex items-center space-x-2">
              <RadioGroupItem value={opt.value} id={`sel-${opt.value || 'none'}`} />
              <Label htmlFor={`sel-${opt.value || 'none'}`} className="font-normal cursor-pointer">{opt.label}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      {/* When this target appears */}
      <div className="space-y-4 border-t pt-4">
        <Label className="text-sm font-medium">When this target appears</Label>

        {/* Restrict to slots */}
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Restrict to slots</p>
          <div className="flex gap-1">
            {ALL_SLOTS.map(s => (
              <Toggle key={s} size="sm"
                pressed={state.allowed_slots.includes(s)}
                onPressedChange={p => {
                  const next = p ? [...state.allowed_slots, s] : state.allowed_slots.filter(x => x !== s);
                  dispatch({ type: 'SET_ALLOWED_SLOTS', allowed_slots: next });
                }}>
                {s}
              </Toggle>
            ))}
          </div>
        </div>

        {/* Skip component types */}
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Skip component types</p>
          <div className="flex gap-4">
            {(['curry', 'subzi'] as const).map(ct => (
              <div key={ct} className="flex items-center space-x-2">
                <Checkbox id={`skip-${ct}`}
                  checked={state.skip_component_types.includes(ct)}
                  onCheckedChange={() => toggleSkipType(ct)} />
                <Label htmlFor={`skip-${ct}`} className="font-normal cursor-pointer capitalize">{ct}</Label>
              </div>
            ))}
          </div>
        </div>

        {/* Exclude extra categories */}
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Exclude extra categories</p>
          <div className="flex flex-wrap gap-2">
            {EXTRA_CATEGORIES.map(cat => (
              <div key={cat} className="flex items-center space-x-2">
                <Checkbox id={`excl-${cat}`}
                  checked={state.exclude_extra_categories.includes(cat)}
                  onCheckedChange={() => toggleExcludeExtra(cat)} />
                <Label htmlFor={`excl-${cat}`} className="font-normal cursor-pointer">{cat}</Label>
              </div>
            ))}
          </div>
        </div>

        {/* Require extra categories */}
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Require extra categories</p>
          <div className="flex flex-wrap gap-2">
            {EXTRA_CATEGORIES.map(cat => (
              <div key={cat} className="flex items-center space-x-2">
                <Checkbox id={`req-${cat}`}
                  checked={state.require_extra_categories.includes(cat)}
                  onCheckedChange={() => toggleRequireExtra(cat)} />
                <Label htmlFor={`req-${cat}`} className="font-normal cursor-pointer">{cat}</Label>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function RuleFields({ state, dispatch }: Props) {
  const targetSet = state.target.mode !== '';

  return (
    <div className="space-y-6">
      <TargetSection state={state} dispatch={dispatch} />
      {targetSet && (
        <>
          <ScopeSection state={state} dispatch={dispatch} />
          <EffectsSection state={state} dispatch={dispatch} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep RuleFields
```

Expected: No errors for RuleFields.tsx

- [ ] **Step 3: Commit**

```bash
git add src/components/rules/RuleFormFields/RuleFields.tsx
git commit -m "feat: unified RuleFields component (target → scope → effects)"
```

---

## Task 8: Rewrite RuleForm

**Files:**
- Modify: `src/components/rules/RuleForm.tsx`

- [ ] **Step 1: Replace RuleForm.tsx entirely**

```tsx
'use client';

import * as React from 'react';
import { useReducer, useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { compileRule } from '@/services/rule-compiler';
import { addRule } from '@/services/food-db';
import { RuleFields } from './RuleFormFields/RuleFields';
import { RuleImpactPreview } from './RuleImpactPreview';
import type { RuleFormState, FormAction } from './types';

// ─── Example presets ──────────────────────────────────────────────────────────

const EXAMPLE_PRESETS: Record<string, RuleFormState> = {
  'fish-fridays': {
    name: 'Fish Fridays',
    target: { mode: 'tag', filter: { protein_tag: 'fish' } },
    days: ['friday'], slots: [],
    selection: 'require_one',
    allowed_slots: [], skip_component_types: [],
    exclude_extra_categories: [], require_extra_categories: [],
  },
  'no-repeat-subzi': {
    name: 'No repeat subzi',
    target: { mode: 'component_type', component_type: 'subzi' },
    days: [], slots: [],
    selection: 'no_repeat',
    allowed_slots: [], skip_component_types: [],
    exclude_extra_categories: [], require_extra_categories: [],
  },
  'weekend-special': {
    name: 'Weekend special',
    target: { mode: 'tag', filter: { occasion_tag: 'weekend' } },
    days: ['saturday', 'sunday'], slots: [],
    selection: 'filter_pool',
    allowed_slots: [], skip_component_types: [],
    exclude_extra_categories: [], require_extra_categories: [],
  },
  'no-paneer-weekdays': {
    name: 'No paneer weekdays',
    target: { mode: 'tag', filter: { protein_tag: 'paneer' } },
    days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'], slots: [],
    selection: 'exclude',
    allowed_slots: [], skip_component_types: [],
    exclude_extra_categories: [], require_extra_categories: [],
  },
  'rice-lunch-dinner': {
    name: 'Rice: lunch and dinner only',
    target: { mode: 'base_type', base_type: 'rice-based' },
    days: [], slots: [],
    selection: '',
    allowed_slots: ['lunch', 'dinner'],
    skip_component_types: [], exclude_extra_categories: [], require_extra_categories: [],
  },
};

// ─── Initial state ────────────────────────────────────────────────────────────

const initialState: RuleFormState = {
  name: '',
  target: { mode: '' },
  days: [], slots: [],
  selection: '',
  allowed_slots: [], skip_component_types: [],
  exclude_extra_categories: [], require_extra_categories: [],
};

// ─── Reducer ──────────────────────────────────────────────────────────────────

function formReducer(state: RuleFormState, action: FormAction): RuleFormState {
  switch (action.type) {
    case 'SET_NAME':
      return { ...state, name: action.name };

    case 'SET_TARGET_MODE': {
      const mode = action.mode;
      const base: Omit<RuleFormState, 'target'> = {
        name: state.name, days: state.days, slots: state.slots,
        selection: state.selection, allowed_slots: state.allowed_slots,
        skip_component_types: state.skip_component_types,
        exclude_extra_categories: state.exclude_extra_categories,
        require_extra_categories: state.require_extra_categories,
      };
      if (mode === 'component_type') return { ...base, target: { mode, component_type: '' } };
      if (mode === 'tag')            return { ...base, target: { mode, filter: {} } };
      if (mode === 'component')      return { ...base, target: { mode, component_id: null } };
      if (mode === 'base_type')      return { ...base, target: { mode, base_type: '' } };
      return state;
    }

    case 'SET_TARGET_COMPONENT_TYPE':
      if (state.target.mode === 'component_type')
        return { ...state, target: { mode: 'component_type', component_type: action.component_type } };
      return state;

    case 'SET_TARGET_TAG_FILTER':
      if (state.target.mode === 'tag')
        return { ...state, target: { mode: 'tag', filter: action.filter } };
      return state;

    case 'SET_TARGET_COMPONENT_ID':
      if (state.target.mode === 'component')
        return { ...state, target: { mode: 'component', component_id: action.component_id } };
      return state;

    case 'SET_TARGET_BASE_TYPE':
      if (state.target.mode === 'base_type')
        return { ...state, target: { mode: 'base_type', base_type: action.base_type } };
      return state;

    case 'SET_DAYS':   return { ...state, days: action.days };
    case 'SET_SLOTS':  return { ...state, slots: action.slots };
    case 'SET_SELECTION': return { ...state, selection: action.selection };
    case 'SET_ALLOWED_SLOTS': return { ...state, allowed_slots: action.allowed_slots };
    case 'SET_SKIP_COMPONENT_TYPES': return { ...state, skip_component_types: action.skip_component_types };
    case 'SET_EXCLUDE_EXTRA_CATEGORIES': return { ...state, exclude_extra_categories: action.categories };
    case 'SET_REQUIRE_EXTRA_CATEGORIES': return { ...state, require_extra_categories: action.categories };
    case 'LOAD_PRESET': return action.state;

    default: return state;
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────

function isFormValid(state: RuleFormState): boolean {
  if (state.name.trim() === '') return false;
  const t = state.target;
  if (t.mode === '') return false;
  if (t.mode === 'component_type' && t.component_type === '') return false;
  if (t.mode === 'tag' && !Object.values(t.filter).some(v => v !== undefined)) return false;
  if (t.mode === 'component' && t.component_id === null) return false;
  if (t.mode === 'base_type' && t.base_type === '') return false;
  // At least one effect
  return (
    state.selection !== '' ||
    state.allowed_slots.length > 0 ||
    state.skip_component_types.length > 0 ||
    state.exclude_extra_categories.length > 0 ||
    state.require_extra_categories.length > 0
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RuleForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, dispatch] = useReducer(formReducer, initialState);
  const [saving, setSaving] = useState(false);
  const presetLoadedRef = useRef(false);

  useEffect(() => {
    if (presetLoadedRef.current) return;
    const preset = searchParams.get('preset');
    if (preset && EXAMPLE_PRESETS[preset]) {
      dispatch({ type: 'LOAD_PRESET', state: EXAMPLE_PRESETS[preset] });
      presetLoadedRef.current = true;
    }
  }, [searchParams]);

  const handleSave = async () => {
    if (!isFormValid(state) || saving) return;
    setSaving(true);
    try {
      const compiled = compileRule(state);
      await addRule({
        name: state.name.trim(),
        enabled: true,
        compiled_filter: compiled,
        created_at: new Date().toISOString(),
      });
      router.push('/rules');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="px-4 py-8 sm:px-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/rules"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="text-[28px] font-semibold font-heading">New Rule</h1>
      </div>

      <form onSubmit={e => { e.preventDefault(); handleSave(); }} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="rule-name">Rule name</Label>
          <Input
            id="rule-name"
            placeholder="e.g. Fish Fridays"
            value={state.name}
            onChange={e => dispatch({ type: 'SET_NAME', name: e.target.value })}
          />
        </div>

        <RuleFields state={state} dispatch={dispatch} />

        {state.target.mode !== '' && <RuleImpactPreview formState={state} />}

        <Button type="submit" disabled={!isFormValid(state) || saving}>
          {saving ? 'Saving...' : 'Save Rule'}
        </Button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep -E "RuleForm|RuleFields" | head -10
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/rules/RuleForm.tsx
git commit -m "feat: rewrite RuleForm with unified target-first form"
```

---

## Task 9: Update ruleDescriptions and RuleImpactPreview

**Files:**
- Modify: `src/components/rules/ruleDescriptions.ts`
- Modify: `src/components/rules/RuleImpactPreview.tsx`
- Modify: `src/components/rules/ruleDescriptions.test.ts`

- [ ] **Step 1: Replace ruleDescriptions.ts**

```typescript
import type { CompiledRule, Target, AnyEffect } from '@/types/plan'

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatDays(days: string[] | null): string {
  if (!days || days.length === 0) return 'all days'
  return days.map(capitalize).join(', ')
}

function formatSlotsSuffix(slots: string[] | null): string {
  if (!slots || slots.length === 0) return ''
  return ` (${slots.join(', ')})`
}

function describeTarget(target: Target): string {
  switch (target.mode) {
    case 'component_type':
      return `all ${target.component_type}s`
    case 'tag': {
      const parts = Object.entries(target.filter)
        .filter(([, v]) => Boolean(v))
        .map(([k, v]) => `${k.replace('_tag', '')}: ${v}`)
      return parts.length > 0 ? parts.join(', ') : 'any tag'
    }
    case 'component':
      return `component #${target.component_id}`
    case 'base_type':
      return capitalize(target.base_type)
  }
}

function describeEffects(effects: AnyEffect[]): string {
  const parts: string[] = []

  const selection = effects.find(e =>
    e.kind === 'filter_pool' || e.kind === 'require_one' ||
    e.kind === 'exclude' || e.kind === 'no_repeat',
  )
  if (selection) {
    const labels: Record<string, string> = {
      filter_pool: 'Filter pool', require_one: 'Require one',
      exclude: 'Exclude', no_repeat: 'No-repeat',
    }
    parts.push(labels[selection.kind] ?? selection.kind)
  }

  for (const e of effects) {
    if (e.kind === 'allowed_slots')
      parts.push(`allowed at ${e.slots.join(', ')}`)
    if (e.kind === 'skip_component')
      parts.push(`skip ${e.component_types.join(', ')}`)
    if (e.kind === 'exclude_extra')
      parts.push(`exclude ${e.categories.join(', ')} extras`)
    if (e.kind === 'require_extra')
      parts.push(`require ${e.categories.join(', ')} extra`)
  }

  return parts.join('; ')
}

export function describeRule(rule: CompiledRule): string {
  const targetLabel = describeTarget(rule.target)
  const daysPart = rule.scope.days && rule.scope.days.length > 0
    ? ` on ${formatDays(rule.scope.days)}`
    : ''
  const slotsSuffix = formatSlotsSuffix(rule.scope.slots)
  const effectsLabel = describeEffects(rule.effects)

  if (!effectsLabel) return `${targetLabel}${daysPart}${slotsSuffix}`
  return `${targetLabel}${daysPart}${slotsSuffix}: ${effectsLabel}`
}
```

- [ ] **Step 2: Update ruleDescriptions.test.ts**

Replace the existing test file content (adapting existing tests to use `CompiledRule` format):

```typescript
import { describe, it, expect } from 'vitest'
import { describeRule } from './ruleDescriptions'
import type { CompiledRule } from '@/types/plan'

function rule(partial: Omit<CompiledRule, 'type'>): CompiledRule {
  return { type: 'rule', ...partial }
}

describe('describeRule', () => {
  it('describes a no-repeat rule', () => {
    expect(describeRule(rule({
      target: { mode: 'component_type', component_type: 'base' },
      scope: { days: null, slots: null },
      effects: [{ kind: 'no_repeat' }],
    }))).toBe('all bases: No-repeat')
  })

  it('describes a filter_pool rule with tag and day scope', () => {
    expect(describeRule(rule({
      target: { mode: 'tag', filter: { protein_tag: 'fish' } },
      scope: { days: ['friday'], slots: null },
      effects: [{ kind: 'filter_pool' }],
    }))).toBe('protein: fish on Friday: Filter pool')
  })

  it('describes an exclude rule with component target', () => {
    expect(describeRule(rule({
      target: { mode: 'component', component_id: 5 },
      scope: { days: null, slots: ['breakfast'] },
      effects: [{ kind: 'exclude' }],
    }))).toBe('component #5 (breakfast): Exclude')
  })

  it('describes a rice template with composition effects', () => {
    expect(describeRule(rule({
      target: { mode: 'base_type', base_type: 'rice-based' },
      scope: { days: null, slots: null },
      effects: [
        { kind: 'allowed_slots', slots: ['lunch', 'dinner'] },
        { kind: 'skip_component', component_types: ['curry'] },
        { kind: 'require_extra', categories: ['condiment'] },
      ],
    }))).toBe('Rice-based: allowed at lunch, dinner; skip curry; require condiment extra')
  })

  it('describes a rule with no effects', () => {
    expect(describeRule(rule({
      target: { mode: 'base_type', base_type: 'bread-based' },
      scope: { days: null, slots: null },
      effects: [],
    }))).toBe('Bread-based')
  })
})
```

- [ ] **Step 3: Update RuleImpactPreview.tsx**

Replace `src/components/rules/RuleImpactPreview.tsx`:

```tsx
'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { TriangleAlert as TriangleAlertIcon } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getAllComponents } from '@/services/food-db';
import type { RuleFormState } from './types';

interface RuleImpactPreviewProps {
  formState: RuleFormState;
}

export function RuleImpactPreview({ formState }: RuleImpactPreviewProps) {
  const allComponents = useLiveQuery(() => getAllComponents()) ?? [];

  const impact = useMemo(() => {
    const target = formState.target;
    if (target.mode === '') return null;

    if (target.mode === 'component_type') {
      const count = allComponents.filter(c => c.componentType === target.component_type).length;
      return { type: 'count' as const, count, label: `${target.component_type}s` };
    }

    if (target.mode === 'tag') {
      const f = target.filter;
      const matchCount = allComponents.filter(c => {
        const dietaryOk = !f.dietary_tag  || c.dietary_tags.includes(f.dietary_tag);
        const proteinOk = !f.protein_tag  || c.protein_tag === f.protein_tag;
        const regionalOk = !f.regional_tag || c.regional_tags.includes(f.regional_tag);
        const occasionOk = !f.occasion_tag || c.occasion_tags.includes(f.occasion_tag);
        return dietaryOk && proteinOk && regionalOk && occasionOk;
      }).length;
      return { type: 'tag_count' as const, matchCount, total: allComponents.length };
    }

    if (target.mode === 'component') {
      if (target.component_id === null) return null;
      const name = allComponents.find(c => c.id === target.component_id)?.name ?? 'Unknown';
      return { type: 'component' as const, name };
    }

    if (target.mode === 'base_type') {
      const count = allComponents.filter(
        c => c.componentType === 'base' && c.base_type === target.base_type,
      ).length;
      return { type: 'base_type' as const, count, base_type: target.base_type };
    }

    return null;
  }, [allComponents, formState]);

  if (!impact) return null;

  return (
    <div className="space-y-3">
      {impact.type === 'count' && (
        <p className="text-sm text-muted-foreground">
          This rule targets {impact.count} {impact.label}.
        </p>
      )}
      {impact.type === 'tag_count' && (
        <>
          <p className="text-sm text-muted-foreground">
            This rule affects {impact.matchCount} of {impact.total} components.
          </p>
          {impact.matchCount === 0 && (
            <Alert className="border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-700">
              <TriangleAlertIcon className="h-4 w-4" />
              <AlertDescription>
                Warning: This rule matches 0 components. The generator will ignore it.
              </AlertDescription>
            </Alert>
          )}
        </>
      )}
      {impact.type === 'component' && (
        <p className="text-sm text-muted-foreground">This rule applies to {impact.name}.</p>
      )}
      {impact.type === 'base_type' && (
        <p className="text-sm text-muted-foreground">
          This rule applies to {impact.count} {impact.base_type} bases.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run description tests**

```bash
npx vitest run src/components/rules/ruleDescriptions.test.ts --reporter verbose
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/rules/ruleDescriptions.ts src/components/rules/ruleDescriptions.test.ts src/components/rules/RuleImpactPreview.tsx
git commit -m "feat: update ruleDescriptions and RuleImpactPreview for CompiledRule"
```

---

## Task 10: Cleanup

**Files:**
- Delete: `src/components/rules/RuleFormFields/NoRepeatFields.tsx`
- Delete: `src/components/rules/RuleFormFields/SchedulingRuleFields.tsx`
- Delete: `src/components/rules/RuleFormFields/MealTemplateFields.tsx`
- Modify: `src/types/plan.ts` — remove old types
- Modify: `src/components/rules/types.ts` — remove `FormState` alias

- [ ] **Step 1: Delete old field components**

```bash
rm src/components/rules/RuleFormFields/NoRepeatFields.tsx
rm src/components/rules/RuleFormFields/SchedulingRuleFields.tsx
rm src/components/rules/RuleFormFields/MealTemplateFields.tsx
```

- [ ] **Step 2: Remove old types from plan.ts**

In `src/types/plan.ts`, delete:
- The entire `CompiledFilterSchema` block (lines starting with `export const CompiledFilterSchema = z.discriminatedUnion(...)`)
- The `CompiledFilter` type alias
- The `NoRepeatRule`, `SchedulingRule`, `MealTemplateRule` type aliases
- The `RuleDefinition` type

Also remove the now-unused suppression comments for `_DietaryTag`, `_ProteinTag`, `_RegionalTag`, `_OccasionTag` if these are now directly used by `TagFilterSchema`.

Also remove the internal `ExtraCategoryEnum` if it was only used by the old schema (it's now used by `EffectSchema` so keep it, but remove the `// Suppress unused type import warnings` block if the imported types are used properly by Zod inference now).

- [ ] **Step 3: Remove FormState alias from types.ts**

In `src/components/rules/types.ts`, remove:

```typescript
// Keep FormState as alias for backwards compat with RuleImpactPreview (removed in Task 9)
export type FormState = RuleFormState;
```

- [ ] **Step 4: Update client.ts import**

In `src/db/client.ts`, update the import to remove `CompiledFilter`:

```typescript
import type { CompiledRule, WeeklyPlan } from '@/types/plan';
```

- [ ] **Step 5: Check for any remaining references to old types**

```bash
grep -r "CompiledFilter\|NoRepeatRule\|SchedulingRule\|MealTemplateRule\|RuleDefinition\|NoRepeatFields\|SchedulingRuleFields\|MealTemplateFields" src/ --include="*.ts" --include="*.tsx" -l
```

Expected: No output (all references removed)

- [ ] **Step 6: Full TypeScript check**

```bash
npx tsc --noEmit 2>&1
```

Expected: No errors

- [ ] **Step 7: Run full test suite**

```bash
npx vitest run --reporter verbose 2>&1 | tail -30
```

Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: remove old CompiledFilter types and field components — unified rule system complete"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|-----------------|-----------|
| Target: component_type / tag / component / base_type | Task 1 (types), Task 6 (form), Task 7 (RuleFields) |
| Scope: days / slots | Task 1 (types), Task 6 (form) |
| SelectionEffect discriminated union | Task 1 (types) |
| CompositionEffect with plural array payloads | Task 1 (types) |
| CompiledRule = type + target + scope + effects | Task 1 (types) |
| Dexie v9 migration — all 10 rule type conversions | Task 2 |
| Generator: two context functions | Task 4 + 5 |
| Generator: effect application order | Task 4 (selection), Task 5 (composition) |
| Generator: ValidatedRule with ID (fixes JSON.stringify) | Task 3 |
| Form: target-first, one unified component | Task 7 (RuleFields) |
| Form: scope collapsed by default | Task 7 (ScopeSection) |
| Form: selection radio + composition toggles | Task 7 (EffectsSection) |
| Three old field components removed | Task 10 |
| ruleDescriptions updated | Task 9 |
| RuleImpactPreview updated | Task 9 |

**Type consistency check:** `RuleFormState` defined in Task 6 and used by Tasks 7, 8, 9. `compileRule` takes `RuleFormState` → `CompiledRule`. `CompiledRule` defined in Task 1 and used throughout. `ValidatedRule` defined in Task 3 and used in Tasks 4, 5. All consistent.

**No placeholders:** All steps contain complete code or exact shell commands.
