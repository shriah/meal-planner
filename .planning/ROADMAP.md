# Roadmap: Indian Food Planner

## Milestones

- ✅ **v1.0 MVP** — Phases 1-6 (shipped 2026-03-22) — see [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- **v1.1 Rule Engine Overhaul** — Phases 7-10 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-6) — SHIPPED 2026-03-22</summary>

- [x] Phase 1: Data Foundation (2/2 plans) — completed 2026-03-20
- [x] Phase 2: Meal Library UI (3/3 plans) — completed 2026-03-20
- [x] Phase 3: Plan Generator + Rule Engine (3/3 plans) — completed 2026-03-20
- [x] Phase 4: Plan Board UI (3/3 plans) — completed 2026-03-21
- [x] Phase 5: Rules Manager UI (2/2 plans) — completed 2026-03-21
- [x] Phase 6: Save, History, and Export (3/3 plans) — completed 2026-03-22

</details>

### v1.1 Rule Engine Overhaul

- [ ] **Phase 7: Scheduling Rule Engine** — New unified scheduling-rule type, compiler variants, and generator logic for all three effects and match criteria
- [ ] **Phase 8: Scheduling Rule UI + Migration** — Rule creation form for scheduling-rule; automatic migration of existing day-filter and require-component rules
- [ ] **Phase 9: Meal Template Engine** — New meal-template rule type with generator integration for slot assignment and composition constraints
- [ ] **Phase 10: Meal Template UI, Settings Removal, and Migration** — Rule creation form for meal-template; remove /settings/slots; migrate existing slot prefs

## Phase Details

### Phase 7: Scheduling Rule Engine
**Goal**: The system can represent, compile, and generate plans using the unified scheduling-rule type with all three effects and both match modes
**Depends on**: Phase 6 (v1.0 rule compiler and generator as baseline)
**Requirements**: SCHED-01, SCHED-02, SCHED-03, SCHED-04
**Success Criteria** (what must be TRUE):
  1. A scheduling-rule record can be stored in IndexedDB scoped to any combination of days (Mon–Sun, any subset, or all) and meal slots (breakfast / lunch / dinner, any subset, or all)
  2. The compiler produces a CompiledFilter variant for scheduling-rule with effect "filter-pool", "require-one", or "exclude" — old day-filter and require-component variants are removed from the CompiledFilter type
  3. The generator applies filter-pool rules by restricting the eligible component pool to tag- or component-matching items for the target slot
  4. The generator applies require-one-by-tag rules by selecting any eligible component that matches the tag criteria for the target slot (e.g., "Fridays lunch: require a fish curry" inserts a fish-tagged curry)
  5. The generator applies exclude rules by removing matching components from the pool before selection; all 22 existing generator TDD tests continue to pass (with updated rule input shapes)
**Plans:** 2/3 plans executed

Plans:
- [x] 07-01-PLAN.md — Types, compiler, and form state types for scheduling-rule
- [x] 07-02-PLAN.md — Generator filter-pool and exclude effects
- [x] 07-03-PLAN.md — Generator require-one effect (two-pass mechanism)

### Phase 8: Scheduling Rule UI + Migration
**Goal**: Users can create scheduling rules through the Rules UI, and all existing rules are automatically migrated to the new type at app startup
**Depends on**: Phase 7
**Requirements**: SCHED-05
**Success Criteria** (what must be TRUE):
  1. The rule creation form in the Rules UI shows a "Scheduling Rule" option; user can select effect (Filter pool / Require one / Exclude), choose match mode (tag filter or specific component), and scope to days and/or slots
  2. A rule created through the form appears in the rules list and is applied on the next plan generation
  3. On first app startup after the Dexie version bump, all existing day-filter and require-component records are converted to scheduling-rule records with equivalent semantics; no rule data is lost
  4. After migration, the app generates plans correctly using only scheduling-rule CompiledFilter variants — no old variant code paths remain
**Plans**: TBD

### Phase 9: Meal Template Engine
**Goal**: The system can represent, compile, and generate plans using the meal-template rule type for slot assignment and composition constraints
**Depends on**: Phase 7
**Requirements**: TMPL-01, TMPL-02, TMPL-03, TMPL-04, TMPL-05
**Success Criteria** (what must be TRUE):
  1. A meal-template record can be stored in IndexedDB scoped to a base type (rice-based / bread-based / other) with optional meal slot and day context
  2. The generator respects meal-template slot assignment: a base type only appears in the allowed slots (e.g., rice-based configured for lunch + dinner only never appears at breakfast)
  3. The generator respects meal-template component exclusions: if a meal-template excludes curry or subzi for a given base type, no component of that type is selected for meals using that base
  4. The generator respects meal-template extra exclusions: if a meal-template excludes an extra category (e.g., sweet), extras of that category are not picked for meals using that base type
  5. The generator respects meal-template required extras: if a meal-template requires one extra of a category (e.g., liquid), the generator always includes an eligible extra of that category for meals using that base type
**Plans**: TBD

### Phase 10: Meal Template UI, Settings Removal, and Migration
**Goal**: Users can create meal template rules through the Rules UI; slot settings are managed entirely through rules; existing slot prefs are migrated automatically
**Depends on**: Phase 9
**Requirements**: TMPL-06, TMPL-07
**Success Criteria** (what must be TRUE):
  1. The rule creation form in the Rules UI shows a "Meal Template" option; user can select a base type, define slot assignments, and set component/extra exclusions and required extras
  2. The /settings/slots route returns 404 (or redirects); the "Slot Settings" link is removed from AppNav; no dead links exist in the app
  3. All meal-template constraints visible in the Rules Manager list are togglable and deletable like any other rule
  4. On first app startup after the Dexie version bump, existing slot_restrictions.base_type_slots and base_type_rules preference data are converted to meal-template rules; no preference data is lost
  5. After migration, plan generation behavior is equivalent to pre-migration for any user who had slot settings configured
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Data Foundation | v1.0 | 2/2 | Complete | 2026-03-20 |
| 2. Meal Library UI | v1.0 | 3/3 | Complete | 2026-03-20 |
| 3. Plan Generator + Rule Engine | v1.0 | 3/3 | Complete | 2026-03-20 |
| 4. Plan Board UI | v1.0 | 3/3 | Complete | 2026-03-21 |
| 5. Rules Manager UI | v1.0 | 2/2 | Complete | 2026-03-21 |
| 6. Save, History, and Export | v1.0 | 3/3 | Complete | 2026-03-22 |
| 7. Scheduling Rule Engine | v1.1 | 2/3 | In Progress|  |
| 8. Scheduling Rule UI + Migration | v1.1 | 0/? | Not started | — |
| 9. Meal Template Engine | v1.1 | 0/? | Not started | — |
| 10. Meal Template UI, Settings Removal, and Migration | v1.1 | 0/? | Not started | — |
