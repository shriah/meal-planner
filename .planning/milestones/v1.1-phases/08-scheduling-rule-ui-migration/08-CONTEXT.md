# Phase 8: Scheduling Rule UI + Migration - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the `SchedulingRuleFields` form component in the Rules UI so users can create scheduling-rule records through the existing `/rules/new` form. Simultaneously: remove the `day-filter` and `require-component` tabs from the form (they are superseded by scheduling-rule), migrate all existing day-filter and require-component records in IndexedDB to scheduling-rule format via a Dexie v3 upgrade, and remove the old CompiledFilter variants from the type system.

This phase does NOT include: meal-template engine or UI (Phases 9–10), /settings/slots removal (Phase 10), or changes to the generator beyond removing the now-deleted old rule type branches.

**SCHED-05 is the sole requirement:** Existing `day-filter` and `require-component` rules automatically migrated to `scheduling-rule` at startup; old CompiledFilter variants removed.

</domain>

<decisions>
## Implementation Decisions

### Effect selector UI

- **D-01:** Effect selector uses a tab/segmented control with **plain English labels**: "Only allow" / "Always include" / "Never include" (mapping to filter-pool / require-one / exclude respectively).
  - Compact, matches existing rule-type tab style in the form
  - Plain English preferred over technical names (filter-pool etc.) — personal app, clarity matters

### Match mode

- **D-02:** Match mode is presented as a **radio toggle** immediately below the effect tabs:
  `● By tag   ○ Specific component`
  Selecting one reveals the relevant fields below. Two options, no dropdown needed.

### Component picker (Specific component mode)

- **D-03:** Component picker uses a **two-step flow**: type selector first (base / curry / subzi), then a filtered combobox showing only components of that type. Mirrors the NoRepeatFields `component_type` picker pattern, then filters the component list.
  - No extras in the component picker — scheduling-rule operates on base/curry/subzi selection paths only (extras use compatible_base_types, not scheduling-rule).

### Day/slot scope

- **D-04:** Day and slot scope fields (carried from Phase 5 DayFilterFields pattern) appear below the match configuration. Both are optional — omitting means "all days" / "all slots" (null in CompiledFilter, consistent with Phase 7 D-09).

### Tab removal

- **D-05:** `day-filter` and `require-component` tabs are **removed** from `RuleForm.tsx`. The form's tab set becomes: `no-repeat` | `scheduling-rule`. The `onValueChange` type cast and `SET_RULE_TYPE` dispatch are updated accordingly. `DayFilterFormState`, `RequireComponentFormState`, and their form field components (`DayFilterFields`, `RequireComponentFields`) are **deleted** — they are replaced by `SchedulingRuleFields`.

### Migration (silent)

- **D-06:** Migration is **silent** — no UI notification, no banner. Migrated rules appear in the rules list with correct `scheduling-rule` descriptions (ruleDescriptions.ts already handles this). This is a personal app; the migrated rules will be visible immediately on next visit.

### Migration semantics

- **D-07:** `day-filter` → `scheduling-rule`:
  - `effect: 'filter-pool'`
  - `days: filter.days` (already DayOfWeek[])
  - `slots: filter.slots ?? null`
  - `match: { mode: 'tag', filter: filter.filter }`

- **D-08:** `require-component` → `scheduling-rule`:
  - `effect: 'require-one'`
  - `days: filter.days` (already DayOfWeek[])
  - `slots: filter.slots ?? null`
  - `match: { mode: 'component', component_id: filter.component_id }`

- **D-09:** Migration runs in a **Dexie v3 upgrade function**. After migration, `day-filter` and `require-component` variants are removed from `CompiledFilterSchema` in `src/types/plan.ts`. The generator's handling of those variants is also removed.

### Preset examples update

- **D-10:** Example presets in `RuleEmptyState` updated to scheduling-rule format:
  - **Fish Fridays** → `{ ruleType: 'scheduling-rule', effect: 'require-one', days: ['friday'], slots: [], match: { mode: 'tag', filter: { protein_tag: 'fish' } } }`
    *(Label: "Always include, protein: fish on Fridays")*
  - **Weekend special** → `{ ruleType: 'scheduling-rule', effect: 'filter-pool', days: ['saturday', 'sunday'], slots: [], match: { mode: 'tag', filter: { occasion_tag: 'weekend' } } }`
    *(Label: "Only allow occasion: weekend on weekends")*
  - **No paneer weekdays** (new) → `{ ruleType: 'scheduling-rule', effect: 'exclude', days: ['monday','tuesday','wednesday','thursday','friday'], slots: [], match: { mode: 'tag', filter: { protein_tag: 'paneer' } } }`
    *(Label: "Never include protein: paneer on weekdays")*
  - **No repeat subzi** — unchanged (stays as no-repeat preset)

### Claude's Discretion

- Exact form validation logic for scheduling-rule (minimum required fields before Save enables: name + effect selected + match mode selected + at least one tag filter key OR component_id not null)
- Impact preview — `RuleImpactPreview` needs a scheduling-rule case; follow the existing `day-filter` pattern (count components matching the tag filter, or single component for component mode)
- Whether to preserve `DayFilterFormState` and `RequireComponentFormState` type aliases in `types.ts` as deprecated or delete entirely (prefer delete)
- Exact error/fallback if a stored rule has an unknown type after migration (log and skip)

