---
phase: 1000-remove-the-compatability-base-for-extras
plan: 01
subsystem: database
tags: [dexie, migration, seed-data, extras, vitest]
requires:
  - phase: 14-add-option-to-create-more-base-category-and-extra-category
    provides: category-backed component storage and delete normalization seams
  - phase: 13-only-include-extras-when-explicitly-required
    provides: explicit-only runtime contract for extras
provides:
  - Persisted extra rows now strip legacy base-compatibility fields during upgrade
  - Food DB no longer exposes base-scoped extra query helpers
  - Migration fixtures and service tests lock extras to flat records while curries retain compatibility
affects: [food-db, dexie-migrations, extras, seed-data]
tech-stack:
  added: []
  patterns: [extras are flat persisted records; only curries retain base-compatibility persistence]
key-files:
  created:
    - .planning/phases/1000-remove-the-compatability-base-for-extras/1000-01-SUMMARY.md
  modified:
    - src/db/client.ts
    - src/services/food-db.ts
    - src/db/migrations.test.ts
    - src/services/food-db.test.ts
key-decisions:
  - "Kept subzi legacy mapping untouched while scoping the cleanup to extras and preserving curry compatibility."
  - "Added a dedicated Dexie v13 cleanup step instead of relying on lazy runtime normalization."
patterns-established:
  - "Feature removals should strip persisted legacy fields at migration time, not merely ignore them in selectors."
  - "Extra-specific service helpers should be deleted when the underlying product concept is removed."
requirements-completed: [PH1000-05]
duration: 18min
completed: 2026-04-03
---

# Phase 1000 Plan 01 Summary

**Persisted extras are now flat records: legacy base-compatibility fields are stripped on upgrade, and the food DB no longer exposes base-scoped extra lookup helpers**

## Performance

- **Duration:** 18 min
- **Started:** 2026-04-03T08:07:00+05:30
- **Completed:** 2026-04-03T08:25:00+05:30
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Locked the current branch state as already satisfying the extra type/seed contract, so execution focused on the remaining persistence/service seams.
- Added a Dexie migration and pure migration-helper cleanup so extras lose `compatible_base_category_ids` and `compatible_base_types` while curries keep their real compatibility contract.
- Removed the food-db extra-by-base helpers and rewrote migration/service tests around flat extra records.

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove extra compatibility from the type and seed contracts** - `4743c5a` (chore, no-op confirmation because current HEAD already satisfied the contract)
2. **Task 2: Strip persisted extra compatibility fields and delete the base-scoped extra query seam** - `4abd51c` (feat)

**Plan metadata:** pending final phase closeout docs commit

## Files Created/Modified

- `src/db/client.ts` - Stops backfilling extra compatibility in migration helpers and strips legacy extra fields in Dexie v13.
- `src/services/food-db.ts` - Deletes base-scoped extra query helpers and leaves flat component-type reads only.
- `src/db/migrations.test.ts` - Proves migration fixtures and delete normalization no longer leave extra compatibility fields behind.
- `src/services/food-db.test.ts` - Verifies stored extras are flat records and curry normalization behavior remains intact.

## Decisions Made

- Scoped the migration cleanup strictly to `componentType === 'extra'` so curry compatibility behavior remains untouched.
- Treated Task 1 as an explicit no-op verification because the branch already had the type/seed contract in the desired shape before execution resumed.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The original wave executor crashed before returning, but spot-checks showed no summary and no task commits. I resumed the plan inline, preserved the partial test edits that were already correct, and completed the remaining persistence changes manually.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Wave 2 can now remove the Library and picker UI without compensating for stale extra compatibility fields in storage or services.
- No blockers remain from persistence or migration seams.

## Self-Check: PASSED

- FOUND: `.planning/phases/1000-remove-the-compatability-base-for-extras/1000-01-SUMMARY.md`
- FOUND: `4743c5a`
- FOUND: `4abd51c`

---
*Phase: 1000-remove-the-compatability-base-for-extras*
*Completed: 2026-04-03*
