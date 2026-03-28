# Phase 7: Scheduling Rule Engine - Research

**Researched:** 2026-03-22
**Domain:** TypeScript rule compiler / generator extension — pure in-process logic, no new libraries
**Confidence:** HIGH

## Summary

Phase 7 is a purely internal TypeScript refactor-plus-extension inside three files: `src/types/plan.ts`, `src/services/rule-compiler.ts`, and `src/services/generator.ts`. No new libraries are required. All patterns needed already exist in the codebase; the task is to add a new `scheduling-rule` variant that sits alongside (not replacing) the existing `day-filter` and `require-component` variants.

The generator already has `isRuleApplicable()`, `matchesTagFilter()`, and `applyDayFilterToPool()` — all of which are directly reusable. The only genuinely new logic is the two-pass require-one mechanism (D-05), which has no existing analog and must be written from scratch. The `filter-pool` and `exclude` effects follow the same structural pattern as the existing `day-filter` pool filtering.

Old variants (`day-filter`, `require-component`) remain in all type signatures and generator logic for the entirety of Phase 7. Nothing is removed in this phase.

**Primary recommendation:** Add the `scheduling-rule` variant to the Zod discriminated union first, then extend `compileRule()` with a new case, then add scheduling-rule application to the generator's per-slot loop in the order: filter-pool → exclude → require-one.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** `filter-pool` → empty pool after filtering: emit warning, fall back to full pool. Same soft behavior as existing `day-filter`.
**D-02:** `exclude` → all components removed from pool: emit warning, fall back to full pool.
**D-03:** `require-one` by tag → no matching component exists in library: emit warning, skip the requirement for that slot.
**D-04:** `require-one` by component ID → target component is excluded by a `filter-pool` rule: **require-one wins**. Inject the required component into the slot regardless. Explicit requirement overrides implicit filter.
**D-05:** Two-pass mechanism. Pass 1: normal pool selection runs (weighted random from eligible pool). Pass 2: check if selected component satisfies the require-one tag criteria. If NOT satisfied, override by picking a random tag-matching component from the **full library** (bypassing any filter-pool rules). If no tag-matching component exists anywhere, warn + skip (D-03).
**D-06:** `require-one` by tag vs `filter-pool` conflict (e.g., "require fish curry" + "no non-veg"): require-one wins. Consistent with D-04 — explicit requirements override filters.
**D-07:** Multiple `require-one` rules on the same slot: all are satisfied independently. Each targets a different component type (base, curry, subzi, extra), so no conflict. All must be attempted; each falls back with warning if unsatisfied.
**D-08:** `scheduling-rule` uses a nested match discriminator:
```typescript
{
  type: 'scheduling-rule',
  effect: 'filter-pool' | 'require-one' | 'exclude',
  days: DayOfWeek[] | null,
  slots: MealSlot[] | null,
  match:
    | { mode: 'tag'; filter: TagFilter }
    | { mode: 'component'; component_id: number }
}
```
Implemented as a Zod schema with `z.discriminatedUnion('mode', [...])` for the `match` field.

**D-09:** `days: null` + `slots: null` = universal rule — applies to all 21 slots (7 days × 3 meal slots). This is valid; omitting scope means "always apply."
**D-10:** `day-filter` and `require-component` CompiledFilter variants remain in the type system and generator during Phase 7. They are only removed in Phase 8 (alongside the Dexie migration). The generator must handle all four variants until then.

### Claude's Discretion

- Exact Zod schema expression for the nested `match` discriminated union
- Warning message strings
- How `RuleDefinition` input type extends for scheduling-rule (form input side)
- Order in which multiple scheduling-rule effects are applied per slot (filter-pool first, then exclude, then require-one is a reasonable default)

### Deferred Ideas (OUT OF SCOPE)

