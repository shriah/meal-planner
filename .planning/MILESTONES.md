# Milestones

## v1.3 Curry Base Compatibility (Shipped: 2026-04-03)

**Phases completed:** 5 phases, 9 plans, 18 tasks
**Timeline:** 2026-03-29 → 2026-04-03 (5 days)
**TypeScript LOC:** ~14,300 (+1,800 from v1.2)
**Git:** 82 commits, 80 files changed, +9,618 / -1,526 lines

**Key accomplishments:**

- Curry records now store compatible base category IDs in the Library, with curated seed mappings and safe upgrade backfill for existing curry data
- Automatic generation now enforces curry compatibility as a hard default constraint and skips curry with warnings instead of silently picking incompatible pairings
- Manual, locked, and scoped `require_one` rule paths now provide explicit override seams for intentional incompatible curry/base combinations
- The real PlanBoard entrypoint now passes base context into the curry picker so override grouping works from the actual weekly board, not just isolated picker tests
- Milestone regression coverage now ties migration, library, generator, picker, store, and board-entry flows to one shared curry compatibility contract
- Extras are no longer base-bound anywhere in the product; extra selection is now explicit-only and category-based without affecting curry compatibility

**Tech debt accepted:**

- Phase 18 validation remains marked pending in its validation artifact even though the runtime contract is shipped and verified
- Curry compatibility classification logic is duplicated between generator and picker helpers
- There is still no browser-level E2E for the full IndexedDB -> board -> picker -> regenerate flow

**Archive:** `.planning/milestones/v1.3-ROADMAP.md` · `.planning/milestones/v1.3-REQUIREMENTS.md` · `.planning/milestones/v1.3-MILESTONE-AUDIT.md`

---

## v1.2 Edit Rule (Shipped: 2026-03-29)

**Phases completed:** 6 phases, 12 plans, 16 tasks
**Timeline:** 2026-03-27 → 2026-03-29 (2 days)
**TypeScript LOC:** ~12,500 (+1,200 from v1.1)
**Git:** 203 files changed, +12,237 / -9,450 lines

**Key accomplishments:**

- Shared rule-form reducer state and reversible compiler mapping for exact rule edit pre-population
- Inline rule editing with a controlled right-side sheet, in-place Dexie updates, discard-on-close resets, and visible save-failure feedback
- Dexie-backed base and extra category records with ID-based component references, transitional legacy shims, and centralized delete normalization
- Sheet-based category management plus live category-backed library authoring and row labels for base and extra components
- Category-ID rule persistence with live Dexie-backed base/extra options, rename-safe descriptions, and delete-safe rule rehydration
- Category-ID runtime generation, picker filtering, and fresh seed bootstrapping for dynamic base and extra categories
- Approved Phase 11 Nyquist validation with real rerun evidence for the shipped edit-rule test surface
- Rule presets now resolve rice-category targets from live built-in category rows, and PlanBoard directly proves the extras picker handoff into MealPickerSheet.

**Archive:** `.planning/milestones/v1.2-ROADMAP.md` · `.planning/milestones/v1.2-REQUIREMENTS.md`

---

## v1.1 Rule Engine Overhaul (Shipped: 2026-03-26)

**Phases completed:** 4 phases, 9 plans
**Timeline:** 2026-03-22 → 2026-03-26 (4 days)
**TypeScript LOC:** ~11,300 (+2,700 from v1.0)
**Git:** 71 commits, 71 files changed, +12,764 / -1,118 lines

**Key accomplishments:**

- Unified `scheduling-rule` type (filter-pool / require-one / exclude × tag / component match) replacing day-filter and require-component (SCHED-01–04)
- Dexie v5 migration auto-converts all existing day-filter/require-component records to scheduling-rule at startup; old variants removed from type system (SCHED-05)
- Scheduling rule creation UI with effect tabs, match mode radio, tag filter grid, two-step component picker, day/slot scoping (Phase 8)
- `meal-template` rule type with full generator integration: slot assignment, component exclusions, extra exclusions/requirements, D-05/D-06 override/fallback semantics (TMPL-01–05)
- Meal template creation UI in Rules Manager; /settings/slots and AppNav "Slot Settings" fully removed (TMPL-06)
- Dexie v7 migration converts slot_restrictions and base_type_rules prefs to meal-template/scheduling-rule records (TMPL-07)

**Archive:** `.planning/milestones/v1.1-ROADMAP.md` · `.planning/milestones/v1.1-REQUIREMENTS.md`

---

## v1.0 MVP (Shipped: 2026-03-22)

**Phases completed:** 6 phases, 16 plans, 24 tasks
**Timeline:** 2026-03-19 → 2026-03-22 (3 days)
**TypeScript LOC:** ~8,600

**Key accomplishments:**

- Typed Dexie v4 data foundation — discriminated union meal components, 12-function CRUD service, 7/7 TDD tests (DATA-01–05)
- 87-component Indian meal seed dataset + four-tab CRUD library UI with AND-logic tag filtering (DATA-06, MEAL-01–05)
- Structured rule compiler (3 rule types → CompiledFilter) — pure synchronous, LLM-free at generation time (RULE-02–04)
- Weighted random 21-slot weekly plan generator with DayFilterRule, NoRepeatRule, frequency weighting — 22 TDD tests (PLAN-01, PLAN-04)
- Interactive 7×3 plan board with lock/swap/regenerate, MealPickerSheet, 76 passing tests (PLAN-02, PLAN-03, PLAN-05, UI-01–04)
- Rules Manager UI with useReducer form, live impact preview, zero-match warning (RULE-01, RULE-05)
- Auto-save per calendar week, week navigation (read-only past weeks), PNG export via satori + resvg + Web Share API (SAVE-01, SAVE-02, EXPORT-01)

**Tech debt accepted:**

- `public/fonts/inter-regular.ttf` committed but never loaded (route uses .woff)
- `addWeeks` dead re-export in plan-store.ts
- IndexedDB write failures silent (fire-and-forget accepted per Phase 4 decision)

**Archive:** `.planning/milestones/v1.0-ROADMAP.md` · `.planning/milestones/v1.0-REQUIREMENTS.md`

---
