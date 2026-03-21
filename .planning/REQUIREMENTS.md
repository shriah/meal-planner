# Requirements: Indian Food Planner

**Defined:** 2026-03-19
**Core Value:** Generate a complete, realistic Indian weekly meal plan in one click — with smart randomization that respects personal rules and locked meals.

## v1 Requirements

### Data Model

- [x] **DATA-01**: System supports typed meal components — Base, Curry, Subzi, Extra — where all except Base are optional
- [x] **DATA-02**: Each Base has a type tag: `rice-based` | `bread-based` | `other` (e.g., idli/dosa = other)
- [x] **DATA-03**: Extras are categorized into fixed types: Liquid, Crunchy, Condiment, Dairy, Sweet
- [x] **DATA-04**: Each Extra has a `compatible_with` list of Base types (e.g., Rasam = `rice-based` only; Curd = `rice-based`, `bread-based`)
- [x] **DATA-05**: Tag catalog covers: dietary (veg / non-veg / vegan / Jain), protein type, regional cuisine, occasion
- [x] **DATA-06**: App ships with a seed dataset of 50–100 pre-loaded Indian meals covering breakfast, lunch, and dinner slots

### Meal Library

- [x] **MEAL-01**: User can add a new meal with Base + optional Curry + optional Subzi + 0-N Extras (from compatible Extra pool)
- [x] **MEAL-02**: User can edit an existing meal (change components, tags, name)
- [x] **MEAL-03**: User can delete a meal from the library
- [x] **MEAL-04**: User can tag meals with dietary, protein, regional, and occasion tags
- [x] **MEAL-05**: User can browse and search meals by component type and tags

### Plan Generation

- [x] **PLAN-01**: User can generate a 7-day (Mon–Sun) plan with breakfast, lunch, and dinner slots
- [x] **PLAN-02**: User can lock individual meal slots; locked slots persist across regeneration
- [x] **PLAN-03**: User can lock all meals for an entire day at once
- [x] **PLAN-04**: Generator only assigns Extras that are compatible with the selected Base type (Rasam never paired with roti-based meals)
- [x] **PLAN-05**: User can manually swap any individual slot by selecting a replacement from the meal library

### Rules Engine

- [ ] **RULE-01**: User can write scheduling rules in plain English (e.g., "Fridays are fish days", "Never repeat the same subzi twice in a week")
- [x] **RULE-02**: LLM compiles rules into a typed JSON filter DSL at rule-save time (not at generation time) — generation is synchronous and LLM-free
- [x] **RULE-03**: Day-based rules are supported (target a specific day or days of the week)
- [x] **RULE-04**: Rotation/no-repeat rules are supported (within a week or across consecutive weeks)
- [ ] **RULE-05**: When a compiled rule matches zero available meals, the app surfaces a warning and does not block plan generation

### Plan Board UI

- [x] **UI-01**: Weekly plan displayed as a 7×3 grid (days × meal slots: breakfast / lunch / dinner)
- [x] **UI-02**: Each slot shows lock/unlock control; locked slots are visually distinguished
- [x] **UI-03**: Regenerate button re-randomizes all unlocked slots respecting active rules
- [x] **UI-04**: Tapping/clicking a slot opens a meal picker filtered to that slot type

### Save & History

- [ ] **SAVE-01**: User can save the current plan with a name
- [ ] **SAVE-02**: User can browse previously saved plans and load any of them

### Export

- [ ] **EXPORT-01**: User can export the current plan as a PNG image suitable for sharing (WhatsApp, etc.)

## v2 Requirements

### Export

- **EXP-02**: PDF export of the weekly plan (deferred — image export covers the sharing use case for v1)

### Enhanced Rules

- **RULE-06**: Seasonal / occasion-based rules ("During Navratri, no non-veg")
- **RULE-07**: Cross-week rotation rules (don't repeat a meal within 2 weeks)

### Library Enhancements

- **MEAL-06**: Import meals from a JSON file
- **MEAL-07**: Export meal library to JSON (backup)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Calorie / macro tracking | Explicitly excluded for v1 — focused on scheduling, not nutrition |
| Multi-user / family accounts | Personal use only; adds auth and data isolation complexity |
| Public sign-up / social features | Single-user personal app |
| Native mobile app | Web-first for v1 |
| Grocery list generation | Requires ingredient-level data not in the current model |
| Real-time collaboration | Out of scope for personal app |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 1 | Complete |
| DATA-02 | Phase 1 | Complete |
| DATA-03 | Phase 1 | Complete |
| DATA-04 | Phase 1 | Complete |
| DATA-05 | Phase 1 | Complete |
| DATA-06 | Phase 2 | Complete |
| MEAL-01 | Phase 2 | Complete |
| MEAL-02 | Phase 2 | Complete |
| MEAL-03 | Phase 2 | Complete |
| MEAL-04 | Phase 2 | Complete |
| MEAL-05 | Phase 2 | Complete |
| PLAN-01 | Phase 3 | Complete |
| PLAN-02 | Phase 4 | Complete |
| PLAN-03 | Phase 4 | Complete |
| PLAN-04 | Phase 3 | Complete |
| PLAN-05 | Phase 4 | Complete |
| RULE-01 | Phase 5 | Pending |
| RULE-02 | Phase 3 | Complete |
| RULE-03 | Phase 3 | Complete |
| RULE-04 | Phase 3 | Complete |
| RULE-05 | Phase 5 | Pending |
| UI-01 | Phase 4 | Complete |
| UI-02 | Phase 4 | Complete |
| UI-03 | Phase 4 | Complete |
| UI-04 | Phase 4 | Complete |
| SAVE-01 | Phase 6 | Pending |
| SAVE-02 | Phase 6 | Pending |
| EXPORT-01 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-19*
*Last updated: 2026-03-19 after roadmap creation*
