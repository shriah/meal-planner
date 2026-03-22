---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Rule Engine Overhaul
status: Ready to execute
stopped_at: Completed 07-02-PLAN.md
last_updated: "2026-03-22T16:28:19.992Z"
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 3
  completed_plans: 2
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-22 — v1.1 started)

**Core value:** Generate a complete, realistic Indian weekly meal plan in one click — with smart randomization that respects personal rules and locked meals.
**Current focus:** Phase 07 — scheduling-rule-engine

## Current Position

Phase: 07 (scheduling-rule-engine) — EXECUTING
Plan: 3 of 3

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01-data-foundation P01 | 2 | 2 tasks | 8 files |
| Phase 01-data-foundation P02 | 5 | 2 tasks | 2 files |
| Phase 02-meal-library-ui P01 | 4 | 2 tasks | 19 files |
| Phase 02-meal-library-ui P02 | 2 | 2 tasks | 8 files |
| Phase 02-meal-library-ui P03 | ~30min | 2 tasks | 4 files |
| Phase 03-plan-generator-rule-engine P01 | 2min | 2 tasks | 5 files |
| Phase 03-plan-generator-rule-engine P02 | 5min | 1 tasks | 2 files |
| Phase 03-plan-generator-rule-engine P03 | ~6min | 2 tasks | 2 files |
| Phase 04-plan-board-ui P01 | 4m | 2 tasks | 8 files |
| Phase 04-plan-board-ui P02 | 18min | 3 tasks | 14 files |
| Phase 04 P03 | 2min | 1 tasks | 3 files |
| Phase 05 P01 | 91s | 2 tasks | 7 files |
| Phase 05 P02 | 3min | 2 tasks | 7 files |
| Phase 06 P01 | 5min | 2 tasks | 5 files |
| Phase 06 P02 | ~8min | 2 tasks | 5 files |
| Phase 06 P03 | 2min | 2 tasks | 5 files |
| Phase 07 P01 | 199s | 2 tasks | 6 files |
| Phase 07 P02 | 150s | 1 tasks | 2 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Init]: Stack confirmed — Next.js 16 + Dexie.js (IndexedDB) + Zustand + Claude Haiku 4.5 via Vercel AI SDK
- [Init]: Rules compile once at save time (LLM); generation is synchronous and LLM-free — this is an architectural gate
- [Init]: Meal data model is compositional (Base + Curry + Subzi + Extras), not flat name strings — tags required from day one
- [Phase 01-data-foundation]: Single components table with componentType discriminator (not separate tables per type)
- [Phase 01-data-foundation]: String literal unions for all tag enumerations (not TypeScript enums) for clean JSON serialization and Zod compatibility
- [Phase 01-data-foundation]: UserPreferences uses fixed string primary key 'prefs' for singleton pattern in Dexie
- [Phase 01-data-foundation]: No React in service layer — pure async TypeScript functions in food-db.ts callable from any context
- [Phase 01-data-foundation]: getExtrasByBaseType uses in-memory filter after Dexie query for array-contains semantics
- [Phase 01-data-foundation]: addMeal and deleteMeal wrapped in db.transaction('rw') for atomicity
- [Phase 02-meal-library-ui]: seed.tsx extension required (not .ts) — JSX fragment syntax requires .tsx for OXC/Vite transform
- [Phase 02-meal-library-ui]: Poori seeded individually via db.components.add() before bulkAdd to capture auto-assigned numeric ID for component_slot_overrides
- [Phase 02-meal-library-ui]: Dynamic import() in runSeed keeps seed-data.ts out of main bundle — loaded only on first launch
- [Phase 02-meal-library-ui P02]: filterComponents uses .every() for AND logic — all active chips must match for a component to appear
- [Phase 02-meal-library-ui P02]: Per-tab state isolation — each ComponentTab owns its own useState so switching tabs never resets sibling tab filters
- [Phase 02-meal-library-ui P02]: TooltipProvider instantiated per-row inside ComponentRow to avoid context sharing issues
- [Phase 02-meal-library-ui P03]: SlotSettings reads allComponents via useLiveQuery internally so ComponentExceptions gets a live list without prop-drilling through page.tsx
- [Phase 02-meal-library-ui P03]: Save builds full merged UserPreferencesRecord to avoid overwriting extra_quantity_limits and base_type_rules
- [Phase 02-meal-library-ui P03]: ComponentExceptions collapsed by default — Poori override visible only after expand
- [Phase 03-01]: CompiledFilter stored as typed Zod discriminated union (not raw JSON/unknown) — compile-time safety for all rule variants
- [Phase 03-01]: rules table in Dexie v2 uses ++id only (dropped is_active index) — enabled field filtered in-memory since <50 rows
- [Phase 03-01]: Frequency field optional on ComponentRecord with no Dexie index — generator reads frequency ?? 'normal' as safe fallback
- [Phase 03-01]: db.version(2) upgrade migrates is_active->enabled and text->name for any existing rule rows
- [Phase 03-02]: compileRule() is a pure structural mapping — ruleType becomes type, optional slots becomes null, within: 'week' hardcoded for v1
- [Phase 03-plan-generator-rule-engine]: NoRepeatRule when pool exhausted skips component rather than falling back to repeats — ensures no-repeat semantics are honored
- [Phase 03-plan-generator-rule-engine]: Frequency statistical test uses 10 components per tier (not 2) to avoid recency halving masking the frequency signal in a 21-slot generation
- [Phase 04-01]: ActivePlanRecord uses singleton key 'current' (matches UserPreferencesRecord 'prefs' pattern)
- [Phase 04-01]: GenerateOptions lockedSlots injects locked components directly — locked/unlocked paths are fully independent
- [Phase 04-01]: Zustand store mutations call saveActivePlan fire-and-forget — keeps UI responsive, write failures are non-critical
- [Phase 04-plan-board-ui]: Per-file happy-dom environment via vitest docblock (environmentMatchPatterns not supported in vitest 4)
- [Phase 04-plan-board-ui]: Fragment key pattern for mapped grid rows to avoid React missing-key warnings in CSS grid
- [Phase 04-plan-board-ui]: afterEach(cleanup) explicit in happy-dom component tests — no auto-cleanup unlike jsdom
- [Phase 04-plan-board-ui]: pickerState wired in PlanBoard with null sentinel — MealPickerSheet Sheet to be added in Plan 03
- [Phase 04]: MealPickerSheet uses 'extras' -> 'extra' ComponentType mapping so LockableComponent key matches Dexie query param
- [Phase 04]: currentBaseType IIFE in PlanBoard avoids extra state - reads live from componentsMap
- [Phase 05-01]: describeRule is a pure function - no state, no hooks, safe to call in render
- [Phase 05-01]: RuleList returns null (not spinner) while useLiveQuery loads - per UI-SPEC
- [Phase 05]: Shared types.ts extracted for FormState/FormAction to avoid circular imports between RuleForm and field components
- [Phase 05]: RuleImpactPreview uses useMemo for synchronous impact computation from live useLiveQuery component pool
- [Phase 06]: Upsert via where('week_start').first() + update/add pattern for secondary-key upsert in Dexie v4 (not put() which would require week_start as PK)
- [Phase 06]: Write-through on saveWeekPlan for current week keeps active_plan in sync with saved_plans without double-read at load time (D-03, D-09)
- [Phase 06]: UTC-based date construction in week-utils eliminates timezone-induced off-by-one errors in ISO week calculations
- [Phase 06]: Replace saveActivePlan with saveWeekPlan in all mutations — single call performs write-through to active_plan for current week
- [Phase 06]: navigateToWeek loads from active_plan for current week and from saved_plans for all others — fast hydration path for the common case (D-09)
- [Phase 06]: isReadOnly derived from weekStart < thisWeek in navigateToWeek and stored in Zustand — components read it directly without recomputing
- [Phase 06]: No export const runtime = 'edge' on route handler — @resvg/resvg-js requires Node.js runtime (napi-rs native bindings)
- [Phase 06]: Component names passed in from PlanActionBar via useLiveQuery to exportPlan — store does not directly access IndexedDB component names
- [v1.1 Roadmap]: Collapse day-filter + require-component into scheduling-rule — Phases 7-8 (engine first, then UI + migration)
- [v1.1 Roadmap]: Move slot settings into meal-template rules — Phases 9-10 (engine first, then UI + cleanup + migration)
- [Phase 07]: scheduling-rule CompiledFilter uses nullable days/slots — undefined from RuleDefinition converts to null at compile time, consistent with existing variants
- [Phase 07]: SchedulingRuleFormState.match uses mode:''/mode:'tag'/mode:'component' discriminated union — empty string sentinel matches NoRepeatFormState pattern
- [Phase 07]: SET_EFFECT and SET_MATCH_MODE FormActions added to types.ts for Phase 8 UI without requiring form reducer redesign
- [Phase 07]: applicableSchedulingRules extracted once per (day, slot) before all component selection paths — avoids repeated filtering and keeps order consistent
- [Phase 07]: scheduling-rule filter-pool and exclude applied AFTER no-repeat and day-filter — scheduling-rule is the outermost soft constraint layer

### Pending Todos

(none — roadmap created, ready to plan Phase 7)

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260321-amx | Enable day of the week in the occasion tag | 2026-03-21 | 671913f | [260321-amx-enable-day-of-the-week-in-the-occasion-t](./quick/260321-amx-enable-day-of-the-week-in-the-occasion-t/) |

### Blockers/Concerns

(none at roadmap stage)

## Session Continuity

Last session: 2026-03-22T16:28:19.990Z
Stopped at: Completed 07-02-PLAN.md
Resume file: None
