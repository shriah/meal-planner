---
phase: 07-scheduling-rule-engine
plan: 01
subsystem: rule-engine
tags: [types, compiler, tdd, scheduling-rule]
dependency_graph:
  requires: []
  provides: [scheduling-rule-zod-variant, SchedulingRule-type, SchedulingRuleFormState, compileRule-scheduling-rule]
  affects: [src/types/plan.ts, src/services/rule-compiler.ts, src/components/rules/types.ts]
tech_stack:
  added: []
  patterns: [discriminated-union-extension, zod-discriminated-union, tdd-red-green]
key_files:
  created: []
  modified:
    - src/types/plan.ts
    - src/services/rule-compiler.ts
    - src/services/rule-compiler.test.ts
    - src/components/rules/types.ts
    - src/components/rules/RuleForm.tsx
    - src/components/rules/ruleDescriptions.ts
decisions:
  - "scheduling-rule CompiledFilter uses nullable days/slots (not optional) — consistent with day-filter and require-component patterns; undefined from RuleDefinition converts to null at compile time"
  - "SchedulingRuleFormState.match uses mode:''/mode:'tag'/mode:'component' discriminated union — empty string sentinel matches existing component_type:'' pattern in NoRepeatFormState"
  - "SET_EFFECT and SET_MATCH_MODE FormActions added to support Phase 8 UI without requiring form reducer redesign"
metrics:
  duration: 199s
  completed_date: "2026-03-22"
  tasks_completed: 2
  files_modified: 6
---

# Phase 07 Plan 01: scheduling-rule Type System Summary

Established the scheduling-rule data contracts (Zod variant, type aliases, compiler case, form state types) that Plans 02 and 03 depend on.

## What Was Built

Added `scheduling-rule` as a fourth variant to the `CompiledFilterSchema` discriminated union, extended `RuleDefinition` and `compileRule()` to handle the new type, added `SchedulingRuleFormState` for Phase 8 UI consumption, and wired `SET_EFFECT`/`SET_MATCH_MODE` actions into the existing form reducer.

**Key contracts established:**

- `CompiledFilterSchema` now accepts `{ type: 'scheduling-rule', effect: 'filter-pool'|'require-one'|'exclude', days: DayOfWeek[]|null, slots: MealSlot[]|null, match: { mode: 'tag', filter: TagFilter } | { mode: 'component', component_id: number } }`
- `SchedulingRule` type alias exported from `plan.ts`
- `compileRule()` converts `undefined` days/slots to `null` (consistent with existing variants)
- `SchedulingRuleFormState` exported from `types.ts` with `mode: ''` sentinel for unset match mode

## Tasks

| Task | Name | Commit | Files Modified |
|------|------|--------|----------------|
| 1 | Add scheduling-rule Zod variant, type alias, and RuleDefinition extension | a460dc2 | src/types/plan.ts, src/services/rule-compiler.ts, src/services/rule-compiler.test.ts, src/components/rules/ruleDescriptions.ts |
| 2 | Add scheduling-rule compiler tests, SchedulingRuleFormState, FormAction updates | 903f33f | src/services/rule-compiler.test.ts, src/components/rules/types.ts, src/components/rules/RuleForm.tsx |

## Verification

- `npx tsc --noEmit` exits 0
- `npx vitest run src/services/rule-compiler.test.ts` exits 0 — 18 tests (9 existing + 9 new)
- `npx vitest run` exits 0 — 128 tests total (no regressions)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Exhaustive switch required compileRule() and describeRule() scheduling-rule cases in Task 1**

- **Found during:** Task 1 (TypeScript check after adding scheduling-rule to CompiledFilterSchema)
- **Issue:** Adding `scheduling-rule` to `CompiledFilterSchema` made `RuleDefinition` union grow, causing TypeScript to report TS2366 (function lacks ending return statement) on both `compileRule()` in `rule-compiler.ts` and `describeRule()` in `ruleDescriptions.ts` — both switch on `filter.type` / `def.ruleType` without a `scheduling-rule` case
- **Fix:** Added `case 'scheduling-rule'` to both functions as part of Task 1. Also added `scheduling-rule` case to `RuleForm.tsx` reducer's `SET_RULE_TYPE` switch for the same reason
- **Files modified:** src/services/rule-compiler.ts, src/components/rules/ruleDescriptions.ts, src/components/rules/RuleForm.tsx
- **Commit:** a460dc2 (compiler case), 903f33f (RuleForm.tsx case)

**2. [Rule 1 - Bug] RuleForm.tsx SET_DAYS and SET_SLOTS guards needed scheduling-rule in Task 2**

- **Found during:** Task 2 (TypeScript check after adding SchedulingRuleFormState to FormState union)
- **Issue:** `SET_DAYS` and `SET_SLOTS` reducer cases only guarded `day-filter | require-component`, not `scheduling-rule`. TypeScript narrowing would fail at runtime if days/slots were dispatched for a scheduling-rule form state
- **Fix:** Added `|| state.ruleType === 'scheduling-rule'` to both guards
- **Files modified:** src/components/rules/RuleForm.tsx
- **Commit:** 903f33f

**Note:** Because Rule 1 required adding the compiler case during Task 1, the TDD RED phase for Task 2's compiler tests was skipped (tests were immediately GREEN). The Zod schema tests did exhibit proper RED-then-GREEN cycle for Task 1.

## Known Stubs

None — all contracts are fully wired. `SchedulingRuleFormState` is intentionally a stub type (no UI renders it yet — that is Phase 8's job). The type is complete and valid; the missing piece is UI, which is planned.

## Self-Check: PASSED

All files found. All commits exist. Full test suite: 128 tests passing.
