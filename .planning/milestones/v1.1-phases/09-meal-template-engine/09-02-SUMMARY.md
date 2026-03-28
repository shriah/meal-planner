---
phase: 09-meal-template-engine
plan: "02"
subsystem: generator
tags: [meal-template, generator, tdd, vitest, dexie, scheduling]

# Dependency graph
requires:
  - phase: 09-01
    provides: MealTemplateRule type, CompiledFilterSchema meal-template variant, rule-compiler case

provides:
  - Generator fully honors meal-template slot assignment (TMPL-02)
  - Generator fully honors meal-template component exclusions (TMPL-03)
  - Generator fully honors meal-template extra exclusions (TMPL-04)
  - Generator fully honors meal-template required extras (TMPL-05)
  - D-05/D-06 override/fallback semantics for prefs coexistence
  - D-08 composition semantics (intersection for slots, union for exclusions, all-attempted for requires)
  - D-09 context scope (days/slots gates composition constraints)
  - D-10 relax-and-warn failure handling for all meal-template constraint types
  - 18 new TDD tests covering all four constraint types and all edge cases

affects: [10-meal-template-ui, generator consumers, rule form UI]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - getMealTemplateAllowedSlots computes intersection across rules (D-08 slot composition)
    - getApplicableMealTemplates filters by (baseType, day, slot) context for composition constraints (D-09)
    - mealTemplateRules extracted once per generate() call, applicableTemplates computed per slot after base selection
    - templatesForBase.length > 0 branch decides D-05 override vs D-06 fallback for both extras and base slots
    - All meal-template failures relax + warn (D-10): never block generation, always emit descriptive warning message

key-files:
  created: []
  modified:
    - src/services/generator.ts
    - src/services/generator.test.ts

key-decisions:
  - "mealTemplateRules extracted once at top of generateWeekPlan(); applicableTemplates computed per slot AFTER base selection — base type must be known first to look up applicable templates"
  - "applicableTemplates uses getApplicableMealTemplates which gates by days+slots context per D-09 — separate from getMealTemplateAllowedSlots which is unscoped per D-03"
  - "excludedComponentTypes computed as Set from applicableTemplates.flatMap(exclude_component_types) — O(1) lookup in curry/subzi skip guards"
  - "Locked components always bypass meal-template soft constraints — locked curry/subzi used unconditionally"
  - "TMPL-05-4 test fixed: assert any condiment present (not specific ID) since extraCondimentAllId from seedMinimalComponents is also bread-compatible and gets picked by weightedRandom"

patterns-established:
  - "D-05/D-06 branch pattern: if (templatesForBase.length > 0) { template logic } else { prefs fallback } — used identically for slot assignment and required extras"
  - "D-10 relax pattern: compute filtered result; if empty AND source non-empty, push warning and keep original; else replace with filtered"
  - "D-08 independent iteration: for (const tmpl of applicableTemplates) { if require_extra_category; attempt + warn on failure } — each rule attempted independently"

requirements-completed: [TMPL-02, TMPL-03, TMPL-04, TMPL-05]

# Metrics
duration: 31min
completed: 2026-03-26
---

# Phase 09 Plan 02: Meal Template Engine — Generator Integration Summary

**Generator fully enforces meal-template rules for slot assignment, component exclusions, extra exclusions, and required extras — with prefs override/fallback semantics and relax-and-warn on all failures**

## Performance

- **Duration:** 31 min
- **Started:** 2026-03-25T15:46:16Z
- **Completed:** 2026-03-26T02:07:31Z
- **Tasks:** 2 (TDD: 4 commits — 2 RED + 2 GREEN)
- **Files modified:** 2

## Accomplishments

- Generator reads `mealTemplateRules` from `validRules` once per generation; applies them at 3 integration points: `getEligibleBases`, curry/subzi gating, extras block
- Added `getMealTemplateAllowedSlots` (intersection of `allowed_slots` across rules per D-08) and `getApplicableMealTemplates` (context-scoped rules per D-09) as pure helpers
- D-05/D-06 override/fallback correctly gates all four constraint types: base types WITH templates ignore prefs entirely, base types WITHOUT templates use prefs unchanged
- D-10 relax-and-warn implemented for all three failure modes: empty `allowed_slots` intersection, all extras excluded, no eligible extras for required category
- 18 new tests added (10 for TMPL-02/03, 8 for TMPL-04/05); all 170 tests pass across 13 test files

