---
phase: 07-scheduling-rule-engine
plan: 02
subsystem: generator
tags: [generator, scheduling-rule, filter-pool, exclude, tdd]
dependency_graph:
  requires: [scheduling-rule-zod-variant, SchedulingRule-type]
  provides: [applySchedulingFilterPool, applySchedulingExclude, scheduling-rule-generator-integration]
  affects: [src/services/generator.ts, src/services/generator.test.ts]
tech_stack:
  added: []
  patterns: [tdd-red-green, filter-then-exclude-pipeline, D-01-fallback, D-02-fallback]
key_files:
  created: []
  modified:
    - src/services/generator.ts
    - src/services/generator.test.ts
decisions:
  - "applicableSchedulingRules extracted once per (day, slot) before all component selection paths — avoids repeated filtering and keeps order consistent"
  - "scheduling-rule filter-pool and exclude applied AFTER no-repeat and day-filter filtering — scheduling-rule is the outermost soft constraint layer"
  - "applySchedulingExclude receives fullPool parameter for API symmetry but uses pool (already filtered by filter-pool) for fallback — D-02 relaxes back to the post-filter-pool pool, not the original full pool"
  - "curryPoolBase/subziPoolBase naming preserves the no-repeat filtered pool reference for fallback clarity"
metrics:
  duration: 150s
  completed_date: "2026-03-22"
  tasks_completed: 1
  files_modified: 2
---

# Phase 07 Plan 02: Scheduling-Rule Generator Integration Summary

**One-liner:** filter-pool and exclude scheduling-rule effects with D-01/D-02 fallbacks integrated into generator's base, curry, and subzi selection paths using TDD.

## What Was Built

Extended `src/services/generator.ts` to handle the `scheduling-rule` CompiledFilter variant for `filter-pool` and `exclude` effects. The generator now:

1. Extracts `applicableSchedulingRules` per (day, slot) combination at the start of each slot iteration
2. Applies `applySchedulingFilterPool` to base, curry, and subzi pools after no-repeat and day-filter filtering
3. Applies `applySchedulingExclude` after filter-pool to remove matched components
4. Falls back to full pool with a "constraint relaxed" warning for both D-01 (filter-pool empties pool) and D-02 (exclude empties pool)

### Helper Functions Added

- `applySchedulingFilterPool(pool, applicableRules)` — filters pool to only components matching all filter-pool rules by tag or component_id
- `applySchedulingExclude(pool, fullPool, applicableRules, warnings, day, slot, ruleRecords)` — removes components matching exclude rules; emits D-02 warning if pool becomes empty

### isRuleApplicable Extension

Added `scheduling-rule` branch: `null` days/slots means universal (applies to all), arrays require inclusion. This is the inverse of `day-filter` where `days` is always a non-null array.

## Tests Added

8 new tests in `describe('SCHED: scheduling-rule filter-pool and exclude')`:

| Test | Coverage |
|------|----------|
| SCHED-1 | filter-pool by tag restricts curry pool |
| SCHED-2 | filter-pool by component_id restricts to single component |
| SCHED-3 | filter-pool scoped to specific day/slot only affects that slot |
| SCHED-4 | filter-pool with null days/slots applies to all slots (D-09) |
| SCHED-5 | filter-pool empty result falls back with warning (D-01) |
| SCHED-6 | exclude by tag removes matching components |
| SCHED-7 | exclude by component_id removes specific component |
| SCHED-8 | exclude all components falls back with warning (D-02) |

All 41 generator tests pass. Full suite: 136 tests passing.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The extras selection path does not apply scheduling-rule filtering (extras use base_type_rules and compatible_base_types, not scheduling-rules in this phase). This is intentional — the plan spec covers base, curry, and subzi only.

## Self-Check: PASSED

- `src/services/generator.ts` — FOUND, contains `applySchedulingFilterPool`, `applySchedulingExclude`, `applicableSchedulingRules`, `constraint relaxed`, `rule.type === 'scheduling-rule'`, `applyDayFilterToPool` calls preserved
- `src/services/generator.test.ts` — FOUND, contains `describe('SCHED: scheduling-rule filter-pool and exclude'` with 8 test cases
- Commits: `9689e5c` (RED tests), `601244f` (GREEN implementation) — both confirmed in git log