- UI form for creating scheduling rules — Phase 8
- Migration of existing day-filter and require-component records — Phase 8
- Removing old day-filter and require-component variants from CompiledFilter — Phase 8
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCHED-01 | User can create a scheduling rule scoped to any combination of days (Mon–Sun) and meal slots (breakfast / lunch / dinner), with both fields optional (omitting means "all days" or "all slots") | `days: DayOfWeek[] \| null` + `slots: MealSlot[] \| null` in D-08 schema; `null` = all (D-09). No DB schema change needed — `compiled_filter: CompiledFilter` already accepts any variant. |
| SCHED-02 | User selects the rule effect: "Filter pool", "Require one", or "Exclude" | `effect` field in D-08 schema. Compiler maps `ruleType: 'scheduling-rule'` + `effect` to the compiled output. |
| SCHED-03 | User matches components by tag filter or by picking a specific component | `match` discriminated union in D-08: `{ mode: 'tag'; filter: TagFilter }` or `{ mode: 'component'; component_id: number }`. `matchesTagFilter()` is fully reusable. |
| SCHED-04 | "Require one by tag" — generator picks any eligible component matching tag criteria for that slot | Two-pass mechanism (D-05): pass 1 = normal weighted-random selection; pass 2 = verify tag match, override from full library if not satisfied. |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | already installed | Schema validation and Zod inference for `CompiledFilterSchema` | Existing discriminated union pattern throughout `src/types/plan.ts` |
| vitest | already installed | Test runner for all existing and new tests | Already configured in `vitest.config.ts`; 33 existing tests in generator alone |

No new libraries needed. All work is pure TypeScript inside existing files.

**Installation:** None required.

---

## Architecture Patterns

### Recommended Project Structure

No new files are required. All changes occur in:
```
src/
├── types/
│   └── plan.ts              # Add SchedulingRuleCompiledFilter variant + SchedulingRuleDefinition type
├── services/
│   ├── rule-compiler.ts     # Add 'scheduling-rule' case to compileRule() switch
│   ├── rule-compiler.test.ts # Add scheduling-rule compile tests
│   ├── generator.ts         # Add scheduling-rule application to per-slot loop
│   └── generator.test.ts    # Add scheduling-rule generator tests (22 existing must still pass)
└── components/
    └── rules/
        └── types.ts          # Add SchedulingRuleFormState (Phase 8 UI will use it; type stub here)
```

### Pattern 1: Extending CompiledFilterSchema (Zod discriminated union)

**What:** Add `scheduling-rule` as a new variant inside the existing `z.discriminatedUnion('type', [...])`.
**When to use:** Follows the exact pattern of the existing three variants.
**Example:**
```typescript
// Source: src/types/plan.ts — existing discriminated union structure
export const CompiledFilterSchema = z.discriminatedUnion('type', [
  // ... existing variants unchanged ...
  z.object({
    type: z.literal('scheduling-rule'),
    effect: z.enum(['filter-pool', 'require-one', 'exclude']),
    days: z.array(DayOfWeekEnum).nullable(),
    slots: z.array(MealSlotEnum).nullable(),
    match: z.discriminatedUnion('mode', [
      z.object({ mode: z.literal('tag'), filter: TagFilterSchema }),
      z.object({ mode: z.literal('component'), component_id: z.number() }),
    ]),
  }),
]);

// Type alias (follows Extract<CompiledFilter, { type: 'X' }> pattern)
export type SchedulingRule = Extract<CompiledFilter, { type: 'scheduling-rule' }>;
```

### Pattern 2: isRuleApplicable extension for scheduling-rule

**What:** The existing `isRuleApplicable()` checks `rule.days` and `rule.slots` for day-filter and require-component. Scheduling-rule uses the same fields but with `null` meaning "all" (not "none").
**When to use:** Called per-slot to determine whether a scheduling-rule applies.
**Key difference:** `day-filter` stores `days: DayOfWeek[]` (never null). `scheduling-rule` stores `days: DayOfWeek[] | null` where `null` = universal scope.

```typescript
// Extension inside isRuleApplicable() or separate helper:
if (rule.type === 'scheduling-rule') {
  if (rule.days !== null && !rule.days.includes(day)) return false;
  if (rule.slots !== null && !rule.slots.includes(slot)) return false;
  return true;
}
```

### Pattern 3: Per-slot scheduling-rule application order

**What:** Extract applicable scheduling-rules at the top of the slot loop, then apply in order: filter-pool, exclude, require-one. This is Claude's discretion per CONTEXT.md.
**When to use:** Inside the main generation loop, after no-repeat and slot-restriction filtering.

