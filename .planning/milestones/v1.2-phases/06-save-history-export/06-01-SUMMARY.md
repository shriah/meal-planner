---
phase: 06-save-history-export
plan: "01"
subsystem: data-layer
tags: [dexie, indexeddb, week-utils, persistence, tdd]
dependency_graph:
  requires: []
  provides: [week-keyed-persistence, week-date-utilities]
  affects: [06-02-week-navigation-ui, 06-03-png-export]
tech_stack:
  added: []
  patterns: [upsert-by-index, write-through-cache, UTC-date-utilities]
key_files:
  created:
    - src/services/week-utils.ts
    - src/services/week-utils.test.ts
    - src/services/plan-db.test.ts
  modified:
    - src/db/client.ts
    - src/services/plan-db.ts
decisions:
  - "Upsert via where('week_start').first() + update/add rather than put() — put() would require week_start as primary key, but auto-increment id is already the PK; where-index query is the correct Dexie v4 pattern for secondary-key upsert"
  - "Write-through on saveWeekPlan for current week keeps active_plan in sync with saved_plans — avoids double-read at plan load time (D-03, D-09)"
  - "UTC-based date construction in week-utils (Date.UTC + T00:00:00Z) eliminates timezone-induced off-by-one errors in ISO week calculations"
metrics:
  duration: ~5min
  completed_date: "2026-03-22"
  tasks_completed: 2
  files_changed: 5
---

# Phase 6 Plan 01: Week-Keyed Data Layer Summary

Dexie v4 schema with week_start index, typed SavedPlanRecord, saveWeekPlan/getWeekPlan service functions, and pure week date utilities with full TDD coverage.

## What Was Built

### Task 1: week-utils.ts + Dexie v4 (TDD)

Three pure UTC-based date utility functions:

- `getISOWeekStart(date)` — returns the Monday ISO string for any date (Sunday rolls back 6 days, ISO 8601 week semantics)
- `addWeeks(weekStart, n)` — shifts a week start forward or backward by N weeks
- `formatWeekLabel(weekStart)` — human-readable label like "Mar 16 – Mar 22, 2026", handles month and year boundaries

`SavedPlanRecord` interface updated: replaced `name: string; slots: unknown` with `week_start: string; slots: WeeklyPlan; locks: Record<string, boolean>`.

`db.version(4)` added with `week_start` secondary index on `saved_plans` table. No upgrade callback needed — existing rows (if any) not used by week-keyed queries.

### Task 2: saveWeekPlan + getWeekPlan (TDD)

Two new exported functions in `src/services/plan-db.ts`:

- `saveWeekPlan(weekStart, plan, locks)` — upserts by week_start index; writes through to active_plan when weekStart matches the current week
- `getWeekPlan(weekStart)` — returns `SavedPlanRecord | undefined` by week_start lookup

## Tests

21 new unit tests (14 week-utils + 7 plan-db). Full suite: 116 passing (was 95).

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all data flows are wired. No placeholder data, no empty returns for the plan's intended operations.

## Self-Check: PASSED
