# Phase 18: Generator Compatibility Contract - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase makes curry/base compatibility a real automatic-generation constraint. Once a base is selected for a slot, automatic curry selection must only consider curries that are compatible with that base.

Phase 18 is not the explicit override phase. Manual picker exceptions, locked/manual incompatible pairings, and rule-based incompatible overrides stay out of scope here and must remain deferred to Phase 19.

</domain>

<decisions>
## Implementation Decisions

### No-compatible-curry outcome
- **D-01:** If the selected base has no compatible curry candidates, automatic generation must skip the curry for that slot rather than silently inserting an incompatible curry.
- **D-02:** “Skip the curry” means the slot still keeps its selected base and any independently valid components, but `curry_id` remains unset.
- **D-03:** Phase 18 must not introduce a relaxed fallback such as “pick any curry anyway” or “pretend zero-compatible means unrestricted.”

### Enforcement boundary
- **D-04:** Phase 18 stays limited to default automatic-generation enforcement.
- **D-05:** Rule-based incompatible curry overrides are explicitly deferred to Phase 19 even if the current rule engine already has nearby seams.
- **D-06:** Planning and implementation should avoid reshaping the roadmap by folding override semantics into this phase.

### Warning behavior
- **D-07:** Reuse the existing per-slot generator warning path when curry selection is skipped because compatibility leaves no eligible candidates.
- **D-08:** This phase should not add a new warning banner type or a stronger dedicated warning style; existing warning presentation is sufficient for now.
- **D-09:** Warning copy should make it clear that the curry was omitted because no compatible curry existed for the selected base.

### Zero-compatible curries
- **D-10:** Curries with an explicit empty `compatible_base_category_ids` array are incompatible with every base for automatic generation.
- **D-11:** Zero-compatible curries must never enter automatic curry pools unless a later explicit override path intentionally allows them.
- **D-12:** Phase 18 must preserve the distinction established in Phase 17 between explicit `[]` and legacy missing data.

### Manual and locked exceptions
- **D-13:** Manual picker swaps and locked/manual incompatible curry selections remain unchanged in this phase.
- **D-14:** Phase 18 should not restrict the manual picker or reinterpret locked/manual state; it only changes normal automatic generation.
- **D-15:** Any UI or store behavior needed for explicit incompatible manual choices belongs to Phase 19, not here.

### the agent's Discretion
- Exact warning string wording, as long as it clearly states that auto-generation skipped curry because no compatible curry was available for the chosen base.
- Whether the compatibility filter is enforced as a dedicated helper or inline pool narrowing, as long as the generator contract stays readable and testable.
- Whether skipped-curry handling is shared with existing empty-pool generator behavior or implemented as a separate narrow branch, as long as it does not silently relax compatibility.

</decisions>

<specifics>
## Specific Ideas

- Compatibility should behave like the extras change from v1.2: if the user did not explicitly allow an exception, the generator should simply omit the component rather than backsliding into a random fallback.
- A generated slot without a curry is acceptable when compatibility makes that necessary; a silently incompatible pairing is not.
- The phase should keep the override story intact by changing only automatic generation and leaving explicit user intent paths alone.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and milestone scope
- `.planning/ROADMAP.md` — Phase 18 goal, requirements, and success criteria within v1.3
- `.planning/REQUIREMENTS.md` — `CURRY-03` and `CURRY-04` traceability for this phase
- `.planning/PROJECT.md` — milestone goal that compatibility is hard by default while overrides stay explicit
- `.planning/STATE.md` — current milestone focus and carry-forward notes from Phase 17

### Prior compatibility decisions
- `.planning/phases/17-curry-compatibility-data/17-CONTEXT.md` — meaning of explicit empty compatibility arrays, backfill behavior, and scope guardrails
- `.planning/phases/17-curry-compatibility-data/17-VERIFICATION.md` — confirms Library-side compatibility data now exists and was manually approved
- `.planning/milestones/v1.2-phases/13-only-include-extras-when-explicitly-required/13-01-PLAN.md` — prior precedent for removing permissive default fill behavior when a component should only appear explicitly

### Current generator and picker seams
- `src/services/generator.ts` — current curry selection path, warning plumbing, and locked/manual handling boundary
- `src/types/plan.ts` — generator result and warning types
- `src/components/plan/PlanBoard.tsx` — current warning display entry point and manual picker flow
- `src/components/plan/MealPickerSheet.tsx` — manual picker path that must remain unchanged in this phase
- `src/services/food-db.ts` — component query helpers that may already expose category-aware filtering seams

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/services/generator.ts`: already has separate curry-selection, warning, and locked/manual branches, so compatibility enforcement can stay localized to the automatic curry pool path.
- `src/types/plan.ts`: warning objects are already slot-scoped and do not require a new result shape for this phase.
- `src/components/plan/WarningBanner.tsx` and the existing plan board flow already surface per-slot generator warnings without adding a new UI channel.

### Established Patterns
- Recent generator changes in v1.2 removed permissive default behavior rather than masking missing explicit intent; Phase 18 should follow that same constraint-first direction.
- Empty persisted arrays are meaningful state in this codebase and should not be collapsed into legacy fallback semantics.
- Manual picker and locked-state behavior are treated as explicit user intent and should not be accidentally tightened while changing automatic generation.

### Integration Points
- Automatic curry selection currently happens after base selection and before extras, so compatibility filtering must key off the already-selected base for the slot.
- Rule effects like `filter_pool`, `exclude`, and `require_one` already run through the curry pool path, so planning must be clear about where compatibility filtering sits relative to those default-selection steps without implementing true incompatible overrides yet.
- Warning generation should remain tied to the slot being generated so existing warning banners continue to explain omitted curries without new UI work.

</code_context>

<deferred>
## Deferred Ideas

- Rule-based incompatible curry overrides remain Phase 19 work and should not be merged into this phase.
- Manual picker restriction or incompatible-picker affordances remain Phase 19 work.
- Curry-vs-subzi composition modes remain deferred to backlog item `999.1`.

</deferred>

---

*Phase: 18-generator-compatibility-contract*
*Context gathered: 2026-03-29*
