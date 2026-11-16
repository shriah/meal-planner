# Rule Levels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every compiled rule carries an explicit level that says what it gives way to, replacing the shape guess
(`isFrequencyBody`), the `yieldsTo` flags and the hidden 1e6/1e3 weights, with no change in behaviour.

**Architecture:** Planner constraints gain `level?: 'rule' | 'dish' | 'frequency'` (pairs are the bringing level and carry
none). Templates mark their frequency bodies; `compileRules` sets every other body's level from the rule's origin. The
scorer derives its give-way codes from `level`. `broughtScore` returns explicit tiers compared in order instead of packing
them into `soft` with 1e6 and 1e3. The Rules page shows a level label.

**Tech Stack:** TypeScript, Zod, Vitest, React.

**Spec:** `docs/superpowers/specs/2026-11-16-rule-levels-design.md`

## Global Constraints

- Behaviour unchanged: all 91 rule cases pass with no expectation edited; plan scores (`Score`) unchanged.
- Levels and what they give way to, exactly:
  - `rule` (Your rules): gives way to nothing.
  - pairs (Bringing rules: comes with, served with, hand-written "also include when"): give way to nothing.
  - `dish` (Dish limits): gives way to Always bringing rules.
  - `frequency` (Frequency): gives way to any bringing rule.
- A hand-written "how often" **per meal** is `rule`; per day or week with an upper bound is `frequency`.
- A count with a minimum and a maximum keeps today's split: minimum on the rule's own level (owner kept), maximum
  `frequency` with id suffix `:max`.
- `yieldsToUnit` and `owner` pair behaviour stay as pair logic, unchanged.
- Tiers live only in `broughtScore`/`chooseCandidate`, not in `Score`. If strict tier order changes any case outcome,
  today's behaviour wins: STOP and report the case.
- Levels are derived at compile time; no Dexie version.
- CLAUDE.md conventions (deterministic planner, commit format, done = tests, tsc, lint, rule cases).

## Review Focus

1. A retired default still stored (`want-curry`, `want-subzi`, `extras-only-when-asked`, switched off) and switched back on:
   it gets the level matching its flag today (`dish` for a count body, `frequency` for a prefer body) (Task 1 test).
2. A hand-written "how often" per week with only a minimum: level `rule`, no `:max` body (Task 1 test).
3. A dish's own `prefer` rule (owned): `frequency`, keeps `owner` (Task 1 test).
4. A stored constraint list from before this change is never read back (constraints are compiled, not stored); confirm no
   persisted `yieldsTo` exists (Task 2 grep step).
5. Two candidates whose overrides and limits tie but soft differs: order unchanged from today (Task 3 test).

---

### Task 1: Levels alongside the old flags, proven equal

**Files:**
- Modify: `src/planner/constraints.ts` (type + schema), `src/rules/templates.ts` (limit, no_repeat, prefer mark
  frequency bodies), `src/rules/record.ts` (`levelOf`, set `level` in `compileRules`)
- Test: `src/rules/record.test.ts`, `src/rule-cases/levels.test.ts` (create)

**Interfaces:**
- Produces: `export type Level = 'rule' | 'dish' | 'frequency'` in `constraints.ts`; `level?: Level` on `CountConstraint`
  and `PreferConstraint` (absent = `rule`); `ConstraintBody` may carry `level: 'frequency'` from a template.

- [ ] **Step 1: Failing tests** in `record.test.ts`:
  - hand-written `limit` per meal max → one body, `level: 'rule'`.
  - hand-written `limit` per week min 1 max 3 → `rule:<id>:0` with `level: 'rule'` and min bounds; `rule:<id>:0:max`
    with `level: 'frequency'`.
  - hand-written `limit` per week min only → one body `level: 'rule'`.
  - owned `allowed_days` → `level: 'dish'`, `owner` set. Owned `prefer` → `frequency`, `owner` set.
  - defaults: `extras-limit-lunch` → `dish`; `variety`, `spacing`, `sides-only-when-asked`, `prefer-frequent`,
    `avoid-rare` → `frequency`; a rule with `default_key: 'want-curry'` → `dish`.
  - pairs (`comes_with`, `require_with`) → no `level`.
- [ ] **Step 2: Failing equivalence test** `src/rule-cases/levels.test.ts`: for every rule of every case in `ALL_CASES`
  (own + given, via `recordsOf`) plus `defaultRules()`, compile and assert for each constraint:
  `yieldsTo === undefined ⇔ level === 'rule' or pair`, `'unit' ⇔ 'dish'`, `'ask' ⇔ 'frequency'`.
- [ ] **Step 3:** Run `npx vitest run src/rules/record.test.ts src/rule-cases/levels.test.ts` — FAIL.
- [ ] **Step 4:** Implement. Templates: `limit` (per day/week) and `no_repeat` bodies get `level: 'frequency'` when they
  have an upper bound; `prefer` bodies always. `compileRules`: pair → unchanged; a body with `level: 'frequency'` →
  today's split logic; otherwise `level: levelOf(rule)` where `levelOf` returns `dish` for owned rules and defaults other
  than the three `frequency` keys, `frequency` for `variety`, `spacing`, `sides-only-when-asked`, `rule` otherwise. Keep
  setting `yieldsTo` exactly as today for now.
- [ ] **Step 5:** Run the two files — PASS. Run `npx vitest run src/rules src/planner` — PASS.
- [ ] **Step 6:** Commit: `refactor(rules): each compiled rule says which level it sits on`

### Task 2: The scorer reads levels; flags removed

