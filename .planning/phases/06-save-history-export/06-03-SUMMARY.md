---
phase: 06-save-history-export
plan: 03
subsystem: ui
tags: [satori, resvg-js, png-export, web-share-api, zustand, next-js-route-handler]

# Dependency graph
requires:
  - phase: 06-01
    provides: week-utils formatWeekLabel, plan-db saveWeekPlan/getWeekPlan
  - phase: 06-02
    provides: PlanActionBar with isReadOnly conditional, currentWeekStart in store
provides:
  - POST /api/export-plan route handler returning PNG via satori + @resvg/resvg-js
  - Inter Regular TTF bundled at public/fonts/inter-regular.ttf for satori
  - buildPlanElement function in src/services/export-template.ts
  - exportPlan action in plan-store with Web Share API + download fallback
  - Export PNG button in PlanActionBar visible on all weeks
affects: []

# Tech tracking
tech-stack:
  added:
    - satori 0.26.0 (JSX object to SVG)
    - "@resvg/resvg-js 2.6.2 (SVG to PNG via Rust napi bindings)"
  patterns:
    - Font loaded once at module scope in route handler (cached across requests)
    - Component names resolved client-side before POST (server has no IndexedDB access)
    - satori plain JS object pattern (no React runtime in route handler)
    - Web Share API detection with navigator.canShare before navigator.share call
    - Download anchor fallback for desktop/unsupported browsers

key-files:
  created:
    - public/fonts/inter-regular.ttf
    - src/app/api/export-plan/route.ts
    - src/services/export-template.ts
  modified:
    - src/stores/plan-store.ts
    - src/components/plan/PlanActionBar.tsx

key-decisions:
  - "No export const runtime = 'edge' on route handler — @resvg/resvg-js requires Node.js runtime (napi-rs native bindings)"
  - "Component names passed in from PlanActionBar via useLiveQuery — server route has no IndexedDB access"
  - "Error message hardcoded in PlanActionBar (not dynamic from store) for consistent UX"
  - "Fixed PNG height 1100px per research recommendation for 7-day portrait layout"

patterns-established:
  - "Pattern: satori route handler loads font once at module scope via readFileSync"
  - "Pattern: exportPlan receives componentNames from component layer — store does not directly access IndexedDB"

requirements-completed: [EXPORT-01]

# Metrics
duration: 2min
completed: 2026-03-22
---

# Phase 6 Plan 03: Export PNG Summary

**Server-side PNG export pipeline via satori + @resvg/resvg-js with Web Share API on mobile and download fallback on desktop, wired end-to-end from Export PNG button click to PNG download**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-22T09:41:28Z
- **Completed:** 2026-03-22T09:43:50Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Installed satori 0.26.0 and @resvg/resvg-js 2.6.2; bundled Inter Regular TTF (304KB) for satori font rendering
- Created POST /api/export-plan route handler: accepts serialized plan payload, renders satori SVG, converts to PNG via resvg, returns with Content-Type image/png
- Created buildPlanElement in export-template.ts with portrait layout: header, 7 day rows, 3 color-coded slot rows per day (amber/green/blue per UI-SPEC)
- Added isExporting, exportError state and exportPlan action to Zustand store with Web Share API + download fallback
- Export PNG button appears in PlanActionBar on all weeks; Regenerate button remains hidden on read-only past weeks

## Task Commits

Each task was committed atomically:

1. **Task 1: Install packages, bundle font, build export route handler and satori template** - `f6bbfb9` (feat)
2. **Task 2: Add exportPlan action to store and Export PNG button to PlanActionBar** - `6468aa7` (feat)

## Files Created/Modified
- `public/fonts/inter-regular.ttf` - Inter Regular 304KB bundled for satori (committed to repo)
- `src/app/api/export-plan/route.ts` - POST handler: satori -> resvg -> PNG response
- `src/services/export-template.ts` - buildPlanElement function, portrait layout, slot color palette
- `src/stores/plan-store.ts` - Added isExporting, exportError, exportPlan action
- `src/components/plan/PlanActionBar.tsx` - Export PNG button with loading state and inline error

## Decisions Made
- No `export const runtime = 'edge'` on route handler — @resvg/resvg-js uses napi-rs native Node.js bindings that cannot run in Edge Runtime
- Component names must be passed from component layer (PlanActionBar via useLiveQuery) into exportPlan — the Zustand store does not have access to IndexedDB component names
- Fixed PNG height of 1100px based on research recommendation (24px header + 7 x ~140px rows + 24px padding)
- Error text hardcoded in PlanActionBar as "Export failed. Try again." for consistent display

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - all packages installed cleanly, font download succeeded on first attempt, TypeScript types resolved without issues.

## User Setup Required
None - no external service configuration required. Font is committed to repo, packages added to package.json.

## Next Phase Readiness
- Phase 6 is now fully complete: week-keyed Dexie persistence (Plan 01), week navigation + read-only mode (Plan 02), and PNG export (Plan 03) all implemented
- All 119 tests pass
- Export pipeline is functional end-to-end; ready for /gsd:verify-work

---
*Phase: 06-save-history-export*
*Completed: 2026-03-22*

## Self-Check: PASSED

- public/fonts/inter-regular.ttf: FOUND
- src/app/api/export-plan/route.ts: FOUND
- src/services/export-template.ts: FOUND
- 06-03-SUMMARY.md: FOUND
- Commit f6bbfb9: FOUND
- Commit 6468aa7: FOUND
