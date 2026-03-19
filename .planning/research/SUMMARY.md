# Project Research Summary

**Project:** Food Planner — Indian Weekly Meal Planner
**Domain:** Personal meal planning web app with LLM-powered natural language rules (Indian cuisine)
**Researched:** 2026-03-19
**Confidence:** HIGH

## Executive Summary

This is a single-user, browser-local personal meal planning application designed specifically for Indian cooking patterns. The core insight driving all research is that Indian meals are compositional — a plate (thali) is made of a Base (rice/roti), a Curry/Dal, a Subzi (dry vegetable side), and Extras (pickle, pappad, rasam). No existing meal planner codifies this structure, which is the primary differentiator. The recommended approach is a local-first architecture built on Next.js 16 + Dexie.js (IndexedDB), with Zustand for session state and Claude Haiku 4.5 for a single, specific LLM task: translating natural language scheduling rules into stored JSON filter objects. There is no server, no database other than the user's own browser, and no auth complexity.

The key architectural decision — and the one that will make or break the user experience — is the rule compilation pattern. Rules must be compiled by the LLM once at save time into a typed JSON filter DSL, then evaluated deterministically at plan generation time with zero LLM involvement. Any deviation from this creates a slow, expensive, and brittle generator. The second most important decision is the meal data model: meals must be stored as compositions of first-class component records (with explicit categorical tags), not as flat name strings. Rules written by users target tags, not names — so the tagging taxonomy must exist before rules can be written.

The primary risks are all front-loaded in the data model and rule system phases: building a meal model without tags (blocks all rule matching), calling the LLM at generation time (kills performance), and using naive `Math.random()` for slot assignment (produces perceptually broken plans with repeated dishes). All three are recoverable but costly to fix after the fact. Ship a correctly structured data model and a compile-once rule engine from day one, even if the initial set of supported rule types is narrow.

## Key Findings

### Recommended Stack

The stack is built around the constraint that this is a personal, single-user app with no server. Next.js 16 handles both UI and API routes (for the LLM proxy), eliminating the need for a separate backend. Dexie.js wraps IndexedDB cleanly with React hooks and TypeScript support — it is the right fit between localStorage (too small) and SQLite WASM (too heavy). Zustand manages ephemeral session state (current plan, lock state) with Dexie handling all persistence. The Vercel AI SDK `generateObject` with a Zod schema delivers typed, validated JSON from Claude without manual parsing logic.

**Core technologies:**
- **Next.js 16.2** — full-stack React framework with App Router; UI and LLM proxy in one project
- **TypeScript 5.x** — type safety across domain models (Meal, MealComponent, CompiledFilter); catches bugs in rule evaluation logic
- **Tailwind CSS 4.x + shadcn/ui** — utility-first styling with owned, accessible components (Dialog, Card, Select) for the planning grid and meal library
- **Zustand 5.0** — minimal client state for current plan, lock state, and UI; persist middleware syncs to Dexie automatically
- **Dexie.js 4.3** — IndexedDB wrapper with `useLiveQuery` hook; stores all meals, components, rules, and saved plans locally
- **Vercel AI SDK 6 + @ai-sdk/anthropic** — `generateObject` with Zod schema for typed, validated rule translations from Claude
- **Claude Haiku 4.5** — cheapest capable tier for the narrow rule-parsing task; upgrade to Sonnet is a one-line change if needed
- **@react-pdf/renderer 4.3** — client-side vector PDF generation (selectable text); `html-to-image` for PNG/WhatsApp share

**What not to use:** Redux, Firebase/Supabase, React Query, localStorage for meal data, html2canvas+jsPDF, any Claude 3 model (deprecated April 2026).

### Expected Features

The meal library and composition data model are the dependency root — nothing else works without them. Plan generation depends on a seeded library, rules depend on tagged components, and exports depend on a working plan board. All eleven v1 features are effectively P1 because of tight dependency chains.

**Must have (table stakes):**
- Meal Composition Model (Base + Curry + Subzi + Extras) — foundation; without it, component-level rules are impossible
- Meal Library CRUD — users must build their personal Indian food library before generation is useful
- Mon-Sun grid view (breakfast/lunch/dinner rows) — the core planning surface
- One-click weekly plan generation — the primary value action
- Meal lock + regenerate rest — standard UX from eatthismuch.com; users expect to fix one slot and reshuffle the rest
- Individual meal swap — frictionless fallback for wrong suggestions
- Save plans — minimum persistence for the tool to be useful beyond one session
- Export (PDF + PNG) — WhatsApp-sharing the week plan is a key Indian household behavior; drives organic discovery

