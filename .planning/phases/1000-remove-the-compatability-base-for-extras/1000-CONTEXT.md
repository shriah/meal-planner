# Phase 1000: remove the compatability base for Extras - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase removes base-compatibility from extras as a product concept. Extras should no longer store or use `compatible_base_category_ids`, and base selection should stop affecting which extras appear in the Library model, plan picker, or generator.

This is not a curry-compatibility phase, not a category-system redesign phase, and not a return to random extra generation. The extras runtime contract established in v1.2 still applies: automatic generation only adds extras when rules explicitly require them.

</domain>

<decisions>
## Implementation Decisions

### Scope of removal
- **D-01:** Remove extra/base compatibility completely from the data model, Library UI, queries, picker filtering, and generator behavior.
- **D-02:** Extra records should stop storing `compatible_base_category_ids` as active application data.
- **D-03:** The phase should remove the extra-specific compatibility editing and summary surfaces from the Library rather than leaving dead UI around a removed runtime behavior.

### Runtime behavior after removal
- **D-04:** Rules become the only mechanism that can cause extras to be auto-added.
- **D-05:** If no matching rule requires an extra, auto-generation should add no extras by default.
- **D-06:** Manual extra picking should show all extras rather than filtering by the current base category.
- **D-07:** This phase should not reintroduce any fallback auto-fill behavior for extras after compatibility removal.

### Existing data migration
- **D-08:** Legacy `compatible_base_category_ids` on extra records should be stripped or ignored during migration/normalization so the old field does not survive as live behavior.
- **D-09:** Upgrade behavior must leave existing extra records otherwise intact; removing base compatibility should not require recreating or manually repairing the library.

### Scope guardrails
- **D-10:** Curry compatibility remains unchanged; this phase applies only to extras.
- **D-11:** Category IDs, rename safety, and delete normalization from Phase 14 remain in force for category-backed data that still exists after this removal.
- **D-12:** Meal composition logic such as curry-vs-subzi defaults remains deferred to backlog item `999.1` and is not part of this phase.

### the agent's Discretion
- Exact cleanup strategy for legacy extra compatibility fields, as long as old base-compatibility data no longer affects runtime behavior.
- Exact Library copy after removing extra compatibility controls, as long as the UI no longer implies extras are scoped to bases.
- Exact service/query refactor shape, as long as manual extra selection becomes unfiltered and auto-generation remains rule-driven only.

</decisions>

<specifics>
## Specific Ideas

- Extras should become globally pickable side items unless a rule narrows them at generation time.
- Removing extra/base compatibility should simplify the system, not create a second hidden compatibility mechanism.
- The post-phase product story should be easy to explain: extras are explicit rule-driven add-ons, not base-bound components.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and milestone scope
- `.planning/ROADMAP.md` — backlog placement for Phase 1000 and current milestone/archive state
- `.planning/PROJECT.md` — current shipped product contract, including explicit-only extra semantics from v1.2
- `.planning/REQUIREMENTS.md` — current live milestone requirements, to avoid accidentally reopening v1.3 curry work

### Prior extra/category decisions
- `.planning/milestones/v1.2-phases/12-require-extra-explicitly-instead-of-excluding-extra-categories-by-default/12-CONTEXT.md` — require-or-none extra rule semantics
- `.planning/milestones/v1.2-phases/13-only-include-extras-when-explicitly-required/13-CONTEXT.md` — no auto-added extras by default unless explicitly required
- `.planning/milestones/v1.2-phases/14-add-option-to-create-more-base-category-and-extra-category/14-CONTEXT.md` — category-ID model, delete normalization, and dynamic category propagation

### Current extra compatibility seams to remove
- `src/types/component.ts` — extra record shape that still includes `compatible_base_category_ids`
- `src/components/library/ComponentForm.tsx` — extra compatibility checklist UI that should be removed
- `src/components/library/ComponentRow.tsx` — extra compatibility summary labels shown in collapsed rows
- `src/services/food-db.ts` — extra queries such as `getExtrasByBaseCategoryId()` and normalization logic
- `src/components/plan/MealPickerSheet.tsx` — manual picker flow that currently filters extras by base context
- `src/services/generator.ts` — extra selection/runtime compatibility helpers that still consider base compatibility
- `src/db/client.ts` — Dexie schema and migration chain where legacy extra compatibility data must be normalized away
- `src/db/seed-data.ts` — seeded extras that may still carry compatibility arrays in source data

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/library/ComponentForm.tsx` already separates component-type-specific sections, so extra compatibility UI can be removed without reworking curry compatibility sections.
- `src/services/food-db.ts` centralizes extra lookup and category normalization behavior, making it the main seam for removing base-filtered extra queries.
- `src/components/plan/MealPickerSheet.tsx` already handles different picker modes, so extras can stop using base-context filtering without touching curry override grouping.

### Established Patterns
- Data-shape removals ship through Dexie versioned migrations plus service-level normalization rather than ad hoc one-off cleanup.
- Category identity remains stable-ID based even when a particular feature stops using one of those category links.
- Extra runtime behavior is already explicit-only after v1.2, so removing base compatibility should simplify filters instead of changing the no-default-extras contract.

### Integration Points
- Library forms and collapsed rows must stop presenting extra/base compatibility as editable or meaningful metadata.
- Service/query changes must align manual picker behavior and generator behavior so there is no hidden base filter left behind for extras.
- Seed data, migrations, and runtime types all need to converge on the same no-compatibility extra model.

</code_context>

<deferred>
## Deferred Ideas

- Curry compatibility behavior remains part of v1.3 and is not reopened here.
- Meal composition modes for curry-vs-subzi defaults and overrides remain backlog work under Phase `999.1`.
- Any new extra recommendation or heuristic system is out of scope; this phase is removal/simplification only.

</deferred>

---

*Phase: 1000-remove-the-compatability-base-for-extras*
*Context gathered: 2026-04-02*
