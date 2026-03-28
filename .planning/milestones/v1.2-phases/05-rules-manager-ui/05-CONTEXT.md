# Phase 5: Rules Manager UI - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a dedicated Rules Manager UI that lets users create, review, enable/disable, and delete scheduling rules through a structured form. The UI connects to the Phase 3 rule engine (`compileRule()`, `addRule()`, `getRules()`, `updateRule()`, `deleteRule()` — already implemented). Rules affect plan generation on the next regenerate.

This phase does NOT include: LLM natural language rule parsing (deferred), named plan saving (Phase 6), or export (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### Rule entry method
- **D-01:** Structured form only — no LLM. `compileRule()` runs locally in milliseconds after form submission.
- **D-02:** User picks rule type first (day-filter | no-repeat | require-component) via a select or tab at the top of the form. Selecting a type reveals only the fields relevant to that type (type-specific form, not a single adaptive form).
- **D-03:** User provides the rule name manually — a required text field above the rule type selector. No auto-generated names.

### Navigation & placement
- **D-04:** Rules Manager lives at a new `/rules` route, linked from AppNav alongside Library and Settings.
- **D-05:** Rule creation form is at `/rules/new` — a separate full-screen page. "Add Rule" button on the `/rules` list navigates there. Back button returns to list.

### Rule list display
- **D-06:** Each rule row shows: rule name prominently, a plain-English human-readable summary of what the rule does (e.g., "Requires fish protein on Fridays"), then toggle switch and delete icon on the right.
- **D-07:** Empty state: show 2–3 greyed-out example rules (e.g., "Fish Fridays", "No repeat subzi") to illustrate what's possible. Clicking an example pre-fills the `/rules/new` form with those values.
- **D-08:** Inactive (disabled) rules: greyed-out / muted text throughout the row — toggle position alone is not enough visual signal.

### Pre-save impact feedback
- **D-09:** Live preview while filling the form — as user selects days/slots/tags, the impact count updates in real-time below the form: "This rule affects N of 34 components."
- **D-10:** Zero-match warning (RULE-05): inline amber warning below the impact count — "Warning: This rule matches 0 components. The generator will ignore it." Save is still allowed (does not block).

### Claude's Discretion
- Exact human-readable summary generation logic (how to convert a CompiledFilter into a readable sentence)
- The exact components counted in the impact preview (how to query the pool for the preview)
- Form validation UX (what's required before Save is enabled — at minimum: name + rule type selected + required type-specific fields filled)
- Styling of the type selector (tabs vs select dropdown vs radio group)
- Delete confirmation (inline confirm vs immediate delete)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Rule engine contracts (Phase 3)
- `src/services/rule-compiler.ts` — `compileRule(RuleDefinition): CompiledFilter` — the function Phase 5 calls after form submission. Already implemented.
- `src/services/food-db.ts` — `addRule()`, `getRules()`, `updateRule()`, `deleteRule()` — all already implemented. Phase 5 builds UI on top of these.
- `src/types/plan.ts` — `RuleDefinition` (3 variants: day-filter, no-repeat, require-component), `CompiledFilter`, `TagFilter`, `DayOfWeek`, `MealSlot` — all types for the form fields.

### Component data (for impact preview)
- `src/services/food-db.ts` — `getAllComponents()`, `getComponentsByType()` — used to count how many components the rule would affect (impact preview).
- `src/types/component.ts` — `ComponentRecord`, `DietaryTag`, `ProteinTag`, `RegionalTag`, `OccasionTag` — tag types shown in the day-filter form.

### Requirements
- `.planning/REQUIREMENTS.md` — RULE-01 (user can write rules), RULE-05 (zero-match warning)
- `.planning/ROADMAP.md` — Phase 5 success criteria

### UI patterns (prior phases)
- `src/components/ui/` — alert, badge, button, checkbox, combobox, input, label, select, separator, sheet, tabs, tooltip already installed. No new shadcn components needed.
- `src/app/layout.tsx` and AppNav — navigation structure. Phase 5 adds a `/rules` link.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/services/rule-compiler.ts` — `compileRule(def: RuleDefinition): CompiledFilter` — call this after form submit; no LLM, no async, instant.
- `src/services/food-db.ts` — `addRule()`, `getRules()`, `updateRule(id, changes)`, `deleteRule(id)` — full CRUD already exists. Phase 5 is purely UI.
- `src/lib/filter-components.ts` — tag filter logic using `.every()` AND predicate. Can be adapted for the impact preview (count components matching the TagFilter).
- `src/components/ui/` — all needed components already installed (alert for zero-match warning, badge for rule type labels, checkbox for day/slot multi-select, combobox for tag selects, select for rule type picker).

### Established Patterns
- `'use client'` required for components that touch Dexie (IndexedDB is browser-only)
- `useLiveQuery` (dexie-react-hooks) for reactive DB reads — rule list should use `useLiveQuery(getRules)` so toggling/deleting updates instantly
- No React in service layer — all DB access through async functions in `food-db.ts`
- Tailwind CSS 4 for styling
- Per-tab state isolation (established in Phase 2) — if rule type picker uses tabs, each type's form fields are independent

### Integration Points
- **New route:** `src/app/rules/page.tsx` (list) + `src/app/rules/new/page.tsx` (creation form)
- **AppNav:** Add "Rules" link between existing nav items
- **Post-save:** After adding a rule, navigate back to `/rules` list and show the new rule
- **Plan Board:** No changes needed — generator already reads enabled rules from Dexie at generation time. The new rules surface automatically on next regenerate.

</code_context>

<specifics>
## Specific Ideas

- Example rules in the empty state (pre-fill the form on click): "Fish Fridays" → day-filter, days: ['friday'], filter: { protein_tag: 'fish' }; "No repeat subzi" → no-repeat, component_type: 'subzi'; "Weekend special" → day-filter, days: ['saturday', 'sunday'], filter: { occasion_tag: 'weekend' }
- Impact count should count `ComponentRecord`s that match the TagFilter, not meal slots — "This rule affects 8 of 34 components" is clearer than "affects N slots"
- The `/rules` list page header should show total rule count and how many are currently active (e.g., "3 rules · 2 active")

</specifics>

<deferred>
## Deferred Ideas

- **LLM natural language rule input** — Optional future enhancement. User types "Fridays are fish days" and Claude Haiku parses it into a RuleDefinition that pre-fills the structured form. Explicitly deferred from Phase 3 and this discussion.
- **Rule editing** — Clicking an existing rule to edit it (not just toggle/delete). Deferred from Phase 5 scope — add/toggle/delete covers v1.

</deferred>

---

*Phase: 05-rules-manager-ui*
*Context gathered: 2026-03-21*
