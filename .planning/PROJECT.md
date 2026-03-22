# Indian Food Planner

## What This Is

A personal weekly meal planner built for Indian dietary patterns. Users build a library of Indian meals (structured as Base + Curry + Subzi + Extras), write structured scheduling rules, and generate randomized Mon-Sun plans that respect those rules — with the ability to lock specific meals, swap individual slots, save per calendar week, and export/share as PNG.

## Core Value

Generate a complete, realistic Indian weekly meal plan in one click — with smart randomization that respects personal rules and locked meals.

## Requirements

### Validated

- ✓ Indian food database with meals structured as Base + Curry + Subzi + Extras — v1.0 (Dexie v4, discriminated union types, 12-function CRUD service)
- ✓ Configurable meal slots: breakfast, lunch, dinner per day — v1.0
- ✓ 87-component Indian meal seed dataset covering all four component types — v1.0
- ✓ Natural language rules to constrain meal randomization (day-based and rotation rules) — v1.0 (structured form compiler; no LLM at generation time)
- ✓ Lock specific meals at the day or meal-slot level; randomize the rest — v1.0
- ✓ Generate a full Mon-Sun meal plan with one action — v1.0
- ✓ Edit generated plan (swap individual meals via MealPickerSheet) — v1.0
- ✓ Rules manager UI for writing, reviewing, toggling, and deleting scheduling rules — v1.0
- ✓ Save plans per calendar week (auto-save, no manual save button) — v1.0
- ✓ Browse past weeks (read-only) and navigate prev/next — v1.0
- ✓ Export/share plans as PNG image (Web Share API + download fallback) — v1.0

### Active

- [ ] **TMPL-01**: Meal Template rule type — base-type-scoped constraints (slot assignment, composition exclusions, required extras) expressed as named, togglable rules
- [ ] **TMPL-02**: Meal Template supports optional context scope (slot + day) so rules like "bread-based on weekdays: no subzi" are expressible
- [ ] **TMPL-03**: `/settings/slots` page replaced — AppNav "Slot Settings" removed, all constraints live in Rules UI
- [ ] **TMPL-04**: Existing `base_type_slots` and `base_type_rules` prefs migrated to `meal-template` rules at startup (Dexie upgrade)

### Out of Scope

- Calorie/macro tracking — not needed; focus is scheduling
- Multi-user / family accounts — personal use only
- Public user accounts / social features — single user, no auth complexity
- Native mobile app — web-first; PWA works fine
- Grocery list generation — requires ingredient-level data not in current model
- PDF export — image export covers the sharing use case (deferred to v2)
- Seasonal / occasion-based rules (Navratri, etc.) — deferred to v1.1
- Cross-week rotation rules (don't repeat within 2 weeks) — deferred to v1.1

## Context

- Shipped v1.0 with ~8,600 LOC TypeScript in 3 days (2026-03-19 → 2026-03-22)
- Tech stack: Next.js 16, Dexie.js (IndexedDB), Zustand, shadcn/ui, satori + @resvg/resvg-js (PNG export)
- Rules compile once at save time (structured form → CompiledFilter); generation is synchronous and LLM-free
- Slot settings (3×3 base-type × meal-slot checkbox grid) currently at /settings; a pending todo proposes moving it to the Rules tab
- 119 tests passing at v1.0 ship

## Constraints

- **Scope**: Single-user personal app — no auth complexity, no multi-tenancy
- **Tech stack**: Next.js 16 + Dexie.js + Zustand + shadcn/ui (confirmed)
- **Nutrition**: Explicitly out of scope — do not track calories or macros
- **LLM dependency**: Rule form uses structured UI (not LLM) — LLM integration removed during Phase 3 (form-based compiler is sufficient and simpler)

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

---
*Last updated: 2026-03-22 after v1.0 milestone complete — 6 phases, 16 plans, 27/27 requirements shipped*
