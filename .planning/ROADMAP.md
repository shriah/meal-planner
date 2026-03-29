# Roadmap: Indian Food Planner

## Milestones

- ✅ **v1.0 MVP** — Phases 1-6 (shipped 2026-03-22) — see [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Rule Engine Overhaul** — Phases 7-10 (shipped 2026-03-26) — see [milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md)
- ✅ **v1.2 Edit Rule** — Phases 11-16 (shipped 2026-03-29) — see [milestones/v1.2-ROADMAP.md](milestones/v1.2-ROADMAP.md)
- 🚧 **v1.3 Curry Base Compatibility** — Phases 17-20 (in progress)

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

### 🚧 v1.3 Curry Base Compatibility (In Progress)

**Milestone Goal:** Auto-generation respects curry-to-base compatibility by default, while explicit rules and manual/locked exceptions remain possible.

- [x] **Phase 17: Curry Compatibility Data** - Curry records store editable compatible base categories and existing libraries upgrade safely. (completed 2026-03-29)
- [ ] **Phase 18: Generator Compatibility Contract** - Automatic generation enforces compatible curries and never silently relaxes the constraint.
- [ ] **Phase 19: Explicit Override Paths** - Manual, locked, and rule-scoped exceptions can bypass compatibility only through explicit user intent.
- [ ] **Phase 20: Compatibility Regression Coverage** - Migration, generator, picker, and override behavior stay aligned under tests.

## Phase Details

### Phase 17: Curry Compatibility Data
**Goal**: Users can maintain curry-to-base compatibility in the library, and existing curry records upgrade into the same category-ID-safe model without rebuilding the library
**Depends on**: Phase 16 (category-ID-backed base categories and normalization already exist)
**Requirements**: CURRY-01, CURRY-02, CURRY-07
**Success Criteria** (what must be TRUE):
  1. User can create or edit any curry in the Library and assign one or more compatible base categories
  2. After upgrading to v1.3, existing curry records already have editable compatibility data without requiring the user to recreate the library
  3. Curry compatibility remains stable when base categories are renamed, and deleted base categories are normalized out of stored compatibility data
**Plans**: 3 plans
Plans:
- [x] 17-01-PLAN.md — Define the curry compatibility storage contract and curated seeded mapping seam
- [x] 17-02-PLAN.md — Backfill legacy curry rows through Dexie migration and normalize deleted base IDs
- [x] 17-03-PLAN.md — Expose curry compatibility editing/summaries in the Library and add phase validation coverage
**UI hint**: yes

### Phase 18: Generator Compatibility Contract
**Goal**: Automatic generation treats curry/base compatibility as the default hard constraint whenever it selects a curry for a chosen base
**Depends on**: Phase 17
**Requirements**: CURRY-03, CURRY-04
**Success Criteria** (what must be TRUE):
  1. Newly generated meal slots only auto-select curries that are compatible with the base chosen for that slot
  2. If a slot has no compatible curry candidates, the generator does not silently insert an incompatible curry
  3. Compatibility-respecting auto-generation behavior remains the default across normal generator flows rather than becoming an optional hint
**Plans**: TBD

### Phase 19: Explicit Override Paths
**Goal**: Exceptional incompatible curry/base pairings remain possible, but only through explicit rule or user override paths that preserve the compatible-by-default contract
**Depends on**: Phase 18
**Requirements**: CURRY-05, CURRY-06
**Success Criteria** (what must be TRUE):
  1. User can deliberately pick and keep an incompatible curry for a slot through the manual picker or locked/manual state without the app treating it as a normal auto-generated pairing
  2. User can create a scoped rule exception that intentionally produces an incompatible curry/base pairing when needed
  3. Outside those explicit override paths, generator behavior continues to reject incompatible curry/base pairings by default
**Plans**: TBD
**UI hint**: yes

### Phase 20: Compatibility Regression Coverage
**Goal**: The milestone ships with regression coverage proving the migration, library, generator, picker, and override flows all follow the same curry compatibility contract
**Depends on**: Phase 19
**Requirements**: CURRY-08
**Success Criteria** (what must be TRUE):
  1. Upgrade-path tests prove legacy curry records become usable compatibility-aware records after v1.3 migration/backfill
  2. Regression tests prove auto-generation, manual picker behavior, and explicit override flows all agree on when incompatible curries are allowed
  3. Regression tests prove category rename/delete normalization does not leave stale curry compatibility behavior behind
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
| 18. Generator Compatibility Contract | v1.3 | 0/TBD | Not started | - |
| 19. Explicit Override Paths | v1.3 | 0/TBD | Not started | - |
| 20. Compatibility Regression Coverage | v1.3 | 0/TBD | Not started | - |

## Backlog

### Phase 999.1: Add meal composition modes for curry-vs-subzi defaults and overrides (BACKLOG)

**Goal:** Capture a future extension for modeling meal composition defaults such as subzi-only, curry-only, both, or one-of, so bases like chapati can express "subzi instead of curry" without overloading curry compatibility.
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with `$gsd-review-backlog` when ready)