```typescript
// Pseudocode for per-slot scheduling-rule application (curry as example):
const schedulingRules = validRules.filter(
  r => r.type === 'scheduling-rule' && isRuleApplicable(r, day, meal_slot),
) as SchedulingRule[];

// 1. filter-pool: restrict eligible pool to tag/component-matching items
let pool = applySchedulingFilterPool(eligibleCurries, schedulingRules);

// 2. exclude: remove tag/component-matching items from pool
pool = applySchedulingExclude(pool, eligibleCurries, schedulingRules, warnings, ...);

// 3. Normal weighted-random selection from pool
const picked = weightedRandom(pool, c => effectiveWeight(c, usageCount));

// 4. require-one: two-pass override (D-05)
const requireOneRules = schedulingRules.filter(r => r.effect === 'require-one');
const finalPicked = applyRequireOne(picked, requireOneRules, allCurries, warnings, ...);
```

### Pattern 4: Two-pass require-one mechanism (D-05)

**What:** Pass 1 is normal selection (already done). Pass 2 checks if selected component satisfies all require-one-by-tag rules for this slot. If not, override by picking a random tag-matching component from the FULL component library (not just the filtered pool), bypassing filter-pool rules.

```typescript
function applyRequireOneByTag(
  selected: ComponentRecord,
  requireOneRules: SchedulingRule[],
  fullLibrary: ComponentRecord[],  // bypass filter-pool (D-05, D-06)
  warnings: Warning[],
  day: DayOfWeek,
  slot: MealSlot,
  ruleRecords: RuleRecord[],
): ComponentRecord {
  for (const rule of requireOneRules) {
    if (rule.match.mode !== 'tag') continue;
    if (matchesTagFilter(selected, rule.match.filter)) continue; // already satisfied

    // Override: pick from full library, not filtered pool
    const candidates = fullLibrary.filter(c => matchesTagFilter(c, rule.match.filter));
    if (candidates.length === 0) {
      warnings.push({ ... message: `require-one: no component in library matches tag filter — skipped` });
      continue;
    }
    // Random selection (not weighted — requirement override, not preference)
    return candidates[Math.floor(Math.random() * candidates.length)];
  }
  return selected;
}
```

**Key subtlety:** require-one-by-component (D-04) must inject the required component into the slot regardless of filter-pool rules. This differs from require-component (existing) which only injects if the component is in the eligible pool.

### Pattern 5: Compiler case addition

**What:** Add `'scheduling-rule'` case to the `compileRule()` switch in `rule-compiler.ts`.
**Example:**
```typescript
// Source: src/services/rule-compiler.ts
case 'scheduling-rule':
  return {
    type: 'scheduling-rule',
    effect: def.effect,
    days: def.days ?? null,
    slots: def.slots ?? null,
    match: def.match,
  };
```

### Pattern 6: SchedulingRuleFormState type stub

**What:** Add the form state type to `src/components/rules/types.ts` following the existing pattern. Phase 8 UI will populate the form, but the type must exist here for Phase 8's planner to reference.

```typescript
export type SchedulingRuleFormState = {
  name: string;
  ruleType: 'scheduling-rule';
  effect: 'filter-pool' | 'require-one' | 'exclude' | '';
  days: DayOfWeek[];      // empty = all days (null compiled)
  slots: MealSlot[];      // empty = all slots (null compiled)
  match:
    | { mode: 'tag'; filter: TagFilter }
    | { mode: 'component'; component_id: number | null }
    | { mode: '' };        // unset state
};
```

Also add `'scheduling-rule'` to the `SET_RULE_TYPE` action union in `FormAction`.

### Anti-Patterns to Avoid

