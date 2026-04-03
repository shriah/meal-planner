---
phase: 19-explicit-override-paths
plan: 02
subsystem: generator
tags: [vitest, generator, compatibility, curry, rules]
requires:
  - phase: 18-generator-compatibility-contract
    provides: compatibility-scoped automatic curry selection and skip-and-warn defaults
  - phase: 19-explicit-override-paths
    provides: manual picker grouping and locked/manual incompatible curry persistence
provides:
  - scoped require_one curry overrides for exact-component and compatibility-first tag targets
  - regression coverage preserving compatibility-by-default outside explicit override paths
  - updated Phase 19 validation contract with CURRY-05 and CURRY-06 traceability
affects: [20-compatibility-regression-coverage, generator, validation]
tech-stack:
  added: []
  patterns: [compatibility-first require_one fallback, curry-only explicit override seam]
key-files:
  created: []
  modified:
    - src/services/generator.ts
    - src/services/generator.test.ts
    - .planning/phases/19-explicit-override-paths/19-VALIDATION.md
key-decisions:
  - "Scoped require_one overrides stay on the existing curry generator seam instead of adding new rule vocabulary or override flags."
  - "Tag-based curry require_one stays compatibility-first and only falls back to incompatible eligible curries when no compatible match satisfies the explicit rule."
patterns-established:
  - "Exact-component and tag curry require_one rules may search an eligible curry library wider than the compatible pool, but only after the compatible path fails."
  - "Broad curry rules and all non-explicit flows continue to use the compatibility-scoped default pool."
requirements-completed: [CURRY-06]
duration: 4min
completed: 2026-03-30
---

# Phase 19 Plan 02: Explicit Override Paths Summary

**Scoped curry `require_one` overrides with compatibility-first tag fallback and preserved compatibility-by-default generator behavior**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-29T19:19:15Z
- **Completed:** 2026-03-29T19:23:21Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Extended the curry `require_one` path so exact-component rules can force an incompatible curry for a scoped slot while reusing the existing rule model.
- Added generator regressions proving tag-based `require_one` stays compatibility-first, only falls back to incompatible curries when needed, and broad curry rules do not become an override loophole.
- Updated the Phase 19 validation contract so CURRY-05 and CURRY-06 map to the shipped picker/store/generator commands and recorded the focused generator rerun evidence while keeping the phase gate pending.

## Task Commits

Each task was committed atomically:

1. **Task 1: Narrowly extend require_one to support explicit incompatible curry overrides** - `af6f172` (test), `c7ecddf` (feat)
2. **Task 2: Keep the Phase 19 validation contract aligned after both override plans land** - `ae8cafe` (docs)

## Files Created/Modified

- `src/services/generator.ts` - Adds a compatibility-first curry `require_one` fallback that can use an eligible incompatible curry only for exact-component and tag targets.
- `src/services/generator.test.ts` - Covers scoped exact-component overrides, tag fallback precedence, and broad-rule compatibility guardrails.
- `.planning/phases/19-explicit-override-paths/19-VALIDATION.md` - Aligns Phase 19 requirement traceability, focused commands, and rerun evidence with both override plans.

## Decisions Made

- Kept the override implementation inside the existing curry `require_one` seam so the rule vocabulary and persisted rule shape stay unchanged.
- Allowed incompatible fallback only for intentionally scoped curry targets (`component` and `tag`), leaving broad `component_type: 'curry'` rules inside the compatible pool.
- Preserved existing cross-component `require_one` warning semantics rather than broadening this plan into a generator-wide warning model change.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The first runtime pass accidentally suppressed existing `require_one` warning cases when a pool pick already existed. Restoring the legacy warning path fixed the regression without changing the new curry override behavior.
- Curry-scoped `require_one` rules still emit legacy warnings during base/subzi passes because `require_one` remains cross-component. Tests were narrowed to the shipped override contract instead of expanding this plan into warning-model changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 19 now has both explicit override paths implemented: manual/locked overrides from `19-01` and scoped `require_one` rule overrides from `19-02`.
- Phase 20 can build regression coverage on a stable contract: compatibility stays strict by default except for manual/locked selections and scoped exact/tag curry `require_one` overrides.

## Self-Check: PASSED

- Found `.planning/phases/19-explicit-override-paths/19-02-SUMMARY.md`
- Found task commits `af6f172`, `c7ecddf`, and `ae8cafe` in git history
