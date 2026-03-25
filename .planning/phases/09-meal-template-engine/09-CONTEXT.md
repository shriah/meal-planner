# Phase 9: Meal Template Engine - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a `meal-template` CompiledFilter variant that the generator uses for base-type-scoped constraints: slot assignment (which slots a base type is allowed in), component exclusions (exclude curry/subzi), extra exclusions (exclude extra categories), and required extras (require one extra category). This phase covers: Zod schema, rule compiler, and generator integration. No UI and no migration — those are Phase 10.

During this phase, `prefs.slot_restrictions.base_type_slots` and `prefs.base_type_rules` still exist in IndexedDB and are read by the generator as a fallback. They are removed in Phase 10 alongside migration.

</domain>

<decisions>
## Implementation Decisions

### Schema shape

- **D-01:** `meal-template` uses a flat record (not effect-based variants). All constraints for a given base type context live in one rule:
  ```typescript
  {
    type: 'meal-template',
    base_type: 'rice-based' | 'bread-based' | 'other',

    // Context scope (optional — null = applies to all days/slots)
    days: DayOfWeek[] | null,
    slots: MealSlot[] | null,

    // Slot assignment (always unscoped — applies globally for this base type)
    allowed_slots: MealSlot[] | null,

    // Composition constraints (gated by context scope above)
    exclude_component_types: ('curry' | 'subzi')[],
    exclude_extra_categories: ExtraCategory[],
    require_extra_category: ExtraCategory | null,
  }
  ```

### Slot scope semantics

- **D-02:** The `slots` field (context scope) gates ONLY the composition constraints (`exclude_component_types`, `exclude_extra_categories`, `require_extra_category`). It does NOT gate `allowed_slots`.
- **D-03:** `allowed_slots` is always unscoped — it applies globally for that base type regardless of any context scope on the rule. A rule with `slots: ['dinner']` and `allowed_slots: ['lunch', 'dinner']` is valid; the context scope narrows when composition constraints fire, but the slot assignment always applies.
- **D-04:** `slots: null` + `days: null` = universal rule — applies to all 21 slots (consistent with Phase 7 D-09).

### Prefs coexistence (Phase 9 only)

- **D-05:** Meal-template rules **override prefs per base type** — if any meal-template rule exists for `rice-based`, the generator ignores `prefs.slot_restrictions.base_type_slots['rice-based']` and `prefs.base_type_rules` entries for `rice-based` entirely.
- **D-06:** For base types with NO meal-template rules, the generator continues reading from prefs as before (fallback). This allows partial adoption — some base types managed by rules, others still by prefs.
- **D-07:** Implementation pattern in `getEligibleBases()`: collect all meal-template rules → group by `base_type` → if group non-empty for current base type, apply template logic; else fall through to prefs read.

### Multiple rules per base type

- **D-08:** Multiple meal-template rules for the same base type **compose** — all apply independently:
  - `allowed_slots`: **intersection** across all rules that specify it (most restrictive). If any rule restricts to `[lunch, dinner]` and another to `[dinner]`, the result is `[dinner]`. Rules with `allowed_slots: null` don't participate in the intersection.
  - `exclude_component_types`: **union** — exclusions from all rules combine.
  - `exclude_extra_categories`: **union** — all category exclusions combine.
  - `require_extra_category`: **all attempted** — each `require_extra_category` is attempted independently (same as scheduling-rule require-one D-07 from Phase 7).
- **D-09:** Composition constraints use the AND of all applicable context scopes — a rule only participates if the current (day, slot) pair matches its `days` and `slots` context.

### Failure behavior

- **D-10:** All failures use **relax + warn** (consistent with Phase 7 D-01 through D-04):
  - `required_extra_category` has no eligible extras → emit warning, skip requirement
  - `exclude_component_types` removes all components from pool → emit warning, fall back to full pool for that type
  - `exclude_extra_categories` removes all eligible extras → emit warning, extras selected normally
  - `allowed_slots` intersection results in empty set → emit warning, fall back to unrestricted base pool for that slot
  - All cases: generation always completes, constraint silently degraded

### Claude's Discretion

- Exact Zod schema expression for the flat `meal-template` variant
- Order in which meal-template constraints are applied within the generator loop
- Helper function naming and structure (e.g., `applyMealTemplate()`)
- Warning message strings
- Whether to add `meal-template` to `RuleDefinition` input type in this phase or defer to Phase 10

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Type system
- `src/types/plan.ts` — `CompiledFilterSchema` (Zod discriminated union to add `meal-template` to), `RuleDefinition`, `DayOfWeek`, `MealSlot`
- `src/types/preferences.ts` — `UserPreferencesRecord`, `SlotRestrictions`, `BaseTypeRule` — the prefs structures that meal-template overrides during this phase
- `src/types/component.ts` — `BaseType`, `ExtraCategory`, `ComponentType` — enumerations used in meal-template constraints

