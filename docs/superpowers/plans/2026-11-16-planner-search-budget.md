# Planner Search Budget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app searches a number of steps computed from the library and rules, not 0.3 s, with the rule cases using the
same budget, and a 10 s safety cap that shows a note when reached.

**Architecture:** A pure `searchBudget(model)` in `src/planner/budget.ts` gives `{ maxIterations, plateauIterations }`.
`solve` uses it when the caller passes no iteration budget, and `timeLimitMs` becomes a 10 000 ms safety cap. The stop
reason travels from `planWeek` through `planFromData` to the plan store, which shows a note after Generate or Regenerate.
Constants come from measurements taken in Task 1.

**Tech Stack:** TypeScript, Vitest, Zustand, React (Next.js client).

**Spec:** `docs/superpowers/specs/2026-11-16-planner-search-budget-design.md`

## Global Constraints

- Same library, rules, pins and seed give the same week on any machine unless the safety cap is reached.
- Safety cap: 10 s (`timeLimitMs` default 10 000).
- Budget formula must cover every rule case's measured need with at least 1.5x margin, and the seeded library's
  iterations-to-plateau with the same margin.
- Seeded library on a normal machine: Generate stays under about 1 s. If the 1.5x margin and 1 s cannot both hold, STOP
  and report the numbers to the user; do not pick.
- Plateau stop stays (3000 unless measurements say otherwise).
- The rule cases use `searchBudget`; their outcomes, including "fails without its subject", must not change. A case that
  changes is investigated, never re-expected.
- The "stopped early" note shows after Generate or Regenerate only, is not stored, and the meal picker and previews ignore it.
- CLAUDE.md: deterministic planner; a changed bound gets a test for both sides; commits `type(scope): …` with scopes from
  CLAUDE.md; done = `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run rule-cases` pass.

## Review Focus

1. A tiny library (0–3 dishes): the budget must still let the search run and stop cleanly (Task 2 test).
2. A very large library (500 dishes): the budget is clamped so Generate stays bounded (Task 2 test).
3. The cap reached mid-search: the best week so far is returned, `stopReason` is `time`, and the note shows (Tasks 3, 4).
4. A Regenerate that finishes normally after a capped one clears the note (Task 4 test).
5. Picking a base on a meal (`replanMeal`) never shows or clears the note (Task 4 test).

---

### Task 1: Measure what the search needs

**Files:**
- Modify: `src/rule-cases/run.ts` (optional budget argument)
- Create: `src/rule-cases/measure-budget.test.ts` (skipped unless `MEASURE_BUDGET=1`)
- Create: `docs/superpowers/plans/2026-11-16-planner-search-budget-measurements.md` (results)

**Interfaces:**
- Produces: `runPlanCase(c: PlanCase, budget?: CaseBudget): CaseResult` and
  `failsWithoutSubject(c: PlanCase, budget?: CaseBudget)`, where
  `type CaseBudget = Pick<SolveOptions, 'maxIterations' | 'plateauIterations' | 'timeLimitMs'>`; the default stays today's
  `BUDGET` until Task 3.

- [ ] **Step 1:** Add the optional `budget` argument to `planWeeks`, `runPlanCase` and `failsWithoutSubject` in
  `src/rule-cases/run.ts`, defaulting to the existing `BUDGET`. Run `npx vitest run src/rule-cases` — PASS, unchanged.
- [ ] **Step 2:** Write `measure-budget.test.ts` under `describe.skipIf(!process.env.MEASURE_BUDGET)`:
  - For every plan case in `ALL_CASES`, find the smallest `maxIterations` in `[500, 1000, 2000, 4000, 8000, 16000, 32000,
    64000]` (plateau 3000, `timeLimitMs: Infinity`) at which `runPlanCase` passes and `failsWithoutSubject` still fails.
    Record: case id, dish count, constraint count, pair count, need, and the largest `stats.iterations` used at that budget.
  - For the seeded library (build it as `src/planner/scenarios.test.ts` does, ids from 100), compile `defaultRules()` with
    `compileRules`, plus three `comes_with` links built with `linkRule` (Rice → Sambar curry, Rice → Papad when the curry is
    Sambar, Idli → Coconut Chutney). Run seeds 1–8 at `maxIterations: 200_000`, plateau 3000; record iterations at the
    plateau stop and ms per iteration.
  - Print one markdown table per set.
- [ ] **Step 3:** Run `MEASURE_BUDGET=1 npx vitest run src/rule-cases/measure-budget.test.ts --silent=false` on AC power
  with Low Power Mode off. Save both tables, the machine and the date into the measurements file.
- [ ] **Step 4:** From the tables, choose `searchBudget`'s formula and constants (shape:
  `clamp(BASE + PER_DISH * dishes + PER_PAIR * pairs, MIN, MAX)`, unless the data clearly needs another shape). Write the
  formula, the margin check against every row, and the projected Generate time for the seeded library into the
  measurements file. If 1.5x margin and ~1 s cannot both hold, STOP and report.
- [ ] **Step 5:** Commit:
  `git commit -m "test(rule-cases): measure how many search steps each case and the seeded library need"`

### Task 2: `searchBudget`

**Files:**
- Create: `src/planner/budget.ts`, `src/planner/budget.test.ts`
- Modify: `src/planner/index.ts` (export)

**Interfaces:**
- Consumes: `CompiledModel` (`m.library`, `m.constraints`) from `src/planner/scorer.ts`.
- Produces: `export interface SearchBudget { maxIterations: number; plateauIterations: number }` and
  `export function searchBudget(m: CompiledModel): SearchBudget`, constants exported (`BUDGET_MIN`, `BUDGET_MAX`, …).

