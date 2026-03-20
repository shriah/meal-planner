# Phase 3: Plan Generator + Rule Engine - Research

**Researched:** 2026-03-20
**Domain:** Pure TypeScript service layer — generation algorithm, rule DSL, weighted random, Dexie reads, Vitest unit tests
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- No LLM at any point in Phase 3. Rule compiler is a pure local TypeScript function that accepts structured `RuleDefinition` input and emits `CompiledFilter` JSON. LLM natural-language rule parsing is an optional Phase 5 enhancement only.
- CompiledFilter DSL is a typed discriminated union with exactly three rule types: `DayFilterRule`, `NoRepeatRule`, `RequireComponentRule`.
- Rules stored in existing `rules` Dexie table as `{ id, name, enabled, compiled_filter: CompiledFilter, created_at }`. Generator queries only `enabled: true` rules.
- Slot fill order: all 7 breakfasts, then all 7 lunches, then all 7 dinners (Mon→Sun within each meal).
- Weight formula: `effective_weight = frequency_weight × 0.5^(times_used_so_far_this_week)`. Frequency weights: `frequent=3`, `normal=1`, `rare=0.3`.
- No-repeat tracks `usedSubziIds`, `usedCurryIds`, `usedBaseIds` as `Set<number>` within the current generation pass. Within-week only.
- Over-constrained: rules are soft constraints (pick best partial match + emit Warning). Slot restrictions are hard constraints.
- Generator returns `{ plan: WeeklyPlan, warnings: Warning[] }`. Always returns a fully populated 21-slot plan.
- `frequency: 'frequent' | 'normal' | 'rare'` field added to `ComponentRecord`. Generator reads `component.frequency ?? 'normal'` as safe fallback.
- 20+ unit tests required covering all rule types, extra compatibility, mandatory extras, over-constrained, frequency weighting, recency halving, and 500ms performance gate.

### Claude's Discretion
- Exact Zod schema for CompiledFilter types (for runtime validation of rule records)
- Whether weighted random uses reservoir sampling or a cumulative probability approach
- Test fixture design (mocked Dexie vs. real fake-indexeddb)
- File structure: one `generator.ts` + one `rule-compiler.ts`, or a single `plan-engine.ts`

### Deferred Ideas (OUT OF SCOPE)
- LLM natural language rule parsing
- Cross-week rotation rules (RULE-07)
- User-assigned numeric weights (1–10)
- Seasonal/occasion rules (RULE-06)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PLAN-01 | Generate a 7-day (Mon–Sun) plan with breakfast, lunch, and dinner slots | Generation algorithm section; slot fill order; WeeklyPlan type |
| PLAN-04 | Generator only assigns Extras that are compatible with the selected Base type | Extra compatibility filtering via `compatible_base_types`; mandatory extras via `BaseTypeRule.required_extra_category` |
| RULE-02 | Rule compiler is a pure local TypeScript function (structured input → CompiledFilter JSON) | Rule compiler service design; Zod validation for CompiledFilter |
| RULE-03 | Day-based rules are supported (target specific day or days) | `DayFilterRule` DSL type; day+slot targeting axes |
| RULE-04 | Rotation/no-repeat rules are supported (within a week) | `NoRepeatRule` DSL type; `Set<number>` per-component-type tracking during generation |
</phase_requirements>

---

## Summary

Phase 3 delivers two pure TypeScript services and their Vitest unit tests. The **generator** (`src/services/generator.ts`) is an async function that reads components, preferences, and enabled rules from Dexie then produces a fully populated 21-slot `WeeklyPlan` using weighted random selection. The **rule compiler** (`src/services/rule-compiler.ts`) is a synchronous function that converts a structured `RuleDefinition` form object into a `CompiledFilter` JSON value ready for storage.

Both services have zero React dependencies. The generator is the most algorithmically complex piece: it must enforce slot eligibility from `UserPreferences`, apply three rule types as soft constraints, track within-week component usage for no-repeat and recency weighting, handle mandatory extras for `other` base types, and always return a fully populated plan even when over-constrained (emitting warnings instead of failing).

