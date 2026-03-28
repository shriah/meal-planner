# Phase 14: Add option to create more base category and extra category - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase replaces the current hard-coded base-type and extra-category lists with user-manageable category data.

Today, base types and extra categories are fixed string unions wired directly into:

- library component create/edit forms
- extra compatibility selection
- rule forms and compiled rule schemas
- generator compatibility and `require_extra` behavior
- rule descriptions and other user-visible category labels

Phase 14 must add a real category-management surface and propagate dynamic categories through the full system. This is not just a library-form tweak; category identity becomes data-backed and must survive rename/delete safely via stable IDs.

</domain>

<decisions>
## Implementation Decisions

### Category management surface
- **D-01:** Category creation should live in a separate category-management UI, not inline inside the component form.
- **D-02:** The category-management surface must cover both base categories and extra categories in the same phase.

### Category lifecycle
- **D-03:** This phase includes add, rename, and delete for custom categories.
- **D-04:** Renames must cascade everywhere existing references are used.
- **D-05:** Deletes are allowed even when the category is in use; cleanup must be handled by the system rather than blocked in UI.
- **D-06:** Category identity must be a stable ID, not the display name.

### Existing built-ins
- **D-07:** Existing built-in categories should be converted into normal category records rather than treated as permanently locked literals.
- **D-08:** After migration, built-in and user-created categories should behave the same from the product point of view.

### Scope of dynamic behavior
- **D-09:** Dynamic categories must flow through the full system in this phase: library forms, rules, generator, picker filtering where relevant, descriptions, persistence, and migrations.
- **D-10:** Planning should treat this as a data-model migration plus UI/system propagation phase, not as an isolated UI enhancement.

### Compatibility UX
- **D-11:** Extra compatibility should keep the current multi-select checklist interaction, but the list of categories must become dynamic.
- **D-12:** Any existing rule or generator surface that currently enumerates base types or extra categories should switch to dynamic category-backed options rather than preserving hard-coded fallback enums.

### Delete semantics
- **D-13:** Because category identity is ID-based, rename should preserve identity and update visible names everywhere automatically.
- **D-14:** Delete should remove the category record and clear or normalize dependent references instead of leaving orphaned name strings behind.
- **D-15:** The planner/researcher should determine the safest exact normalization rules per reference type, but the product contract is that deletes are allowed and the system resolves fallout automatically.

### the agent's Discretion
- Exact shape of the category-management UI, as long as it is clearly separate from component create/edit.
- Whether category management belongs on the library page itself or in a dedicated settings-like route/modal, provided it remains part of the same delivered phase.
- Exact migration mechanics, Dexie version bump strategy, and whether category records are unified in one table or split by kind.
- Exact normalization policy for deleted references per surface, as long as deleted IDs do not remain dangling and user data remains coherent.

</decisions>

<specifics>
## Specific Ideas

- The current product feels artificially constrained because users can only classify bases as `rice-based`, `bread-based`, or `other`, and extras only as `liquid`, `crunchy`, `condiment`, `dairy`, or `sweet`.
- The new model should let categories evolve without more code changes every time the user wants a new grouping.
- Category labels should behave like editable names on top of stable underlying IDs.
- This phase should preserve the existing “compatible base types” checklist feel for extras rather than replacing it with a heavier picker UX.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Current type model and schema constraints
- `src/types/component.ts` — hard-coded `BaseType` and `ExtraCategory` unions currently constrain the entire app
- `src/types/plan.ts` — hard-coded base-type and extra-category enums in target/effect schemas
- `src/db/client.ts` — current Dexie schema and migration chain that will need a new category-backed storage design

### Library UI and component authoring
- `src/components/library/ComponentForm.tsx` — current hard-coded base-type select, extra-category select, and compatible-base-types checklist
- `src/components/library/ComponentRow.tsx` — current display of extra compatibility labels
- `src/components/library/ComponentLibrary.tsx` and `src/components/library/ComponentTab.tsx` — likely entry points for a separate category-management surface

### Rule and generator propagation
- `src/components/rules/RuleFormFields/RuleFields.tsx` — current hard-coded base-type and extra-category controls in the rule form
- `src/components/rules/ruleDescriptions.ts` — current user-visible category description logic
- `src/services/generator.ts` — current generator compatibility and `require_extra` behavior tied to static category literals
- `src/services/food-db.ts` — current extra filtering by compatible base type

### Seed and tests
- `src/db/seed-data.ts` — current seed assumptions built around fixed category unions
- `src/services/food-db.test.ts`, `src/services/generator.test.ts`, `src/db/seed.test.ts` — tests that currently lock in the fixed category lists

### Prior phase decisions
- `.planning/phases/12-require-extra-explicitly-instead-of-excluding-extra-categories-by-default/12-CONTEXT.md` — prior extra-category rule decisions that Phase 14 must preserve while making category options dynamic
- `.planning/phases/13-only-include-extras-when-explicitly-required/13-CONTEXT.md` — explicit-requirement runtime contract that must continue to work with dynamic extra categories

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/library/ComponentForm.tsx`: already centralizes base/extra-specific component editing, so it is the main consumer to rewire to category records.
- `src/components/ui/select.tsx`, `src/components/ui/checkbox.tsx`, and the existing library page structure: enough existing primitives exist to build a lightweight category-management UI without introducing a new UI system.
- `src/components/rules/RuleFormFields/RuleFields.tsx`: already owns the base-type and require-extra controls, making it the main rule surface to convert to dynamic options.

### Established Patterns
- Data-shape changes are handled through Dexie versioned migrations with test coverage rather than ad hoc runtime conversion.
- Create/edit flows share central type/compiler boundaries, so category changes must be reflected across form state, persistence, and decompile paths together.
- Recent phases 12 and 13 already narrowed extra semantics, so Phase 14 should preserve those semantics while swapping hard-coded category sources for dynamic records.

### Integration Points
- Component authoring depends on category selection at save time.
- Extra compatibility and picker filtering depend on base-category relationships.
- Meal-template rule targeting and `require_extra` effects depend on both base and extra categories.
- Generator warnings and rule descriptions expose category names to users, so ID-backed records need a label-resolution path everywhere those names appear.

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 14-add-option-to-create-more-base-category-and-extra-category*
*Context gathered: 2026-03-28*
