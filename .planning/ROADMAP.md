# Roadmap: Indian Food Planner

## Overview

The build follows a strict dependency chain: a correctly typed meal data model must exist before meals can be managed, meals must be in the library before the generator can produce meaningful output, the generator and rule engine must be tested in isolation before a UI is placed on top, and export must be finalized after the plan board rendering is stable. Six phases deliver the complete v1: data foundation, meal library UI, plan generator + rule engine (back-end only), plan board UI, rules manager UI, and save/history/export.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Data Foundation** - Establish the typed meal data model, DB schema, and TypeScript domain types that every other phase depends on (completed 2026-03-20)
- [ ] **Phase 2: Meal Library UI** - Build the CRUD interface for managing Indian meals with required categorical tags and a seed dataset
- [ ] **Phase 3: Plan Generator + Rule Engine** - Implement the core generation algorithm and LLM rule compilation back-end, with unit tests, before any UI exists
- [ ] **Phase 4: Plan Board UI** - Build the interactive 7x3 weekly grid with lock, swap, and regenerate on top of the tested generator
- [ ] **Phase 5: Rules Manager UI** - Surface the rule engine through a UI for entering, reviewing, and managing natural language scheduling rules
- [ ] **Phase 6: Save, History, and Export** - Add named plan saving, history browsing, and PNG export for sharing

## Phase Details

### Phase 1: Data Foundation
**Goal**: The typed meal data model, database schema, and service layer exist so that all subsequent phases can build on a stable, correctly structured foundation
**Depends on**: Nothing (first phase)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05
**Success Criteria** (what must be TRUE):
  1. A meal can be represented in code as a composition of Base (with type tag), optional Curry, optional Subzi, and zero or more typed Extras — the type system enforces this structure
  2. Each Extra carries a `compatible_with` list of Base types and the system can evaluate compatibility at runtime
  3. The tag catalog (dietary, protein type, regional cuisine, occasion) is fully defined as a fixed enumeration that can be applied to any meal component
  4. The Dexie database schema is initialized with all required tables (components, meals, meal_extras, rules, saved_plans) and can be read and written without error
  5. The Food DB Service exposes typed CRUD functions for meals and components that are callable from any UI layer
**Plans**: 2 plans

Plans:
- [ ] 01-01-PLAN.md — Scaffold Next.js project, define TypeScript domain types, create Dexie database client, set up test infrastructure
- [ ] 01-02-PLAN.md — Implement Food DB Service CRUD layer with TDD (tests first, then implementation proving DATA-01 through DATA-05)

### Phase 2: Meal Library UI
**Goal**: Users can build and maintain their personal Indian meal library with full CRUD, mandatory categorical tags, and a pre-loaded seed dataset to make the generator immediately useful
**Depends on**: Phase 1
**Requirements**: DATA-06, MEAL-01, MEAL-02, MEAL-03, MEAL-04, MEAL-05
**Success Criteria** (what must be TRUE):
  1. User can add a new meal by specifying a Base and optionally selecting Curry, Subzi, and compatible Extras from the existing component pool
  2. User can edit any saved meal — change its components, name, or tags — and see the change reflected immediately in the library
  3. User can delete a meal from the library and it no longer appears in search or generation
  4. User can filter and search the meal library by component type (Base type, presence of Curry, etc.) and by any combination of tags
  5. The app starts with 50–100 pre-loaded Indian meals covering breakfast, lunch, and dinner slots so the generator produces useful output from first launch
**Plans**: TBD

### Phase 3: Plan Generator + Rule Engine
**Goal**: A pure synchronous plan generator and a compile-once rule engine exist as tested back-end services, with no LLM involvement at generation time
**Depends on**: Phase 2
**Requirements**: PLAN-01, PLAN-04, RULE-02, RULE-03, RULE-04
**Success Criteria** (what must be TRUE):
  1. Calling the generator produces a full Mon–Sun plan (21 slots) in under 500ms with meals distributed across slots using recency-weighted randomization that avoids perceptual repetition
  2. Extras in a generated plan are only ever paired with compatible Base types — Rasam never appears with a roti-based meal
  3. A natural language rule is compiled by the LLM into a typed CompiledFilter JSON object at save time; generation reads only the stored filter and never calls the LLM
  4. Day-based rules (e.g., "Fridays are fish days") and rotation/no-repeat rules (e.g., "Never repeat the same subzi twice in a week") are both correctly enforced by the generator as verified by a unit test suite of 20+ cases
**Plans**: TBD

### Phase 4: Plan Board UI
**Goal**: Users can view, interact with, and edit the generated weekly plan through an interactive grid with full lock, swap, and regenerate capabilities
**Depends on**: Phase 3
**Requirements**: PLAN-02, PLAN-03, PLAN-05, UI-01, UI-02, UI-03, UI-04
**Success Criteria** (what must be TRUE):
  1. The weekly plan is displayed as a 7×3 grid (Mon–Sun columns, breakfast/lunch/dinner rows) with each slot showing the meal name and a lock/unlock toggle
  2. Locked slots are visually distinct from unlocked slots, and clicking the regenerate button re-randomizes only unlocked slots while locked slots remain unchanged
  3. User can lock all slots for an entire day at once with a single action
  4. Clicking any slot opens a meal picker filtered to the correct slot type (breakfast, lunch, or dinner) from which the user can select a replacement meal
**Plans**: TBD

### Phase 5: Rules Manager UI
**Goal**: Users can write, review, enable/disable, and delete natural language scheduling rules through a dedicated UI surface backed by the Phase 3 rule engine
**Depends on**: Phase 3
**Requirements**: RULE-01, RULE-05
**Success Criteria** (what must be TRUE):
  1. User can type a scheduling rule in plain English, submit it, and see a "Compiling..." state while the LLM processes it
  2. After compilation, the UI shows a human-readable summary of what the rule will do (e.g., "This rule affects 6 of your 34 meals") before the rule is saved
  3. User can view all saved rules in a list, toggle any rule active or inactive, and delete a rule — changes take effect on the next generation
  4. When a newly saved rule matches zero available meals, the UI surfaces a warning at save time without blocking the save
**Plans**: TBD

### Phase 6: Save, History, and Export
**Goal**: Users can save named plans for future reference, load previously saved plans, and export the current plan as a PNG image suitable for sharing on WhatsApp
**Depends on**: Phase 4
**Requirements**: SAVE-01, SAVE-02, EXPORT-01
**Success Criteria** (what must be TRUE):
  1. User can save the current plan under a chosen name and see it appear in a saved plans list
  2. User can open the saved plans list, select any previously saved plan, and have it loaded into the plan board as the active plan
  3. User can export the current plan as a PNG image and the result is a clean, shareable image (not a screenshot of the interactive grid)
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Foundation | 2/2 | Complete   | 2026-03-20 |
| 2. Meal Library UI | 0/TBD | Not started | - |
| 3. Plan Generator + Rule Engine | 0/TBD | Not started | - |
| 4. Plan Board UI | 0/TBD | Not started | - |
| 5. Rules Manager UI | 0/TBD | Not started | - |
| 6. Save, History, and Export | 0/TBD | Not started | - |