The existing codebase (Phase 1–2) provides all necessary data-layer plumbing: `getAllComponents()`, `getExtrasByBaseType()`, `getPreferences()` in `food-db.ts`; the `rules` Dexie table in `db/client.ts`; and the `fake-indexeddb` + Vitest test infrastructure. Phase 3 adds a `getRules()` function to `food-db.ts`, a `frequency` field to `ComponentRecord`, a typed `RuleRecord` replacement in `db/client.ts`, and the two new service files with their tests.

**Primary recommendation:** Separate files (`generator.ts` + `rule-compiler.ts`) with a shared `src/types/plan.ts` for `CompiledFilter`, `WeeklyPlan`, `PlanSlot`, `Warning`, `GeneratorResult`, and `RuleDefinition`. Use cumulative-probability weighted random (verified correct and performant). Use Zod `z.discriminatedUnion` (confirmed available in installed Zod 4.3.6) for runtime validation of CompiledFilter when reading from Dexie. Test with real `fake-indexeddb` (already wired via `src/test/setup.ts`) rather than mocking — it eliminates mock drift and matches the established test pattern.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ^5 (installed) | Type-safe service layer | Project standard; discriminated unions and `z.infer<>` are the safety net |
| Dexie | 4.3.0 (installed) | IndexedDB reads from generator | Already used throughout; `getAllComponents()`, `getPreferences()`, `getRules()` |
| Zod | 4.3.6 (installed) | Runtime validation of CompiledFilter JSON read from Dexie | Prevents bad persisted data crashing the generator silently |
| Vitest | 4.1.0 (installed) | Unit test framework | Already configured with `fake-indexeddb/auto` setup |
| fake-indexeddb | 6.2.5 (installed) | Browser-free Dexie in tests | Already wired in `src/test/setup.ts`; used in all Phase 1-2 tests |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | — | — | No new dependencies needed; all required libraries are already installed |

**Installation:** No new packages required. All libraries already in `node_modules`.

**Version verification (confirmed against local node_modules):**
- `zod`: 4.3.6
- `vitest`: 4.1.0
- `dexie`: 4.3.0
- `fake-indexeddb`: 6.2.5

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── types/
│   ├── component.ts       # Existing — ADD frequency field
│   └── plan.ts            # NEW — CompiledFilter, RuleDefinition, WeeklyPlan, PlanSlot, Warning, GeneratorResult
├── db/
│   └── client.ts          # Existing — UPDATE RuleRecord to typed shape
├── services/
│   ├── food-db.ts         # Existing — ADD getRules(), addRule(), updateRule(), deleteRule()
│   ├── generator.ts       # NEW — generate(options?) → Promise<GeneratorResult>
│   ├── generator.test.ts  # NEW — 20+ unit tests
│   ├── rule-compiler.ts   # NEW — compileRule(def: RuleDefinition) → CompiledFilter
│   └── rule-compiler.test.ts # NEW — compiler unit tests
```

### Pattern 1: Typed CompiledFilter with Zod Discriminated Union

**What:** Define CompiledFilter as a TypeScript discriminated union in `src/types/plan.ts` with a matching Zod schema for runtime validation when reading from Dexie.

**When to use:** At rule-read time in the generator — call `CompiledFilterSchema.safeParse(row.compiled_filter)` before using a rule. Skip rules that fail validation and emit a warning rather than crashing.

**Example:**
```typescript
// src/types/plan.ts
import { z } from 'zod';
import type { DayOfWeek, MealSlot } from './preferences'; // MealSlot already exists

export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

const TagFilterSchema = z.object({
  dietary_tag: z.enum(['veg', 'non-veg', 'vegan', 'jain', 'eggetarian']).optional(),
  protein_tag: z.enum(['fish', 'chicken', 'mutton', 'egg', 'paneer', 'dal', 'none']).optional(),
  regional_tag: z.enum(['south-indian', 'north-indian', 'coastal-konkan', 'pan-indian']).optional(),
  occasion_tag: z.enum(['everyday', 'fasting', 'festive', 'weekend']).optional(),
});