- **Forgetting `days: null` means ALL days, not NO days:** The existing `day-filter` uses `days: DayOfWeek[]` (always an array). The new `scheduling-rule` uses `days: DayOfWeek[] | null`. `null` here is the universal case, not the empty case. Do not confuse with `slots: null` on day-filter (which means "all slots" there too — consistent, but the `days` field was never nullable in day-filter).
- **Applying scheduling-rule filter-pool BEFORE no-repeat:** No-repeat filtering happens first (it reduces the pool to unvisited items). Scheduling-rule filter-pool then further restricts that already-reduced pool. Reversing the order would break no-repeat semantics.
- **Applying require-one from filtered pool instead of full library:** D-05 and D-06 explicitly state require-one overrides filter-pool by going to the full library. Using the filtered pool for require-one would silently violate D-06.
- **Using weighted-random for require-one override:** When require-one overrides by tag, it should use uniform random selection (the user explicitly demanded this component type — preference weighting should not apply to the override). Normal selection (pass 1) still uses weighted-random.
- **Breaking the 22 existing generator tests:** The existing tests pass rules using `type: 'day-filter'` and `type: 'require-component'`. Since D-10 mandates these variants are kept, adding scheduling-rule handling must not break the existing code paths. No refactoring of existing branches.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tag matching logic | Custom tag matcher | `matchesTagFilter()` in generator.ts | Already handles all four tag fields (dietary, protein, regional, occasion) with AND semantics |
| Slot applicability check | Custom days/slots intersection | `isRuleApplicable()` (extended) | Already handles null-slots and includes-day patterns |
| Pool filtering pattern | New helper | Reference `applyDayFilterToPool()` and inline | Pattern is simple enough to inline; no shared abstraction needed |
| Weighted random selection | Custom weighted picker | `weightedRandom()` in generator.ts | Existing function handles edge cases (floating point) |

**Key insight:** The generator file already contains all primitives. Phase 7 is assembly, not invention.

---

## Common Pitfalls

### Pitfall 1: Null vs empty array for days/slots scope

**What goes wrong:** `days: null` (compile output) vs `days: []` (empty selection from UI) are semantically opposite. `null` = universal (all days). `[]` = no days (never applies).
**Why it happens:** The form might emit an empty array when the user hasn't selected any days (meaning "all"), but the schema expects `null` for that semantic.
**How to avoid:** In `compileRule()`, convert `def.days.length === 0 ? null : def.days` — or require the form to pass `null` explicitly for "all days." Phase 8 handles the UI; for Phase 7's RuleDefinition input type, use `days?: DayOfWeek[]` where undefined becomes `null`.
**Warning signs:** Tests where a scheduling-rule with `days: []` incorrectly applies to all slots (would mean the rule never fires, not always fires).

### Pitfall 2: require-one for component ID injecting into wrong component type

**What goes wrong:** A `require-one` rule with `match.mode === 'component'` and `component_id: 42` might inject a curry ID into the base selection step (or vice versa), because the generator handles base/curry/subzi/extra in separate branches.
**Why it happens:** The scheduling-rule schema doesn't encode which component type the match targets — it's inferred by which library the generator is searching.
**How to avoid:** When applying `require-one` with component ID, check `component.componentType === expectedType` before injecting. The generator knows the current selection step (base, curry, subzi, extra) and must only inject a require-one-by-component if the component is of that type.
**Warning signs:** `riceBaseId` appearing as `curry_id` in a test slot.

### Pitfall 3: Multiple require-one rules on the same slot (D-07)

**What goes wrong:** If the generator applies only the first require-one rule and skips others, D-07 is violated. All require-one rules for the same slot must be attempted independently.
**Why it happens:** Loop breaks after first rule satisfaction.
**How to avoid:** Iterate through all applicable require-one rules — do not break after the first. Each targets a different component type logically, but the generator must attempt all of them.
**Warning signs:** A test with two require-one rules on the same day/slot where only one is honored.

### Pitfall 4: Zod validation at generator startup rejects scheduling-rule

**What goes wrong:** The generator validates all rules through `CompiledFilterSchema.safeParse()` at lines 237-248. If `scheduling-rule` is not added to the Zod schema before testing the generator changes, every scheduling-rule in the DB will be silently skipped with a "Zod validation failed" warning.
**Why it happens:** The Zod schema and the TypeScript type are the same source (inference), so a missing variant in Zod means the value is filtered out before reaching generator logic.
**How to avoid:** Add the `scheduling-rule` variant to `CompiledFilterSchema` in `plan.ts` FIRST, before touching `generator.ts`. The compiler and test files follow after.
**Warning signs:** Tests that add a scheduling-rule to the DB then observe it has no effect, even though the generator code path looks correct.

### Pitfall 5: The `pickFromPool` helper applies day-filter rules internally