### Compiler
- `src/services/rule-compiler.ts` — `compileRule()` switch statement; add `'meal-template'` case

### Generator
- `src/services/generator.ts` — `getEligibleBases()` (extend to check meal-template before prefs), lines ~130–150; `base_type_rules` handling at lines ~578–600 (require_extra_category logic); main generation loop integration points
- `src/services/food-db.ts` — `getPreferences()` (still called in Phase 9 for non-template base types)

### Tests
- `src/services/rule-compiler.test.ts` — add meal-template compile tests following existing pattern
- `src/services/generator.test.ts` — 22+ existing generator TDD tests must still pass; add meal-template tests for slot assignment, component exclusion, extra exclusion, required extras

### DB schema
- `src/db/client.ts` — current Dexie version is v5; Phase 9 will be v6 (adding rules for meal-template; no migration of prefs — that's Phase 10)

### Design reference (todo → folded)
- `.planning/todos/pending/2026-03-22-refactor-and-move-slot-setting-to-rules-tab.md` — original design document with schema proposal and example rules; used as foundation for D-01 schema

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getEligibleBases(slot, prefs, bases)` in `generator.ts` (lines ~133–150): current slot restriction logic via `prefs.slot_restrictions.base_type_slots` — extend this function to check meal-template rules first (D-05 to D-07); the prefs fallback stays as the else branch
- `isRuleApplicable(rule, day, slot)` in `generator.ts`: checks day/slot applicability — reuse/extend for meal-template's `days`/`slots` context scope
- `matchesTagFilter()` in `generator.ts`: not directly relevant but shows the pattern for rule applicability helpers
- Required extras logic at generator.ts lines ~578–600: the `baseTypeRule.required_extra_category` path — this is the direct analog for `require_extra_category` in meal-template; extend to check meal-template rules (D-05 override logic) before reading `prefs.base_type_rules`

### Established Patterns
- Zod `z.discriminatedUnion('type', [...])` for `CompiledFilter` in `src/types/plan.ts` — add `meal-template` variant following same pattern (already has `no-repeat` and `scheduling-rule`)
- Warning emission pattern: `warnings.push({ type: '...', message: '...' })` throughout generator.ts — use for all meal-template fallback cases (D-10)
- `Extract<CompiledFilter, { type: 'X' }>` for typed rule extraction in generator — use for `meal-template` extraction
- `compileRule()` switch in `rule-compiler.ts` — add `'meal-template'` case (structural mapping from `RuleDefinition` to `CompiledFilter`)

### Integration Points
- `CompiledFilterSchema` in `src/types/plan.ts`: add `meal-template` as a new union member
- `getEligibleBases()` in `generator.ts`: primary integration point for slot assignment (D-05 to D-07)
- Required extras block in generator.ts (~line 578): secondary integration point for `require_extra_category` override
- Composition constraints (exclude_component_types, exclude_extra_categories) need new filtering steps in the curry/subzi/extras selection loops within `generateWeekPlan()`
- `db.version(6)` in `src/db/client.ts`: Dexie schema version bump needed to signal the new phase (no data migration — prefs stay, new meal-template rules can be stored in existing `rules` table since it stores `CompiledFilter` as JSON)

</code_context>

<specifics>
## Specific Ideas

- The todo's example rules are the canonical reference for expected behaviour:
  | Intent | meal-template config |
  |--------|----------------------|
  | Rice-based at lunch and dinner only | `base_type=rice, allowed_slots=[lunch, dinner]` |
  | Bread-based: no subzi, no sweets | `base_type=bread, exclude_component_types=[subzi], exclude_extra_categories=[sweet]` |
  | Bread-based on weekdays: no subzi | `base_type=bread, days=[mon-fri], exclude_component_types=[subzi]` |
  | Bread-based always needs sambar | `base_type=bread, require_extra_category=liquid` |

- `component_slot_overrides` (per-component slot restrictions, e.g., Poori → breakfast only) is NOT part of this phase — it stays in prefs and is not migrated until Phase 10 (or addressed separately). The todo mentioned migrating these to `require-component` rules; this is deferred.

- `extra_quantity_limits` in prefs (global max extras per slot) is explicitly out of scope for both Phase 9 and 10 — it stays as a simple preference.

</specifics>

<deferred>
## Deferred Ideas

- UI form for creating meal-template rules — Phase 10
- Deletion of `/settings/slots` route and components — Phase 10
- Migration of `prefs.slot_restrictions.base_type_slots` and `prefs.base_type_rules` to meal-template rules — Phase 10
- `component_slot_overrides` migration (Poori → breakfast) — Phase 10 or separate phase
- Multiple `require_extra_category` values on one rule (e.g., require BOTH liquid and sweet) — current design supports one per rule; compose multiple rules if needed

</deferred>

---

*Phase: 09-meal-template-engine*
*Context gathered: 2026-03-25*