const DayOfWeekEnum = z.enum(['monday','tuesday','wednesday','thursday','friday','saturday','sunday']);
const MealSlotEnum = z.enum(['breakfast','lunch','dinner']);

export const CompiledFilterSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('day-filter'),
    days: z.array(DayOfWeekEnum),
    slots: z.array(MealSlotEnum).nullable(),
    filter: TagFilterSchema,
  }),
  z.object({
    type: z.literal('no-repeat'),
    component_type: z.enum(['base', 'curry', 'subzi']),
    within: z.literal('week'),
  }),
  z.object({
    type: z.literal('require-component'),
    component_id: z.number(),
    days: z.array(DayOfWeekEnum),
    slots: z.array(MealSlotEnum).nullable(),
  }),
]);

export type CompiledFilter = z.infer<typeof CompiledFilterSchema>;
export type TagFilter = z.infer<typeof TagFilterSchema>;
```

**Source:** Verified against installed Zod 4.3.6 — `z.discriminatedUnion` exports confirmed, parse result validated in test run.

### Pattern 2: Cumulative-Probability Weighted Random

**What:** Compute total weight of candidate pool, pick a random value in [0, total), iterate subtracting weights until remainder hits zero or less. O(n) time, no sorting required.

**When to use:** Every slot fill — select base, then curry, then subzi, then each extra category.

**Example:**
```typescript
// Source: verified correct by local Node.js test run (10,000 iterations, A:B ratio = 3.03 vs expected 3)
function weightedRandom<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total === 0) return items[Math.floor(Math.random() * items.length)]; // fallback: uniform random
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1]; // float rounding safety
}
```

**Performance:** 21-slot simulation runs in < 1ms pure sync. DB read is the only meaningful cost; the 500ms gate is achievable.

### Pattern 3: Generator State — No-Repeat and Recency Tracking

**What:** Maintain mutable state during a single generation pass. Separate concerns: `Set<number>` per component type for no-repeat enforcement; `Map<number, number>` for usage counts driving recency weight.

**Example:**
```typescript
// Internal generator state — reset per generate() call, not persisted
const usedBaseIds = new Set<number>();
const usedCurryIds = new Set<number>();
const usedSubziIds = new Set<number>();
const usageCount = new Map<number, number>(); // componentId → times assigned this week

function getUsageCount(id: number): number {
  return usageCount.get(id) ?? 0;
}

function recordUsage(id: number): void {
  usageCount.set(id, getUsageCount(id) + 1);
}

