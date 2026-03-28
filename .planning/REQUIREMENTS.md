# Requirements: Indian Food Planner

**Defined:** 2026-03-22
**Milestone:** v1.2 — Edit Rule
**Core Value:** Generate a complete, realistic Indian weekly meal plan in one click — with smart randomization that respects personal rules and locked meals.

## v1.2 Requirements

### Edit Rule

- [x] **EDIT-01**: User can open an edit sheet for any existing rule from the rules list
- [x] **EDIT-02**: Edit sheet opens with the RuleForm pre-populated with the rule's current target, scope, and effects
- [x] **EDIT-03**: Saving overwrites the existing rule record in Dexie (no duplicate created)
- [x] **EDIT-04**: Closing or canceling the sheet discards unsaved changes

### Require Extra Explicitly

- [x] **PH12-01**: Create and edit meal-template rules expose require-extra as the only extra-related control; the empty require-extra state means no extras logic
- [x] **PH12-02**: `compileRule()` and `decompileRule()` no longer emit or hydrate exclude-extra behavior in active rule form state
- [x] **PH12-03**: Existing stored meal-template rules are normalized so legacy `exclude_extra_categories` and compiled `{ kind: 'exclude_extra' }` effects are stripped during migration
- [x] **PH12-04**: The generator leaves extras unconstrained unless a rule explicitly requires an extra category, and extra-related warnings only occur when that explicit requirement cannot be satisfied
- [x] **PH12-05**: Rule descriptions and other user-visible copy mention only explicitly required extras and never excluded extra categories

## v1.1 Requirements (Complete)

### Scheduling Rule (unified day/slot constraint)

- [x] **SCHED-01**: User can create a scheduling rule scoped to any combination of days (Mon–Sun) and meal slots (breakfast / lunch / dinner), with both fields optional (omitting means "all days" or "all slots")
- [x] **SCHED-02**: User selects the rule effect: "Filter pool" (only matching components eligible), "Require one" (at least one matching component must appear), or "Exclude" (matching components removed from pool)
- [x] **SCHED-03**: User matches components by tag filter (dietary / protein / regional / occasion) or by picking a specific component from the library
- [x] **SCHED-04**: "Require one by tag" — generator selects any eligible component matching the tag criteria for that slot (e.g., "Fridays lunch: require a fish curry" picks any fish-tagged curry)
- [x] **SCHED-05**: Existing `day-filter` and `require-component` rules in IndexedDB are automatically migrated to `scheduling-rule` format at app startup; old CompiledFilter variants removed from the type system

### Meal Template (base-type composition rule)

- [x] **TMPL-01**: User can create a meal template rule for a specific base type (rice-based / bread-based / other), optionally scoped to meal slots and/or days
- [x] **TMPL-02**: Meal template defines which meal slots the base type is allowed in (e.g., rice-based → lunch and dinner only) — replaces the 3×3 slot assignment grid in settings
- [x] **TMPL-03**: Meal template can exclude component types (curry and/or subzi) for the given base type context (e.g., bread-based: no subzi)
- [x] **TMPL-04**: Meal template can exclude extra categories (liquid / crunchy / condiment / dairy / sweet) for the given base type context (e.g., bread-based: no sweet extras)
- [x] **TMPL-05**: Meal template can require one extra of a specific category for the given base type (e.g., bread-based always includes a liquid extra)
- [x] **TMPL-06**: `/settings/slots` route and all settings components removed; AppNav "Slot Settings" link removed; slot assignment managed through meal template rules in the Rules UI
- [x] **TMPL-07**: Existing `slot_restrictions.base_type_slots` and `base_type_rules` preference data automatically migrated to `meal-template` rules at app startup

## v2 Requirements

### Enhanced Export

- **EXP-02**: PDF export of the weekly plan
- **EXP-03**: Export meal library to JSON (backup)

### Library Enhancements

- **MEAL-06**: Import meals from a JSON file
- **MEAL-07**: Cross-week rotation rules (don't repeat a meal within 2 weeks) — subsumed by NRPT-01

## Out of Scope

| Feature | Reason |
|---------|--------|
| Calorie / macro tracking | Explicitly excluded — focused on scheduling, not nutrition |
| Multi-user / family accounts | Personal use only |
| Public sign-up / social features | Single-user personal app |
| Native mobile app | Web-first |
| Grocery list generation | Requires ingredient-level data not in current model |
| LLM rule interpretation | Structured form covers all v1.1 rule types without LLM cost/latency |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| EDIT-01 | Phase 11 | Complete |
| EDIT-02 | Phase 11 | Complete |
| EDIT-03 | Phase 11 | Complete |
| EDIT-04 | Phase 11 | Complete |
| PH12-01 | Phase 12 | Complete |
| PH12-02 | Phase 12 | Complete |
| PH12-03 | Phase 12 | Complete |
| PH12-04 | Phase 12 | Complete |
| PH12-05 | Phase 12 | Complete |
| SCHED-01 | Phase 7 | Complete |
| SCHED-02 | Phase 7 | Complete |
| SCHED-03 | Phase 7 | Complete |
| SCHED-04 | Phase 7 | Complete |
| SCHED-05 | Phase 8 | Complete |
| TMPL-01 | Phase 9 | Complete |
| TMPL-02 | Phase 9 | Complete |
| TMPL-03 | Phase 9 | Complete |
| TMPL-04 | Phase 9 | Complete |
| TMPL-05 | Phase 9 | Complete |
| TMPL-06 | Phase 10 | Complete |
| TMPL-07 | Phase 10 | Complete |

**Coverage:**
- v1.2 requirements: 9 total
- Mapped to phases: 9/9
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-22*
*Last updated: 2026-03-28 — Phase 12 require-extra normalization completed*