**What goes wrong:** `pickFromPool()` internally calls `applyDayFilterToPool()`, which only looks for `type === 'day-filter'` rules. If scheduling-rule filter-pool logic is placed inside `pickFromPool`, there is a risk of double-application. Conversely, if it is placed only inside `pickFromPool`, it won't be applied to the base selection path (which does not use `pickFromPool` — bases call `applyDayFilterToPool` directly).
**Why it happens:** The generator has two code paths: base selection (inline) and curry/subzi selection (via `pickFromPool`). Both must apply scheduling-rule filter-pool.
**How to avoid:** Add scheduling-rule filter-pool application at the SAME level as day-filter is already applied in each path. Do not consolidate into `pickFromPool` alone.
**Warning signs:** Scheduling-rule filter-pool working for curry/subzi but silently skipped for base selection.

---

## Code Examples

### CompiledFilterSchema extension

```typescript
// Source: src/types/plan.ts — add as fourth variant in the discriminatedUnion array
z.object({
  type: z.literal('scheduling-rule'),
  effect: z.enum(['filter-pool', 'require-one', 'exclude']),
  days: z.array(DayOfWeekEnum).nullable(),
  slots: z.array(MealSlotEnum).nullable(),
  match: z.discriminatedUnion('mode', [
    z.object({
      mode: z.literal('tag'),
      filter: TagFilterSchema,
    }),
    z.object({
      mode: z.literal('component'),
      component_id: z.number(),
    }),
  ]),
}),
```

### isRuleApplicable extension

```typescript
// Source: src/services/generator.ts — add after the require-component branch
if (rule.type === 'scheduling-rule') {
  // null means universal (all days / all slots)
  if (rule.days !== null && !rule.days.includes(day)) return false;
  if (rule.slots !== null && !rule.slots.includes(slot)) return false;
  return true;
}
```

### Filter-pool effect helper

```typescript
// Analogous to applyDayFilterToPool — for scheduling-rule filter-pool effect
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
```

### Exclude effect helper

```typescript
function applySchedulingExclude(
  pool: ComponentRecord[],
  fullPool: ComponentRecord[],        // fallback if pool goes empty
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
    // D-02: relax + warn
    for (const rule of excludeRules) {
      const rr = ruleRecords.find(r => JSON.stringify(r.compiled_filter) === JSON.stringify(rule));
      warnings.push({
        slot: { day, meal_slot: slot },
        rule_id: rr?.id ?? null,
        message: `scheduling-rule exclude removed all components from pool on ${day} ${slot} — constraint relaxed`,
      });
    }
    return pool; // fall back
  }

  return filtered;
}
```

### RuleDefinition extension

```typescript
// Source: src/types/plan.ts — add to RuleDefinition union
| {
    ruleType: 'scheduling-rule';
    effect: 'filter-pool' | 'require-one' | 'exclude';
    days?: DayOfWeek[];      // undefined → null (all days)
    slots?: MealSlot[];      // undefined → null (all slots)
    match:
      | { mode: 'tag'; filter: TagFilter }
      | { mode: 'component'; component_id: number };
  }
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (already installed) |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npm test -- --reporter=verbose src/services/rule-compiler.test.ts src/services/generator.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCHED-01 | scheduling-rule with days/slots null compiles and applies to all 21 slots | unit | `npm test -- src/services/rule-compiler.test.ts` | ✅ (file exists, new tests needed) |
| SCHED-01 | scheduling-rule with specific days/slots subset applies only to matching slots | unit | `npm test -- src/services/generator.test.ts` | ✅ (file exists, new tests needed) |
| SCHED-02 | compileRule() produces correct effect field for each of three effects | unit | `npm test -- src/services/rule-compiler.test.ts` | ✅ (file exists, new tests needed) |
| SCHED-02 | generator applies filter-pool, require-one, exclude independently | integration | `npm test -- src/services/generator.test.ts` | ✅ (file exists, new tests needed) |
| SCHED-03 | filter-pool by tag restricts curry pool to matching tags | integration | `npm test -- src/services/generator.test.ts` | ✅ (file exists, new tests needed) |
| SCHED-03 | filter-pool by component_id restricts pool to single component | integration | `npm test -- src/services/generator.test.ts` | ✅ (file exists, new tests needed) |
| SCHED-04 | require-one-by-tag: if pool selection doesn't match, override from full library | integration | `npm test -- src/services/generator.test.ts` | ✅ (file exists, new tests needed) |
| SCHED-04 | require-one-by-tag with no matching component in library: warn + skip | integration | `npm test -- src/services/generator.test.ts` | ✅ (file exists, new tests needed) |
| All | 22 existing generator tests still pass after changes | regression | `npm test -- src/services/generator.test.ts` | ✅ |

### Sampling Rate

- **Per task commit:** `npm test -- src/services/rule-compiler.test.ts src/services/generator.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

