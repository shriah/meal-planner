# Phase 1001: Add base-linked meal combo rules for exact companion dishes - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds a new dedicated rule type for exact meal combos. It should allow a rule to target either a specific base component or a base category, then attach exact companion dishes such as curry, subzi, and extras to that base context.

This phase is not the general meal-composition-mode phase. Broad composition semantics like `curry-only`, `subzi-only`, `both`, or `one-of` remain owned by Phase `999.1`. Phase `1001` is about exact companion dishes such as `Pongal -> Sambar + Coconut chutney`.

</domain>

<decisions>
## Implementation Decisions

### Rule model
- **D-01:** This should be a new dedicated rule type, not an overload of existing scheduling-rule or meal-template rule semantics.
- **D-02:** The new combo rule should target exact companion dishes, not just generic pool constraints or category requirements.

### Targeting scope
- **D-03:** Combo rules may target either a specific base component or a base category.
- **D-04:** The target flexibility should still preserve the exact-companion nature of the rule; this phase is not introducing broad composition defaults.
- **D-05:** When both a base-component combo and a base-category combo match the same slot, the base-component combo wins.

### Companion specificity
- **D-06:** Companion curry/subzi/extras are explicitly named components, not tags or categories.
- **D-07:** Extras in combo rules should be stored as an exact extra component list.
- **D-08:** Combo rules may specify any subset of companion slots: curry only, subzi only, extras only, or mixed exact bundles.
- **D-09:** When a combo rule applies, its explicitly named companion components are authoritative for that slot.

### Interaction with other rules
- **D-10:** Other rules should not further filter, replace, or reshape combo-selected companions once the combo rule is the active source of those companions.
- **D-11:** Combo rules should behave like a stronger explicit composition choice than normal scheduling or meal-template rule effects.

### Manual override boundary
- **D-12:** Explicit manual user choices still win over combo rules.
- **D-13:** Combo rules should not overwrite user-picked curry/subzi/extras on regenerate if the user has manually chosen something else.
- **D-14:** Combo rules govern normal generation behavior, not explicit user overrides.

### Broken reference behavior
- **D-15:** If a combo rule references a missing or deleted companion component, generation should apply the remaining valid companions and emit a warning.

### the agent's Discretion
- Exact persistence shape of the new combo rule, as long as it is clearly a separate rule type and supports base-component plus base-category targets.
- Exact UX copy and layout for combo-rule creation/editing, as long as it communicates exact companion dishes rather than generic constraints.
- Exact warning copy for partially broken combo rules, as long as the rule does not silently substitute other components or allow unrelated rules to rewrite the combo.

</decisions>

<specifics>
## Specific Ideas

- The motivating example is `Pongal -> Sambar + Coconut chutney`.
- The user wants this modeled as a true linked combo rule, not approximated through separate existing rules.
- Explicitly chosen companion components should behave as a bundle for normal generation, while still yielding to manual user edits.
- Base-component targeting is more specific than base-category targeting and should take precedence when both match.
- Combo rules do not need to be full bundles; a user may define only the exact companion slots they care about.
- Missing combo references should degrade partially with warning rather than canceling the whole combo.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and milestone scope
- `.planning/ROADMAP.md` — Phase `1001` milestone placement, goal, and neighboring scope
- `.planning/PROJECT.md` — current product state, v1.4 direction, and validated rule-system constraints
- `.planning/STATE.md` — current active milestone and carry-forward decisions

### Prior rule and composition decisions
- `.planning/milestones/v1.3-phases/19-explicit-override-paths/19-CONTEXT.md` — explicit override precedence and manual-choice-wins behavior
- `.planning/phases/1000-remove-the-compatability-base-for-extras/1000-CONTEXT.md` — extras are explicit-only and no longer base-bound; composition remains separate from extra compatibility
- `.planning/milestones/v1.3-phases/18-generator-compatibility-contract/18-CONTEXT.md` — current generator rule boundaries and deferred composition work reference

### Current implementation seams
- `src/types/plan.ts` — current rule schema and effect vocabulary
- `src/services/rule-compiler.ts` — compile/decompile boundary for rule persistence and edit rehydration
- `src/components/rules/form-state.ts` — rule form state shape and reducer patterns
- `src/components/rules/RuleFormFields/RuleFields.tsx` — current rule creation/editing surface
- `src/services/generator.ts` — current component selection order, rule application, and manual/locked boundaries
- `src/stores/plan-store.ts` — persistence and regenerate behavior for manual user choices
- `src/components/plan/MealPickerSheet.tsx` — explicit user override seam for slot-level manual picks

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/services/rule-compiler.ts` already provides a compile/decompile seam for introducing a new rule type without duplicating ad hoc persistence mapping.
- `src/components/rules/form-state.ts` and `src/components/rules/RuleFormFields/RuleFields.tsx` already host the create/edit rule UX patterns that a new combo rule should likely extend.
- `src/services/generator.ts` already has explicit manual/locked boundaries and multi-pass component selection logic that combo-rule application will need to plug into.

### Established Patterns
- Explicit user choices win over automatic rule-driven behavior.
- The rule system uses stored compiled rule payloads and reversible form hydration rather than bespoke one-off UI state.
- Exact component targeting already exists elsewhere in the rule system and should be reused where possible.

### Integration Points
- The new combo rule type must integrate with the existing rule compiler, rule list rendering, and edit flow.
- Generator application order will matter because combo-selected companions must resist downstream rule rewriting while still yielding to manual selections.
- Combo rules overlap conceptually with Phase `999.1`, so planning should keep broad composition modes out of this phase and focus on exact named companions only.

</code_context>

<deferred>
## Deferred Ideas

- General composition modes such as `curry-only`, `subzi-only`, `both`, and `one-of` remain Phase `999.1`.
- Authentication and sharing work remain in Phases `1002` and `1003`.
- Any broader “meal bundles” beyond base-linked exact companion dishes should be treated as future scope unless they fall directly out of this rule type.

</deferred>

---

*Phase: 1001-add-base-linked-meal-combo-rules-for-exact-companion-dishes*
*Context gathered: 2026-04-03*
