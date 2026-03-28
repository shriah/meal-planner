# Roadmap: Indian Food Planner

## Milestones

- ✅ **v1.0 MVP** — Phases 1-6 (shipped 2026-03-22) — see [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Rule Engine Overhaul** — Phases 7-10 (shipped 2026-03-26) — see [milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md)
- 🚧 **v1.2 Edit Rule** — Phases 11-16 (active debt cleanup)

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

<details>
<summary>✅ v1.1 Rule Engine Overhaul (Phases 7-10) — SHIPPED 2026-03-26</summary>

- [x] Phase 7: Scheduling Rule Engine (3/3 plans) — completed 2026-03-22
- [x] Phase 8: Scheduling Rule UI + Migration (2/2 plans) — completed 2026-03-25
- [x] Phase 9: Meal Template Engine (2/2 plans) — completed 2026-03-26
- [x] Phase 10: Meal Template UI, Settings Removal, and Migration (2/2 plans) — completed 2026-03-26

</details>

### v1.2 Edit Rule

- [x] **Phase 11: Edit Rule** - Add edit capability to the rules list so users can update any existing rule in place (completed 2026-03-27)

## Phase Details

### Phase 11: Edit Rule
**Goal**: Users can edit any existing rule from the rules list without leaving the page
**Depends on**: Phase 10 (unified RuleForm exists; rules stored in Dexie with auto-incremented id)
**Requirements**: EDIT-01, EDIT-02, EDIT-03, EDIT-04
**Success Criteria** (what must be TRUE):
  1. Each rule card in the rules list has an Edit button that opens a Sheet overlay
  2. The Sheet opens with RuleForm pre-populated with the rule's current target, scope, and effects — no fields are blank or reset to defaults
  3. Saving the edited rule overwrites the original record in Dexie — no duplicate rule is created and the rule count stays the same
  4. Closing or canceling the Sheet (via close button, Cancel button, or pressing Escape) discards all unsaved edits — the original rule remains unchanged
**Plans**: 2 plans
Plans:
- [x] 11-01-PLAN.md — Extract shared form-state and add reversible `decompileRule` coverage for exact pre-population
- [x] 11-02-PLAN.md — Add the rule-row edit sheet with in-place save, discard/reset behavior, and save-failure feedback
**UI hint**: yes

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Data Foundation | v1.0 | 2/2 | Complete | 2026-03-20 |
| 2. Meal Library UI | v1.0 | 3/3 | Complete | 2026-03-20 |
| 3. Plan Generator + Rule Engine | v1.0 | 3/3 | Complete | 2026-03-20 |
| 4. Plan Board UI | v1.0 | 3/3 | Complete | 2026-03-21 |
| 5. Rules Manager UI | v1.0 | 2/2 | Complete | 2026-03-21 |
| 6. Save, History, and Export | v1.0 | 3/3 | Complete | 2026-03-22 |
| 7. Scheduling Rule Engine | v1.1 | 3/3 | Complete | 2026-03-22 |
| 8. Scheduling Rule UI + Migration | v1.1 | 2/2 | Complete | 2026-03-25 |
| 9. Meal Template Engine | v1.1 | 2/2 | Complete | 2026-03-26 |
| 10. Meal Template UI, Settings Removal, and Migration | v1.1 | 2/2 | Complete | 2026-03-26 |
| 11. Edit Rule | v1.2 | 2/2 | Complete   | 2026-03-27 |
| 12. Require extra explicitly instead of excluding extra categories by default | v1.2 | 3/3 | Complete | 2026-03-28 |
| 13. Only include extras when explicitly required | v1.2 | 1/1 | Complete | 2026-03-28 |
| 14. Add option to create more base category and extra category | v1.2 | 4/4 | Complete | 2026-03-28 |
| 15. Finalize Phase 11 validation coverage | v1.2 | 1/1 | Complete   | 2026-03-28 |
| 16. Remove category ID preset coupling and add PlanBoard/MealPicker integration coverage | v1.2 | 0/0 | Pending | - |

### Phase 12: Require extra explicitly instead of excluding extra categories by default

**Goal:** Meal-template rules use explicit require-extra semantics only, with legacy exclude-extra behavior removed from UI, persisted rules, generator warnings, and rule descriptions
**Requirements**: PH12-01, PH12-02, PH12-03, PH12-04, PH12-05
**Depends on:** Phase 11
**Plans:** 3 plans

Plans:
- [x] 12-01-PLAN.md — Remove exclude-extra from active form state and create/edit UI surfaces
- [x] 12-02-PLAN.md — Normalize compiler, descriptions, and persisted rule data so exclude-extra cannot survive migration or round-trips
- [x] 12-03-PLAN.md — Remove runtime exclude-extra support from schema/generator and finalize require-or-none validation

### Phase 13: Only include extras when explicitly required

**Goal:** Unlocked slots include generated extras only when a matching rule explicitly requires them, while locked extra selections and existing require-extra warning semantics remain unchanged
**Requirements**: PH13-01, PH13-02, PH13-03, PH13-04
**Depends on:** Phase 12
**Plans:** 1 plan

Plans:
- [x] 13-01-PLAN.md — Remove unlocked default extra fill, preserve explicit require-extra and locked extras, then finalize regression coverage and validation

### Phase 14: Add option to create more base category and extra category

**Goal:** Users can manage base and extra categories as real data so new categories flow through library forms, rules, generator behavior, picker filtering, descriptions, and seed defaults without code changes
**Requirements**: CAT-01, CAT-02, CAT-03, CAT-04, CAT-05, CAT-06, CAT-07, CAT-08
**Depends on:** Phase 13
**Plans:** 4/4 plans complete

Plans:
- [x] 14-01-PLAN.md — Add persisted category records, migrate literals to IDs, and centralize delete normalization in the service/data layer
- [x] 14-02-PLAN.md — Add the separate Library category manager and dynamic category-backed component forms
- [x] 14-03-PLAN.md — Convert rule schema, form state, compiler, and descriptions to category IDs with rename/delete-safe labels
- [x] 14-04-PLAN.md — Propagate dynamic categories through generator, picker, seeds, and finalize validation

### Phase 15: Finalize Phase 11 validation coverage

**Goal:** Close the remaining milestone audit debt for Phase 11 by bringing its validation artifact and Nyquist coverage up to the same standard as later phases
**Requirements:** none new — closes audit tech debt
**Depends on:** Phase 14
**Gap Closure:** Closes milestone audit debt from `v1.2-MILESTONE-AUDIT.md`
**Plans:** 1/1 plans complete

Plans:
- [x] 15-01-PLAN.md — Approve and align `11-VALIDATION.md` with the completed Phase 11 test surface and rerun evidence

### Phase 16: Remove category ID preset coupling and add PlanBoard/MealPicker integration coverage

**Goal:** Remove the hidden category-ID ordering dependency from presets and add direct automated coverage for the `PlanBoard -> MealPickerSheet` category handoff
**Requirements:** none new — closes audit tech debt
**Depends on:** Phase 15
**Gap Closure:** Closes milestone audit debt from `v1.2-MILESTONE-AUDIT.md`
**Plans:** 1 plan

Plans:
- [ ] 16-01-PLAN.md — Resolve preset category targets by stable built-in category identity and add direct `PlanBoard -> MealPickerSheet` handoff coverage
