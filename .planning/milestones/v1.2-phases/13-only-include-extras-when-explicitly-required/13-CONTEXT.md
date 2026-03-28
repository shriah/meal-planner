# Phase 13: Only include extras when explicitly required - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning
**Source:** Inline planning context from debug session and roadmap follow-up

<domain>
## Phase Boundary

This phase changes generator behavior for extras after Phase 12 removed exclude-extra support.

Today, the generator still randomly fills compatible extras whenever there is remaining extra capacity for a slot, even if no rule explicitly requires an extra. The desired product behavior is stricter:

- unlocked slots should include extras only when a matching rule explicitly requires an extra category
- no random optional extras should be added by default
- explicit `require_extra` behavior from Phase 12 must continue to work
- locked `extra_ids` must still be preserved as-is

This phase is primarily a generator/runtime and test-surface change. It is not expected to add new rule UI or a new rule type.
</domain>

<decisions>
## Implementation Decisions

### Locked Behavior
- Locked slot `extra_ids` remain authoritative and must continue to bypass normal generation choices.

### Default Extra Policy
- For unlocked generation, a slot with no matching `require_extra` effects should end with zero generated extras.
- Compatible extras should no longer be randomly filled just because they are available.

### Explicit Requirement Semantics
- Existing `require_extra` rules remain the only rule path that can cause generated extras to appear.
- Existing warning behavior for unsatisfied explicit `require_extra` categories should remain intact.

### Scope of Change
- No new rule-form controls are needed.
- Rule descriptions do not need new copy unless the planner finds a user-visible surface that promises optional extras today.
- Preference fields such as `extra_quantity_limits` may still matter as a ceiling or compatibility input, but they must not cause optional extras to appear by themselves.

### the agent's Discretion
- Whether `extra_quantity_limits` should stay untouched, be partially repurposed, or merely limit explicit requirements if multiple categories are required.
- Whether plan-board tests, export tests, or docs outside generator-focused coverage need updates to reflect the new “no extras by default” output shape.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Generator and schema
- `src/services/generator.ts` — current runtime behavior still performs random extra fill after satisfying required extras
- `src/services/generator.test.ts` — current test suite includes a Phase 12 assertion that extras remain unconstrained without `require_extra`
- `src/types/plan.ts` — active compiled rule effect schema after Phase 12

### Prior phase decisions
- `.planning/phases/12-require-extra-explicitly-instead-of-excluding-extra-categories-by-default/12-CONTEXT.md` — prior decisions that removed exclude-extra and kept explicit require-extra semantics
- `.planning/phases/12-require-extra-explicitly-instead-of-excluding-extra-categories-by-default/12-RESEARCH.md` — generator/persistence reasoning from the immediately preceding phase
- `.planning/phases/12-require-extra-explicitly-instead-of-excluding-extra-categories-by-default/12-VERIFICATION.md` — completed Phase 12 contract that this phase intentionally narrows further

### Data access
- `src/services/food-db.ts` — generator data loading for components, preferences, and enabled rules
</canonical_refs>

<specifics>
## Specific Ideas

- Replace the current “random fill remaining slots” extra-selection branch with a require-only path.
- Rewrite the Phase 12 regression that currently asserts compatible extras stay unconstrained without `require_extra`.
- Add focused tests proving:
  - no `require_extra` means `extra_ids` is empty for unlocked generation
  - explicit `require_extra` still injects matching extras
  - locked extras survive unchanged
</specifics>

<deferred>
## Deferred Ideas

- Any future product choice to reintroduce optional extras as an explicit rule or preference.
</deferred>

---

*Phase: 13-only-include-extras-when-explicitly-required*
*Context gathered: 2026-03-28 via inline planning context*
