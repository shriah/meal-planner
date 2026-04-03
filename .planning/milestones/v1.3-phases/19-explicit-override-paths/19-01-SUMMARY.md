---
phase: 19-explicit-override-paths
plan: 01
subsystem: ui
tags: [react, zustand, vitest, curry, compatibility, overrides]
requires:
  - phase: 18-generator-compatibility-contract
    provides: compatibility-scoped automatic curry selection and the legacy uncategorized-base compatibility contract
provides:
  - grouped curry picker sections for compatible choices and explicit overrides
  - flat-list fallback when no compatible curry section exists
  - regression coverage proving manual incompatible curry ids persist through store saves and locked regeneration
affects: [19-02, 20-compatibility-regression-coverage, generator, plan-ui, store]
tech-stack:
  added: []
  patterns: [reuse generator compatibility semantics in picker UI, preserve explicit manual curry ids through existing lockedSlots regeneration seam]
key-files:
  created: []
  modified:
    - src/components/plan/MealPickerSheet.tsx
    - src/components/plan/MealPickerSheet.test.tsx
    - src/stores/plan-store.test.ts
key-decisions:
  - "The picker reuses Phase 18's uncategorized-base compatibility semantics so the UI and generator classify curries the same way."
  - "Store behavior stayed on the existing swapComponent/regenerate seam because manual incompatible curry ids already persisted correctly without new override metadata."
patterns-established:
  - "Only show explicit override grouping when both compatible and incompatible curry lists exist; otherwise keep the picker flat."
  - "Manual incompatible curry choices are treated as authoritative persisted ids and forwarded back into generate({ lockedSlots }) unchanged."
requirements-completed: [CURRY-05]
duration: 7min
completed: 2026-03-29
---

# Phase 19 Plan 01: Explicit Override Picker and Persistence Summary

**Compatible-vs-override curry picker sections with persisted manual incompatible curry intent through Dexie and locked regeneration**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-29T19:11:00Z
- **Completed:** 2026-03-29T19:17:35Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Curry picker results now split into compatible and override sections only when both are meaningful for the selected base.
- Bases with zero compatible curries fall back to one flat list, and base/subzi/extras pickers keep their existing flat behavior.
- Store regressions now prove manual incompatible curry swaps persist exactly and locked regeneration forwards those exact ids back into `generate({ lockedSlots })`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Group curry picker results into normal and override sections** - `c606525` (test), `4cd3bdc` (feat)
2. **Task 2: Preserve manual incompatible curry intent through store persistence and regenerate wiring** - `01a1144` (test)

## Files Created/Modified

- `src/components/plan/MealPickerSheet.tsx` - Adds compatibility-aware curry grouping with flat-list fallback.
- `src/components/plan/MealPickerSheet.test.tsx` - Covers grouped curry sections, zero-compatible fallback, and unchanged non-curry picker behavior.
- `src/stores/plan-store.test.ts` - Locks in manual curry persistence and locked regenerate forwarding without adding new override state.

## Decisions Made

- Reused Phase 18's compatibility contract in the picker, including the uncategorized-base edge case, to avoid UI/generator drift.
- Left `src/stores/plan-store.ts` unchanged because the existing persistence and regeneration seam already satisfied the explicit manual override contract.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The first zero-compatible picker test fixture accidentally included a legacy curry with missing compatibility metadata, which Phase 18 correctly treats as compatible for categorized bases. The test fixture was narrowed so it represented the intended zero-compatible case.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 19-02 can extend explicit override behavior into scoped `require_one` rules on top of the now-aligned picker and store contracts.
- Phase 20 can reuse these regressions to ensure picker, store, and generator override behavior stay synchronized.

## Self-Check: PASSED

- Found `.planning/phases/19-explicit-override-paths/19-01-SUMMARY.md`
- Found task commits `c606525`, `4cd3bdc`, and `01a1144` in git history

---
*Phase: 19-explicit-override-paths*
*Completed: 2026-03-29*