## Task Commits

Each task was committed atomically with TDD RED/GREEN pairs:

1. **Task 1 RED: Slot assignment + component exclusion tests** - `d01821b` (test)
2. **Task 1 GREEN: Slot assignment + component exclusion implementation** - `e0cb6b8` (feat)
3. **Task 2 RED: Extra exclusion + required extras tests** - `967a3e4` (test)
4. **Task 2 GREEN: Extra exclusion + required extras implementation** - `3334e4d` (feat)

**Plan metadata:** _(docs commit follows)_

_Note: TDD tasks each have 2 commits (RED test → GREEN implementation)_

## Files Created/Modified

- `src/services/generator.ts` — Added `getMealTemplateAllowedSlots`, `getApplicableMealTemplates`, `MealTemplateRule` import; updated `getEligibleBases` signature; added `mealTemplateRules` extraction, `applicableTemplates`/`excludedComponentTypes` per slot, extra exclusion block, D-05/D-06 required extras branching
- `src/services/generator.test.ts` — Added 18 new meal-template TDD tests covering TMPL-02 (6 tests), TMPL-03 (4 tests), TMPL-04 (3 tests), TMPL-05 (5 tests)

## Decisions Made

- `mealTemplateRules` extracted once at top of `generateWeekPlan()` from `validRules`; `applicableTemplates` computed per slot AFTER base selection — base type must be known to look up applicable templates
- `getApplicableMealTemplates` uses `days`/`slots` context scope per D-09 (for composition constraints); separate from `getMealTemplateAllowedSlots` which is unscoped per D-03 (slot assignment always global)
- `excludedComponentTypes` is a `Set` built from `applicableTemplates.flatMap(t => t.exclude_component_types)` — O(1) lookup in the `skipCurry`/`skipSubzi` guards
- Locked components always bypass meal-template soft constraints — `locked?.curry_id` guard checked before `skipCurry`
- TMPL-05-4 test assertion corrected during GREEN phase: `extraCondimentAllId` (from seedMinimalComponents) is also bread-compatible and gets picked by `weightedRandom` before the test-specific `condimentBreadId` — test fixed to accept any condiment in the category, with `extra_quantity_limits` bumped to 3 to ensure both mandatory extras fit

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TMPL-05-4 test assertion too strict**
- **Found during:** Task 2 GREEN (extra exclusion + required extras implementation)
- **Issue:** Test asserted specific `condimentBreadId` must appear in `extra_ids`, but `extraCondimentAllId` from `seedMinimalComponents` is also bread-compatible and gets picked first by `weightedRandom`; test also used default `extra_quantity_limits` (max 2) which is too low for 2 mandatory extras
- **Fix:** Changed assertion to check for any condiment ID (`condimentBreadId OR extraCondimentAllId`); bumped `extra_quantity_limits` to 3 in that test
- **Files modified:** `src/services/generator.test.ts`
- **Verification:** All 67 generator tests pass
- **Committed in:** `3334e4d` (Task 2 GREEN commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in test assertion)
**Impact on plan:** Test correctness fix only — no implementation changes needed. The generator behavior was correct; only the test expectation was wrong.

## Issues Encountered

- Pre-existing TypeScript errors in `src/app/api/export-plan/route.ts` (missing `estimateHeight` export, wrong `ReactNode` type) — confirmed pre-existing before this plan's changes, out of scope per deviation rules, logged here for awareness

## Known Stubs

None — all four constraint types are fully wired and verified by tests.

## Next Phase Readiness

- Generator now fully enforces all meal-template constraints from Phase 09 Plan 01 types
- Phase 10 (meal-template UI) can build the rule form, migration logic, and `/settings/slots` removal on this foundation
- `prefs.slot_restrictions.base_type_slots` and `prefs.base_type_rules` still read as fallback — migration in Phase 10 will eliminate them

---
*Phase: 09-meal-template-engine*
*Completed: 2026-03-26*
