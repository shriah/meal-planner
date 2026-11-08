# Solver Final Descent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the gap the rule case library found: the planner sometimes leaves a soft rule unmet when a
single change would meet it. The known case is "No base on the next day", where seed 4 plans Pongal on
Wednesday and Thursday.

**Architecture:** After the random local search, the solver runs a short deterministic final descent. It
tries every single change of a free base, curry or subzi in every meal and keeps any change that strictly
improves the score, until a full pass finds none. A base change goes through the existing `bring`, so
pairing units stay intact. This runs before the existing polish, which drops sides.

**Tech Stack:** TypeScript, Vitest.

**Spec:** No separate spec. The authority is:
- the rule case library design (`docs/superpowers/specs/2026-11-08-rule-cases-design.md`, section "A case
  that fails on today's code");
- the pairing-units design (`docs/superpowers/specs/2026-11-08-pairing-units-design.md`, for units, pins and
  `bring`);
- the investigation below.

## Root cause (investigated 2026-11-08)

The case was reproduced with the default rules on the rule-case test library, seed 4, at the case budget of
20k iterations with a plateau of 3000:
- The planner stopped on `plateau` after 6,591 iterations, at soft cost 31. That is 28 for variety, which is
  unavoidable because 21 meals share 7 bases, plus 3 for Pongal on Wednesday and Thursday.
- No swap of two bases improves the plan (0 of 210).
- One single change does improve it: Thursday dinner Pongal to Upma reaches 28, which is optimal. A longer
  run (200k iterations) also finds 28.
- The local search draws moves at random. The "change one role" move picks that exact meal, role and base
  with probability about 0.45 × 1/3 × 1/21 × 1/7 ≈ 0.1% per iteration. So 3,000 iterations without
  improvement miss it about 5% of the time (e^-3).
- The existing polish only tries dropping sides. It never tries changing a base.

**So the cause is that the search can stop at a plan that one change would improve.** It is not a scoring
bug. Raising the plateau only makes the miss less likely and costs time on every plan. A final pass that
tries every single change makes the miss impossible.

## Global Constraints

- **Determinism.** The descent uses no random numbers. It tries meals in index order, the roles base, curry
  and subzi in that order, and candidates in library order (`pool[role]`). For curry and subzi, `undefined`
  (no side) is tried first. Same seed, same plan.
- **Pins and units win.** A role that is not free (`isFree`) is never changed. A unit member (`isUnit`) is
  never changed while its base stays. A base change applies `bring(i, prev)`, as the local-search moves do.
- **Strict improvement only.** Keep a change only when `compareScore(next, current) < 0`. Keep a candidate
  only if it lowers the score.
- **Bounded.** Stop after a full pass with no improvement, or after 10 passes, whichever comes first.
  Extras are not part of the descent; the existing polish handles them.
- **No change to plans the search already got right.** A plan with no improving single change comes out
  unchanged.
- **Placement:** after `bestPlan` is final and before the existing polish (`solver.ts` around line 328).
- **Scope:** do not change scoring, rules or the rule case library, apart from removing `known` from the
  variety case.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Verification: `npx tsc --noEmit -p .`, `npx eslint src`, `npx vitest run`. All clean.

## Review Focus

1. **A base change in a meal with a pairing unit.** The descent must bring the new base's unit and clear the
   old one's sides. Covered by a Task 1 test with an Always pairing.
2. **Pinned and held-empty roles.** These are never touched. Covered by a Task 1 test.
3. **Run time.** Each pass is at most 21 meals × (bases + curries + 1 + subzis + 1) scores. Measure the extra
   time on the seed scenarios and the timing scenario in `src/planner/scenarios.test.ts`. That scenario must
   still reach `plateau` in its 300 ms budget.
4. **Existing scenario expectations.** Bounds such as the Pongal counts near baseline in the pairing
   scenarios may shift. Re-check them; a bound may change only with a stated reason.
5. **The rule case run.** It must stay deterministic: identical values across 3 runs.

---

### Task 1: Final descent in the solver

**Files:**
- Modify: `src/planner/solver.ts`
- Test: `src/planner/solver.test.ts`

**Interfaces:**
- Produces: no new exports. The plan `solve` returns is a local optimum under single changes of free
  base, curry and subzi roles.

- [ ] **Step 1: Write the failing tests** in `solver.test.ts`, under `describe('final descent')`. Use a
  library like the file's own, but with 7 bases and only these constraints:
  - variety: per component, `softMax 1`, cost 2, over base/curry/subzi;
  - spacing: `['component', { days: 2 }]`, `softMax 1`, cost 3.

  Tests:
  - **Local optimum.** For seeds 1–8 at
    `{ timeLimitMs: Infinity, maxIterations: 20_000, plateauIterations: 3000 }`, take the returned plan and
    check that no single change of any base (to any other library base) gives a hard-0 score strictly lower
    than `r.score`. Write it as a helper that loops over meals and bases with `score`. Today seed 4 of the
    rule-case library fails this; reproduce the failure on this library or, if this library never stalls,
    use the rule-case test library (`TEST_LIBRARY` from `@/rule-cases/library`) with constraints from
    `compileRules(defaultRules())`. Tests may import across folders; the planner's source may not.
  - **Pins kept.** Pin Monday lunch to a base that the descent would like to change. It stays.
  - **Units kept.** With `pair(when: is('id', base1), component: curry11, strength: 'must')`, every planned
    base-1 meal still holds curry 11 after solving. Where the descent changed a base away from base 1, curry
    11 is not left behind as a stale side, unless another dish still brings it.

- [ ] **Step 2: Run** `npx vitest run src/planner/solver.test.ts`. Expected: the local-optimum test FAILS for
  at least one seed, with the improving change named in the failure message. The pin and unit tests may
  already pass; they are regression guards.

- [ ] **Step 3: Implement** the descent in `solve`, as specified in Global Constraints. Then run the existing
  side-dropping polish unchanged.

- [ ] **Step 4: Run** `npx vitest run src/planner`. Expected: PASS, including `scenarios.test.ts` and the
  timing case. Report the planning time before and after for the timing seed. If a scenario bound fails,
  stop and report it rather than loosening it.

- [ ] **Step 5: Commit:** `fix(planner): a final pass takes any single change that still improves the week`

### Task 2: Close the known issue in the rule case library

**Files:**
- Modify: `src/rule-cases/cases/variety.ts`

- [ ] **Step 1: Run** `npx vitest run src/rule-cases`. Expected: FAIL with
  `Known issue now passes: remove \`known\` from variety-no-base-on-consecutive-days`. This proves Task 1
  fixed it.
- [ ] **Step 2: Remove** the `known` field from that case.
- [ ] **Step 3: Run** `npx vitest run src/rule-cases` 3 times. Expected: PASS with identical observed values.
  Then run `npm run rule-cases`. The report should show 11 passed, 0 failed, 0 known.
- [ ] **Step 4: Run** `npx tsc --noEmit -p .`, `npx eslint src` and `npx vitest run`. All clean. Report the
  total `npm test` duration before and after.
- [ ] **Step 5: Commit:** `test(rule-cases): spacing holds on every seed; drop the known issue`
