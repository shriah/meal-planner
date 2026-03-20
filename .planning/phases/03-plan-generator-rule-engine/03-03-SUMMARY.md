---
phase: 03-plan-generator-rule-engine
plan: 03
subsystem: generator
tags: [generator, weighted-random, rule-engine, tdd, typescript, dexie]

# Dependency graph
requires:
  - phase: 03-01
    provides: CompiledFilter, RuleRecord, PlanSlot, WeeklyPlan, Warning, GeneratorResult, getEnabledRules
  - phase: 01-data-foundation
    provides: ComponentRecord, UserPreferencesRecord, getAllComponents, getPreferences
provides:
  - generate() async function returning GeneratorResult (21-slot WeeklyPlan + warnings)
  - Weighted random selection with frequency weighting and recency halving
  - DayFilterRule enforcement with over-constrained fallback
  - NoRepeatRule enforcement (skip component when pool exhausted, no fallback repeats)
  - Extra compatibility filtering by compatible_base_types
  - Mandatory extra enforcement via base_type_rules
affects: [04-plan-board-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "weightedRandom with cumulative probability for O(n) weighted selection"
    - "effectiveWeight = frequency_weight * 0.5^uses for recency halving"
    - "Pre-filter no-repeat pool before calling pickFromPool — no fallback to repeat"
    - "Slot fill order: all breakfasts, then lunches, then dinners"
    - "Separate usedBaseIds/usedCurryIds/usedSubziIds Sets for per-type no-repeat tracking"

key-files:
  created:
    - src/services/generator.ts
    - src/services/generator.test.ts

key-decisions:
  - "NoRepeatRule when pool exhausted skips component (undefined) rather than falling back to repeats — tests 13/14 require no duplicates"
  - "Frequency test uses 10 frequent + 10 rare bases to avoid recency halving masking frequency signal with small 2-component pools"
  - "RuleRecord imported as type from db/client for function signatures — generator never calls db.* directly"
  - "pickFromPool signature simplified to remove usedIds param — no-repeat pre-filtering done by caller before passing pool"

# Metrics
duration: ~6min
completed: 2026-03-20
---

# Phase 3 Plan 03: Plan Generator Summary

**Weighted random 21-slot weekly plan generator with DayFilterRule, NoRepeatRule, frequency weighting, recency halving, and mandatory extra enforcement — all validated with 22 TDD tests**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-03-20T14:13:16Z
- **Completed:** 2026-03-20T14:17:05Z
- **Tasks:** 2 (RED + GREEN TDD phases)
- **Files modified:** 2

## Accomplishments

- Created `src/services/generator.ts` (469 lines) with `generate()` function returning a fully populated 21-slot WeeklyPlan
- Created `src/services/generator.test.ts` (750 lines) with 22 test cases covering all requirements
- Frequency weighting: frequent=3, normal=1, rare=0.3 with recency halving `0.5^uses`
- Extra compatibility: extras filtered by `compatible_base_types` of selected base — Rasam never with bread-based
- DayFilterRule: AND-logic tag matching with over-constrained fallback (warning emitted, full pool used)
- NoRepeatRule: separate Sets per component type; when pool exhausted, slot gets no curry/subzi (no repeat)
- Mandatory extras: base_type_rules enforcement, force-inserts required extra category before filling optional slots
- require-component rule: honored for base selection; invalid ID emits warning and fills from pool
- Performance: 21-slot generation consistently under 500ms (measured in test 22)
- Full test suite: 58/58 tests pass (no regressions)

## Task Commits

Each TDD phase was committed atomically:

1. **Task 1: RED — failing tests for plan generator** - `e3112bb` (test)
2. **Task 2: GREEN — implement generator, all 22 tests pass** - `7b17a74` (feat)

## Files Created/Modified

- `src/services/generator.ts` — Core generate() function; weightedRandom, effectiveWeight, isRuleApplicable, matchesTagFilter, getEligibleBases helpers
- `src/services/generator.test.ts` — 22 test cases; seedMinimalComponents() and seedDefaultPreferences() helpers

## Decisions Made

- `NoRepeatRule` when pool is exhausted **skips** the component type for that slot (curry_id/subzi_id remains undefined) rather than falling back to repeats — ensures no-repeat semantics are honored
- Frequency statistical test uses 10 components per tier (not 2) to avoid recency halving masking the frequency signal within a 21-slot generation — with only 2 components, the frequent one gets halved so many times it loses its advantage by slot 6
- `pickFromPool` receives a pre-filtered pool (no-repeat already removed by caller) — cleaner separation of concerns
- `usageCount` is shared across all component types within a single generate() call (global recency tracking) — this is intentional per spec

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] No-repeat pool exhaustion behavior**
- **Found during:** Task 2 (GREEN) — tests 13 and 14 failing
- **Issue:** Generator was falling back to full pool when no-repeat pool was exhausted, causing repeat curry/subzi IDs
- **Fix:** Changed curryPool/subziPool logic to skip component assignment when no-repeat is active and pool is exhausted (no fallback to repeat pool)
- **Files modified:** `src/services/generator.ts`
- **Commit:** `7b17a74`

**2. [Rule 1 - Bug] Frequency statistical test with small pools**
- **Found during:** Task 2 (GREEN) — test 16 failing (frequentCount not > rareCount * 3)
- **Issue:** With only 2 bases (1 frequent + 1 rare), recency halving caused the frequent base to lose its weight advantage by slot 6 of 21, making rare win more than expected
- **Fix:** Updated test 16 to use 10 frequent + 10 rare bases — each component experiences less recency pressure, keeping the frequency signal intact
- **Files modified:** `src/services/generator.test.ts`
- **Commit:** `7b17a74`

## Issues Encountered

None blocking. Two auto-fixed bugs during GREEN phase.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `generate()` is fully implemented and tested — Phase 4 Plan Board UI can call it to produce meal plans
- GeneratorResult.warnings carries relaxation messages — Plan Board can display them to users
- All Phase 3 types (PlanSlot, WeeklyPlan, Warning, GeneratorResult) are stable

## Self-Check: PASSED

- `src/services/generator.ts` — FOUND
- `src/services/generator.test.ts` — FOUND
- `.planning/phases/03-plan-generator-rule-engine/03-03-SUMMARY.md` — FOUND
- Commit `e3112bb` (RED phase) — FOUND
- Commit `7b17a74` (GREEN phase) — FOUND

---
*Phase: 03-plan-generator-rule-engine*
*Completed: 2026-03-20*
