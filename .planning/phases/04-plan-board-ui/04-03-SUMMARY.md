---
phase: "04"
plan: "03"
subsystem: "plan-board-ui"
tags: ["meal-picker", "bottom-sheet", "component-swap", "tdd"]
dependency_graph:
  requires: ["04-02"]
  provides: ["MealPickerSheet", "PlanBoard-complete"]
  affects: ["src/components/plan/PlanBoard.tsx"]
tech_stack:
  added: ["Sheet (shadcn bottom drawer)", "useLiveQuery in sheet context"]
  patterns: ["filterComponents reused from ComponentTab", "swapComponent Zustand action", "wave-0 test stubs"]
key_files:
  created:
    - src/components/plan/MealPickerSheet.tsx
    - src/components/plan/MealPickerSheet.test.tsx
  modified:
    - src/components/plan/PlanBoard.tsx
decisions:
  - "MealPickerSheet uses 'extras' -> 'extra' ComponentType mapping so LockableComponent key matches Dexie query param"
  - "filterComponents pass-through mock in tests avoids asserting filtered behavior (separate concern from component rendering)"
  - "currentBaseType IIFE in PlanBoard avoids adding extra state — reads live from componentsMap"
  - "Test uses getAllByText for tag chips because same text appears in component row tag badges"
metrics:
  duration: "~2 minutes"
  completed_date: "2026-03-21"
  tasks_completed: 1
  files_changed: 3
---

# Phase 04 Plan 03: MealPickerSheet and PlanBoard Wiring Summary

One-liner: Bottom sheet meal picker (MealPickerSheet) with search, dietary/regional tag filters, and auto-save on component selection, wired into PlanBoard via pickerState.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Build MealPickerSheet with Wave 0 tests and wire into PlanBoard | 8e5c6d6 | MealPickerSheet.tsx, MealPickerSheet.test.tsx, PlanBoard.tsx |

## What Was Built

### MealPickerSheet.tsx
- Bottom sheet (side="bottom") using shadcn Sheet component
- Dynamic title: "Pick Base" / "Pick Curry" / "Pick Subzi" / "Pick Extras" based on componentType prop
- Search Input pre-populated with `Search {type}s...` placeholder
- Dietary tag filter chips (veg, non-veg, vegan, jain, eggetarian) with toggle-active Badge pattern
- Regional tag filter chips (south-indian, north-indian, coastal-konkan, pan-indian) with toggle-active Badge pattern
- Scrollable component list with name + tag badges per item
- Empty state: "No {type}s match your filters. Try clearing a tag."
- On selection: calls `swapComponent(day, slot, componentType, id)`, resets filters, closes sheet
- Extras picker: when componentType='extras' with currentBaseType provided, calls `getExtrasByBaseType(baseType)` instead of `getComponentsByType('extra')`

### MealPickerSheet.test.tsx
- 6 passing tests (no `it.todo` stubs — all implemented)
- Mocks: usePlanStore, dexie-react-hooks (useLiveQuery), filterComponents (pass-through)
- Tests: title rendering per type, search input, dietary + regional tag chips, swapComponent + close on select, empty state

### PlanBoard.tsx updates
- Imports MealPickerSheet and BaseType
- Replaces `{/* MealPickerSheet will be added in Plan 03 */} {pickerState && null}` with actual MealPickerSheet render
- Passes day, slot, componentType from pickerState
- Computes currentBaseType via IIFE from componentsMap when componentType='extras'

## Verification

- `npx vitest run`: 82/82 tests pass (9 test files)
- `npx next build`: compiles successfully, 4 static routes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test used getByText for tag chips causing ambiguity**
- **Found during:** Task 1 (Step 4 - filling in test stubs)
- **Issue:** `getByText('veg')` throws "multiple elements found" because 'veg' appears in both filter chips AND component row tag badges
- **Fix:** Changed to `getAllByText('veg').length >= 1` pattern
- **Files modified:** src/components/plan/MealPickerSheet.test.tsx
- **Commit:** 8e5c6d6 (fixed inline before final commit)

## Self-Check: PASSED
- [x] src/components/plan/MealPickerSheet.tsx exists
- [x] src/components/plan/MealPickerSheet.test.tsx exists
- [x] src/components/plan/PlanBoard.tsx modified
- [x] Commit 8e5c6d6 exists
