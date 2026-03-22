---
phase: 06-save-history-export
plan: "02"
subsystem: week-navigation-ui
tags: [zustand, week-navigation, read-only, react, planboard]
dependency_graph:
  requires: [06-01-week-keyed-data-layer]
  provides: [week-navigation-ui, read-only-mode, future-empty-state]
  affects: [06-03-png-export]
tech_stack:
  added: []
  patterns: [week-aware-store, read-only-mode, write-through-single-save]
key_files:
  created:
    - src/components/plan/WeekNavigator.tsx
  modified:
    - src/stores/plan-store.ts
    - src/stores/plan-store.test.ts
    - src/components/plan/PlanBoard.tsx
    - src/components/plan/PlanActionBar.tsx
decisions:
  - "Replace saveActivePlan with saveWeekPlan in all mutations — saveWeekPlan already performs write-through to active_plan for the current week, so a single call is sufficient; eliminates the dual-write pattern"
  - "navigateToWeek loads from active_plan for current week and from saved_plans for all other weeks — fast hydration path for the common case (D-09)"
  - "isReadOnly derived from weekStart < thisWeek comparison in navigateToWeek; stored in Zustand so components can read it directly without recomputing"
metrics:
  duration: ~8min
  completed_date: "2026-03-22"
  tasks_completed: 2
  files_changed: 5
---

# Phase 6 Plan 02: Week Navigation UI Summary

Week-aware Zustand store with navigateToWeek action, WeekNavigator component with prev/next chevrons and formatted date label, PlanBoard read-only amber banner and future empty state, and PlanActionBar that hides Regenerate for past weeks.

## What Was Built

### Task 1: Week-aware plan store

Added to `PlanStore` interface and Zustand store:
- `currentWeekStart: string` — ISO Monday date of the currently viewed week, initialized to `getISOWeekStart(new Date())`
- `isReadOnly: boolean` — true when viewing a past week; false for current and future weeks
- `navigateToWeek(weekStart)` — loads from `active_plan` for current week, from `saved_plans` for all others; sets `isReadOnly` based on date comparison

All six mutations (`setLock`, `lockDay`, `unlockDay`, `swapComponent`, `regenerate`, `generateFresh`) now call `saveWeekPlan(currentWeekStart, plan, locks)` instead of `saveActivePlan`. Since `saveWeekPlan` performs write-through to `active_plan` when the week matches the current week, this is a single-call simplification with no behavior change for the current week.

Three new tests in `plan-store.test.ts`:
- Past week navigation sets `isReadOnly: true`
- Current week navigation loads from `active_plan`, sets `isReadOnly: false`
- Future week with no saved plan sets `plan: null`, `isReadOnly: false`

### Task 2: WeekNavigator, PlanBoard read-only, PlanActionBar conditional

**WeekNavigator** (`src/components/plan/WeekNavigator.tsx`):
- Prev/next chevron buttons (ghost variant) using `ChevronLeft` / `ChevronRight` from lucide
- Formatted week label via `formatWeekLabel(currentWeekStart)` with `aria-live="polite"` for screen reader announcements
- Past/future weeks render label in `text-muted-foreground`

**PlanBoard** changes:
- `<WeekNavigator />` rendered above the heading, followed by `<Separator>`
- Amber read-only banner (`Alert` with `border-amber-300 bg-amber-50 text-amber-900`) shown for past weeks
- Three-way empty state logic: future week shows "No plan yet for this week" + "Generate Plan for This Week" CTA; past week with no plan shows "No plan was saved for this week" (no generate button); current week shows existing "No plan yet" copy
- `onPickerOpen` suppressed to no-op when `isReadOnly`; `MealPickerSheet` not rendered when `isReadOnly`

**PlanActionBar** changes:
- `isReadOnly` selector added; Regenerate/Generate button wrapped in `{!isReadOnly && (...)}` conditional

## Tests

8 store tests (all passing, 3 new week navigation tests). Full suite: 119 tests passing (was 116).

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — navigation is fully wired. WeekNavigator reads live store state and triggers real DB loads on chevron click. Read-only mode fully suppresses all edit controls.

## Self-Check: PASSED