function effectiveWeight(component: ComponentRecord): number {
  const freqWeight = component.frequency === 'frequent' ? 3
    : component.frequency === 'rare' ? 0.3
    : 1; // 'normal' or undefined (fallback)
  return freqWeight * Math.pow(0.5, getUsageCount(component.id!));
}
```

### Pattern 4: Over-Constrained Slot Handling

**What:** When no candidate satisfies all active rules, score candidates by partial rule satisfaction (count of rules satisfied) and pick the highest-scoring one. Emit a `Warning` for the relaxed rule(s).

**When to use:** Any slot where rule-filtered pool is empty. Never leave a slot empty — always produce a plan.

**Example:**
```typescript
function pickWithFallback(
  allCandidates: ComponentRecord[],
  ruleFilteredCandidates: ComponentRecord[],
  violatedRuleIds: number[],
  slot: { day: DayOfWeek; meal_slot: MealSlot },
  warnings: Warning[],
): ComponentRecord {
  if (ruleFilteredCandidates.length > 0) {
    return weightedPick(ruleFilteredCandidates);
  }
  // Soft constraint relaxation — pick best from full pool
  for (const ruleId of violatedRuleIds) {
    warnings.push({ slot, rule_id: ruleId, message: `Rule ${ruleId} relaxed — no eligible candidates` });
  }
  return weightedPick(allCandidates); // guaranteed non-empty (slot restriction pre-check)
}
```

### Pattern 5: Slot Eligibility from UserPreferences

**What:** For each (day, meal_slot) combination, determine eligible `BaseType` values by consulting `base_type_slots` (which meal slots allow each base type) and `component_slot_overrides` (specific component-level overrides). This is a hard constraint.

**Example:**
```typescript
function eligibleBaseTypes(
  slot: MealSlot,
  prefs: UserPreferencesRecord,
  allBaseComponents: ComponentRecord[],
): ComponentRecord[] {
  const { base_type_slots, component_slot_overrides } = prefs.slot_restrictions;

  return allBaseComponents.filter(base => {
    // Check component-level override first
    if (base.id !== undefined && component_slot_overrides[base.id]) {
      return component_slot_overrides[base.id].includes(slot);
    }
    // Fall back to base_type_slots
    const allowed = base.base_type ? base_type_slots[base.base_type] : undefined;
    return allowed ? allowed.includes(slot) : true; // no restriction = allowed everywhere
  });
}
```

### Pattern 6: Mandatory Extra Enforcement

**What:** After selecting extras via weighted random, check `BaseTypeRule.required_extra_category` for the selected base's type. If required category has zero selected extras, force-add one from the compatible pool (bypassing the quantity limit for that one slot).

**When to use:** When base is `other` (idli/dosa) and `required_extra_category` is `condiment`. Add coconut chutney / sambar condiment even if `extra_quantity_limits.breakfast` would be 0.

### Anti-Patterns to Avoid

- **Calling Dexie directly in generator:** Use `getAllComponents()`, `getPreferences()`, `getRules()` from `food-db.ts`. Never import `db` into service files. Matches established project pattern.
- **React imports in service layer:** Zero React in `generator.ts` or `rule-compiler.ts`. Project-wide rule from Phase 1.
- **TypeScript enums for tags:** Use string literal unions only (project decision from Phase 1 — clean JSON serialization and Dexie index compatibility).
- **Mocking Dexie in tests:** Use real `fake-indexeddb` (already in setup). Mocking Dexie adds drift risk and diverges from established Phase 1-2 test pattern.
- **Modifying RuleRecord without Dexie migration:** The current `RuleRecord` in `db/client.ts` has `text: string` and `is_active: boolean`. Phase 3 changes these to `name: string` and `enabled: boolean` and types `compiled_filter`. This requires a `db.version(2)` migration block (or at minimum a `db.version(2).stores({})` no-op to bump the version so Dexie doesn't reject the schema change in browsers with existing v1 data).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Runtime validation of CompiledFilter from Dexie | Custom type guard with manual `if` chains | `Zod.discriminatedUnion` + `.safeParse()` | Handles all three variants, generates TypeScript types via `z.infer<>`, gives actionable error messages |
| Weighted random selection | Custom sorting or shuffle | Cumulative-probability loop (pure math, no library) | It is 10 lines; no library needed. The algorithm is well-understood and verified correct. |
| DayOfWeek type | Custom string union re-declaration | Single source in `src/types/plan.ts`, imported everywhere | Prevents drift between generator and rule compiler |

**Key insight:** The only "new" algorithmic work in this phase is the weighted random loop and the rule-application loop. Everything else reuses existing types and service functions.

---

## Common Pitfalls

### Pitfall 1: RuleRecord Schema Mismatch
**What goes wrong:** Phase 1 defined `RuleRecord` with `text: string` and `is_active: boolean`. Phase 3 needs `name: string`, `enabled: boolean`, and `compiled_filter: CompiledFilter`. If `db.version(2)` is not added, Dexie may throw a `VersionError` on browsers that have an existing v1 database.

**Why it happens:** Dexie enforces schema versioning. Changing column semantics without bumping the version is silently unsafe in development (fresh DB each test run) but visible in production.

**How to avoid:** Add `db.version(2).stores({})` (no-op — same indexes) with an upgrade function that migrates any existing `is_active` → `enabled` and `text` → `name` on existing rows. Or define version 2 as the first write since Phase 3 data is new.

**Warning signs:** `VersionError` in browser console on first page load after deploying Phase 3.

### Pitfall 2: `frequency` Field Missing from Existing Seeded Components
**What goes wrong:** The seed data (50–100 components) was inserted without a `frequency` field. Generator code that does `component.frequency === 'frequent'` will get `undefined` for all seeded records, breaking weight computation if not guarded.

**Why it happens:** Dexie stores exactly what was inserted; missing fields come back as `undefined`.

**How to avoid:** Always read as `component.frequency ?? 'normal'` in the generator. This is already called out in CONTEXT.md as the required pattern. No schema migration needed for the field itself.

**Warning signs:** All components getting weight `1` (normal) regardless of intended frequency — effectively no weighting differentiation.

### Pitfall 3: Slot Restriction Returns Empty Base Pool
**What goes wrong:** If a user has very restrictive `base_type_slots` (e.g., `rice-based` only allowed at lunch), calling `eligibleBaseTypes('breakfast', prefs, bases)` may return an empty array. The generator must detect this as a hard configuration error and emit a `Warning` with `rule_id: null` rather than crashing.

**Why it happens:** Empty array passed to `weightedRandom` will divide by zero (total weight = 0) or return the last element of an empty array.

**How to avoid:** Guard: `if (eligibleBases.length === 0) { warnings.push(...); continue; }` — skip slot assignment and leave it as a `null` base (or use a default). Document the behavior in tests.

**Warning signs:** `TypeError: Cannot read property of undefined` at `items[items.length - 1]` in the weighted random function.

### Pitfall 4: No-Repeat Set Not Scoped to Component Type
**What goes wrong:** Using a single `usedIds = new Set<number>()` for all component types means a curry with id=5 would incorrectly block a subzi with id=5 from being selected.

**Why it happens:** Component IDs are auto-incremented across all component types in a single table. A base with id=1 and a curry with id=1 would never co-exist, but curry id=5 and subzi id=5 can.

**How to avoid:** Maintain three separate Sets: `usedBaseIds`, `usedCurryIds`, `usedSubziIds`. Filter each independently before weighting.

### Pitfall 5: Applying Rules to Wrong Slot
**What goes wrong:** A `DayFilterRule` with `days: ['friday']` and `slots: null` (all slots) is incorrectly applied to a Monday slot because the day check was skipped.

**Why it happens:** Rule application logic processes all active rules without filtering for the current (day, slot) context first.

**How to avoid:** For each slot, filter the enabled rules to only those applicable to that (day, meal_slot) pair before applying. Three-step check: (1) is rule type applicable to this slot? (2) does rule's `days` include current day? (3) does rule's `slots` include current meal_slot (or is `slots === null`)?

### Pitfall 6: Vitest + fake-indexeddb Shared State Between Tests
**What goes wrong:** Tests that insert components or rules in one test bleed into the next, causing flaky count assertions.

**Why it happens:** `fake-indexeddb/auto` replaces the global `indexedDB` but does not reset between tests automatically. The existing test pattern (`beforeEach(() => { await db.components.clear(); ... })`) must be followed for every table touched.

**How to avoid:** Every generator test file must have a `beforeEach` that clears `db.components`, `db.preferences`, and `db.rules`. Follow the exact pattern in `src/services/food-db.test.ts`.

---

## Code Examples

Verified patterns from codebase and local verification:

### Generator Function Signature
```typescript
// src/services/generator.ts
import type { GeneratorResult } from '@/types/plan';

export async function generate(): Promise<GeneratorResult> {
  const [allComponents, prefs, rules] = await Promise.all([
    getAllComponents(),
    getPreferences(),
    getRules(),
  ]);
  // ... generation pass
  return { plan: { slots }, warnings };
}
```

### Rule Compiler Function Signature
```typescript
// src/services/rule-compiler.ts
import type { RuleDefinition, CompiledFilter } from '@/types/plan';

export function compileRule(def: RuleDefinition): CompiledFilter {
  // Pure synchronous transform — no I/O, no LLM
  switch (def.ruleType) {
    case 'day-filter': return { type: 'day-filter', days: def.days, slots: def.slots ?? null, filter: def.filter };
    case 'no-repeat':  return { type: 'no-repeat', component_type: def.component_type, within: 'week' };
    case 'require-component': return { type: 'require-component', component_id: def.component_id, days: def.days, slots: def.slots ?? null };
  }
}
```

### Adding getRules to food-db.ts
```typescript
// Addition to src/services/food-db.ts
import type { RuleRecord } from '@/db/client';

export async function getRules(): Promise<RuleRecord[]> {
  return db.rules.where('enabled').equals(1).toArray();
  // Note: Dexie boolean index stores true as 1
}

export async function addRule(rule: Omit<RuleRecord, 'id'>): Promise<number> {
  return db.rules.add(rule) as Promise<number>;
}
```

### Vitest Test Pattern for Generator (follows food-db.test.ts pattern)
```typescript
// src/services/generator.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/client';
import { generate } from './generator';