</decisions>

<specifics>
## Specific Ideas

- The `formReducer`'s `SET_RULE_TYPE` case for `'scheduling-rule'` already returns the right initial state (Phase 7 added it). Just needs `'day-filter'` and `'require-component'` cases removed.
- The `isFormValid()` function in `RuleForm.tsx` needs a `scheduling-rule` branch. Valid when: `effect !== ''` AND (`match.mode === 'tag'` with at least one non-empty tag filter key, OR `match.mode === 'component'` with `component_id !== null`).
- `EXAMPLE_PRESETS` in `RuleForm.tsx` is a `Record<string, FormState>` — three preset keys need updating, fourth (no-repeat-subzi) stays.
- Phase 9/10 deferred note: user prefers **per-base multi-select** for meal-template slot assignment (one rule per base type, "Allowed in: [lunch] [dinner]" as chip group).

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Rule form (primary integration point)
- `src/components/rules/RuleForm.tsx` — existing form with tabs, reducer, presets, validation; Phase 8 modifies this file heavily
- `src/components/rules/types.ts` — `FormState` union, `SchedulingRuleFormState`, all `FormAction` types; `DayFilterFormState` and `RequireComponentFormState` to be removed
- `src/components/rules/RuleFormFields/` — `DayFilterFields.tsx` and `RequireComponentFields.tsx` to be deleted; new `SchedulingRuleFields.tsx` to be created following the same pattern

### Type system and compiler
- `src/types/plan.ts` — `CompiledFilterSchema` discriminated union; `day-filter` and `require-component` variants removed after migration
- `src/services/rule-compiler.ts` — `compileRule()` switch; `'day-filter'` and `'require-component'` cases removed

### Generator
- `src/services/generator.ts` — remove `day-filter` and `require-component` handling branches; scheduling-rule already wired from Phase 7

### Dexie schema (migration)
- `src/db/client.ts` — add `db.version(3)` upgrade function; migration logic per D-07/D-08 above. Currently at v2.

### Existing form field components (reference patterns)
- `src/components/rules/RuleFormFields/DayFilterFields.tsx` — day/slot checkbox pattern (reference then delete)
- `src/components/rules/RuleFormFields/RequireComponentFields.tsx` — component combobox pattern (reference then delete)
- `src/components/rules/RuleFormFields/NoRepeatFields.tsx` — component type radio pattern (reference, keep)

### Rule descriptions (already handles scheduling-rule)
- `src/components/rules/ruleDescriptions.ts` — `describeRule()` already has `scheduling-rule` case from Phase 7; no changes needed

### Impact preview
- `src/components/rules/RuleImpactPreview.tsx` — needs scheduling-rule case; follow day-filter pattern

### Tests
- `src/services/rule-compiler.test.ts` — remove day-filter / require-component compile tests once those variants are deleted; add migration logic tests
- `src/services/generator.test.ts` — 144 tests must still pass; some test fixtures using old rule variants need updating to scheduling-rule

### Requirements
- `.planning/REQUIREMENTS.md` — SCHED-05
- `.planning/ROADMAP.md` — Phase 8 success criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SchedulingRuleFormState` in `types.ts` — fully defined in Phase 7 with all required fields
- `SET_EFFECT` and `SET_MATCH_MODE` actions in `FormAction` — already wired, reducer cases exist
- `formReducer` case `'scheduling-rule'` in `RuleForm.tsx` — already returns correct initial state
- `DayFilterFields` — day/slot checkboxes; reuse this sub-pattern inside `SchedulingRuleFields` for the scope section
- `RequireComponentFields` — component combobox pattern; reuse inside `SchedulingRuleFields` for component-mode picker (but with type-first two-step flow per D-03)
- `db.version(2)` upgrade in `src/db/client.ts` — reference pattern for adding `db.version(3)`

### Established Patterns
- `'use client'` required for any component touching Dexie
- `useLiveQuery` for reactive rule reads — no changes needed; rule list stays reactive
- Tabs component from shadcn/ui already used for rule type selector — same for effect selector
- Form fields always exported as named components from `RuleFormFields/` subdirectory

### Integration Points
- `RuleForm.tsx` tab set: remove `day-filter` and `require-component` tabs, add `scheduling-rule` tab
- `RuleForm.tsx` `handleSave()`: add scheduling-rule branch to build RuleDefinition and call compileRule
- `src/db/client.ts`: add version(3) upgrade
- `src/types/plan.ts`: remove two CompiledFilter variants from discriminated union
- `src/services/generator.ts`: remove dead code for deleted rule types

</code_context>

<deferred>
## Deferred Ideas

- **Meal-template engine and UI** — Phases 9–10 as roadmapped. Detailed spec already captured in `.planning/todos/pending/2026-03-22-refactor-and-move-slot-setting-to-rules-tab.md`. User prefers per-base multi-select chip group for slot assignment form.
- **Rule editing** — Click existing rule to edit (not just toggle/delete). Deferred from Phase 5, still deferred.
- **LLM natural language rule input** — Deferred from Phase 3 and Phase 5, still deferred.

</deferred>

---

*Phase: 08-scheduling-rule-ui-migration*
*Context gathered: 2026-03-24*