**Should have (competitive differentiators):**
- Natural language scheduling rules via LLM — "Fridays are fish days," "No meat on Tuesdays" — no existing Indian planner supports this
- Day-of-week rules — tightly coupled to NL rules; the first examples users will try
- Rotation rules (no-repeat within week) — "same subzi twice" is the most common Indian scheduling frustration; this is a primary differentiator
- Configurable meal slots — not every household has three meals; toggle per day
- Extras as first-class fields — rasam, pappad, pickle, curd are distinct courses, not toppings

**Defer (v2+):**
- Cross-week rotation rules (requires plan history first)
- Pre-seeded Indian dish library (reduces onboarding friction; 1-2 days of content work)
- Grocery list (requires ingredient-level data; forces data model change)
- Calorie/macro tracking, full recipe storage, multi-user accounts, native mobile app — all change product category

### Architecture Approach

The architecture has three clean layers: React UI components, pure TypeScript services (Food DB Service, Plan Generator, Rule Engine), and a Dexie data layer. The three services are independently testable without React and communicate only through typed interfaces. The Claude API is called only by the Rule Engine, only on rule save/edit — never by the Plan Generator. Zustand holds the working plan as mutable session state; SQLite holds persisted snapshots. The export pipeline renders a separate, hidden `PrintablePlan` component rather than screenshotting the interactive grid.

**Major components:**
1. **Food Library UI + Food DB Service** — CRUD for meal components with required categorical tags; the data quality bottleneck for the entire system
2. **Rule Engine** — sends NL rule + tag catalog to Claude Haiku via `generateObject`, stores the typed `CompiledFilter` JSON alongside the original text; never called at generation time
3. **Plan Generator** — pure synchronous function; loads meals from Dexie, loads compiled filters from Rule Store, applies slot-scoped then week-scoped filters, selects with recency-weighted randomization; target: under 500ms
4. **Plan Board UI + Zustand PlanStore** — the interactive 7×3 weekly grid; lock state lives in the plan store (not component state)
5. **Export Pipeline** — @react-pdf/renderer for vector PDF; html-to-image for PNG share

**Build order:** DB schema → Food DB Service → Food Library UI → Rule Engine → Plan Generator → Plan Board → Save/History → Export. The generator cannot be tested without meals; rules cannot be tested without tags; the board cannot be tested without the generator.

### Critical Pitfalls

1. **LLM produces semantically wrong rule translations** — validate structurally AND semantically; immediately show users a human-readable confirmation of what the rule will do ("This rule excludes 6 meals: Dal Tadka, Moong Dal..."); build a regression test suite of 20+ rule translations before shipping.

2. **Naive randomization produces perceptually broken plans** — `Math.random()` produces statistical clustering that feels like repetition; implement recency-weighted selection with component-level variety tracking (Base, Curry, Subzi deduplication are independent); enforce at least a 2-day gap for Subzis.

3. **Indian dish name aliasing breaks rule matching** — "Dal Tadka," "Toor Dal," "Parippu," and "Lentil Curry" are the same category; rules must target tags (`exclude: { tags: ["dal"] }`), never names; require mandatory categorical tags at meal entry time from day one.

4. **LLM called at plan generation time** — compile rules once on save; generation must be LLM-free; if the plan generation function imports the LLM client, the architecture is wrong.

5. **Lock state stored in component state instead of plan store** — lock flags must live in the Zustand plan store, persisted immediately on toggle; write an explicit test: lock a slot, call generate, assert slot is unchanged in output.

## Implications for Roadmap

Based on the dependency graph in FEATURES.md and the component build order in ARCHITECTURE.md, the roadmap should follow the dependency chain closely. Skipping ahead (e.g., building the plan board before the meal library is seeded) produces untestable code and wasted rework.

### Phase 1: Data Foundation
**Rationale:** Everything else depends on a correctly structured meal data model with categorical tags. This is the highest-leverage phase — mistakes here (flat name strings, no tags) require expensive schema migrations later and cannot be patched around.
**Delivers:** DB schema (components, meals, meal_extras, rules, saved_plans tables), Dexie client setup, TypeScript domain types (MealComponent, Meal, SlotState, CompiledFilter, NLRule), Food DB Service (CRUD functions), Zustand store scaffolding.
**Addresses:** Meal Composition Model (Base + Curry + Subzi + Extras), categorical tag taxonomy
**Avoids:** Indian dish name aliasing pitfall (tags from day one), schema migration costs

### Phase 2: Meal Library UI
**Rationale:** The plan generator is useless without a seeded meal library. Users need a fast, friction-low way to add their meals with required categorical tags before any generation can produce useful output. This is also where the tagging taxonomy gets validated against real user data entry.
**Delivers:** Add/edit/delete meals; component CRUD (Base, Curry, Subzi, Extras as separate component records); tag multi-select with fixed Indian food taxonomy; basic search/filter of library
**Addresses:** Meal Library CRUD, Configurable meal slots
**Avoids:** Forcing complex forms at entry time (show minimal form; optional tags can be added later)

