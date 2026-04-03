---
phase: 17-curry-compatibility-data
plan: 01
subsystem: database
tags: [dexie, seeds, vitest, curry-compatibility, category-ids]
requires:
  - phase: 16-remove-category-id-preset-coupling-and-add-planboard-mealpicker-integration-coverage
    provides: category-ID-backed base categories and normalized compatibility storage
provides:
  - curated seeded curry compatibility arrays backed by base category IDs
  - an exact-name curry seed resolver reusable by later migration work
  - seed regression coverage for explicit empty curry compatibility arrays
affects: [phase-17-plan-02, phase-17-plan-03, curry-compatibility, library-ui, migrations]
tech-stack:
  added: []
  patterns: [exact seeded-name compatibility resolver, explicit empty-array curry compatibility semantics]
key-files:
  created: [.planning/phases/17-curry-compatibility-data/17-01-SUMMARY.md]
  modified: [src/types/component.ts, src/db/seed-data.ts, src/db/seed.test.ts]
key-decisions:
  - "Curated curry compatibility is keyed only by exact seeded curry names to avoid narrowing renamed or user-created curries."
  - "An empty compatible_base_category_ids array remains a valid persisted curry state and is not conflated with legacy missing data."
patterns-established:
  - "Seeded curry compatibility resolves from human-readable base-type maps into numeric category IDs at materialization time."
  - "Seed regressions should assert explicit curry compatibility arrays, including intentional empty arrays."
requirements-completed: [CURRY-01, CURRY-02]
duration: 10min
completed: 2026-03-29
---

# Phase 17 Plan 01: Curry Compatibility Storage Summary

**Seeded curries now materialize curated base-category ID compatibility arrays, including intentional zero-compatible cases, through an exact-name resolver.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-29T05:08:09Z
- **Completed:** 2026-03-29T05:18:35Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Extended the curry-facing type contract so explicit `compatible_base_category_ids` arrays are part of the curry model.
- Added seed regression coverage proving seeded curries persist numeric compatibility IDs and that `[]` remains an intentional state.
- Implemented a curated exact-name resolver in seed materialization so fresh installs persist explicit compatibility arrays for seeded curries.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend the curry record contract and prove seeded curries carry explicit compatibility arrays** - `f24b47a` (`test`), `3272e99` (`test`)
2. **Task 2: Materialize curated seeded curry compatibility with an exact-match resolver** - `67825ff` (`feat`)

## Files Created/Modified
- `src/types/component.ts` - Makes curry compatibility explicit on the curry-specific type contract.
- `src/db/seed.test.ts` - Covers explicit seeded curry compatibility arrays, exact-name matching, and intentional empty arrays.
- `src/db/seed-data.ts` - Adds the curated seeded curry compatibility map and materializes category-ID arrays for curries.

## Decisions Made
- Used a human-readable curated map of seeded curry names to built-in base types, then resolved those names to numeric category IDs during seed materialization.
- Treated exact seeded-name matching as the boundary for curated narrowing; unmatched names intentionally return `undefined` from the resolver for downstream migration handling.
- Preserved `[]` as a first-class stored value for curries that should never be auto-picked.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 17-02 can reuse `resolveSeededCurryCompatibilityIds()` for the migration backfill path.
- Fresh-seed curry data now uses the same `compatible_base_category_ids` field the migration and Library UI can consume directly.

## Self-Check: PASSED

- Verified `.planning/phases/17-curry-compatibility-data/17-01-SUMMARY.md` exists.
- Verified task commits `f24b47a`, `3272e99`, and `67825ff` exist in git history.

---
*Phase: 17-curry-compatibility-data*
*Completed: 2026-03-29*
