# Phase 20: Compatibility Regression Coverage - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase closes `CURRY-08` by proving the full curry compatibility contract stays aligned across migration, library/runtime normalization, generator defaults, picker overrides, and explicit rule exceptions.

Phase 20 is not a behavior-change phase. It should add milestone-level regression proof for the behavior already shipped in Phases 17, 18, and 19.

</domain>

<decisions>
## Implementation Decisions

### Coverage strategy
- **D-01:** Phase 20 should add one broader cross-flow regression harness as the backbone for `CURRY-08`, rather than only scattering more assertions across unrelated focused tests.
- **D-02:** Focused existing tests may still expand where needed, but they should support the backbone contract instead of being the only proof artifact.
- **D-03:** Planning should treat the backbone regression as the primary milestone-level evidence that migration, generator, picker, and override semantics all agree on the same compatibility rules.

### Rename/delete proof depth
- **D-04:** Phase 20 must prove rename/delete safety at the data/service layer and also through downstream runtime behavior after normalization.
- **D-05:** “Downstream runtime behavior” includes at least generator behavior and picker behavior after category normalization changes have been applied.
- **D-06:** It is not sufficient to prove only stored IDs are normalized; the tests must also prove that runtime selection logic no longer behaves as if deleted or renamed category references still exist.

### Scope guardrails
- **D-07:** Phase 20 should not add new compatibility features, override controls, fallback rules, or subzi/composition behavior.
- **D-08:** This phase is allowed to restructure or consolidate tests if that makes the compatibility contract easier to verify, but it should avoid unnecessary production refactors unless tests reveal a real drift.
- **D-09:** Manual verification is not a locked requirement for this phase; the planning default should favor automated proof unless research discovers a hard UI-only gap.

### the agent's Discretion
- Exact choice of backbone regression location and whether it lives in one existing test file or a small dedicated milestone-level regression file, as long as it becomes the clearest proof for `CURRY-08`.
- Exact split between migration/service tests and runtime tests, as long as rename/delete normalization is verified both before and after runtime consumption.
- Exact validation artifact structure, as long as it clearly traces `CURRY-08` to the milestone-wide regression commands.

</decisions>

<specifics>
## Specific Ideas

- This phase should feel like a final contract lock, not another feature wave.
- The best proof is a regression story that starts from compatibility-aware data, exercises auto-generation and explicit overrides, and shows the same rules still hold after rename/delete normalization.
- The backlog item about curry-vs-subzi composition should stay out of this phase.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope and requirement
- `.planning/ROADMAP.md` — Phase 20 goal, success criteria, and its dependency on Phases 17-19
- `.planning/REQUIREMENTS.md` — `CURRY-08` traceability target for this phase
- `.planning/PROJECT.md` — milestone summary and validated compatibility decisions carried forward from Phases 17-19
- `.planning/STATE.md` — current milestone position and carry-forward concern that Phase 20 must lock regression coverage

### Prior phase contracts
- `.planning/phases/17-curry-compatibility-data/17-CONTEXT.md` — migration/backfill semantics, empty-array meaning, and delete-normalization contract
- `.planning/phases/18-generator-compatibility-contract/18-CONTEXT.md` — compatible-by-default generator contract and skipped-curry warning boundary
- `.planning/phases/19-explicit-override-paths/19-CONTEXT.md` — manual/locked precedence, picker grouping, and scoped `require_one` override contract
- `.planning/phases/19-explicit-override-paths/19-VERIFICATION.md` — verified runtime truths and artifact links for explicit overrides

### Existing proof seams
- `src/db/migrations.test.ts` — migration/backfill coverage for seeded mappings, unmatched curry fallback, and explicit empty compatibility arrays
- `src/services/food-db.test.ts` — category rename/delete normalization coverage and service-layer runtime inputs
- `src/services/generator.test.ts` — automatic compatibility enforcement plus explicit override regressions
- `src/components/plan/MealPickerSheet.test.tsx` — picker grouping and flat-list fallback behavior for explicit overrides
- `src/stores/plan-store.test.ts` — regenerate/lock persistence for explicit incompatible selections

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/db/migrations.test.ts` already proves the Phase 17 migration seams and can anchor the “legacy becomes compatibility-aware” side of the contract.
- `src/services/food-db.test.ts` already exercises category rename/delete normalization and can be extended into a stronger pre-runtime contract.
- `src/services/generator.test.ts`, `src/components/plan/MealPickerSheet.test.tsx`, and `src/stores/plan-store.test.ts` already cover Phases 18-19 behavior and provide the most natural runtime proof seams.

### Established Patterns
- Recent phases use focused regression expansions first and only add new harnesses when the milestone contract spans multiple existing seams.
- Category normalization is ID-based and must be reflected both in persistence and in derived runtime behavior.
- Explicit overrides are intentionally narrow: manual/locked state and scoped `require_one` only.

### Integration Points
- A milestone-level backbone regression should connect Phase 17 migration semantics with Phase 18 generator enforcement and Phase 19 override behavior.
- Rename/delete regression depth must cross the seam from normalized stored data into runtime consumers such as generator candidate pools and picker section grouping.
- Validation should map `CURRY-08` to the combined regression commands that exercise all of those seams together.

</code_context>

<deferred>
## Deferred Ideas

- `2026-03-22-refactor-and-move-slot-setting-to-rules-tab.md` / “Meal Template rule type — unify slot settings and composition constraints” remains out of scope for Phase 20.
- Curry-vs-subzi composition modes remain deferred to backlog item `999.1`.
- Any new compatibility feature or override vocabulary remains out of scope; this phase only proves the current contract.

</deferred>

---

*Phase: 20-compatibility-regression-coverage*
*Context gathered: 2026-04-01*
