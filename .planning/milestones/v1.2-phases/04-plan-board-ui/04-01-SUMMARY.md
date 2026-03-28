---
phase: 04-plan-board-ui
plan: 01
subsystem: data-layer
tags: [zustand, dexie, generator, persistence, state-management]
dependency_graph:
  requires: [src/db/client.ts, src/services/food-db.ts, src/services/generator.ts, src/types/plan.ts]
  provides: [src/services/plan-db.ts, src/stores/plan-store.ts, src/services/generator.ts(extended)]
  affects: [phase-04-plan-board-ui-components]
tech_stack:
  added: [zustand@5.0.12, shadcn/ui Sheet]
  patterns: [Dexie singleton table, Zustand store with Dexie sync, TDD RED-GREEN]
key_files:
  created:
    - src/services/plan-db.ts
    - src/stores/plan-store.ts
    - src/stores/plan-store.test.ts
    - src/components/ui/sheet.tsx
  modified:
    - src/db/client.ts
    - src/services/generator.ts
    - src/services/generator.test.ts
    - package.json
decisions:
  - "ActivePlanRecord uses singleton key 'current' (same pattern as UserPreferencesRecord 'prefs')"
  - "GenerateOptions lockedSlots injects components directly, skipping randomization — locked/unlocked components are fully independent"
  - "Zustand store mutations call saveActivePlan fire-and-forget (no await) to avoid blocking UI updates"
  - "LockKey type encodes day-slot-component as template literal for compile-time safety"
metrics:
  duration: "4m"
  completed_date: "2026-03-21"
  tasks_completed: 2
  files_modified: 8
---

# Phase 04 Plan 01: Data Layer and State Management for Plan Board UI Summary

Zustand store with Dexie persistence, extended generator with locked slot support, and shadcn Sheet component — all data-layer and state-management infrastructure needed by Plan Board UI components.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Install deps, bump Dexie v3, create plan-db service | 213af3c | package.json, src/db/client.ts, src/services/plan-db.ts, src/components/ui/sheet.tsx |
| 2 | Extend generator with locked slot support and create Zustand store | 00edaa9 | src/services/generator.ts, src/services/generator.test.ts, src/stores/plan-store.ts, src/stores/plan-store.test.ts |

## What Was Built

**Task 1: Dependencies, Dexie v3, plan-db service**
- Installed zustand@5.0.12 and shadcn Sheet component
- Added `ActivePlanRecord` interface (`id: 'current'`, `plan: WeeklyPlan`, `locks: Record<string, boolean>`, `updated_at: string`) to `src/db/client.ts`
- Added `active_plan: EntityTable<ActivePlanRecord, 'id'>` to the Dexie instance type
- Added `db.version(3)` preserving all existing table schemas and adding `active_plan: 'id'`
- Created `src/services/plan-db.ts` with `getActivePlan`, `saveActivePlan`, `clearActivePlan`

**Task 2 (TDD): Generator extension + Zustand store**
- Added `GenerateOptions` interface with optional `lockedSlots` parameter to generator
- Extended `generate(options?: GenerateOptions)` — locked components injected directly, unlocked components randomized normally
- Wrote 5 failing tests (RED), then implemented to pass (GREEN) — all 27 generator tests pass
- Created `src/stores/plan-store.ts` with `usePlanStore` Zustand store
- Store actions: `initFromDB`, `setLock`, `lockDay`, `unlockDay`, `swapComponent`, `regenerate`, `generateFresh`, `dismissWarningBanner`
- Each mutation auto-saves to Dexie via `saveActivePlan`
- Created 5 store tests in `src/stores/plan-store.test.ts` — all pass

## Test Results

- Before: 58 tests across 5 files
- After: 68 tests across 6 files (10 new tests added)
- All tests pass: 6 test files, 68 tests

## Decisions Made

1. **ActivePlanRecord singleton key 'current'** — follows the same pattern as `UserPreferencesRecord` which uses `'prefs'` as its fixed primary key. Consistent and simple.

2. **Locked slots inject directly, skip randomization** — locked components are pulled from the component array by ID and assigned without going through the weighted random pool logic. Unlocked components run the full randomization pipeline. This ensures lock semantics are unambiguous.

3. **Zustand mutations fire saveActivePlan without await** — keeps UI responsive. A failure in IndexedDB write is non-critical (data is still in memory). Errors are swallowed silently.

4. **LockKey as template literal type** — `${DayOfWeek}-${MealSlot}-${LockableComponent}` gives compile-time safety on all lock operations.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED
