# Requirements: Indian Food Planner

**Defined:** 2026-03-22
**Milestone:** v1.1 — Rule Engine Overhaul
**Core Value:** Generate a complete, realistic Indian weekly meal plan in one click — with smart randomization that respects personal rules and locked meals.

## v1.1 Requirements

### Scheduling Rule (unified day/slot constraint)

- [ ] **SCHED-01**: User can create a scheduling rule scoped to any combination of days (Mon–Sun) and meal slots (breakfast / lunch / dinner), with both fields optional (omitting means "all days" or "all slots")
- [ ] **SCHED-02**: User selects the rule effect: "Filter pool" (only matching components eligible), "Require one" (at least one matching component must appear), or "Exclude" (matching components removed from pool)
- [ ] **SCHED-03**: User matches components by tag filter (dietary / protein / regional / occasion) or by picking a specific component from the library
- [ ] **SCHED-04**: "Require one by tag" — generator selects any eligible component matching the tag criteria for that slot (e.g., "Fridays lunch: require a fish curry" picks any fish-tagged curry)
- [ ] **SCHED-05**: Existing `day-filter` and `require-component` rules in IndexedDB are automatically migrated to `scheduling-rule` format at app startup; old CompiledFilter variants removed from the type system

### Meal Template (base-type composition rule)

- [ ] **TMPL-01**: User can create a meal template rule for a specific base type (rice-based / bread-based / other), optionally scoped to meal slots and/or days
- [ ] **TMPL-02**: Meal template defines which meal slots the base type is allowed in (e.g., rice-based → lunch and dinner only) — replaces the 3×3 slot assignment grid in settings
- [ ] **TMPL-03**: Meal template can exclude component types (curry and/or subzi) for the given base type context (e.g., bread-based: no subzi)
- [ ] **TMPL-04**: Meal template can exclude extra categories (liquid / crunchy / condiment / dairy / sweet) for the given base type context (e.g., bread-based: no sweet extras)
- [ ] **TMPL-05**: Meal template can require one extra of a specific category for the given base type (e.g., bread-based always includes a liquid extra)
- [ ] **TMPL-06**: `/settings/slots` route and all settings components removed; AppNav "Slot Settings" link removed; slot assignment managed through meal template rules in the Rules UI
- [ ] **TMPL-07**: Existing `slot_restrictions.base_type_slots` and `base_type_rules` preference data automatically migrated to `meal-template` rules at app startup

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
| SCHED-01 | Phase 7 | Pending |
| SCHED-02 | Phase 7 | Pending |
| SCHED-03 | Phase 7 | Pending |
| SCHED-04 | Phase 7 | Pending |
| SCHED-05 | Phase 8 | Pending |
| TMPL-01 | Phase 9 | Pending |
| TMPL-02 | Phase 9 | Pending |
| TMPL-03 | Phase 9 | Pending |
| TMPL-04 | Phase 9 | Pending |
| TMPL-05 | Phase 9 | Pending |
| TMPL-06 | Phase 10 | Pending |
| TMPL-07 | Phase 10 | Pending |

**Coverage:**
- v1.1 requirements: 12 total
- Mapped to phases: 12 (roadmap created 2026-03-22)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-22*
*Last updated: 2026-03-22 — traceability filled after roadmap creation*
