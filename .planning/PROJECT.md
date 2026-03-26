# Indian Food Planner

## What This Is

A personal weekly meal planner built for Indian dietary patterns. Users build a library of Indian meals (structured as Base + Curry + Subzi + Extras), write structured scheduling rules, and generate randomized Mon-Sun plans that respect those rules — with the ability to lock specific meals, swap individual slots, save per calendar week, and export/share as PNG.

## Core Value

Generate a complete, realistic Indian weekly meal plan in one click — with smart randomization that respects personal rules and locked meals.

## Current Milestone: v1.1 Rule Engine Overhaul

**Goal:** Replace the fragmented constraint system (3 separate rule types + hidden slot prefs) with two clean, composable rule types that cover the full scheduling space.

**Target features:**
- `scheduling-rule` — unified day/slot-scoped rule replacing `day-filter` + `require-component` (filter pool / require / exclude, by tag or specific component)
- `meal-template` — base-type-scoped composition rule replacing `/settings/slots` and `base_type_rules` prefs (slot assignment, composition exclusions, required extras)
- Migration: existing rules + prefs → new variants at startup

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

### Active

**Scheduling Rule (unified)**
- [ ] **SCHED-01**: User can create a scheduling rule scoped to any combination of days and meal slots
- [ ] **SCHED-02**: Scheduling rule effect can be "filter pool" (restrict eligible components), "require one" (force a match to appear), or "exclude" (remove matches from pool)
- [ ] **SCHED-03**: Scheduling rule match criteria can be tag-based (dietary / protein / regional / occasion) or specific component (by ID)
- [ ] **SCHED-04**: "Require one by tag" — generator picks any eligible component matching the tag filter for that slot (e.g., "Fridays: require a fish curry")
- [ ] **SCHED-05**: Existing `day-filter` and `require-component` rules migrated to `scheduling-rule` at startup (Dexie version bump); old rule types removed from CompiledFilter

**Meal Template**
- ✓ **TMPL-01**: User can create a meal template rule scoped to a base type (rice-based / bread-based / other) with optional slot and day context — Validated in Phase 9: Meal Template Engine
- ✓ **TMPL-02**: Meal template specifies which slots the base type is allowed in (slot assignment — replaces 3×3 settings grid) — Validated in Phase 9: Meal Template Engine
- ✓ **TMPL-03**: Meal template can exclude component types (curry, subzi) and/or extra categories (liquid, sweet, etc.) for the given base type context — Validated in Phase 9: Meal Template Engine
- ✓ **TMPL-04**: Meal template can require an extra category for the given base type (e.g., bread-based always needs a liquid extra) — Validated in Phase 9: Meal Template Engine
- [ ] **TMPL-05**: `/settings/slots` page removed; AppNav "Slot Settings" link removed; all constraints managed through Rules UI
- [ ] **TMPL-06**: Existing `slot_restrictions.base_type_slots` and `base_type_rules` prefs migrated to `meal-template` rules at startup

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
- Tech stack: Next.js 16, Dexie.js (IndexedDB), Zustand, shadcn/ui, satori + @resvg/resvg-js (PNG export)
- v1.0 rule system: 3 CompiledFilter variants (day-filter, no-repeat, require-component) — all being refactored in v1.1
- Generator reads CompiledFilter variants directly; new variants require generator updates alongside type changes
- 119 tests passing at v1.0 ship; generator has 22 TDD tests that must remain passing after refactor

## Constraints

- **Scope**: Single-user personal app — no auth complexity, no multi-tenancy
- **Tech stack**: Next.js 16 + Dexie.js + Zustand + shadcn/ui (confirmed)
- **Nutrition**: Explicitly out of scope — do not track calories or macros
- **Backwards compatibility**: v1.1 must migrate existing IndexedDB data — no data loss on upgrade
- **Test coverage**: Generator refactor must maintain or improve existing TDD suite (22 generator tests + 9 compiler tests)

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
| Collapse day-filter + require-component into scheduling-rule | One concept for users, one handler in generator, cleaner form | — Pending (v1.1) |
| Move slot settings into meal-template rules | All scheduling constraints in one place, deletable/togglable | — Pending (v1.1) |

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
*Last updated: 2026-03-26 — Phase 9 complete (meal-template engine backend fully implemented; TMPL-01 through TMPL-04 validated)*