beforeEach(async () => {
  await db.components.clear();
  await db.rules.clear();
  await db.preferences.clear();
});

describe('PLAN-01: generates full 21-slot plan', () => {
  it('returns 21 PlanSlot entries for Mon–Sun × breakfast/lunch/dinner', async () => {
    // seed minimal components + preferences
    const result = await generate();
    expect(result.plan.slots).toHaveLength(21);
  });
});
```

### Zod CompiledFilter Validation in Generator
```typescript
// Inside generator.ts, when loading rules from Dexie
import { CompiledFilterSchema } from '@/types/plan';

const activeRules = rules.flatMap(row => {
  const parsed = CompiledFilterSchema.safeParse(row.compiled_filter);
  if (!parsed.success) {
    warnings.push({ slot: null, rule_id: row.id ?? null, message: `Invalid compiled_filter on rule "${row.name}" — skipped` });
    return [];
  }
  return [{ id: row.id!, rule: parsed.data }];
});
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| LLM at generation time (original design) | Compile-once at save time, generation is pure sync TS | Offline capable, instant, deterministic |
| Flat meal names (string) | Compositional Base + Curry + Subzi + Extras | Rich filtering and rule application possible |
| TypeScript enums for tags | String literal unions | Clean JSON serialization; Dexie multi-entry index compatible |
| Dexie mocks in tests | Real fake-indexeddb | No mock drift; tests reflect actual Dexie behavior |

**Deprecated/outdated:**
- `RuleRecord.text` and `RuleRecord.is_active` from Phase 1 stub: replaced by `name`, `enabled`, and typed `compiled_filter` in Phase 3. Requires `db.version(2)` migration block.
- `MealRecord` and `meal_extras` table: The generator does NOT use the meals table. `PlanSlot` in the generator result directly references component IDs, not meal IDs. This supersedes the `MealRecord` type for plan output purposes (Phase 4 can save `WeeklyPlan` directly to `saved_plans`).

---

## Open Questions

1. **DayOfWeek type location**
   - What we know: `MealSlot` lives in `src/types/preferences.ts`. `DayOfWeek` does not yet exist as a shared type.
   - What's unclear: Whether to add `DayOfWeek` to `preferences.ts` or create a new `plan.ts`.
   - Recommendation: Create `src/types/plan.ts` as the canonical home for all Phase 3 types (`DayOfWeek`, `CompiledFilter`, `RuleDefinition`, `WeeklyPlan`, `PlanSlot`, `Warning`, `GeneratorResult`). Keep `preferences.ts` for preferences-related types only.

