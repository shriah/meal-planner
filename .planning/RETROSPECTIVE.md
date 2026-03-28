# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

---

## Milestone: v1.0 — MVP

**Shipped:** 2026-03-22
**Phases:** 6 | **Plans:** 16 | **Timeline:** 3 days (2026-03-19 → 2026-03-22)

### What Was Built

- Typed Dexie v4 IndexedDB data layer with discriminated union meal components and 12-function CRUD service
- 87-component Indian seed dataset + full CRUD library UI with per-tab search and AND-logic tag filtering
- Structured rule compiler (3 rule types → CompiledFilter) — LLM-free, pure synchronous generation
- Weighted random 21-slot plan generator with day-filter, no-repeat, and frequency weighting (22 tests)
- Interactive 7×3 plan board with lock/swap/regenerate, meal picker, 76 passing tests
- Rules Manager UI with live impact preview and zero-match warning
- Auto-save per calendar week, week navigation, PNG export via satori + resvg + Web Share API

### What Worked

- **Strict dependency ordering** — data foundation before UI before generation meant zero rework across phases
- **TDD on the generator** — writing 22 tests before the generator implementation caught edge cases (NoRepeatRule pool exhaustion, frequency statistical signal) that would have been painful post-hoc
- **Structured rule form over LLM** — discovered during Phase 3 that a form-based compiler covered 95% of use cases without LLM latency or API cost; simpler and faster
- **Dexie useLiveQuery** — reactive IndexedDB queries drove all UI state with zero manual cache invalidation
- **GSD phase workflow** — research → plan → execute per phase kept each unit focused and verifiable

### What Was Inefficient

- Several SUMMARY.md files were filled with template placeholders or task-level noise rather than phase-level one-liners — makes retrospective extraction noisy (affected phases 04-03, 05-01, 05-02, 06-01, 06-02)
- Slot settings UI at /settings/slots (3×3 checkbox grid) feels conceptually like a rule; pending todo to move it to Rules tab
- `inter-regular.ttf` was committed to public/fonts but never loaded (route uses .woff) — dead asset

### Patterns Established

- **Singleton Dexie records** use fixed string primary key (`'current'`, `'prefs'`) — consistent pattern across UserPreferences and ActivePlan
- **Fire-and-forget IndexedDB writes** in Zustand mutations — keeps UI responsive; write failures are non-critical for personal use
- **Per-file happy-dom environment** via vitest docblock (not environmentMatchPatterns) for component tests
- **UTC-based date construction** for all week calculations — eliminates timezone off-by-one bugs
- **Write-through on saveWeekPlan** — single call updates both active_plan and saved_plans, no double-read needed

### Key Lessons

1. **LLM for rules was over-engineered** — a structured form covering 3 rule types was simpler, faster, and sufficient. Validate before building LLM integrations.
2. **TDD on pure services pays off immediately** — generator, compiler, and DB service bugs were caught before UI existed, not after
3. **Seed dataset authoring is real work** — budget explicitly; 87 components took meaningful time and can't be automated without quality loss
4. **Phase SUMMARY.md discipline matters** — noisy summaries degrade retrospective and milestone tooling; enforce one-liner quality during execution

### Cost Observations

- Model mix: ~100% sonnet (balanced profile throughout)
- Sessions: ~6-8 across 3 days
- Notable: 3 days from empty repo to 27/27 requirements shipped, 119 tests passing

---

## Milestone: v1.1 — Rule Engine Overhaul

**Shipped:** 2026-03-26
**Phases:** 4 | **Plans:** 9 | **Timeline:** 4 days (2026-03-22 → 2026-03-26)

### What Was Built

- Unified `scheduling-rule` type replacing day-filter + require-component — 3 effects × 2 match modes, full generator integration with TDD (22 → 30+ tests)
- Dexie v5 auto-migration: converts all existing day-filter/require-component records at startup; old variants removed from CompiledFilter type system
- Scheduling rule creation UI: effect tabs (Only allow / Always include / Never include), match mode radio, tag filter 2×2 grid, two-step component picker, day/slot scoping
- `meal-template` rule type with generator integration: slot assignment (replaces 3×3 settings grid), curry/subzi exclusions, extra exclusions/requirements, D-05/D-06 prefs-override semantics
- Meal template creation UI in Rules Manager; /settings/slots page and AppNav link fully removed
- Dexie v7 auto-migration: converts slot_restrictions and base_type_rules prefs to typed meal-template/scheduling-rule records; seed updated for new users
- Quick task w99: extended meal-template selector to Base/Tag/Component discriminated union (beyond just base_type)

