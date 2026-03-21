---
phase: 04-plan-board-ui
plan: 02
subsystem: ui
tags: [react, nextjs, zustand, tailwind, testing-library, vitest, lucide-react, dexie-react-hooks]

# Dependency graph
requires:
  - phase: 04-01
    provides: usePlanStore with plan, locks, warnings, hydrated state and all actions
  - phase: 03-plan-generator-rule-engine
    provides: generator producing WeeklyPlan with PlanSlot array
  - phase: 01-data-foundation
    provides: ComponentRecord types and getAllComponents service

provides:
  - Interactive 7x3 weekly plan grid at / route with lock controls and empty state
  - AppNav header with Meal Library and Slot Settings navigation links
  - PlanBoard, MealCell, PlanComponentRow, DayColumnHeader, SlotRowLabel components
  - PlanActionBar with generate/regenerate button wired to usePlanStore
  - WarningBanner dismissable amber alert for slot fill failures
  - Wave 0 test stubs (filled in) for PlanBoard and PlanComponentRow with 8 passing tests

affects:
  - 04-03 (MealPickerSheet slot swap — pickerState is wired in PlanBoard, sheet to be added)
  - future phases using plan grid as primary UI surface

# Tech tracking
tech-stack:
  added:
    - "@testing-library/react — React component testing"
    - "@testing-library/user-event — user event simulation"
    - "@vitejs/plugin-react — React JSX transform for vitest"
    - "happy-dom — DOM environment for component tests"
  patterns:
    - "Per-file vitest environment via // @vitest-environment happy-dom docblock"
    - "Module-level mock state pattern for Zustand selector mocks (not just vi.fn)"
    - "Fragment with key prop for mapped rows in CSS grid to avoid React key warnings"
    - "afterEach(cleanup) required for happy-dom environment (no auto-cleanup)"

key-files:
  created:
    - src/components/plan/PlanBoard.tsx
    - src/components/plan/PlanBoard.test.tsx
    - src/components/plan/MealCell.tsx
    - src/components/plan/PlanComponentRow.tsx
    - src/components/plan/PlanComponentRow.test.tsx
    - src/components/plan/DayColumnHeader.tsx
    - src/components/plan/SlotRowLabel.tsx
    - src/components/plan/AppNav.tsx
    - src/components/plan/PlanActionBar.tsx
    - src/components/plan/WarningBanner.tsx
  modified:
    - src/app/page.tsx
    - src/app/layout.tsx
    - vitest.config.ts
    - package.json

key-decisions:
  - "Per-file happy-dom environment via docblock instead of environmentMatchPatterns (not supported in vitest 4)"
  - "Fragment key on slot rows instead of shorthand <> to avoid React missing-key warning in grid"
  - "afterEach(cleanup) explicit in component tests — happy-dom does not auto-cleanup between tests"
  - "getAllByText used for elements that appear in multiple places (Generate Plan in ActionBar + empty state)"
  - "pickerState wired in PlanBoard with null sentinel — MealPickerSheet Sheet added in Plan 03"

patterns-established:
  - "Module-level mock variable + vi.mock selector pattern for Zustand store mocks in component tests"
  - "Lock/unlock toggle pattern: button with aria-label 'Lock/Unlock {Component}' and 44px min touch target"
  - "Component test files use // @vitest-environment happy-dom docblock for DOM testing"

requirements-completed: [UI-01, UI-02, PLAN-02, PLAN-03]

# Metrics
duration: 18min
completed: 2026-03-21
---

# Phase 04 Plan 02: Plan Board UI Summary

**Interactive 7x3 weekly plan grid with per-component lock toggles, day-lock button, empty state, warning banner, and AppNav — rendered at / route with 76 passing tests**

## Performance

- **Duration:** 18 min
- **Started:** 2026-03-21T06:41:00Z
- **Completed:** 2026-03-21T06:47:00Z
- **Tasks:** 3 (Task 0, Task 1, Task 2)
- **Files modified:** 14

## Accomplishments

- Plan board grid renders 7 day columns × 3 meal slot rows = 21 MealCell components with 4 lock toggles each
- AppNav header with "Meal Library" (/library) and "Slot Settings" (/settings/slots) navigation links
- Empty state shows "No plan yet" with Generate Plan CTA; hydration guard shows loading pulse
- WarningBanner with amber border, AlertTriangle icon, and dismissable X button for slot fill failures
- Wave 0 test stubs filled in: 4 PlanBoard tests + 4 PlanComponentRow tests, all passing (76 total)

## Task Commits

Each task was committed atomically:

1. **Task 0: Wave 0 test stubs** - `e8fc918` (test)
2. **Task 1: AppNav, PlanActionBar, WarningBanner, scaffolding** - `7d7538e` (feat)
3. **Task 2: PlanBoard grid, MealCell, PlanComponentRow, tests filled in** - `6170cba` (feat)

## Files Created/Modified

