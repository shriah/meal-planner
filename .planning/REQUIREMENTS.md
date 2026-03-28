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

### Only Include Extras When Explicitly Required

- [x] **PH13-01**: Unlocked generation adds no extras when the slot has no matching `require_extra` effect
- [x] **PH13-02**: Matching `require_extra` effects remain the only runtime path that can add generated extras to an unlocked slot
- [x] **PH13-03**: Locked slot `extra_ids` remain unchanged and bypass the no-random-fill default
- [x] **PH13-04**: Extra-related warnings occur only for unsatisfied explicit `require_extra` categories, not for the absence of optional extras

### Dynamic Categories

- [x] **CAT-01**: Persist user-managed category records for both base and extra kinds, and migrate existing built-in literals into those records with stable IDs
- [x] **CAT-02**: Component records and Library forms store category IDs instead of hard-coded category names, while extra compatibility keeps the current checklist interaction
- [x] **CAT-03**: Rule targets and `require_extra` effects store category IDs and render dynamic category-backed options in create/edit flows
- [x] **CAT-04**: Generator behavior and picker filtering resolve compatibility from category data while preserving the explicit-extra runtime contract from Phase 13
- [x] **CAT-05**: Users can add, rename, and delete both base and extra categories from a separate category-management UI
- [x] **CAT-06**: Renaming a category cascades automatically across visible labels because identity is the stable ID, not the display name
- [x] **CAT-07**: Deleting a category normalizes dependent references so no dangling IDs remain in components, rules, or runtime surfaces
- [x] **CAT-08**: Seed/default data and regression tests use the category-backed model instead of the old string unions

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
| PH13-01 | Phase 13 | Complete |
| PH13-02 | Phase 13 | Complete |
| PH13-03 | Phase 13 | Complete |
| PH13-04 | Phase 13 | Complete |
| CAT-01 | Phase 14 | Complete |
| CAT-02 | Phase 14 | Complete |
| CAT-03 | Phase 14 | Complete |
| CAT-04 | Phase 14 | Complete |
| CAT-05 | Phase 14 | Complete |
| CAT-06 | Phase 14 | Complete |
| CAT-07 | Phase 14 | Complete |
| CAT-08 | Phase 14 | Complete |
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
*Last updated: 2026-03-28 — Phase 14 dynamic category rollout completed*
