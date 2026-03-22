# Milestones

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