2. **Dexie boolean index for `enabled`**
   - What we know: Dexie stores JS `true` as `1` in IDBKeyRange queries for indexed fields. `where('enabled').equals(1)` is the correct pattern for boolean indexes.
   - What's unclear: Whether to index `enabled` in the schema or just filter in-memory after `db.rules.toArray()`.
   - Recommendation: Since the rules table will have a small number of rows (< 50 typically), in-memory filter after `toArray()` is simpler and avoids the boolean index quirk. Use `db.rules.toArray().then(rows => rows.filter(r => r.enabled))`.

3. **`frequency` field and Dexie schema migration**
   - What we know: `ComponentRecord` in `src/types/component.ts` does not have a `frequency` field. It needs to be added.
   - What's unclear: Whether adding a non-indexed optional field to the TypeScript type requires a `db.version(2)` bump.
   - Recommendation: Adding an optional field to the TypeScript type with no new Dexie index does NOT require a version bump. The `db.version(2)` bump is only required for the `RuleRecord` shape change. Add `frequency?: 'frequent' | 'normal' | 'rare'` to `ComponentRecord` only in the TypeScript type, no schema change needed.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npx vitest run src/services/generator.test.ts src/services/rule-compiler.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLAN-01 | generate() returns 21 PlanSlot entries Mon–Sun × 3 slots | unit | `npx vitest run src/services/generator.test.ts` | ❌ Wave 0 |
| PLAN-04 | Extras only assigned when `compatible_base_types` includes selected base type; Rasam never with bread-based | unit | `npx vitest run src/services/generator.test.ts` | ❌ Wave 0 |
| RULE-02 | compileRule(def) returns correct CompiledFilter JSON for all 3 rule types | unit | `npx vitest run src/services/rule-compiler.test.ts` | ❌ Wave 0 |
| RULE-03 | DayFilterRule applied only to matching (day, slot) pairs; ignored on other days | unit | `npx vitest run src/services/generator.test.ts` | ❌ Wave 0 |
| RULE-04 | NoRepeatRule prevents same subzi/curry/base from appearing twice in generated week | unit | `npx vitest run src/services/generator.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/services/generator.test.ts src/services/rule-compiler.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/services/generator.test.ts` — covers PLAN-01, PLAN-04, RULE-03, RULE-04 (20+ cases)
- [ ] `src/services/rule-compiler.test.ts` — covers RULE-02 (all 3 rule type compilations)
- [ ] `src/types/plan.ts` — shared type definitions and Zod schema (prerequisite for both services)

*(No framework install gaps — Vitest + fake-indexeddb already installed and configured)*

---

## Sources

### Primary (HIGH confidence)
- Local codebase read — `src/types/component.ts`, `src/types/preferences.ts`, `src/db/client.ts`, `src/services/food-db.ts`, `src/lib/filter-components.ts`, `src/test/setup.ts`, `vitest.config.ts`, `package.json`
- Local Node.js execution — Zod 4.3.6 `discriminatedUnion` API verified, weighted random distribution verified (10,000 iterations), recency halving formula verified, 21-slot pure-sync performance verified (< 1ms)
- Installed package inspection — `dexie@4.3.0`, `zod@4.3.6`, `vitest@4.1.0`, `fake-indexeddb@6.2.5` all confirmed present

### Secondary (MEDIUM confidence)
- `03-CONTEXT.md` — phase decisions, algorithm spec, type definitions (authored 2026-03-20; all locked decisions treated as HIGH)
- Existing test files (`food-db.test.ts`, `filter-components.test.ts`) — confirmed `beforeEach` + `fake-indexeddb` test pattern

### Tertiary (LOW confidence)
- Dexie boolean index behavior for `enabled` field — based on known Dexie IDBKeyRange behavior; recommendation is to avoid the quirk entirely by using in-memory filter

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries confirmed installed and version-checked locally
- Architecture: HIGH — algorithm specified in CONTEXT.md; patterns verified with local code execution; codebase patterns established in Phases 1-2
- Pitfalls: HIGH for items 2-6 (code-level analysis of existing files); MEDIUM for Pitfall 1 (Dexie migration behavior — known pattern but not tested here)

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (stable libraries, no fast-moving dependencies)