### Phase 3: Plan Generator + Rule Engine
**Rationale:** These two are architecturally coupled (the generator consumes compiled filters from the rule engine) but must be built before any UI is placed on top. Getting the core algorithm right — weighted randomization, slot-scoped and week-scoped filter application, lock-slot respect — is the hardest engineering work and needs to be testable in isolation before a UI exists.
**Delivers:** Rule Engine (NL rule → Claude Haiku → CompiledFilter JSON via `generateObject`; stored in Dexie); Plan Generator (pure function; recency-weighted randomization; filter application pipeline; lock enforcement); Vitest unit tests covering 20+ rule translations and 50 generated plan variety assertions
**Addresses:** Natural language rules, day-of-week rules, rotation rules (no-repeat within week)
**Avoids:** LLM called at generation time (architectural gate check); naive randomization; lock state in component state; over-engineered constraint solver

### Phase 4: Plan Board UI
**Rationale:** The interactive weekly grid and the lock/swap/regenerate UX can now be built on a working, tested generator. This is the primary user-facing surface.
**Delivers:** Mon-Sun grid (7 days x 3 meal slots); one-click generate; meal lock toggle (state in Zustand store); regenerate rest; individual meal swap (click slot → pick from library); unsaved-changes indicator; single-level undo after regenerate
**Addresses:** Full-week view, one-click generation, meal lock + regenerate rest, individual meal swap
**Avoids:** Lock state stored in component state; no feedback during generation (show skeleton loading, disable button)

### Phase 5: Rules Manager UI
**Rationale:** Rule Engine is already built (Phase 3); this phase is the UI surface for entering, reviewing, and managing rules. Separating it from Phase 3 keeps the generator phase focused on correctness, not UI polish.
**Delivers:** Natural language rule text input; LLM compilation trigger with "Compiling..." state; human-readable rule summary confirmation ("This rule affects 8 of your 34 meals"); active/inactive toggle; conflict detection warning at save time; rule list view
**Addresses:** Natural language scheduling rules, day-of-week rules, extras rotation
**Avoids:** No feedback on rule save; silent rule conflicts; missing semantic validation confirmation

### Phase 6: Save, History, and Export
**Rationale:** Save and export are the last features to build because they depend on stable plan board rendering and a working plan model. Export in particular requires pixel-stable rendering, which only makes sense to finalize after the board UI is settled.
**Delivers:** Named plan save (explicit action, not auto-save); saved plans list/load; plan history (last-served date per meal); PDF export via @react-pdf/renderer with a dedicated PrintablePlan component; PNG export via html-to-image for WhatsApp sharing
**Addresses:** Save plans, export (PDF + image), plan history + last served tracking
**Avoids:** Auto-saving to named plan (overwrites silently); screenshotting interactive grid instead of dedicated print component; non-ASCII meal name rendering bugs in PDF

### Phase Ordering Rationale

- Data model first because every other layer reads from it; schema mistakes are the most expensive to fix
- Meal Library before generator because the generator requires a seeded library to produce meaningful output
- Generator and Rule Engine together in Phase 3 (back-end only, no UI) because they must be unit-tested in isolation before UI is placed on top
- Plan Board after the generator because it is a thin UI layer over tested services — not the place to debug algorithmic bugs
- Rules UI after the generator for the same reason
- Save and Export last because they depend on plan board rendering stability

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (Plan Generator + Rule Engine):** The CompiledFilter DSL design requires careful scoping — the LLM prompt schema, the set of supported rule types, and the filter evaluation logic all need to be co-designed. The rule type taxonomy (day-restriction, rotation-gap, slot-lock, category-exclusion) needs explicit definition before the LLM prompt is written.
- **Phase 3 (Rule Engine):** Prompt engineering for structured output with `generateObject` and Zod — the schema complexity and few-shot examples need iteration; recommend a focused research-phase before building.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Data Foundation):** Dexie schema design and TypeScript domain types are well-documented; the schema is provided in ARCHITECTURE.md.
- **Phase 2 (Meal Library UI):** Standard CRUD UI with shadcn/ui components; no novel patterns.
- **Phase 4 (Plan Board UI):** Standard React grid UI with Zustand; lock/swap patterns are documented in FEATURES.md and ARCHITECTURE.md.
- **Phase 6 (Export):** @react-pdf/renderer and html-to-image are well-documented; the main risk (non-ASCII rendering) is a known issue with a known fix.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified against official docs and npm registry on 2026-03-19; full version compatibility matrix confirmed |
| Features | MEDIUM-HIGH | eatthismuch.com UX confirmed from official help docs; Indian meal patterns from multiple food blogs and Wikipedia; the exact rule types Indian users need are inferred from domain research, not user interviews |
| Architecture | MEDIUM-HIGH | Core patterns (compile-once rules, compositional meal model, session-vs-snapshot state) are well-established; DB schema is fully specified in ARCHITECTURE.md; the CompiledFilter DSL expressiveness is unvalidated against real user rules |
| Pitfalls | HIGH | LLM pitfalls verified from academic sources and real GitHub issues; randomization pitfalls confirmed from Mealie open-source tracker; Indian aliasing pitfall is domain-specific with MEDIUM confidence |

