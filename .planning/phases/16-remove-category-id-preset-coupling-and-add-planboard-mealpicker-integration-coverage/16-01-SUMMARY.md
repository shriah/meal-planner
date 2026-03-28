---
phase: 16-remove-category-id-preset-coupling-and-add-planboard-mealpicker-integration-coverage
plan: 01
subsystem: ui
tags: [rules, presets, categories, testing, vitest, planboard]
requires:
  - phase: 14-add-option-to-create-more-base-category-and-extra-category
    provides: category-backed base and extra compatibility throughout rules, generator, and picker flows
provides:
  - preset resolution keyed to built-in base-category identity instead of seeded numeric IDs
  - RuleForm preset hydration that waits for live base-category rows before dispatch
  - direct PlanBoard-to-MealPickerSheet regression coverage for extras-only currentBaseCategoryId handoff
affects: [rules-manager, meal-picker, phase-14-audit-debt, v1.2-milestone-audit]
tech-stack:
  added: []
  patterns:
    - pure preset resolver in form-state.ts backed by live category rows from RuleForm
    - parent-to-child prop assertions in PlanBoard tests via mocked MealPickerSheet
key-files:
  created: []
  modified:
    - src/components/rules/form-state.ts
    - src/components/rules/RuleForm.tsx
    - src/components/rules/form-state.test.ts
    - src/components/rules/RuleForm.test.tsx
    - src/components/plan/PlanBoard.test.tsx
key-decisions:
  - "Kept preset definitions declarative in form-state.ts and resolved built-in category targets at the RuleForm boundary using live base-category rows."
  - "Covered the PlanBoard extras handoff by mocking MealPickerSheet and asserting received props directly instead of inferring behavior only from picker queries."
patterns-established:
  - "Category-backed presets should encode stable built-in identity, then resolve to numeric IDs only where live category rows are available."
  - "Cross-component handoff regressions should assert parent props directly when the child already has separate picker-level tests."
requirements-completed: [audit-tech-debt-phase-14-category-coupling-and-picker-handoff]
duration: 5min
completed: 2026-03-28
---

# Phase 16 Plan 01: Remove Category ID Preset Coupling and Add PlanBoard MealPicker Integration Coverage Summary

**Rule presets now resolve rice-category targets from live built-in category rows, and PlanBoard directly proves the extras picker handoff into MealPickerSheet.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-28T19:30:45Z
- **Completed:** 2026-03-28T19:35:20Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Replaced the `rice-lunch-dinner` preset’s hard-coded `base_category_id: 1` with a pure resolver keyed to the built-in `rice-based` category identity.
- Updated `RuleForm` to wait for live base-category rows before dispatching a category-backed preset, and added a component regression for that waiting behavior.
- Added dedicated PlanBoard coverage that asserts `MealPickerSheet` receives `currentBaseCategoryId` only for extras picker opens.

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace hard-coded preset category IDs with stable preset resolution** - `b0626b9` (fix)
2. **Task 2: Add direct PlanBoard-to-MealPicker extras handoff coverage** - `1870f55` (test)

## Files Created/Modified
- `src/components/rules/form-state.ts` - Encodes declarative example presets and resolves built-in base-category targets against live category rows.
- `src/components/rules/RuleForm.tsx` - Loads base categories via the existing category query and hydrates presets only after resolution succeeds.
- `src/components/rules/form-state.test.ts` - Covers category-backed preset resolution and the unresolved-yet path.
- `src/components/rules/RuleForm.test.tsx` - Verifies the rice preset does not hydrate before the live category row exists.
- `src/components/plan/PlanBoard.test.tsx` - Asserts extras picker opens pass the slot base category ID and non-extras leave it undefined.

## Decisions Made
- Resolved category-backed presets in `RuleForm` instead of pushing Dexie access into `form-state.ts`, preserving the pure-module boundary from the plan.
- Kept Task 2 implementation test-only because the existing `PlanBoard.tsx` wiring already satisfied the new direct regression once covered explicitly.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The plan frontmatter requirement ID `audit-tech-debt-phase-14-category-coupling-and-picker-handoff` was not present in `.planning/REQUIREMENTS.md`, so the workflow auto-marker made no requirements-file change.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 14 audit debt is closed for both the preset category-coupling bug and the PlanBoard extras handoff coverage gap.
- No blockers remain from this plan.

## Self-Check: PASSED

- Found summary file: `.planning/phases/16-remove-category-id-preset-coupling-and-add-planboard-mealpicker-integration-coverage/16-01-SUMMARY.md`
- Found task commit: `b0626b9`
- Found task commit: `1870f55`

---
*Phase: 16-remove-category-id-preset-coupling-and-add-planboard-mealpicker-integration-coverage*
*Completed: 2026-03-28*
