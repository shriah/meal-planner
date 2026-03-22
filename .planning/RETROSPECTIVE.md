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

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Timeline | Key Change |
|-----------|--------|-------|----------|------------|
| v1.0 | 6 | 16 | 3 days | Initial build |

### Cumulative Quality

| Milestone | Tests | Tech Debt Items | Requirements |
|-----------|-------|-----------------|--------------|
| v1.0 | 119 | 3 (minor) | 27/27 |

### Top Lessons (Verified Across Milestones)

1. Validate LLM necessity before designing around it — structured alternatives often simpler
2. TDD on pure service/utility layers catches bugs before UI integration
