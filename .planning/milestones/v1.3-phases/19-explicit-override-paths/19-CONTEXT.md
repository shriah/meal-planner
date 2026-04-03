# Phase 19: Explicit Override Paths - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds the explicit escape hatches that are intentionally deferred by Phase 18. Incompatible curry/base pairings should remain possible, but only through clearly intentional user actions or explicitly scoped rules.

Phase 19 is not the regression-sweep phase. It should implement the override paths themselves and preserve the compatible-by-default contract established in Phase 18.

</domain>

<decisions>
## Implementation Decisions

### Manual picker visibility
- **D-01:** The curry picker should normally split results into compatible and incompatible sections so override choices are visible as exceptions, not normal matches.
- **D-02:** If there are no compatible curries for the current base, do not segregate the list; show one flat list so the picker still feels usable.
- **D-03:** Incompatible picker choices are allowed in this phase, but their visibility should communicate that they are override behavior rather than standard compatibility.

### Manual and locked persistence
- **D-04:** If a user manually selects an incompatible curry, that exact choice must persist until the user changes it.
- **D-05:** Locking and regeneration must preserve the manually chosen incompatible curry exactly; regeneration must not auto-normalize it back to a compatible curry.
- **D-06:** Phase 19 should treat manual and locked incompatible picks as explicit user intent, not as validation errors to “fix.”

### Rule override shape
- **D-07:** Both specific-component `require_one` and tag-based `require_one` rules can act as explicit compatibility overrides when they are intentionally scoped.
- **D-08:** Phase 19 should not add a new dedicated “ignore compatibility” rule control if existing `require_one` forms can express the exception cleanly.
- **D-09:** Tag-based `require_one` must prefer compatible matches first, and only use incompatible matches when no compatible match satisfies the explicit rule.

### Warning and explanation UX
- **D-10:** Explicit overrides should look normal on the board once selected; do not add a badge, warning-style indicator, or extra visual explanation in this phase.
- **D-11:** Existing warning UI remains for automatic omitted-curry behavior from Phase 18, but not for explicit override outcomes.

### Override precedence
- **D-12:** Manual and locked selections win over everything else.
- **D-13:** Explicit override rules win over the default compatibility constraint, but only when no manual/locked selection already owns the slot.
- **D-14:** Default compatibility still applies everywhere else.

### the agent's Discretion
- Exact section titles and copy in the curry picker, as long as compatible vs incompatible choices are clearly distinguishable when both exist.
- Exact internal implementation seam for explicit rule overrides, as long as existing rule forms are reused and override behavior remains scoped and testable.
- Exact handling of empty incompatible sections in the picker, as long as the user only sees meaningful grouping.

</decisions>

<specifics>
## Specific Ideas

- The picker should make incompatible choices feel intentional without becoming noisy or punitive.
- A user who manually chose an incompatible curry should never feel like the app “helpfully corrected” their decision later.
- Tag-based rule overrides should still respect compatibility when they can, and only cross that line when the explicit rule would otherwise fail.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and milestone scope
- `.planning/ROADMAP.md` — Phase 19 goal, requirements, and success criteria within v1.3
- `.planning/REQUIREMENTS.md` — `CURRY-05` and `CURRY-06` traceability for this phase
- `.planning/PROJECT.md` — milestone goal and currently validated compatibility-by-default behavior
- `.planning/STATE.md` — active phase position and carry-forward concerns

### Prior compatibility decisions
- `.planning/phases/17-curry-compatibility-data/17-CONTEXT.md` — meaning of explicit empty compatibility arrays and persistence contract
- `.planning/phases/18-generator-compatibility-contract/18-CONTEXT.md` — strict default enforcement boundary and explicit deferral of override behavior to this phase
- `.planning/phases/18-generator-compatibility-contract/18-VERIFICATION.md` — confirms current default generator enforcement and unchanged manual/locked behavior

### Current override seams
- `src/components/plan/MealPickerSheet.tsx` — current flat curry picker that will need explicit override grouping behavior
- `src/stores/plan-store.ts` — manual swap and locked regeneration behavior that currently persists chosen components
- `src/services/generator.ts` — automatic curry enforcement plus locked/manual boundary and `require_one` seam
- `src/services/rule-compiler.ts` — current rule compilation/decompilation path that should be reused instead of adding a brand-new override control if possible
- `src/types/plan.ts` — current rule effect vocabulary and generator result shapes

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/plan/MealPickerSheet.tsx` already owns the curry picker list and is the natural seam for compatible/incompatible grouping.
- `src/stores/plan-store.ts` already persists manual swaps and rebuilds locked-slot constraints for regeneration, so explicit incompatible manual choices can likely ride the current persistence path.
- `src/services/generator.ts` already distinguishes locked/manual state from automatic selection, and Phase 18 added the compatibility-scoped `require_one` seam that Phase 19 will intentionally extend.

### Established Patterns
- Compatibility is strict by default and only explicit intent can bypass it.
- Manual and locked state are treated as direct user intent and should not be silently normalized away.
- Existing rule controls are preferred over adding fresh surface area when the current model can express the behavior clearly enough.

### Integration Points
- Picker grouping and selection semantics must align with store persistence so manual incompatible choices survive regeneration.
- Rule override behavior will likely sit on the `require_one` path because that is the current explicit “must include this” mechanism.
- Override precedence must stay coherent across picker, lock state, and generator runtime so the user sees one consistent rule: manual/locked first, explicit rule next, compatibility default otherwise.

</code_context>

<deferred>
## Deferred Ideas

- Special board badges or warning-style override indicators are out of scope for this phase.
- A dedicated “ignore compatibility” rule control is deferred unless research proves existing `require_one` semantics are insufficient.
- Curry-vs-subzi composition modes remain deferred to backlog item `999.1`.

</deferred>

---

*Phase: 19-explicit-override-paths*
*Context gathered: 2026-03-30*
