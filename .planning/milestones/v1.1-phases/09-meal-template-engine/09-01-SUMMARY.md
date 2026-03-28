---
phase: 09-meal-template-engine
plan: "01"
subsystem: rule-engine
tags: [meal-template, types, zod, dexie, rule-compiler, ui]
dependency_graph:
  requires: []
  provides: [MealTemplateRule-type, meal-template-compiler-case, Dexie-v6, describeRule-meal-template, RuleRow-badge]
  affects: [src/types/plan.ts, src/services/rule-compiler.ts, src/db/client.ts, src/components/rules/ruleDescriptions.ts, src/components/rules/RuleRow.tsx]
tech_stack:
  added: []
  patterns: [discriminated-union-extension, Zod-schema-extension, TDD-red-green]
key_files:
  created: []
  modified:
    - src/types/plan.ts
    - src/services/rule-compiler.ts
    - src/services/rule-compiler.test.ts
    - src/db/client.ts
    - src/components/rules/ruleDescriptions.ts
    - src/components/rules/RuleRow.tsx
decisions:
  - "ExtraCategory imported from @/types/component into plan.ts for RuleDefinition meal-template variant"
  - "meal-template Zod variant uses z.enum(['liquid','crunchy','condiment','dairy','sweet']).nullable() for require_extra_category"
  - "Dexie v6 has no upgrade() callback — rules table stores CompiledFilter as JSON so new variant requires no migration"
  - "ruleDescriptions.ts TS2366 exhaustiveness error resolved as a side effect of adding meal-template case"
metrics:
  duration: "165s"
  completed_date: "2026-03-25"
  tasks_completed: 2
  files_modified: 6
---

# Phase 09 Plan 01: Meal-Template Type Foundation Summary

MealTemplateRule Zod variant added to CompiledFilterSchema discriminated union with 8 fields, compileRule() handles meal-template with correct null/[] defaults, Dexie bumped to v6, and describeRule + RuleRow badge support the new rule type.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Add meal-template Zod schema, type alias, RuleDefinition variant, compiler case | 3c5931f | src/types/plan.ts, src/services/rule-compiler.ts, src/services/rule-compiler.test.ts |
| 2 | Dexie v6 bump, describeRule meal-template case, RuleRow badge update | a0c5fdc | src/db/client.ts, src/components/rules/ruleDescriptions.ts, src/components/rules/RuleRow.tsx |

## What Was Built

### Task 1: Type Foundation + Compiler Case (TDD)

Added the `meal-template` variant to `CompiledFilterSchema` with 8 fields:
- `type: z.literal('meal-template')`
- `base_type: z.enum(['rice-based', 'bread-based', 'other'])`
- `days: z.array(DayOfWeekEnum).nullable()`
- `slots: z.array(MealSlotEnum).nullable()`
- `allowed_slots: z.array(MealSlotEnum).nullable()`
- `exclude_component_types: z.array(z.enum(['curry', 'subzi']))`
- `exclude_extra_categories: z.array(z.enum([...ExtraCategory values...]))`
- `require_extra_category: z.enum([...ExtraCategory values...]).nullable()`

Exported `MealTemplateRule` type alias. Extended `RuleDefinition` union with meal-template variant (all fields optional except `base_type`). Added `case 'meal-template'` to `compileRule()` with `?? null` / `?? []` defaults. Added 11 new tests (meal-template rules + Zod schema blocks); 45 total tests pass.

### Task 2: Dexie v6 + UI Description Support

Added `db.version(6).stores({...})` without `.upgrade()` callback — the rules table stores `CompiledFilter` as JSON so new variant is stored transparently. Added `case 'meal-template':` to `describeRule()` following the UI-SPEC Copywriting Contract format (base label + slots qualifier + parts array). Replaced `ruleTypeLabel` ternary in `RuleRow.tsx` with a `Record<string, string>` map that handles all three variants; Badge now renders "Meal Template" for meal-template rules.

**Side effect fix:** The pre-existing `TS2366: Function lacks ending return statement` error in `ruleDescriptions.ts` was resolved by the exhaustive switch — TypeScript now recognizes full coverage of the discriminated union.

## Verification

- All 444 tests pass (39 test files, no regressions)
- TypeScript: only pre-existing `export-plan/route.ts` errors remain (out-of-scope, existed before this plan)
- New files satisfy all `must_haves.artifacts` requirements

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Bonus Fix (Rule 1 — Bug, pre-existing)

**Found during:** Task 2
**Issue:** `ruleDescriptions.ts` had `TS2366: Function lacks ending return statement` because the switch over `CompiledFilter` was non-exhaustive (missing meal-template variant).
**Fix:** Adding `case 'meal-template':` completed the switch, eliminating the TS error automatically.
**Files modified:** src/components/rules/ruleDescriptions.ts
**Commit:** a0c5fdc

## Known Stubs

None — all new code paths are fully wired. The meal-template variant can be created, parsed, stored, compiled, described, and badged.

## Self-Check: PASSED

- All 6 modified files exist on disk
- Commits 3c5931f and a0c5fdc confirmed in git log
- 444 tests pass (39 test files)
- meal-template variant satisfies all must_haves.artifacts requirements