None — existing test infrastructure covers all phase requirements. New test cases must be added within the existing test files, not in new files.

---

## Open Questions

1. **Which component types does each scheduling-rule effect target?**
   - What we know: The schema has no `component_type` field (unlike no-repeat). The match is by tag or component_id.
   - What's unclear: If a scheduling-rule filter-pool with `match.mode === 'tag'` and `filter: { protein_tag: 'fish' }` is active, does it apply to bases, curries, subzis, and extras separately? The likely answer is: the generator applies it to each component type independently at the point of selection. A fish tag on a curry filter makes sense; on a base filter it might match nothing (bases rarely have protein_tag).
   - Recommendation: Apply the filter to whatever pool is being selected at that step. Don't restrict to specific component types at the schema level. Document in tests that a filter-pool rule with no matching bases simply doesn't affect base selection.

2. **Does require-one-by-tag target all component types or just curries?**
   - What we know: SCHED-04 says "require a fish curry" and "picks any fish-tagged curry." D-07 says "each targets a different component type (base, curry, subzi, extra)."
   - What's unclear: The schema has no `component_type` discriminator on the scheduling-rule. How does the generator know whether to satisfy a require-one rule during base selection, curry selection, etc.?
   - Recommendation: The generator applies require-one rules to each component type independently. A require-one-by-tag(fish) will naturally only match curries (because bases don't have protein_tag). If the library had a fish base, it would also be eligible. This is emergent behavior from the tag filter — no explicit component_type scoping needed at schema level. The planner should document this assumption in the implementation task.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate `day-filter` type (days array only, never null) | Unified `scheduling-rule` (nullable days + slots, 3 effects) | Phase 7 | New variant added; old kept until Phase 8 migration |
| `require-component` type (single component_id injection) | `scheduling-rule` with `effect: 'require-one'` + `match.mode: 'component'` | Phase 7 | New variant compiles the same semantic; old kept until Phase 8 |

---

## Sources

### Primary (HIGH confidence)

- Direct code reading: `src/types/plan.ts` — CompiledFilterSchema, TagFilterSchema, RuleDefinition, DayOfWeek, MealSlot (all current)
- Direct code reading: `src/services/rule-compiler.ts` — compileRule() switch pattern (3 cases, all simple structural mappings)
- Direct code reading: `src/services/generator.ts` — full generator logic including isRuleApplicable(), matchesTagFilter(), applyDayFilterToPool(), pickFromPool(), main slot loop (558 lines)
- Direct code reading: `src/services/generator.test.ts` — 33 test cases (PLAN-01 through DL-5 groups); 22 confirmed as pre-existing requirement from phase success criteria
- Direct code reading: `src/components/rules/types.ts` — FormState union, FormAction union
- Direct code reading: `src/db/client.ts` — RuleRecord (compiled_filter: CompiledFilter), Dexie schema v4
- Direct code reading: `.planning/phases/07-scheduling-rule-engine/07-CONTEXT.md` — all decisions D-01 through D-10 locked
- Direct code reading: `.planning/config.json` — nyquist_validation: true

### Secondary (MEDIUM confidence)

None required — all findings are from direct codebase inspection.

### Tertiary (LOW confidence)

None.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; existing stack confirmed by direct file read
- Architecture patterns: HIGH — all patterns directly observed in generator.ts and plan.ts
- Pitfalls: HIGH — derived from direct code analysis of generator branching and Zod validation behavior
- Test map: HIGH — vitest config confirmed, test file confirmed at 33 tests

**Research date:** 2026-03-22
**Valid until:** Stable codebase — valid until Phase 8 removes day-filter/require-component variants
