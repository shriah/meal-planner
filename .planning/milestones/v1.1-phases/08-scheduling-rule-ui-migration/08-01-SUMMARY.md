---
phase: 08-scheduling-rule-ui-migration
plan: "01"
subsystem: data-layer
tags: [migration, dexie, types, generator, tests]
dependency_graph:
  requires: []
  provides: [migrateCompiledFilter, dexie-v5-upgrade, CompiledFilter-2-variants, RuleDefinition-2-variants]
  affects: [src/db/client.ts, src/types/plan.ts, src/services/rule-compiler.ts, src/services/generator.ts, src/components/rules/types.ts]
tech_stack:
  added: []
  patterns: [pure-function-extraction-for-testability, dexie-version-upgrade]
key_files:
  created:
    - src/db/client.test.ts
  modified:
    - src/db/client.ts
    - src/types/plan.ts
    - src/services/rule-compiler.ts
    - src/services/generator.ts
    - src/components/rules/types.ts
    - src/components/rules/ruleDescriptions.ts
    - src/components/rules/ruleDescriptions.test.ts
    - src/components/rules/RuleImpactPreview.tsx
    - src/components/rules/RuleRow.tsx
    - src/services/rule-compiler.test.ts
    - src/services/generator.test.ts
    - src/services/food-db.test.ts
decisions:
  - "migrateCompiledFilter exported as pure function for independent unit testing — avoids Dexie upgrade callback complexity"
  - "day-filter -> scheduling-rule(filter-pool + tag match), require-component -> scheduling-rule(require-one + component match)"
  - "ruleDescriptions.ts, RuleImpactPreview.tsx, RuleRow.tsx updated in Task 1 (not deferred to Plan 02) since they reference removed CompiledFilter variants directly"
metrics:
  duration: "6min"
  completed_date: "2026-03-25"
  tasks_completed: 3
  files_modified: 12
---

# Phase 08 Plan 01: Dexie v5 Migration + Type System Cleanup Summary

Dexie v5 upgrade with automatic migration of day-filter/require-component records to scheduling-rule, full type system reduction from 4 to 2 CompiledFilter variants, and generator dead-code removal with test fixture conversion.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 0 | Migration logic unit tests | 656815b | src/db/client.ts, src/db/client.test.ts |
| 1 | Dexie v5 migration + type system cleanup | 2c8725d | src/types/plan.ts, src/services/rule-compiler.ts, src/components/rules/types.ts, ruleDescriptions.ts, RuleImpactPreview.tsx, RuleRow.tsx |
| 2 | Generator dead code removal + test fixture updates | 49e2bdf | src/services/generator.ts, rule-compiler.test.ts, generator.test.ts, food-db.test.ts |

## What Was Built

**migrateCompiledFilter** — Pure function exported from `src/db/client.ts` that maps:
- `day-filter` → `scheduling-rule { effect: 'filter-pool', match: { mode: 'tag', filter: ... } }`
- `require-component` → `scheduling-rule { effect: 'require-one', match: { mode: 'component', component_id: ... } }`
- All other types pass through unchanged (reference equality preserved)

**Dexie v5 upgrade** — `db.version(5)` with `.upgrade()` callback that applies `migrateCompiledFilter` to every rule's `compiled_filter` field.

**Type system** — `CompiledFilterSchema` and `RuleDefinition` reduced from 4 to 2 variants (`no-repeat` and `scheduling-rule`). `DayFilterRule`, `RequireComponentRule` type aliases deleted. `DayFilterFormState`, `RequireComponentFormState` deleted from component types.

**Generator** — Removed: `applyDayFilterToPool()`, `isRuleApplicable` day-filter/require-component cases, `requireRules` extraction block, day-filter soft constraint application in base selection, require-component base selection pass. Simplified `pickFromPool()` to pure weighted-random selection.

**Tests** — 8 new migration unit tests in `client.test.ts`. Generator tests 9–12 and 19–21 converted from day-filter/require-component fixtures to scheduling-rule fixtures. 146 total tests passing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ruleDescriptions.ts, RuleImpactPreview.tsx, RuleRow.tsx broken by type removal**
- **Found during:** Task 1
- **Issue:** Removing day-filter and require-component from CompiledFilter broke switch/case exhaustiveness in ruleDescriptions.ts, FormState type checks in RuleImpactPreview.tsx, and conditional type label in RuleRow.tsx
- **Fix:** Updated all three files to work with the 2-variant type system. ruleDescriptions.test.ts converted to use no-repeat and scheduling-rule test cases.
- **Files modified:** src/components/rules/ruleDescriptions.ts, src/components/rules/ruleDescriptions.test.ts, src/components/rules/RuleImpactPreview.tsx, src/components/rules/RuleRow.tsx
- **Commits:** 2c8725d

## Known Stubs

None — all changes are functional. RuleForm.tsx still references deleted types (DayFilterFormState, RequireComponentFormState, SET_FILTER, SET_COMPONENT_ID) which will be fixed in Plan 02.

## Verification

- `npx vitest run src/db/client.test.ts` — 8 migration tests pass
- `npx vitest run` — 146 total tests pass
- `grep -r "day-filter" src/services/ src/types/plan.ts src/db/client.ts` — only in migrateCompiledFilter (migration logic only)
- `grep -r "require-component" src/services/ src/types/plan.ts src/db/client.ts` — only in migrateCompiledFilter

## Self-Check: PASSED
