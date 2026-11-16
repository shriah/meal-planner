# Planner Repair Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the five passes after the search (final descent, re-pick, sweep, polish, retry) with one bounded
repair loop of move kinds, written over a single list of meal parts, with no change in behaviour.

**Architecture:** First pin today's output with snapshot tests. Then extract each pass into a move kind with its own
acceptance rule (output identical). Then run the move kinds in rounds until a round keeps nothing or `REPAIR_ROUNDS` is
reached. Finally make the move kinds read parts from one `PARTS` list instead of naming base, curry and subzi.

**Tech Stack:** TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-16-planner-repair-loop-design.md`

**Depends on:** the search budget plan (rule cases run at `searchBudget`) and the rule levels plan, both merged first.

## Global Constraints

- All rule cases pass with expectations unchanged.
- Exact-plan tests (`solver.test.ts`, `scenarios.test.ts`) may be updated only where the chosen week changes and every
  rule case still holds; each update is listed with why in the PR.
- A round runs the move kinds in a fixed order, each over all meals in order (meals 0–20, roles in `PARTS` order,
  candidates in library order).
- `REPAIR_ROUNDS = 10` (today's `DESCENT_PASSES`), not bounded by the time limit. Changed only for a measured need, with
  tests on both sides.
- Each move kind keeps today's acceptance rule: descent and polish keep a change only if it strictly improves the search
  score (`evaluate`); re-pick and retry keep a change unless it is worse; sweep keeps a removal only if it lowers the
  normal score's hard count (`score(m, plan).hard`).
- A move kind that keeps changes which do not improve (re-pick, retry) remembers, across rounds, what it already tried
  (re-pick: its `picked` keys per meal; retry: meals it already retried), so rounds cannot cycle.
- If no order keeps every case passing: a move kind may be split or given a precondition. If a pass still cannot join,
  it stays a separate step after the loop with the reason in a comment.
- Pins and locks keep today's meaning (`isFree`, unit members, `lockNudge`).
- Speed: seeded library, seeds 1–8, at `searchBudget`, median of 5 runs, no more than 10% slower than the branch just
  before Task 3.
- CLAUDE.md conventions.

## Review Focus

1. A week where the second repair round finds an improvement the first could not (bound tested on both sides, Task 3).
2. A fully locked meal: no move kind touches it (Task 2 test).
3. A plan with no conditional links (`hasConditional` false): sweep and retry do nothing, weeks unchanged (Task 1 set (c)).
4. Re-pick keeping a not-worse change every round: the loop still ends before `REPAIR_ROUNDS` (Task 3 test).
5. Extras as a list part: removing one extra leaves the others in order (Task 4 test).

---

### Task 1: Pin today's output

**Files:**
- Create: `src/planner/repair.snapshot.test.ts`

- [ ] **Step 1:** Write a test that plans, at `searchBudget`, (a) the seeded library (built as in `scenarios.test.ts`) with
  `defaultRules()` compiled plus the three links used in the search-budget measurements (Rice → Sambar; Rice → Papad when
  the curry is Sambar; Idli → Coconut Chutney), seeds 1–8; (b) the test library of `src/rule-cases/library.ts` with the
  rules of rule cases `when-curry-brings`, `when-curry-retried-after-polish`, `when-curry-lock-nudge`,
  `limit-ranks-a-links-dishes`, seeds 1–8; (c) the seeded library with `defaultRules()` only (no conditional link), seeds
  1–8. `expect(weeks).toMatchSnapshot()` per set.
- [ ] **Step 2:** Run `npx vitest run src/planner/repair.snapshot.test.ts` — writes the snapshot. Run again — PASS.
- [ ] **Step 3:** Commit: `test(planner): pin the weeks the planner gives today before reworking its clean-up`

### Task 2: Each pass becomes a move kind (no behaviour change)

**Files:**
- Modify: `src/planner/solver.ts:590-741`
- Test: `src/planner/solver.test.ts`

**Interfaces:**
- Produces (inside `solve`): `type Accept = 'better' | 'notWorse' | 'fewerHard'`;
  `interface MoveKind { name: 'descent' | 'repick' | 'sweep' | 'polish' | 'retry'; accept: Accept; on: 'plan' | 'best'; runMeal(i: number): boolean }`
  — `runMeal` tries the kind's changes in meal `i`, keeps those its `accept` allows, and returns whether any was kept;
  `on` says whether it works on `plan` (descent, re-pick, sweep, retry) or `bestPlan` (polish), as today.

- [ ] **Step 1: Failing tests** in `solver.test.ts`:
  - `a locked meal is left alone`: pins on every role of meal 0; after `solve`, meal 0 equals the pins.
  (No-conditional-link weeks are pinned by snapshot set (c) from Task 1.)
- [ ] **Step 2:** Move each pass's body into a `MoveKind`, called in today's order and today's count (descent up to
  `DESCENT_PASSES` passes, then re-pick, sweep, polish, retry, once each).
- [ ] **Step 3:** Run `npx vitest run src/planner` — PASS, including the Task 1 snapshot unchanged. Run
  `npm run rule-cases` — 91/91.
- [ ] **Step 4:** Commit: `refactor(planner): each clean-up pass after the search is a move kind`

### Task 3: One repair loop

**Files:**
- Modify: `src/planner/solver.ts` (`DESCENT_PASSES` → `REPAIR_ROUNDS`, loop), `src/planner/solver.test.ts:423-520`
  (descent tests become repair tests)

**Interfaces:**
- Produces: `export const REPAIR_ROUNDS = 10` and `SolveOptions.repairRounds?: number` (tests only, default
  `REPAIR_ROUNDS`); `function repair(kinds: readonly MoveKind[], rounds: number): void`.

- [ ] **Step 1: Failing tests:**
  - `a second round can improve`: find (search seeds 1–50 on the Task 1 set (a)) a seed where `repairRounds: 1` gives a
    worse score than `repairRounds: 2`; assert that. If no seed exists, build a model where a polish removal enables a
    descent change. (Lower side of the bound.)
  - `rounds stop when nothing is kept`: with the default, `stats.repairRounds` (new stat) is below `REPAIR_ROUNDS` on the
    Task 1 sets. (Upper side.)
  - `runs in full after the time limit`: adapt the existing descent test (line 506) to the loop.
  - `re-pick does not cycle`: on `limit-ranks-a-links-dishes`'s rules, `stats.repairRounds < REPAIR_ROUNDS`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement `repair`: per round, for each kind in order, for each meal in order, `runMeal`; stop after a
  round with nothing kept. Keep `bestPlan`/`plan` syncing as the passes did (restore `plan` from `bestPlan` before a
  `plan` kind that follows `polish`). Add `stats.repairRounds`.
- [ ] **Step 4:** Run `npm run rule-cases` — 91/91 with no expectation edited. Run the Task 1 snapshot; if it changed,
  review each changed week (score must be equal or better), then update the snapshot and record the list for the PR.
  If a case fails under every move-kind order, apply the split/precondition rule from Global Constraints.
- [ ] **Step 5:** Commit: `refactor(planner): one repair loop replaces the clean-up passes after the search`

### Task 4: Move kinds read one list of parts

**Files:**
- Modify: `src/planner/types.ts` (`PARTS`), `src/planner/solver.ts` (move kinds, `PICK_ROLES`, `PIN_KEY`, `free`)
- Test: `src/planner/types.test.ts` (create or extend), `src/planner/solver.test.ts`

**Interfaces:**
- Produces in `types.ts`: `export interface PartDef { role: Role; many: boolean; pin: keyof SlotPins }`,
  `export const PARTS: readonly PartDef[]` = base (one), curry (one), subzi (one), extra (many); helpers
  `dishesIn(s: SlotState, p: PartDef): number[]`, `withDish(s, p, id): void`, `withoutDish(s, p, id): void`.

- [ ] **Step 1: Failing tests** for the helpers: `withoutDish` on extras `[4, 7, 9]` removing 7 gives `[4, 9]` (Review
  Focus 5); `withDish` on a `many: false` part replaces; `dishesIn` of an empty curry is `[]`.
- [ ] **Step 2:** Run — FAIL. Implement the helpers.
- [ ] **Step 3:** Rewrite the move kinds over `PARTS` (no `'curry'`/`'subzi'`/`'base'` literals inside them).
  `grep -nE "'curry'|'subzi'" src/planner/solver.ts` shows none inside the repair code.
- [ ] **Step 4:** Run `npm test` and `npm run rule-cases` — PASS; the Task 1 snapshot unchanged from Task 3.
- [ ] **Step 5:** Commit: `refactor(planner): the repair loop works over the list of meal parts`

### Task 5: Speed, docs, full check

- [ ] **Step 1:** Time the seeded library (seeds 1–8, `searchBudget`, median of 5) on this branch and on the commit before
  Task 3. Record both in the PR description. More than 10% slower: STOP and report.
- [ ] **Step 2:** Update `docs/architecture.md`: the solver section lists construct, late acceptance, then the repair loop
  and its move kinds.
- [ ] **Step 3:** Run `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run rule-cases` — all pass.
- [ ] **Step 4:** Commit: `docs(planner): the repair loop`