**Overall confidence:** HIGH

### Gaps to Address

- **CompiledFilter DSL completeness:** The four rule types (day-restriction, rotation-gap, slot-lock, category-exclusion) are proposed but not validated against a real set of user rules. Before Phase 3, spend one session writing 15-20 realistic user rules and verify each can be expressed in the DSL. Extend the DSL if gaps are found.
- **LLM prompt engineering quality:** The few-shot examples for rule translation need to be written and tested before the Rule Engine is considered production-ready. Plan for 1-2 days of prompt iteration with a real test suite.
- **Tag taxonomy completeness:** The Indian food categorical tag set (dal, subzi, curry, rice-based, bread, seafood, egg, meat, sweet, fasting, south-indian, north-indian, etc.) needs to be defined completely before the meal library UI is built, because tags are a fixed multi-select. This is a domain decision, not an engineering one.
- **Meal library seeding:** No open Indian food dataset matches the Base+Curry+Subzi+Extras model. A curated seed dataset of 50-100 Indian meals must be authored manually. Budget 1-2 days; this gates the usefulness of the generator for testing.

## Sources

### Primary (HIGH confidence)
- [Anthropic Models Overview](https://platform.claude.com/docs/en/about-claude/models/overview) — model IDs, pricing, context windows; Claude Haiku 4.5 selection
- [Next.js Installation Docs](https://nextjs.org/docs/app/getting-started/installation) — v16.2.0, default stack confirmed
- [Vercel AI SDK Introduction](https://ai-sdk.dev/docs/introduction) — v6, `generateObject`, Anthropic provider
- [Anthropic Structured Outputs Docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) — constrained decoding, Zod/JSON Schema
- [shadcn/ui Tailwind v4 docs](https://ui.shadcn.com/docs/tailwind-v4) — React 19 and Tailwind v4 compatibility confirmed
- [Dexie.js npm registry](https://www.npmjs.com/package/dexie) — v4.3.0
- [Zustand npm registry](https://www.npmjs.com/package/zustand) — v5.0.12
- [@react-pdf/renderer npm](https://www.npmjs.com/package/@react-pdf/renderer) — v4.3.2
- [Eat This Much Help Docs](https://help.eatthismuch.com/help/how-do-i-prevent-a-specific-meal-or-day-from-generating) — lock/regenerate UX confirmed
- [Martin Fowler — Rules Engine](https://martinfowler.com/bliki/RulesEngine.html) — avoid over-engineering pitfall
- [Mealie GitHub Issue #3647](https://github.com/mealie-recipes/mealie/issues/3647) — randomization duplicate selection pitfall confirmed

### Secondary (MEDIUM confidence)
- [Thali — Wikipedia](https://en.wikipedia.org/wiki/Thali) — Indian meal plate structure and component breakdown
- [Weekly South Indian Meal Planner — Vidhya's Vegetarian Kitchen](https://www.vidhyashomecooking.com/weekly-south-indian-meal-planner/) — household weekly rotation patterns
- [Constraint Satisfaction for Meal Planning — DIVA portal](https://www.diva-portal.org/smash/get/diva2:21100/FULLTEXT01.pdf) — rule engine complexity assessment
- [Agenta — Guide to Structured Outputs with LLMs](https://agenta.ai/blog/the-guide-to-structured-outputs-and-function-calling-with-llms) — prompt patterns for JSON output
- [MIT News — LLM reliability shortcomings](https://news.mit.edu/2025/shortcoming-makes-llms-less-reliable-1126) — LLM semantic failure modes
- WebSearch: Next.js vs Remix vs SvelteKit 2025 comparison
- WebSearch: Indian food datasets survey (Kaggle, Mendeley) — no usable open dataset for this data model

### Tertiary (LOW confidence)
- WebSearch: html-to-image vs html2canvas 2025 — image export approach selection
- [Indian Meal Planning 101 — Simple Indian Meals](https://simpleindianmeals.com/meal-planning-101/) — household planning pattern inference

---
*Research completed: 2026-03-19*
*Ready for roadmap: yes*
