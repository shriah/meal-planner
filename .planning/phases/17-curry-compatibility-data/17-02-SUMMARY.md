---
phase: 17-curry-compatibility-data
plan: 02
subsystem: database
tags: [dexie, indexeddb, vitest, curry-compatibility, category-ids]
requires:
  - phase: 17-curry-compatibility-data
    provides: curated seeded curry compatibility resolver and explicit empty-array semantics
provides:
  - one-time Dexie upgrade for legacy curry compatibility arrays
  - migration coverage for curated curry backfill, all-base fallback, and explicit empty preservation
  - delete-category regression coverage for curry compatibility normalization
affects: [phase-17-plan-03, phase-18, curry-compatibility, migrations, category-normalization]
tech-stack:
  added: []
  patterns: [exact-name curry migration backfill, explicit empty compatibility preservation, ID-based curry delete normalization]
key-files:
  created: [.planning/phases/17-curry-compatibility-data/17-02-SUMMARY.md]
  modified: [src/db/client.ts, src/db/migrations.test.ts, src/services/food-db.test.ts]
key-decisions:
  - "Legacy curries only backfill when compatible_base_category_ids is undefined; actual arrays, including [], are preserved as-is."
  - "Unmatched legacy curries fall back to all current base category IDs so existing libraries remain editable after upgrade."
  - "Category delete normalization continues to be ID-based, with explicit curry coverage locking the zero-compatible state."
patterns-established:
  - "Dexie upgrade-only curry backfill should reuse the seeded exact-name resolver and apply the all-base fallback only to unmatched legacy rows."
  - "Delete normalization tests should cover curry arrays explicitly even when the runtime helper is generic."
requirements-completed: [CURRY-02, CURRY-07]
duration: 3min
completed: 2026-03-29
---

# Phase 17 Plan 02: Curry Compatibility Data Summary

**Legacy curry rows now upgrade into explicit compatible base-category ID arrays, and base-category deletes strip stale curry IDs without broadening empty states.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-29T10:52:09+05:30
- **Completed:** 2026-03-29T10:54:35+05:30
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added a Dexie v12 migration that backfills only legacy curries missing compatibility arrays.
- Reused the seeded exact-name resolver for curated curries and fell back unmatched legacy curries to all current base-category IDs.
- Locked delete-category regressions so curry compatibility remains ID-based and explicit empty arrays stay empty after normalization.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the Dexie curry backfill migration for curated and unmatched legacy rows** - `7620b97` (`test`), `3fac8be` (`feat`)
2. **Task 2: Normalize deleted base-category IDs out of curry compatibility and keep zero-compatible curries empty** - `cfa2663` (`fix`)

_Note: Task 2's service regressions passed on the first run because the existing generic compatibility-array normalization already handled deletes correctly; the task commit makes curry handling explicit and locks that behavior with focused tests._

## Files Created/Modified
- `src/db/client.ts` - Adds the shared legacy curry backfill helper, the Dexie v12 upgrade, and explicit curry handling in delete normalization.
- `src/db/migrations.test.ts` - Covers curated seeded curry backfill, unmatched all-base fallback, and preservation of explicit empty curry compatibility arrays.
- `src/services/food-db.test.ts` - Covers curry compatibility cleanup through `deleteCategory()`, including rename/delete safety and zero-compatible persistence.

## Decisions Made
- Reused the Phase 17 seeded exact-name curry resolver for live-data migration to keep fresh installs and upgrades aligned.
- Treated only `undefined` as legacy missing compatibility data; explicit arrays are preserved verbatim.
- Kept delete normalization strictly category-ID based, with focused curry regressions rather than any label-backed special case.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The first implementation pass briefly nested the new backfill helper inside `migrateRuleCategoryRefs()`, which made the helper unavailable at runtime. Moving it back to module scope restored the migration path before the Task 1 verification rerun.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 17-03 can consume explicit persisted curry compatibility arrays in the Library UI without needing separate legacy handling.
- Phase 18 can rely on migrated curries and delete-safe category IDs when enforcing compatibility in generator flows.

## Self-Check: PASSED

- Verified `.planning/phases/17-curry-compatibility-data/17-02-SUMMARY.md` exists.
- Verified task commits `7620b97`, `3fac8be`, and `cfa2663` exist in git history.
