---
phase: 03-plan-generator-rule-engine
plan: 01
subsystem: database
tags: [dexie, zod, typescript, indexeddb, discriminated-union]

# Dependency graph
requires:
  - phase: 01-data-foundation
    provides: ComponentRecord, MealRecord, UserPreferencesRecord, Dexie db schema v1
  - phase: 02-meal-library-ui
    provides: MealSlot, SlotRestrictions, BaseTypeRule types from preferences.ts
provides:
  - CompiledFilter discriminated union with Zod schema (day-filter, no-repeat, require-component)
  - RuleRecord with typed compiled_filter field and enabled boolean in Dexie
  - Rule CRUD functions (getRules, getEnabledRules, addRule, updateRule, deleteRule)
  - Frequency type and frequency? field on ComponentRecord
  - All Phase 3 types: PlanSlot, WeeklyPlan, Warning, GeneratorResult, RuleDefinition
affects: [03-plan-generator-rule-engine, 04-plan-board-ui, 05-rule-manager-ui]

# Tech tracking
tech-stack:
  added: [zod (discriminatedUnion schema for CompiledFilter)]
  patterns: [Dexie version migration with upgrade() for field renames, in-memory filter after toArray() for low-volume tables (<50 rows)]

key-files:
  created:
    - src/types/plan.ts
  modified:
    - src/types/component.ts
    - src/db/client.ts
    - src/services/food-db.ts
    - src/services/food-db.test.ts

key-decisions:
  - "CompiledFilter stored as typed discriminated union (not raw JSON/unknown) — compile-time safety for all rule variants"
  - "rules table drops is_active index in v2 (now ++id only) — enabled field filtered in-memory since <50 rows"
  - "Frequency field is optional on ComponentRecord with no Dexie index — generator reads frequency ?? 'normal' as safe fallback"
  - "db.version(2) upgrade migrates is_active->enabled and text->name to support existing rule rows"

patterns-established:
  - "Dexie version(N).upgrade() pattern: use modify() to rename fields on existing rows during schema migration"
  - "Rule CRUD in food-db.ts follows same pattern as component CRUD — pure async TypeScript, no React"

requirements-completed: [RULE-02]

# Metrics
duration: 2min
completed: 2026-03-20
---

# Phase 3 Plan 01: Foundation Types and Rule CRUD Summary

**Zod-validated CompiledFilter discriminated union (day-filter, no-repeat, require-component), Dexie v2 migration with typed RuleRecord, and rule CRUD in food-db.ts**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-20T14:04:10Z
- **Completed:** 2026-03-20T14:06:24Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Created `src/types/plan.ts` with full Phase 3 type system: CompiledFilter discriminated union, TagFilter, RuleDefinition, PlanSlot, WeeklyPlan, Warning, GeneratorResult — all with Zod schemas
- Updated Dexie schema to version 2 with typed RuleRecord (name, enabled, compiled_filter: CompiledFilter) and migration upgrading existing rows from is_active/text fields
- Added 5 rule CRUD functions to food-db.ts and 4 new passing tests — all 11 tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Create plan types and Zod schemas, add frequency to ComponentRecord** - `d36da8d` (feat)
2. **Task 2: Update Dexie schema to v2 with typed RuleRecord and add rule CRUD to food-db.ts** - `d27299f` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/types/plan.ts` - All Phase 3 types and Zod schemas; CompiledFilter discriminated union with 3 variants
- `src/types/component.ts` - Added Frequency type and frequency? optional field to ComponentRecord
- `src/db/client.ts` - Replaced RuleRecord stub with typed record; added db.version(2) migration
- `src/services/food-db.ts` - Added getRules, getEnabledRules, addRule, updateRule, deleteRule
- `src/services/food-db.test.ts` - Added db.rules.clear() in beforeEach; added Rule CRUD describe block with 4 tests

## Decisions Made

- `rules` table in v2 uses `'++id'` only (not `'++id, is_active'`) because the `enabled` field replaces `is_active`, filtering in-memory after `toArray()` is sufficient for < 50 rows
- Zod `discriminatedUnion` on the `type` field provides runtime validation of stored rule JSON — mismatched rule records will throw on parse rather than silently corrupt generation results
- `frequency` field added as optional with no Dexie index — generator reads `component.frequency ?? 'normal'` safely, and seeded components without the field work without migration

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All Phase 3 type definitions are in place — plan generator (03-02) and rule compiler (03-03) can now import from `src/types/plan.ts` and `src/services/food-db.ts`
- RuleRecord is fully typed — no unknown field access needed in generator or compiler
- Existing 11 tests passing, TypeScript compilation clean

---
*Phase: 03-plan-generator-rule-engine*
*Completed: 2026-03-20*
