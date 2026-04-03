# Roadmap: Indian Food Planner

## Milestones

- ✅ **v1.0 MVP** — Phases 1-6 (shipped 2026-03-22) — see [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Rule Engine Overhaul** — Phases 7-10 (shipped 2026-03-26) — see [milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md)
- ✅ **v1.2 Edit Rule** — Phases 11-16 (shipped 2026-03-29) — see [milestones/v1.2-ROADMAP.md](milestones/v1.2-ROADMAP.md)
- ✅ **v1.3 Curry Base Compatibility** — Phases 17-21 (shipped 2026-04-03) — see [milestones/v1.3-ROADMAP.md](milestones/v1.3-ROADMAP.md)
- 🚧 **v1.4 Collaboration + Meal Composition** — Phases 999.1, 1001-1003

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

<details>
<summary>✅ v1.2 Edit Rule (Phases 11-16) — SHIPPED 2026-03-29</summary>

- [x] Phase 11: Edit Rule (2/2 plans) — completed 2026-03-27
- [x] Phase 12: Require extra explicitly instead of excluding extra categories by default (3/3 plans) — completed 2026-03-28
- [x] Phase 13: Only include extras when explicitly required (1/1 plan) — completed 2026-03-28
- [x] Phase 14: Add option to create more base category and extra category (4/4 plans) — completed 2026-03-28
- [x] Phase 15: Finalize Phase 11 validation coverage (1/1 plan) — completed 2026-03-29
- [x] Phase 16: Remove category ID preset coupling and add PlanBoard/MealPicker integration coverage (1/1 plan) — completed 2026-03-29

</details>

<details>
<summary>✅ v1.3 Curry Base Compatibility (Phases 17-21) — SHIPPED 2026-04-03</summary>

**Milestone Goal:** Auto-generation respects curry-to-base compatibility by default, while explicit rules and manual/locked exceptions remain possible.

- [x] **Phase 17: Curry Compatibility Data** - Curry records store editable compatible base categories and existing libraries upgrade safely. (completed 2026-03-29)
- [x] **Phase 18: Generator Compatibility Contract** - Automatic generation enforces compatible curries and never silently relaxes the constraint. (completed 2026-03-29)
- [x] **Phase 19: Explicit Override Paths** - Manual, locked, and rule-scoped exceptions can bypass compatibility only through explicit user intent. (completed 2026-03-29)
- [x] **Phase 20: Compatibility Regression Coverage** - Migration, generator, picker, and override behavior stay aligned under tests. (completed 2026-04-01)
- [x] **Phase 21: Wire PlanBoard Curry Override Flow** - The real board entrypoint passes base context into the curry picker and regression coverage closes the missed seam from the v1.3 audit. (completed 2026-04-02)

</details>

### 🚧 v1.4 Collaboration + Meal Composition

**Milestone Goal:** Add explicit meal-composition modeling plus the first multi-user foundations needed for login and sharing.

- [ ] **Phase 999.1: Add meal composition modes for curry-vs-subzi defaults and overrides** - Model composition defaults such as subzi-only, curry-only, both, or one-of for base contexts.
- [ ] **Phase 1001: Add base-linked meal combo rules for exact companion dishes** - Allow specific bases such as Pongal to bring exact companion dishes like Sambar and Coconut chutney.
- [ ] **Phase 1002: add user login** - Add the authentication foundation required for user-specific and shared data.
- [ ] **Phase 1003: Allow users to share their plan with other users** - Add plan sharing across authenticated users.

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
| 11. Edit Rule | v1.2 | 2/2 | Complete | 2026-03-27 |
| 12. Require extra explicitly instead of excluding extra categories by default | v1.2 | 3/3 | Complete | 2026-03-28 |
| 13. Only include extras when explicitly required | v1.2 | 1/1 | Complete | 2026-03-28 |
| 14. Add option to create more base category and extra category | v1.2 | 4/4 | Complete | 2026-03-28 |
| 15. Finalize Phase 11 validation coverage | v1.2 | 1/1 | Complete | 2026-03-29 |
| 16. Remove category ID preset coupling and add PlanBoard/MealPicker integration coverage | v1.2 | 1/1 | Complete | 2026-03-29 |
| 17. Curry Compatibility Data | v1.3 | 3/3 | Complete   | 2026-03-29 |
| 18. Generator Compatibility Contract | v1.3 | 1/1 | Complete    | 2026-03-29 |
| 19. Explicit Override Paths | v1.3 | 2/2 | Complete   | 2026-03-29 |
| 20. Compatibility Regression Coverage | v1.3 | 2/2 | Complete    | 2026-04-01 |
| 21. Wire PlanBoard Curry Override Flow | v1.3 | 1/1 | Complete   | 2026-04-02 |
| 1000. remove the compatability base for Extras | v1.3 | 3/3 | Complete | 2026-04-03 |
| 999.1. Add meal composition modes for curry-vs-subzi defaults and overrides | v1.4 | 0/0 | Not Planned | — |
| 1001. Add base-linked meal combo rules for exact companion dishes | v1.4 | 0/0 | Not Planned | — |
| 1002. add user login | v1.4 | 0/0 | Not Planned | — |
| 1003. Allow users to share their plan with other users | v1.4 | 0/0 | Not Planned | — |

## Follow-Up Work

### Phase 1000: remove the compatability base for Extras (v1.3 follow-up)

**Goal**: Extras no longer store or use base-compatibility anywhere in the product, and explicit-only extra runtime behavior remains the sole automatic path
**Depends on**: Phase 21
**Requirements**: PH1000-01, PH1000-02, PH1000-03, PH1000-04, PH1000-05, PH1000-06
**Success Criteria** (what must be TRUE):
  1. Users can create, edit, browse, and manually pick extras without seeing or depending on any base-compatibility concept
  2. Existing extra rows upgrade safely in Dexie and no longer retain live compatibility fields, while curry compatibility behavior remains unchanged
  3. Automatic generation only adds extras through explicit `require_extra` rules and never restores fallback auto-fill behavior after compatibility removal
**Plans**: 3 plans
Plans:
- [x] 1000-01-PLAN.md — Remove extra compatibility from the type, seed, migration, and service contracts
- [x] 1000-02-PLAN.md — Remove extra compatibility UI and make manual extra picking unfiltered
- [x] 1000-03-PLAN.md — Simplify generator extras to explicit-only runtime behavior and finalize validation

## Backlog

### Phase 999.2: Support multiple components in any category per meal slot (BACKLOG)

**Goal:** [Captured for future planning]
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with `$gsd-review-backlog` when ready)
