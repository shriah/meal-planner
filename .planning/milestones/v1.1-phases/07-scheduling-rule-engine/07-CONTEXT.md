# Phase 7: Scheduling Rule Engine - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a `scheduling-rule` CompiledFilter variant that unifies the existing `day-filter` and `require-component` rule types. This phase covers: Zod schema additions, rule compiler, and generator logic for all three effects (filter-pool, require-one, exclude) and both match modes (tag, component). UI form and migration are Phase 8.

Old `day-filter` and `require-component` variants remain in the type system and generator during this phase — they are removed in Phase 8 alongside migration.

</domain>

<decisions>
## Implementation Decisions

### Unsatisfied constraint behavior

All three effects use "relax + warn" — generation always completes, constraints degrade gracefully:

- **D-01:** `filter-pool` → empty pool after filtering: emit warning, fall back to full pool. Same soft behavior as existing `day-filter`.
- **D-02:** `exclude` → all components removed from pool: emit warning, fall back to full pool.
- **D-03:** `require-one` by tag → no matching component exists in library: emit warning, skip the requirement for that slot.
- **D-04:** `require-one` by component ID → target component is excluded by a `filter-pool` rule: **require-one wins**. Inject the required component into the slot regardless. Explicit requirement overrides implicit filter.

### Require-one-by-tag mechanism

- **D-05:** Two-pass mechanism. Pass 1: normal pool selection runs (weighted random from eligible pool). Pass 2: check if selected component satisfies the require-one tag criteria. If NOT satisfied, override by picking a random tag-matching component from the **full library** (bypassing any filter-pool rules). If no tag-matching component exists anywhere, warn + skip (D-03).
- **D-06:** `require-one` by tag vs `filter-pool` conflict (e.g., "require fish curry" + "no non-veg"): require-one wins. Consistent with D-04 — explicit requirements override filters.
- **D-07:** Multiple `require-one` rules on the same slot: all are satisfied independently. Each targets a different component type (base, curry, subzi, extra), so no conflict. All must be attempted; each falls back with warning if unsatisfied.

### CompiledFilter schema structure

- **D-08:** `scheduling-rule` uses a nested match discriminator:
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

- **D-09:** `days: null` + `slots: null` = universal rule — applies to all 21 slots (7 days × 3 meal slots). This is valid; omitting scope means "always apply."

### Old variants during Phase 7

- **D-10:** `day-filter` and `require-component` CompiledFilter variants remain in the type system and generator during Phase 7. They are only removed in Phase 8 (alongside the Dexie migration). The generator must handle all four variants until then.

### Claude's Discretion

- Exact Zod schema expression for the nested `match` discriminated union
- Warning message strings
- How `RuleDefinition` input type extends for scheduling-rule (form input side)
- Order in which multiple scheduling-rule effects are applied per slot (filter-pool first, then exclude, then require-one is a reasonable default)

</decisions>

<specifics>
## Specific Ideas

- The `isRuleApplicable(rule, day, slot)` helper in `generator.ts` already checks day/slot applicability — reuse or extend it for scheduling-rule's day/slot fields.
- The `matchesTagFilter(component, filter)` helper is reusable as-is for tag matching.
- The two-pass require-one mechanism is new — no current analog in the generator.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Rule type system
- `src/types/plan.ts` — `CompiledFilterSchema` (Zod discriminated union), `RuleDefinition`, `TagFilter`, `DayOfWeek`, `MealSlot` — all types that scheduling-rule extends
- `src/components/rules/types.ts` — `FormState` union, per-rule form state shapes, `FormAction` union — required to add `SchedulingRuleFormState` and actions

### Compiler
- `src/services/rule-compiler.ts` — `compileRule()` switch statement pattern; add `'scheduling-rule'` case here

### Generator
- `src/services/generator.ts` — `isRuleApplicable()` (reuse), `matchesTagFilter()` (reuse), `applyDayFilterToPool()` (reference pattern), `pickFromPool()`, main generation loop; all integration points for the new variant

### Tests
- `src/services/rule-compiler.test.ts` — existing compile tests; add scheduling-rule compile tests following same pattern
- `src/services/generator.test.ts` — 22 existing generator TDD tests must still pass after changes; add new scheduling-rule generator tests

### Dexie schema
- `src/db/client.ts` — `RuleRecord` shape (no change needed for Phase 7 — `compiled_filter: CompiledFilter` already stores any variant)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `isRuleApplicable(rule, day, slot)` in `generator.ts`: checks if a rule's `days`/`slots` fields target the current slot — reuse or extend for scheduling-rule's nullable days/slots (null = applies to all)
- `matchesTagFilter(component, filter)` in `generator.ts`: tag matching logic — reuse as-is for scheduling-rule tag match mode
- `applyDayFilterToPool()` in `generator.ts`: pool filtering pattern — reference implementation for filter-pool effect

### Established Patterns
- Zod `z.discriminatedUnion('type', [...])` for `CompiledFilter` — add scheduling-rule variant following the same pattern
- `Extract<CompiledFilter, { type: 'X' }>` for typed rule extraction inside generator
- All constraint violations emit to `Warning[]` array (returned in `GeneratorResult`) — use for all three scheduling-rule fallback cases
- Generator validates all rules through Zod at startup (lines 237-248 in generator.ts) — invalid rules skipped

### Integration Points
- `CompiledFilterSchema` in `src/types/plan.ts`: add new variant to the discriminated union
- `compileRule()` switch in `src/services/rule-compiler.ts`: add `'scheduling-rule'` case
- Main generation loop in `src/services/generator.ts`: extract scheduling-rules, apply per-slot in the base/curry/subzi/extra selection steps
- `src/components/rules/types.ts`: add `SchedulingRuleFormState` (needed by Phase 8, but type should be defined here in Phase 7 with the other rule state shapes)

</code_context>

<deferred>
## Deferred Ideas

- UI form for creating scheduling rules — Phase 8
- Migration of existing day-filter and require-component records — Phase 8
- Removing old day-filter and require-component variants from CompiledFilter — Phase 8

</deferred>

---

*Phase: 07-scheduling-rule-engine*
*Context gathered: 2026-03-22*
