# Roadmap: Indian Food Planner

## Milestones

- ✅ **v1.0 MVP** — Phases 1-6 (shipped 2026-03-22) — see [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Rule Engine Overhaul** — Phases 7-10 (shipped 2026-03-26) — see [milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md)
- 🔄 **v1.2 Edit Rule** — Phase 11 (in progress)

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

- [ ] **Phase 11: Edit Rule** - Add edit capability to the rules list so users can update any existing rule in place

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
**Plans**: TBD
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
| 11. Edit Rule | v1.2 | 0/? | Not started | - |