**Files:**
- Modify: `src/planner/constraints.ts` (drop `Yield`, `yieldsTo`), `src/planner/scorer.ts:136-141,196,248` (codes from
  `level`), `src/rules/record.ts` (drop `givesWayTo`, `isFrequencyBody`, `yieldsTo`), tests that build constraints with
  `yieldsTo` (`constraints.test.ts`, `scenarios.test.ts`, `solver.test.ts`, `scorer.test.ts`, `record.test.ts`),
  `src/rule-cases/levels.test.ts` (assert levels directly; drop the flag comparison)

**Interfaces:**
- Consumes: `Level` (Task 1).
- Produces: scorer-internal `const givesWay = (l: Level | undefined) => l === 'dish' ? GIVES_TO_ALWAYS : l === 'frequency' ? GIVES_TO_ANY : 0`
  replacing `yieldCode`; `YIELD_UNIT`/`YIELD_ASK` renamed `GIVES_TO_ALWAYS`/`GIVES_TO_ANY`.

- [ ] **Step 1:** Replace `yieldsTo: 'unit'` with `level: 'dish'` and `yieldsTo: 'ask'` with `level: 'frequency'` in the
  five test files. Run `npx vitest run src/planner src/rules` — FAIL to compile/type-check where the scorer still reads
  `yieldsTo`.
- [ ] **Step 2:** Implement in the scorer and `record.ts`; delete `Yield`, `yieldsTo`, `givesWayTo`, `isFrequencyBody`.
- [ ] **Step 3:** `grep -rn "yieldsTo\|isFrequencyBody\|givesWayTo" src` — only the rule-case expectation helper
  `yieldsTo` in `src/rule-cases/expect.ts` (unrelated name) remains.
- [ ] **Step 4:** Run `npm test` and `npm run rule-cases` — PASS, 91/91, no expectation edited.
- [ ] **Step 5:** Commit: `refactor(planner): rules give way by their level instead of inferred flags`

### Task 3: Explicit tiers for a link's pick

**Files:**
- Modify: `src/planner/solver.ts:47-53,70-110,134-143,336,374`, `src/services/plan-generation.ts:257,272`,
  `src/planner/index.ts` (exports)
- Test: `src/planner/solver.test.ts`

**Interfaces:**
- Produces: `export interface BroughtScore extends Score { overrides: number; limits: number }`;
  `export const compareBrought = (a: BroughtScore, b: BroughtScore): number` comparing hard, then overrides, then limits,
  then soft; `broughtScore(...)` returns `BroughtScore`; `chooseCandidate<S>(candidates, slot, scoreWith: (id) => S,
  timesPlanned, limit?, weightOf?, offsetOf?, compare: (a: S, b: S) => number = compareScore as never): number`.

- [ ] **Step 1: Failing tests** in `solver.test.ts`:
  - `compareBrought orders tiers`: `{hard:0,overrides:1,limits:0,soft:0}` worse than `{hard:0,overrides:0,limits:5,soft:9}`;
    `{…limits:1, soft:0}` worse than `{…limits:0, soft:999}`; hard beats all.
  - `soft breaks ties as before`: equal overrides and limits, soft 3 vs 5 → the 3 wins (Review Focus 5).
  - `broughtScore exposes tiers`: an existing `broughtScore` test's packed value `overrides * 1e6 + limits * 1e3 + soft`
    now reads as separate fields with the same values.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement; delete `OVERRIDE_WEIGHT` and `LIMIT_WEIGHT`. Solver and `plan-generation.ts` pass
  `compareBrought` to `chooseCandidate`.
- [ ] **Step 4:** Run `npm test` and `npm run rule-cases` — PASS, 91/91. If any case changes, STOP and report it (Global
  Constraints).
- [ ] **Step 5:** Commit: `refactor(planner): a link's pick ranks its candidates by explicit tiers, not weight sizes`

### Task 4: Level label on the Rules page

**Files:**
- Modify: `src/rules/record.ts` (export `ruleLevel`), `src/rules/index.ts`, `src/components/rules/RuleRow.tsx`
- Test: `src/rules/record.test.ts`, `src/components/rules/RuleList.test.tsx`

**Interfaces:**
- Produces: `export function ruleLevel(rule: RuleRecord): Level | 'bring' | undefined` — `bring` for pair templates,
  `frequency` if any compiled body is `frequency`, else the rule's own level; `undefined` for an unreadable rule.
  Labels: `rule` "Your rule", `dish` "Dish limit", `frequency` "Frequency", `bring` "Brings a dish"; tooltips: "Gives way to
  nothing", "Gives way to Always links", "Gives way to any link", "Brings a dish into the meal".

- [ ] **Step 1: Failing tests:** `ruleLevel` for a hand-written exclude (`rule`), a per-week limit with min and max
  (`frequency`), a `require_with` (`bring`), `extras-limit-lunch` default (`dish`). `RuleList.test.tsx`: the row for a
  hand-written `prefer` shows the badge "Frequency" with tooltip "Gives way to any link".
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement; the badge uses the existing `Badge` and `Tooltip` components next to the rule name.
- [ ] **Step 4:** Run `npm test` — PASS.
- [ ] **Step 5:** Commit: `feat(rules): the Rules page shows what each rule gives way to`

### Task 5: Docs and full check

- [ ] **Step 1:** Update `docs/architecture.md`: replace the "gives way" / frequency wording with the level table from the
  spec, and the pairing-units design table if it names `yieldsTo`.
- [ ] **Step 2:** Run `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run rule-cases` — all pass.
- [ ] **Step 3:** Commit: `docs(rules): rule levels`