### What Worked

- **Engine-first, UI-second split** — building Phase 7 (engine) before Phase 8 (UI) meant the generator had full type-safe contracts before any form was built; zero generator rework during UI phase
- **Pure function extraction for testability** — `migrateCompiledFilter` as a standalone pure function meant the Dexie migration logic had full unit test coverage before the upgrade callback wired it in
- **TDD red-green on all generator effects** — each of filter-pool, exclude, require-one, and all meal-template constraint types had failing tests first; caught multiple edge cases (D-02 fallback, D-07 multiple require-one, TMPL-05-4 condiment pool)
- **Two-pass require-one mechanism** — elegant solution: check if current pick satisfies rule, override from full library if not; avoids circular pool-narrowing that would have broken D-06
- **Quick task workflow** — the flexible selector extension (w99) was cleanly isolated from Phase 10 work, tracked separately, completed in 16 minutes

### What Was Inefficient

- REQUIREMENTS.md checkboxes for SCHED-05 and TMPL-07 were never updated during execution — required manual correction at milestone close; automation gap in gsd-executor
- Phase 7 ROADMAP entry showed "2/3 plans executed" even after all 3 completed — STATE.md / ROADMAP.md progress sync gap
- MILESTONES.md accomplishment extraction from SUMMARY.md files was noisy (extracted fragments, not one-liners) — gsd-tools `summary-extract` needs SUMMARY.md format alignment

### Patterns Established

- **discriminated union extension** — add new CompiledFilter variant → update Zod schema → add compiler case → add describeRule case → add generator branch → test. Consistent 5-step pattern.
- **D-05/D-06 branch pattern** — `if (templatesForBase.length > 0) { template logic } else { prefs fallback }` — reusable override/fallback structure for any rule type that coexists with prefs
- **D-10 relax-and-warn** — `compute filtered; if empty AND source non-empty, push warning + keep original` — consistent failure handling across all meal-template constraints
- **Dexie async upgrade** — use async upgrade callback when migration needs component name lookups; pure sync migration when not needed

### Key Lessons

1. **Engine-first sequencing is load-bearing** — the Phase 7 → 8, Phase 9 → 10 ordering meant UI phases had zero data contract uncertainty; always build engine before UI for new rule types
2. **REQUIREMENTS.md is a living doc, not a backfill** — checkboxes should be ticked during execution (via executor hook), not manually at milestone close
3. **Pure function extraction pays dividends** — `migrateCompiledFilter` tested independently before being wired into Dexie; found bugs in mapping before they hit the upgrade callback
4. **Form state discriminated unions scale cleanly** — empty-string sentinel for unset mode (`mode: ''`) works as well for scheduling-rule as it did for no-repeat; consistent pattern across all form types

### Cost Observations

- Model mix: ~100% sonnet (balanced profile throughout)
- Sessions: ~8-10 across 4 days
- Notable: Full rule engine overhaul in 4 days with 12/12 requirements, ~160 tests, zero data migrations failing

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Timeline | Key Change |
|-----------|--------|-------|----------|------------|
| v1.0 | 6 | 16 | 3 days | Initial build |
| v1.1 | 4 | 9 | 4 days | Engine-first phase pairs; quick task workflow introduced |

### Cumulative Quality

| Milestone | Tests | Tech Debt Items | Requirements |
|-----------|-------|-----------------|--------------|
| v1.0 | 119 | 3 (minor) | 27/27 |
| v1.1 | ~160 | 1 (TS errors in export-plan route, pre-existing) | 12/12 |

### Top Lessons (Verified Across Milestones)

1. Validate LLM necessity before designing around it — structured alternatives often simpler (v1.0 + v1.1)
2. TDD on pure service/utility layers catches bugs before UI integration (v1.0 + v1.1)
3. Engine-first → UI-second phase sequencing eliminates data contract rework (v1.1)
