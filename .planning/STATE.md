---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Edit Rule
status: verifying
stopped_at: Completed 15-01-PLAN.md
last_updated: "2026-03-28T19:23:07.596Z"
last_activity: 2026-03-28
progress:
  total_phases: 6
  completed_phases: 5
  total_plans: 11
  completed_plans: 11
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-27 — v1.2 started)

**Core value:** Generate a complete, realistic Indian weekly meal plan in one click — with smart randomization that respects personal rules and locked meals.
**Current focus:** v1.2 debt cleanup — Phase 16 planning next

## Current Position

Phase: 16 (remove-category-id-preset-coupling-and-add-planboard-mealpicker-integration-coverage) — NOT STARTED
Plan: 0 of 0
Status: Phase 15 complete — ready for verification
Last activity: 2026-03-28

## Performance Metrics

**Velocity:**

- Total plans completed: 6
- Average duration: 6min
- Total execution time: 0.45 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 11-edit-rule | 2 | 16min | 8min |
| 12-require-extra-explicitly-instead-of-excluding-extra-categories-by-default | 3 | 11min | 4min |
| 13-only-include-extras-when-explicitly-required | 1 | 3min | 3min |

**Recent Trend:**

- Last 5 plans: 11-edit-rule P02 (11min), 12-require-extra P01 (3min), 12-require-extra P02 (3min), 12-require-extra P03 (5min), 13-only-include-extras P01 (3min)
- Trend: steady

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
| Phase 07 P03 | 159s | 1 tasks | 2 files |
| Phase 08 P01 | 6min | 3 tasks | 12 files |
| Phase 08 P02 | 4min | 2 tasks | 8 files |
| Phase 09 P01 | 165s | 2 tasks | 6 files |
| Phase 09-meal-template-engine P02 | 31min | 2 tasks | 2 files |
| Phase 10 P02 | 79s | 2 tasks | 2 files |
| Phase 10-meal-template-ui-settings-removal-migration P01 | ~15min | 2 tasks | 10 files |
| Phase 11-edit-rule P01 | 5min | 2 tasks | 6 files |
| Phase 11-edit-rule P02 | 11min | 2 tasks | 10 files |
| Phase 12-require-extra P01 | 3min | 2 tasks | 6 files |
| Phase 12-require-extra P02 | 3min | 2 tasks | 6 files |
| Phase 12-require-extra P03 | 5min | 2 tasks | 4 files |
| Phase 14-add-option-to-create-more-base-category-and-extra-category P01 | 10min | 2 tasks | 9 files |
| Phase 14 P02 | 7min | 2 tasks | 6 files |
| Phase 14-add-option-to-create-more-base-category-and-extra-category P03 | 1h49m | 2 tasks | 15 files |
| Phase 14 P04 | 8min | 2 tasks | 11 files |
| Phase 15-finalize-phase-11-validation-coverage P01 | 82s | 2 tasks | 2 files |

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
- [Phase 07]: applyRequireOneByTag uses uniform Math.random (not weightedRandom) for override pick — explicit requirement
- [Phase 07]: TypeScript discriminated union narrowing requires local const capture (tagMatch) before accessing .filter on rule.match
- [Phase 07]: require-one pass-2 applied inside picked guard block — only runs when a component was normally selected
- [Phase 08]: migrateCompiledFilter exported as pure function for independent unit testing — avoids Dexie upgrade callback complexity
- [Phase 08]: day-filter -> scheduling-rule(filter-pool + tag match), require-component -> scheduling-rule(require-one + component match) in Dexie v5 migration
- [Phase 08]: FormState union trimmed to 3 variants: EmptyFormState + NoRepeatFormState + SchedulingRuleFormState; day-filter and require-component removed from form layer
- [Phase 08]: SET_SCHEDULING_TAG_FILTER and SET_SCHEDULING_COMPONENT_ID added to FormAction for scheduling-rule-specific sub-state updates without redesigning reducer
- [Phase 09]: ExtraCategory imported into plan.ts for RuleDefinition meal-template variant
- [Phase 09]: Dexie v6 has no upgrade() callback — meal-template rules stored as JSON transparently
- [Phase 09]: ruleTypeLabel in RuleRow.tsx changed from ternary to Record<string,string> map to support 3+ rule types
- [Phase 09-meal-template-engine]: mealTemplateRules extracted once per generateWeekPlan; applicableTemplates computed per slot after base selection — base type must be known to look up applicable templates
- [Phase 09-meal-template-engine]: D-05/D-06 branch pattern used identically for slot assignment and required extras: if (templatesForBase.length > 0) { template logic } else { prefs fallback }
- [Phase 09-meal-template-engine]: Locked components bypass all meal-template soft constraints — locked curry/subzi checked before skipCurry/skipSubzi guards
- [Phase 10]: Dexie v7 upgrade uses async callback to allow component name lookup for friendlier rule names
- [Phase 10]: Seed uses db.rules.bulkAdd directly to avoid circular import from service layer
- [Phase 10-meal-template-ui-settings-removal-migration]: MealTemplateFormState follows flat pattern of SchedulingRuleFormState — no nested discriminated union needed
- [Phase 10-meal-template-ui-settings-removal-migration]: Toggle (shadcn) used for allowed_slots chip group per UI-SPEC; installed as it was absent
- [v1.2 Roadmap]: All 4 edit-rule requirements are tightly coupled (UI entry point, pre-population, save, cancel) — collapsed into single Phase 11
- [Phase 11]: compileRule and decompileRule now form a reversible service-layer pair for persisted rule rehydration.
- [Phase 11]: Mounted a single app-level Toaster in layout so rule save failures surface globally.
- [Phase 11]: EditRuleSheet reseeds reducer state from the persisted rule on every open, so close and discard never keep abandoned drafts.
- [Phase 11]: Used a file-based local sonner shim because registry install was blocked in the execution environment.
- [Phase 12]: Meal-template rule editing is now require-or-none for extras; the form no longer exposes exclude-extra controls.
- [Phase 12]: Dexie v10 strips legacy compiled `exclude_extra` effects so old rule rows normalize on upgrade and on edit round-trips.
- [Phase 12]: Runtime effect schema and generator now treat `require_extra` as the only extra-specific rule effect, so extra warnings only fire for unsatisfied explicit requirements.
- [Phase 13]: Unlocked slots now generate no extras by default; only explicit `require_extra` rules can add extras, while locked `extra_ids` still pass through unchanged.
- [Phase 14-add-option-to-create-more-base-category-and-extra-category]: Wave 1 keeps legacy base_type and extra_category fields alongside canonical category IDs so downstream plans can migrate incrementally.
- [Phase 14]: Mounted a single sheet-based CategoryManager from the Library header so category CRUD stays separate from ComponentForm.
- [Phase 14]: Library forms now persist canonical category IDs and resolve labels from live Dexie queries, with legacy string fields only preserved for built-in labels.
- [Phase 14-add-option-to-create-more-base-category-and-extra-category]: Stored rules use base_category/category_id in persistence while form state keeps base_category_id for explicit UI semantics.
- [Phase 14-add-option-to-create-more-base-category-and-extra-category]: Rule descriptions and edit rehydration resolve category labels from live Dexie records so rename/delete safety stays in the display layer.
- [Phase 14]: Generator and picker now use category IDs as the primary compatibility key, with legacy string fields kept only as defensive fallback data.
- [Phase 14]: Seed fixtures stay human-readable in seed-data.ts and are materialized into category-backed component records during runSeed().
- [Phase 15-finalize-phase-11-validation-coverage]: Kept Phase 15 strictly documentation-and-evidence scoped: only the Phase 11 validation artifact changed.
- [Phase 15-finalize-phase-11-validation-coverage]: Used the actual focused Vitest reruns plus full npm test results as the approval basis instead of relying only on historical summaries.

### Roadmap Evolution

- Phase 12 completed: Require extra explicitly instead of excluding extra categories by default
- Phase 13 added: Only include extras when explicitly required
- Phase 13 completed: Only include extras when explicitly required
- Phase 14 added: Add option to create more base category and extra category
- Phase 14 completed: Add option to create more base category and extra category
- Phase 15 added: Finalize Phase 11 validation coverage
- Phase 16 added: Remove category ID preset coupling and add PlanBoard/MealPicker integration coverage

### Pending Todos

- Plan Phase 16 from the remaining v1.2 milestone audit debt

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260321-amx | Enable day of the week in the occasion tag | 2026-03-21 | 671913f | [260321-amx-enable-day-of-the-week-in-the-occasion-t](./quick/260321-amx-enable-day-of-the-week-in-the-occasion-t/) |
| 260326-w99 | Meal template flexible selector (Base/Tag/Component) | 2026-03-26 | 99efa8f | [260326-w99-meal-template-flexible-selector-base-tag](./quick/260326-w99-meal-template-flexible-selector-base-tag/) |

### Blockers/Concerns

(none at roadmap stage)

## Session Continuity

Last session: 2026-03-28T19:23:07.593Z
Stopped at: Completed 15-01-PLAN.md
Resume file: None
