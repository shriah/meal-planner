# Phase 12: Require extra explicitly instead of excluding extra categories by default - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove `exclude_extra_categories` from the active meal-template rule surface so extras are only shaped when a rule explicitly requires them. This phase covers the existing rule UI, persisted-rule normalization, generator behavior, and rule-description copy needed to make that product change consistent for both new and existing users.

</domain>

<decisions>
## Implementation Decisions

### Rule semantics
- **D-01:** Meal-template extra logic becomes require-or-none. If no required extra is selected, the rule imposes no extra-category constraint.
- **D-02:** The empty state of the require-extra control means "no extras logic." No extra default should be implied.

### UI shape
- **D-03:** Remove the entire "Exclude extra categories" section from create and edit rule UI.
- **D-04:** Keep the require-extra control as the only extra-related UI. It can be left empty to mean no extra logic.

### Existing saved rules
- **D-05:** Existing persisted `exclude_extra_categories` data must be stripped in a migration or normalization path so records are cleaned up, not merely hidden.
- **D-06:** Edit/save flows must not preserve or round-trip legacy exclude-extra behavior after the phase ships.

### Generator behavior and warnings
- **D-07:** The generator should emit no extra-related warnings unless a rule explicitly requires an extra category and that requirement cannot be satisfied.
- **D-08:** When no required extra is configured, extras remain otherwise unconstrained by meal-template rules.

### Rule list and user-visible copy
- **D-09:** Rule descriptions should only mention explicitly required extras. Exclusion language should disappear from user-visible copy.

### the agent's Discretion
- Exact presentation of the require-extra control can follow existing rule form patterns as long as the empty state clearly means "no extras logic."
- The migration helper name, exact Dexie version bump, and test naming can follow current project conventions.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and current project state
- `.planning/ROADMAP.md` — Phase 12 entry and upstream Phase 11 dependency
- `.planning/REQUIREMENTS.md` — Existing meal-template requirement history, especially TMPL-04/TMPL-05
- `.planning/STATE.md` — Prior rule-system decisions and current project state

### Phase-specific research
- `.planning/phases/12-require-extra-explicitly-instead-of-excluding-extra-categories-by-default/12-RESEARCH.md` — Phase 12 recommendation to treat this as persisted-rule normalization, not just a UI tweak

### Prior phase specs and implementation history
- `.planning/milestones/v1.1-ROADMAP.md` — Original Phase 9 and Phase 10 meal-template scope, including prior extra exclusion/requirement behavior
- `.planning/quick/260326-w99-meal-template-flexible-selector-base-tag/260326-w99-SUMMARY.md` — Existing selector/flexible meal-template rule behavior that must remain intact while extras logic changes

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/rules/RuleFormFields/RuleFields.tsx`: Current shared rule-effects UI already contains both exclude-extra and require-extra sections; this is the primary form surface to simplify
- `src/components/rules/types.ts`: Shared `RuleFormState` and `FormAction` definitions currently expose `exclude_extra_categories` and `require_extra_categories`
- `src/services/rule-compiler.ts`: Central compile/decompile boundary for create/edit rule correctness; any removed effect must be removed symmetrically here
- `src/components/rules/ruleDescriptions.ts`: User-facing rule summary copy includes both `exclude_extra` and `require_extra`
- `src/db/client.ts`: Existing Dexie migration boundary already normalizes legacy meal-template rule shapes and is the right place to strip persisted `exclude_extra`
- `src/services/generator.test.ts`: Current extra-exclusion and require-extra tests define the behavior that must be updated

### Established Patterns
- Rule-shape changes are handled through Dexie versioned migrations plus pure helper functions rather than ad hoc runtime cleanup
- Create and edit flows share one reducer/compiler contract, so form-surface removals must be reflected in both save and rehydration paths
- Rule list updates and edit behavior rely on exact reversible form state, so hidden legacy fields are not acceptable long-term

### Integration Points
- Meal-template extra behavior flows through `RuleFields` -> `form-state`/`types` -> `rule-compiler` -> persisted `rules.compiled_filter` -> `generator.ts` -> `ruleDescriptions.ts`
- Existing users can carry old `exclude_extra` effects in IndexedDB, so the data migration path is part of the feature, not an optional cleanup

</code_context>

<specifics>
## Specific Ideas

- The current edit UI can show all exclude-extra categories checked by default, which makes the rule look inverted and confusing.
- Warning-heavy generated plans are part of the problem to solve; extra warnings should only happen when an explicit require-extra rule fails.
- The desired product model is "extras are added only when explicitly required," not "extras are controlled by exclusion defaults."

</specifics>

<deferred>
## Deferred Ideas

### Reviewed Todos (not folded)
- `Meal Template rule type — unify slot settings and composition constraints` — reviewed as historical background only; Phase 12 stays focused on removing exclude-extra behavior from the active rule surface rather than broadening meal-template scope again.

</deferred>

---

*Phase: 12-require-extra-explicitly-instead-of-excluding-extra-categories-by-default*
*Context gathered: 2026-03-28*
