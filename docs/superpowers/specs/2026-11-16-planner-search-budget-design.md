# Planner Search Budget

First of four planner generalisation projects (order: search budget, rule levels, repair loop, user-defined meal
parts). From the planner review of 2026-11-14.

## Why

The app and the tests run different searches. `planFromData` (`src/services/plan-generation.ts`) calls `planWeek` with the
solver defaults: stop after 300 ms (`timeLimitMs`), at most 200 000 iterations, plateau 3000. The rule-case library
(`src/rule-cases/run.ts`) runs `{ timeLimitMs: Infinity, maxIterations: 20_000, plateauIterations: 3000 }`. On a slow or
throttled machine (Low Power Mode, battery) the app may do far fewer iterations than the cases prove behaviour at, so a
rule that passes its case can still fail in the plan the user sees. The same seed can also give different weeks on
different machines.

## What the user decided

- The budget scales with the library: more dishes, more search.
- (Agreed with the proposal) The search is measured in steps, not time.

## Goals

- The app searches a number of iterations computed from the model, not a wall-clock time. The same library, rules,
  pins and seed give the same week on any machine.
- The budget grows with the number of dishes. It may also grow with the number of compiled constraints, pairs in
  particular (my call; each pair adds work per move).
- The rule-case library uses the same budget function, so a passing case means the app behaves the same.
- A wall-clock safety cap (10 s, my call) stops a search that runs too long on a very slow machine. The best week found
  so far is shown, with a short note on the plan board that the search stopped early. Only then may the result differ
  between machines.
- Every place that plans uses the one function: generate and regenerate, picking a base on a meal (`pinsForMeal`), the
  draft check and "Preview on this week" (`compareRuleSets`).

## Non-goals

- Making the search faster. Speed-ups are welcome but not this project.
- Changing what any rule means.

## Anti-goals

- A budget so large that Generate on the seeded library takes noticeably longer than today on a normal machine
  (today: about 0.3 s). Target: the seeded library on a normal machine stays under about 1 s.
- Tests that pass only because they run a bigger search than the app.

## Constraints

- Planner stays deterministic for a seed (CLAUDE.md). A bound changed needs a test for both sides of it (CLAUDE.md).
- Planning runs in the Web Worker already; the UI keeps showing "Generating..." while it runs.

## How (decided)

- A pure function in `src/planner`, e.g. `searchBudget(model) -> { maxIterations, plateauIterations }`, used by
  `planWeek` when the caller gives no budget.
- Before picking the formula, measure: for each rule case, the fewest iterations at which it passes on all 8 seeds, against
  its library size and constraint count. The formula must cover every case with margin (my call: at least 1.5x the
  largest need at that size).
- `timeLimitMs` becomes the safety cap only (default 10 000). `SolveResult.stopReason === 'time'` is surfaced to the plan
  store, which shows the note.

## Settled after the builder check (my calls)

- **Fitted to both libraries.** Measure the rule cases (their test library) and the seeded library with its default rules
  plus a few representative links. For the seeded library, measure iterations until the plateau stop. The formula's
  growth shape comes from both sets of measurements, not from extrapolating the small library.
- **If the 1.5x margin and the 1 s target cannot both hold,** stop and report the numbers before choosing. That trade-off
  is the user's.
- **The plateau stop stays a valid stop.** It is step-based, so it is the same on any machine. Plateau stays 3000 unless
  measurements say otherwise.
- **The budget function replaces the rule cases' fixed 20 000.** Existing case outcomes, including the
  "fails without its subject" checks, should not change. Any that do are investigated, not re-expected.
- **`planWeek` computes the budget from the compiled model** when the caller passes none. App callers stop passing
  budgets. Only tests that deliberately pin a budget keep one.
- **The "stopped early" note** shows after Generate or Regenerate only. It is not stored with the plan. The meal picker and
  the preview ignore it.

## Left to the builder

- The exact formula and its constants, from the measurements.
- Whether plateau scales with the budget.
- Wording and placement of the "stopped early" note (it uses existing plan-board notice styling).

## Acceptance

- `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run rule-cases` pass, with the rule cases using `searchBudget`.
- A test shows the same seed gives the same week whatever the time limit, as long as the cap is not reached.
- A test shows the cap stops the search and reports `time`.
- The measurements table is recorded in the plan or the PR.
