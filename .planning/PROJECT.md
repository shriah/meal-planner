# Indian Food Planner

## What This Is

A personal weekly meal planner built for Indian dietary patterns. Users build a library of Indian meals (structured as Base + Curry + Subzi + Extras), write structured scheduling rules, and generate randomized Mon-Sun plans that respect those rules — with the ability to lock specific meals, swap individual slots, save per calendar week, and export/share as PNG.

## Core Value

Generate a complete, realistic Indian weekly meal plan in one click — with smart randomization that respects personal rules and locked meals.

## Requirements

### Validated

- ✓ Indian food database with meals structured as Base + Curry + Subzi + Extras — v1.0 (Dexie v4, discriminated union types, 12-function CRUD service)
- ✓ Configurable meal slots: breakfast, lunch, dinner per day — v1.0
- ✓ 87-component Indian seed dataset covering all four component types — v1.0
- ✓ Structured rule compiler (3 rule types → CompiledFilter); generation synchronous, LLM-free — v1.0
- ✓ Lock specific meals at the day or meal-slot level; randomize the rest — v1.0
- ✓ Generate a full Mon-Sun meal plan with one action — v1.0
- ✓ Edit generated plan (swap individual meals via MealPickerSheet) — v1.0
- ✓ Rules manager UI for writing, reviewing, toggling, and deleting scheduling rules — v1.0
- ✓ Save plans per calendar week (auto-save, no manual save button) — v1.0
- ✓ Browse past weeks (read-only) and navigate prev/next — v1.0
- ✓ Export/share plans as PNG image (Web Share API + download fallback) — v1.0
- ✓ **SCHED-01**: User can create a scheduling rule scoped to any combination of days and meal slots — v1.1
- ✓ **SCHED-02**: Scheduling rule effect can be "filter pool", "require one", or "exclude" — v1.1
- ✓ **SCHED-03**: Scheduling rule match criteria can be tag-based or specific component — v1.1
- ✓ **SCHED-04**: "Require one by tag" — generator picks any eligible component matching the tag filter for that slot — v1.1
- ✓ **SCHED-05**: Existing day-filter and require-component rules auto-migrated to scheduling-rule at startup (Dexie v5) — v1.1
- ✓ **TMPL-01**: User can create a meal template rule scoped to a base type with optional slot and day context — v1.1
- ✓ **TMPL-02**: Meal template specifies which slots the base type is allowed in (replaces 3×3 settings grid) — v1.1
- ✓ **TMPL-03**: Meal template can exclude component types (curry, subzi) and extra categories — v1.1
- ✓ **TMPL-04**: Meal template can require an extra category for the given base type — v1.1
- ✓ **TMPL-05**: /settings/slots removed; AppNav "Slot Settings" removed; all constraints in Rules UI — v1.1
- ✓ **TMPL-06**: Meal template creation UI in Rules Manager with RadioGroup, Toggle slot chips, exclusion checkboxes — v1.1
- ✓ **TMPL-07**: Existing slot_restrictions and base_type_rules prefs auto-migrated to meal-template/scheduling-rule records (Dexie v7) — v1.1

### Active

*(planning next milestone — run `/gsd:new-milestone` to define v1.2 requirements)*

### Out of Scope

- Calorie/macro tracking — not needed; focus is scheduling
- Multi-user / family accounts — personal use only
- Public user accounts / social features — single user, no auth complexity
- Native mobile app — web-first; PWA works fine
- Grocery list generation — requires ingredient-level data not in current model
- PDF export — image export covers the sharing use case (deferred to v2)
- Seasonal / occasion-based rules (Navratri, etc.) — expressible via scheduling-rule occasion_tag filter

## Context

- Shipped v1.0 with ~8,600 LOC TypeScript in 3 days (2026-03-19 → 2026-03-22)
- Shipped v1.1 with ~11,300 LOC TypeScript in 4 days (2026-03-22 → 2026-03-26)
- Tech stack: Next.js 16, Dexie.js (IndexedDB, v7 now), Zustand, shadcn/ui, satori + @resvg/resvg-js (PNG export)
- Rule system: 2 CompiledFilter variants (no-repeat, scheduling-rule) + meal-template; all synchronous, LLM-free
- ~160 tests passing at v1.1 ship; generator has 30+ TDD tests covering all rule types and edge cases
- Dexie schema at v7; three auto-migration chains from v1 (day-filter/require-component → scheduling-rule at v5, slot prefs → rules at v7)

## Constraints

- **Scope**: Single-user personal app — no auth complexity, no multi-tenancy
- **Tech stack**: Next.js 16 + Dexie.js + Zustand + shadcn/ui (confirmed)
- **Nutrition**: Explicitly out of scope — do not track calories or macros
- **Backwards compatibility**: Dexie auto-migration handles all upgrade paths — no data loss on upgrade
- **Test coverage**: All generator and compiler refactors covered by TDD; ~160 tests passing

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Meal structure as components | Base + Curry + Subzi + Extras matches real Indian meal patterns | ✓ Good — discriminated union ComponentRecord shipped in Phase 01 |
| Personal-use scope for v1 | Simplifies auth, data model, and UX significantly | ✓ Good — no complexity regrets |
| Rules compile at save time (not generation time) | Generation must be synchronous and fast | ✓ Good — zero LLM calls during generation |
| Structured rule form (not LLM) | LLM adds latency and API cost; 3 rule types cover 95% of use cases | ✓ Good — simpler, faster, cheaper |
| Dexie v4 with EntityTable typing | Type-safe IndexedDB ORM with live query hooks | ✓ Good — useLiveQuery drove all reactive UI |
| Zustand for plan board state | Lightweight store, fire-and-forget IndexedDB writes | ✓ Good — kept UI responsive |
| satori + resvg for PNG export | Server-side render to PNG without browser screenshot | ✓ Good — clean shareable output; required Node.js runtime (not edge) |
| Fire-and-forget saveWeekPlan in mutations | Keeps UI responsive; write failures are non-critical | — Accepted trade-off (IndexedDB failures silent) |
| UTC-based date construction in week-utils | Eliminates timezone off-by-one in ISO week calculations | ✓ Good — resolved date edge cases |
| Collapse day-filter + require-component into scheduling-rule | One concept for users, one handler in generator, cleaner form | ✓ Good — shipped in v1.1; Dexie v5 migration covers existing rules |
| Move slot settings into meal-template rules | All scheduling constraints in one place, deletable/togglable | ✓ Good — unified in Phase 10; settings page fully removed |
| scheduling-rule match as discriminated union (tag/component) | Covers both use cases without separate rule types | ✓ Good — clean form UX with RadioGroup mode selector |
| meal-template D-05/D-06 prefs-override semantics | Allows migration without breaking existing user intent | ✓ Good — zero data loss, relax-and-warn on empty pool |
| Two-pass require-one generator effect | First check current pick, override from full library if needed | ✓ Good — D-06 override from full library prevents circular exclusion |
| migrateCompiledFilter as pure function | Testable in isolation without Dexie upgrade callback complexity | ✓ Good — full unit test coverage, deterministic |
| Flexible meal-template selector (quick task w99) | Base/tag/component targeting modes via discriminated union | ✓ Good — extends meal-template targeting beyond just base_type |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-26 — v1.1 Rule Engine Overhaul complete (all 12 SCHED + TMPL requirements validated; 4 phases, 9 plans, 71 commits)*
