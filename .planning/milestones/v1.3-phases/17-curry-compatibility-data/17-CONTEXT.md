# Phase 17: Curry Compatibility Data - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds curry-to-base compatibility data to the library model and editing surfaces, and upgrades existing curry records into that same category-ID-safe shape.

Phase 17 is not the generator-enforcement phase and not the override-semantics phase. It must deliver the data model, library editing UX, upgrade/backfill path, and delete-normalization behavior that later phases will rely on.

</domain>

<decisions>
## Implementation Decisions

### Backfill policy
- **D-01:** Ship curated compatibility mappings for seeded/default curries where the pairing is known.
- **D-02:** Any existing curry that is not covered by curated seed mappings should fall back to "all current base categories" on upgrade so no current library breaks.
- **D-03:** Phase 17 must cover both seeded/default curry data and a safe in-app fallback path for already-existing non-curated user-library curries.

### Empty compatibility semantics
- **D-04:** An empty `compatible_base_category_ids` array means "compatible with none," not "all."
- **D-05:** Zero compatible bases is allowed in stored data and editing flows; it represents a curry the generator should never auto-pick.
- **D-06:** The Library must surface zero-compatible-base curries with a clear warning/badge so the state is explicit to the user.

### Library editing UX
- **D-07:** Reuse the existing extra-compatibility checklist pattern for curry compatibility rather than introducing a new picker interaction.
- **D-08:** Collapsed curry rows should show the selected compatible base labels, matching the existing compatibility-summary pattern used elsewhere in the library.
- **D-09:** The phase should keep the editing experience lightweight and library-native rather than creating a separate category-management-style flow for curry compatibility.

### Delete normalization
- **D-10:** When a base category is deleted, remove that ID from curry compatibility lists and keep any remaining IDs.
- **D-11:** If delete normalization leaves a curry with zero compatible base IDs, keep it empty and let the empty-state warning behavior apply; do not silently reset it back to all-bases.
- **D-12:** Category identity remains ID-based, so rename/delete safety must follow the same normalization contract established in Phase 14.

### Scope guardrails
- **D-13:** This phase does not define generator fallback behavior beyond the meaning of the stored compatibility data; enforcement belongs to Phase 18.
- **D-14:** This phase does not add curry-vs-subzi composition logic, subzi compatibility, or a new rule surface.

### the agent's Discretion
- Exact copy for the zero-compatible-base warning state, as long as it clearly communicates that the curry will not be auto-selected.
- Exact placement/styling of compatibility labels on collapsed curry rows, as long as the summary remains visible.
- Exact curated seed mapping mechanism and migration implementation details, as long as seeded curries get explicit mappings and non-curated curries get the safe all-bases fallback.

</decisions>

<specifics>
## Specific Ideas

- Curry compatibility should behave like a real constraint field in the Library, not like an inferred hidden heuristic.
- Existing user data should survive upgrade without forcing the user to recreate or immediately edit every curry.
- Zero-compatible-base curries are valid, but they should look intentionally constrained rather than accidentally broken.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and milestone scope
- `.planning/ROADMAP.md` — Phase 17 goal, requirements, and milestone boundary within v1.3
- `.planning/REQUIREMENTS.md` — `CURRY-01`, `CURRY-02`, and `CURRY-07` traceability for this phase
- `.planning/PROJECT.md` — current milestone framing and active requirement summary for curry/base compatibility

### Prior category-system decisions
- `.planning/milestones/v1.2-phases/14-add-option-to-create-more-base-category-and-extra-category/14-CONTEXT.md` — stable-ID category model, delete normalization contract, and compatibility checklist direction established in Phase 14

### Current library and data seams
- `src/components/library/ComponentForm.tsx` — existing base/extra compatibility checklist pattern to reuse for curries
- `src/components/library/ComponentRow.tsx` — collapsed row badge/label pattern for showing compatibility summaries
- `src/types/component.ts` — current component record variants and where curry compatibility fields will be added
- `src/db/client.ts` — Dexie schema/migration chain and category normalization helpers
- `src/services/category-db.ts` — category delete flow that already normalizes component/rule references
- `src/db/seed-data.ts` — seeded curry source data that will need curated compatibility mappings

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/library/ComponentForm.tsx`: already contains the checklist UI and save-path wiring for `compatible_base_category_ids` on extras, making it the natural pattern to mirror for curries.
- `src/components/library/ComponentRow.tsx`: already resolves and displays compatible base labels on collapsed rows for extras, so curry summary badges can reuse the same label-resolution pattern.
- `src/services/category-db.ts` + `src/db/client.ts`: category delete logic and `normalizeComponentCategoryRefs()` already provide the normalization seam that curry compatibility should plug into.

### Established Patterns
- Category identity is stable-ID based, with rename/delete safety handled through normalization rather than blocked UI actions.
- Data-shape changes ship through Dexie versioned migrations, with existing fallback fields preserved only when needed for compatibility.
- Library editing favors inline form sections and compact collapsed-row summaries rather than separate flows for per-component metadata.

### Integration Points
- Curry compatibility storage belongs on `ComponentRecord`/`CurryRecord` alongside existing extra compatibility data.
- Upgrade behavior must touch both Dexie migration/backfill and seed/bootstrap assumptions so seeded/default data and existing user data converge on the same shape.
- Category delete normalization must treat curry compatibility lists as first-class references, alongside existing base/extra category references.

</code_context>

<deferred>
## Deferred Ideas

- Curry-vs-subzi composition modes remain deferred to backlog item `999.1` and are not part of this phase.
- Generator enforcement and explicit override behavior are handled in Phases 18 and 19, not here.

</deferred>

---

*Phase: 17-curry-compatibility-data*
*Context gathered: 2026-03-29*
