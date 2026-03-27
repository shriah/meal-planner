---
phase: 07-scheduling-rule-engine
plan: 03
subsystem: generator
tags: [generator, scheduling-rule, require-one, tdd, two-pass]
dependency_graph:
  requires: [applySchedulingFilterPool, applySchedulingExclude, scheduling-rule-generator-integration]
  provides: [applyRequireOneByTag, applyRequireOneByComponent, require-one-full-generator-integration]
  affects: [src/services/generator.ts, src/services/generator.test.ts]
tech_stack:
  added: []
  patterns: [tdd-red-green, two-pass-require-one, D-03-warn-skip, D-04-inject, D-05-full-library-override, D-06-require-wins, D-07-all-satisfied]
key_files:
  created: []
  modified:
    - src/services/generator.ts
    - src/services/generator.test.ts
decisions:
  - "applyRequireOneByTag uses uniform Math.random (not weightedRandom) for override pick — explicit requirement from plan spec"
  - "TypeScript narrowing of rule.match requires capturing discriminated union branch into local const (tagMatch) before accessing .filter property"
  - "require-one pass-2 applied inside the curryPool/subziPool > 0 guard block — only runs when a component was selected, mirrors base pattern"
  - "Multiple require-one rules per slot satisfied by iterating all rules in applyRequireOneByTag and applyRequireOneByComponent without early break (D-07)"
metrics:
  duration: 159s
  completed_date: "2026-03-22"
  tasks_completed: 1
  files_modified: 2
---

# Phase 07 Plan 03: Require-One Generator Integration Summary

**One-liner:** Two-pass require-one effect in generator — tag-mode overrides from full library (D-05/D-06), component-mode injects with type guard (D-04/Pitfall 2), warn-skip on no match (D-03), multiple rules all satisfied (D-07).

## What Was Built

Completed the scheduling-rule generator integration by implementing the require-one effect. All three scheduling-rule effects (filter-pool, require-one, exclude) now work in the generator. This was the final plan of Phase 07.

### Key Components

**`applyRequireOneByTag`** (new helper in generator.ts):
- Two-pass mechanism: if selected component already satisfies the tag criteria, no-op
- Override path: picks from the **full component library** (bypassing filter-pool rules — D-06)
- Uses `Math.floor(Math.random() * candidates.length)` — uniform random, not weighted (explicit requirement)
- Warns and skips if no matching component found anywhere in library (D-03)
- TypeScript narrowing: captures `rule.match` into `const tagMatch` to satisfy discriminated union type checker

**`applyRequireOneByComponent`** (new helper in generator.ts):
- Injects the required component regardless of what filter-pool rules would have selected (D-04)
- Type guard: `c.componentType === expectedComponentType` — prevents a curry ID from affecting base selection (Pitfall 2)
- Silent skip if component exists but wrong type; warning if component not found at all
- Iterates all require-one rules without early break (D-07)

**Main loop integration** (pass-2 after normal selection):
- Base selection: after `weightedRandom(finalBasePool, ...)`, applies both tag and component require-one
- Curry selection: inside `if (picked)` block after `pickFromPool`, applies both require-one helpers
- Subzi selection: same pattern as curry

## Task Summary

| Task | Description | Commit |
|------|-------------|--------|
| 1 (RED) | 8 failing tests for require-one behavior | b2f0bd5 |
| 1 (GREEN) | applyRequireOneByTag + applyRequireOneByComponent + main loop integration | 4436336 |

## Test Results

- 8 new require-one tests (SCHED-R1 through SCHED-R8) — all passing
- 42 existing tests (22 original + 8 filter-pool/exclude from Plan 02 + 12 other) — all still passing
- Total: 144 tests across 12 test files — all passing
- `npx tsc --noEmit` — clean

## Acceptance Criteria Verification

- [x] `src/services/generator.ts` contains `function applyRequireOneByTag`
- [x] `src/services/generator.ts` contains `function applyRequireOneByComponent`
- [x] `src/services/generator.ts` contains `Math.floor(Math.random() * candidates.length)` (uniform random)
- [x] `src/services/generator.ts` contains `no component in library matches tag filter` warning message (D-03)
- [x] `src/services/generator.ts` contains `c.componentType === expectedComponentType` check (Pitfall 2 guard)
- [x] `src/services/generator.test.ts` contains `describe('SCHED: scheduling-rule require-one'`
- [x] 8 new require-one test cases (SCHED-R1 through SCHED-R8)
- [x] `npx vitest run src/services/generator.test.ts` exits 0
- [x] `npx vitest run` exits 0 (full suite — 144 tests)

## Deviations from Plan

**1. [Rule 1 - Bug] TypeScript type narrowing fix for discriminated union access**
- **Found during:** GREEN phase, TypeScript check
- **Issue:** `rule.match.filter` not accessible after `rule.match.mode !== 'tag'` continue — TypeScript couldn't narrow the discriminated union property through the `continue` guard
- **Fix:** Captured `const tagMatch = rule.match` after the mode check to give TypeScript a narrowed reference
- **Files modified:** `src/services/generator.ts` (line ~257)
- **Commit:** 4436336 (fixed inline before GREEN commit)

## Known Stubs

None — all require-one behavior is fully wired with real component data from Dexie.

## Self-Check: PASSED