- `src/components/plan/PlanBoard.tsx` - Root 8-column CSS grid; uses Fragment key for slot rows
- `src/components/plan/PlanBoard.test.tsx` - 4 tests: empty state, 7 day headers, 3 slot labels, 84 lock buttons
- `src/components/plan/MealCell.tsx` - 4 PlanComponentRows per cell; amber border-2 on warning
- `src/components/plan/PlanComponentRow.tsx` - Lock/Unlock toggle with aria-label and 44px touch targets
- `src/components/plan/PlanComponentRow.test.tsx` - 4 tests: icon state, setLock call, locked picker guard
- `src/components/plan/DayColumnHeader.tsx` - "Lock Day"/"Unlock Day" toggle checks all 12 components
- `src/components/plan/SlotRowLabel.tsx` - Sticky left slot label (Breakfast/Lunch/Dinner)
- `src/components/plan/AppNav.tsx` - Nav with Food Planner brand, Meal Library, Slot Settings links
- `src/components/plan/PlanActionBar.tsx` - Generate/Regenerate button with spinner via isGenerating state
- `src/components/plan/WarningBanner.tsx` - Amber alert with warning count and dismiss action
- `src/app/page.tsx` - Replaced default Next.js page with PlanBoard import
- `src/app/layout.tsx` - AppNav added above children; metadata: "Food Planner" / "Indian weekly meal planner"
- `vitest.config.ts` - Added @vitejs/plugin-react; node default environment retained
- `package.json` - Added @testing-library/react, @testing-library/user-event, @vitejs/plugin-react, happy-dom

## Decisions Made

- Used `// @vitest-environment happy-dom` per-file docblock because `environmentMatchPatterns` is not supported in vitest 4.
- Fragment key pattern used for `ALL_SLOTS.map(slot => <Fragment key={slot}>...)` to avoid React missing-key warning in the CSS grid.
- `afterEach(cleanup)` added explicitly in component tests because happy-dom does not perform auto-cleanup, leading to DOM accumulation across tests.
- `getAllByText` used for "Generate Plan" since it appears in both PlanActionBar header button and empty state CTA.
- pickerState is wired in PlanBoard and ready; MealPickerSheet will be added in Plan 03.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed missing @testing-library/react and DOM test dependencies**
- **Found during:** Task 2 (filling in Wave 0 test stubs with real implementations)
- **Issue:** Plan specified real test implementations using @testing-library/react but it was not installed; vitest was also missing react plugin and DOM environment
- **Fix:** Installed @testing-library/react, @testing-library/user-event, @vitejs/plugin-react, happy-dom; added @vitejs/plugin-react to vitest.config.ts; used per-file `// @vitest-environment happy-dom` docblock
- **Files modified:** vitest.config.ts, package.json, package-lock.json
- **Verification:** All 8 component tests pass, all 76 total tests pass
- **Committed in:** 6170cba (Task 2 commit)

**2. [Rule 1 - Bug] Fixed React missing key warning in CSS grid fragment rows**
- **Found during:** Task 2 (PlanBoard grid implementation)
- **Issue:** `ALL_SLOTS.map(slot => <> ... </>)` had no key on the shorthand Fragment, causing React key warning in tests
- **Fix:** Changed `<>` to `<Fragment key={slot}>` with explicit React Fragment import
- **Files modified:** src/components/plan/PlanBoard.tsx
- **Verification:** No React key warnings in test output, 84 lock buttons render correctly
- **Committed in:** 6170cba (Task 2 commit)

**3. [Rule 1 - Bug] Fixed DOM accumulation in happy-dom tests requiring explicit cleanup**
- **Found during:** Task 2 (running PlanBoard tests)
- **Issue:** Test "renders 21 MealCell components" found 252 lock buttons instead of 84 (3x accumulation from prior 3 tests running without DOM cleanup)
- **Fix:** Added `afterEach(cleanup)` to both PlanBoard.test.tsx and PlanComponentRow.test.tsx; used `getAllByText` for elements appearing multiple times
- **Files modified:** src/components/plan/PlanBoard.test.tsx, src/components/plan/PlanComponentRow.test.tsx
- **Verification:** All 8 component tests pass consistently
- **Committed in:** 6170cba (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 bugs)
**Impact on plan:** All auto-fixes required for tests to pass. No scope creep. Plan goals fully met.

## Issues Encountered

- happy-dom environment does not auto-cleanup between tests (unlike jsdom with @testing-library/react auto-cleanup setup). Resolved by explicit `afterEach(cleanup)`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- PlanBoard renders at / with full grid, lock toggles, empty state, and navigation
- pickerState is initialized in PlanBoard and ready to be wired to MealPickerSheet in Plan 03
- All 76 tests pass, build succeeds — Plan 03 (meal picker sheet) can proceed immediately

---
*Phase: 04-plan-board-ui*
*Completed: 2026-03-21*