- [ ] **Step 1: Failing tests** in `budget.test.ts` (models built with `buildModel`):
  - `grows with the library`: a 40-dish model's `maxIterations` < a 120-dish model's.
  - `grows with pairs`: same library, 0 vs 5 pair constraints: strictly more with pairs.
  - `has a floor`: an empty library gives `maxIterations === BUDGET_MIN` and `BUDGET_MIN >= plateauIterations`.
  - `has a ceiling`: a 500-dish library gives `maxIterations === BUDGET_MAX`.
  - `covers the measured needs`: for each row of the measurements (copied into the test as a `const NEEDS` table of
    `{ dishes, pairs, need }`), `searchBudget` of a model of that size is `>= 1.5 * need`.
- [ ] **Step 2:** `npx vitest run src/planner/budget.test.ts` — FAIL (module not found).
- [ ] **Step 3:** Implement with the Task 1 constants. Pairs are `m.constraints` with `kind === 'pair'`.
- [ ] **Step 4:** Run again — PASS.
- [ ] **Step 5:** Commit: `feat(planner): the search budget grows with the library and its links`

### Task 3: The solver uses the budget; time is only a safety cap

**Files:**
- Modify: `src/planner/solver.ts:10-25,169-171` (defaults), `src/rule-cases/run.ts` (default budget)
- Test: `src/planner/solver.test.ts`

**Interfaces:**
- Consumes: `searchBudget` (Task 2).
- Produces: `SolveOptions` defaults: `maxIterations`/`plateauIterations` from `searchBudget(m)` when absent;
  `timeLimitMs` default `SAFETY_CAP_MS = 10_000` (exported). `SolveResult.stats.stopReason` unchanged in type.

- [ ] **Step 1: Failing tests** in `solver.test.ts`:
  - `uses the search budget by default`: `solve(m, { seed: 1 }).stats.iterations <= searchBudget(m).maxIterations`, and
    with a plateau that cannot be reached (a model with an unsatisfiable soft rule) equals it.
  - `same week whatever the time limit`: `solve(m, { seed: 3 })` and `solve(m, { seed: 3, timeLimitMs: 60_000 })` give
    equal plans and equal `stats.iterations`.
  - `the cap stops the search` (both sides of the bound): `timeLimitMs: 0` gives `stopReason === 'time'`; the default gives
    a stop reason other than `time` on the test library.
- [ ] **Step 2:** Run `npx vitest run src/planner/solver.test.ts` — the new tests FAIL.
- [ ] **Step 3:** In `solve`, read `searchBudget(m)` once when `maxIterations` or `plateauIterations` is absent; default
  `timeLimitMs` to `SAFETY_CAP_MS`. Update the `SolveOptions` doc comments. In `src/rule-cases/run.ts`, the default budget
  becomes `{ timeLimitMs: Infinity }` (iterations from `searchBudget`). Leave `scenarios.test.ts`'s pinned budget as is.
- [ ] **Step 4:** Run `npx vitest run src/planner` then `npm run rule-cases` — PASS, and every case's status is the same as
  before this task (compare `rule-cases-report.html` summary counts; 91/91 pass). Investigate any change; do not re-expect.
- [ ] **Step 5:** Commit: `feat(planner): the search stops after a set number of steps, with time only as a safety cap`

### Task 4: "Stopped early" note after Generate or Regenerate

**Files:**
- Modify: `src/services/plan-generation.ts` (`PlanningOutcome`, `planFromData`), `src/stores/plan-store.ts`
  (`stoppedEarly` state, `applyOutcome`), `src/components/plan/PlanProblemsBanner.tsx` (note)
- Test: `src/services/plan-generation.test.ts`, `src/stores/plan-store.test.ts`, `src/components/plan/PlanBoard.test.tsx`

**Interfaces:**
- Consumes: `PlanResult.stats.stopReason` (already returned by `planWeek`).
- Produces: `PlanningOutcome.stoppedEarly: boolean` (`stopReason === 'time'`); plan store field `stoppedEarly: boolean`,
  set only by `applyOutcome` (Generate/Regenerate), reset to `false` on week navigation.

- [ ] **Step 1: Failing tests:**
  - `planFromData` with `timeLimitMs` forced to 0 (add `timeLimitMs?: number` to `PlanningOptions`, tests only) gives
    `stoppedEarly: true`; default gives `false`.
  - Store: Generate with an outcome `{ …, stoppedEarly: true }` sets `stoppedEarly`; a following Regenerate with `false`
    clears it; `replanMeal` (pick a base) with `stoppedEarly: true` leaves it `false`; `navigateToWeek` resets it.
  - Board: with `stoppedEarly` true the text "Planning took too long on this device, so this is the best week found in
    10 seconds. Regenerate to try again." is shown; with false it is not.
- [ ] **Step 2:** Run those three files — FAIL.
- [ ] **Step 3:** Implement. Mocks in existing tests that build `PlanningOutcome` gain `stoppedEarly: false`.
- [ ] **Step 4:** Run `npm test` — PASS.
- [ ] **Step 5:** Commit: `feat(plan): a week cut short by the safety cap says so`

### Task 5: Docs and full check

**Files:**
- Modify: `docs/architecture.md` (planner section: budget, cap, note), the measurements file (final Generate time)

- [ ] **Step 1:** Update `docs/architecture.md`: the search runs `searchBudget` steps (formula in one line), time is a 10 s
  safety cap, the note, and that rule cases use the same budget.
- [ ] **Step 2:** Time Generate for the seeded library in the measurements test (`MEASURE_BUDGET=1`), seeds 1–8, record
  median and max in the measurements file. Must be under about 1 s median; otherwise STOP and report.
- [ ] **Step 3:** Run `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run rule-cases` — all pass.
- [ ] **Step 4:** Commit: `docs(planner): the search budget and its safety cap`
