# Frequency Hierarchy and "Comes With … When the Curry Is" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A brought dish's frequency rules never influence the dish above it (every link), then a base's "Comes with"
link may apply only when the meal's curry and/or subzi is one of the named dishes (parts AND, dishes within a part OR).

**Architecture:** Part A changes which compiled count/prefer constraints give way to brought dishes (`src/rules/record.ts`)
and lets the solver still rank a link's candidates by those rules (`broughtScore`). Part B adds an optional `when: { curry?, subzi? }`
to the `comes_with` template, a meal-level condition (`inMeal`, one matcher per part) on the planner's `pair` constraint, keeps the search
blind to what a conditional pair causes, adds the lock nudge, then the dish form.

**Tech Stack:** TypeScript, Vitest, React (Next.js app), Zod, Dexie.

**Spec:** `docs/superpowers/specs/2026-11-09-comes-with-when-curry-design.md`

## Global Constraints

- Strength words only from `STRENGTH_WORDS` (`src/rules/levels.ts`): Always, Usually, Often, Sometimes.
- No Dexie upgrade; no stored rule changes meaning. `when` absent = today's `comes_with`.
- Planner deterministic per seed. Don't change `BRING_ROUNDS`, `DESCENT_PASSES` or other search bounds.
- Every planner/rule change gets a rule case first (fails on today's code, fails without its subject; supporting rules
  in `given`). Case-only dishes use ids from 900 (comes-with.ts already uses 900–906).
- Forms: never save what the user did not change; test both load orders and a no-edit save.
- Done = `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run rule-cases` all pass.
- Commits: `type(scope): what now happens, in plain English`, ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Not frequency rules (keep as today): the per-meal extras cap `extras-limit-*`, `sides-only-when-asked`.
- The rules assistant does not draft conditional links.

## Review Focus

1. A frequency rule with a **minimum** ("Dal at least 2 a week"): a brought Dal must still count toward it — only upper
   bounds give way. Test in Task 2.
2. A curry or subzi **deleted** while named in `when`: its part loses it; a part left empty removes the whole link, never
   a wider condition. Test in Task 9.
3. **Extras cap full** at a meal where the condition holds (softer link): Papad is left out and reported, the curry
   is not swapped away. Rule case in Task 7.
4. Editing an **old unconditional** link on a base and saving without touching the condition writes nothing, and the
   condition picker never appears on non-base dishes or for curry targets. Tests in Task 9.
5. A conditional link whose curry is **brought by the base's own** "Comes with Sambar" (chain). Rule case in Task 6.

---

## Part A — Frequency hierarchy (all links)

### Task 1: Rule cases for the hierarchy (failing)

**Files:**
- Modify: `src/rule-cases/cases/comes-with.ts`, `src/rule-cases/cases/pairings.ts`

**Interfaces:**
- Produces: `limitRule(dish: ComponentRecord, max: number, per: 'week' | 'day'): CaseRule` — a hand-written
  `limit` rule (`{ name, spec: { template: 'limit', params: { match: is('id', id), per, max, strength: 'must' } } }`),
  exported from `src/rule-cases/cases/comes-with.ts` for Part B's cases too.

- [ ] **Step 1: Add the cases.** Each `why` names the bug ("a brought dish's own limit made its base rarer").
  - `brought-side-ignores-its-limit` (comes-with.ts): rules: Idiyappam always comes with Kerala Stew (Veg); given:
    breakfast-only Idiyappam, `limitRule(STEW_VEG, 1, 'week')`. Expect `nearNoRulesCount('Idiyappam')`,
    `everyMealWith('Idiyappam', ['Kerala Stew (Veg)'])`, `noHardProblems()`.
  - `brought-side-ignores-its-limit-usually`: as above with `strength: 'usually'`; expect `nearNoRulesCount('Idiyappam')`
    and stew in at least 3 of 4 Idiyappam meals (inline expectation).
  - `served-with-ignores-its-limit` (pairings.ts): rules: Papad always served with Rice (`linkRule(papad, { mode: 'serve',
    target: 'base_dish', values: [rice.id] })`); given: `limitRule(papad, 2, 'week')`. Expect `nearNoRulesCount('Rice')`,
    `everyMealWith('Rice', ['Papad'])`, `noHardProblems()`.
  - `limit-ranks-a-links-dishes`: rules: Idiyappam comes with both stews; given: breakfast-only, `limitRule(STEW_VEG, 1,
    'week')`. Expect `everyMealWithOneOf('Idiyappam', STEWS)` and Kerala Stew (Veg) in at most one Idiyappam meal per
    week whenever the week has two or more Idiyappam meals (inline).
  - `brought-chain-ignores-limit`: rules: Idiyappam comes with Kerala Stew (Veg), the stew comes with Pepper Rasam;
    given: breakfast-only, `limitRule(PEPPER_RASAM, 1, 'week')`. Expect `nearNoRulesCount('Idiyappam')`.
- [ ] **Step 2: Run `npm run rule-cases`.** Expected: the new cases FAIL (except possibly the `usually` one; if it
  passes, keep it as a guard and say so in its `why`); the existing 47 pass.
- [ ] **Step 3: Commit** `test(rule-cases): a brought dish's limits must not make its base rarer`.

### Task 2: Frequency rules give way to every brought dish

**Files:**
- Modify: `src/rules/record.ts` (`givesWayTo`, `compileRules`)
- Test: `src/rules/record.test.ts`
- Docs: `docs/superpowers/specs/2026-11-08-pairing-units-design.md` ("What gives way to a unit" table),
  `docs/superpowers/specs/2026-11-09-links-bring-dishes-design.md` ("What gives way"), `docs/architecture.md`

**Interfaces:**
- Produces: `isFrequencyBody(body: ConstraintBody): boolean` (exported from `src/rules/record.ts`): a `count` body whose
  `groupBy` is not `'slot'` and that has an upper bound (`hardMax` or `softMax`), or a `prefer` body.

Rule per compiled constraint (replaces the per-rule `givesWayTo` for these bodies):
- A frequency body gets `yieldsTo: 'ask'` (keeping `owner` for owned rules), whatever rule it came from: owned,
  hand-written, or a default (`prefer-frequent`, `avoid-rare`, `variety`, `spacing`). `sides-only-when-asked` keeps
  `'ask'`; `extras-limit-*` (groupBy `'slot'`) keeps `'unit'`; owned non-frequency bodies keep `'unit'`.
- A frequency `count` body with both a lower and an upper bound is split into two constraints: the lower bounds
  without `yieldsTo` (a brought dish still counts toward a minimum), the upper bounds with `'ask'`. Ids
  `rule:<id>:<i>` and `rule:<id>:<i>:max`.

- [ ] **Step 1: Rewrite the tests** in `record.test.ts`: replace "extras caps and prefer-frequent give way to a unit
  only" with "extras caps give way to a unit only; prefer-frequent and avoid-rare to asked sides"; replace "leaves
  hand-written rules unmarked" with: a hand-written `limit` per week `max` → `yieldsTo: 'ask'`; a hand-written `exclude`
  → unmarked; a hand-written `limit` per meal → unmarked; a `limit` per week with `min: 1, max: 3` → two constraints,
  `[{ hardMin: 1 } no yieldsTo, { hardMax: 3, yieldsTo: 'ask' }]`; a hand-written `prefer` → `'ask'`.
- [ ] **Step 2: Run** `npx vitest run src/rules/record.test.ts` — FAIL.
- [ ] **Step 3: Implement** `isFrequencyBody` and the per-body marks in `compileRules`.
- [ ] **Step 4: Run** `npx vitest run src/rules src/planner` — PASS (fix any scorer test that asserted the old marks
  only by updating it to the new rule; note each in the commit body).
- [ ] **Step 5: Run `npm run rule-cases`.** Expected: Task 1 cases pass except `limit-ranks-a-links-dishes` (Task 3);
  all 47 old cases pass, including `comes-with-respects-frequency`.
- [ ] **Step 6: Update the three docs** to state the hierarchy (spec section "Frequency rules follow the hierarchy").
- [ ] **Step 7: Commit** `fix(planner): a brought dish's frequency rules no longer make the dish above it rarer`.

### Task 3: Frequency rules rank a link's candidates

**Files:**
- Modify: `src/planner/scorer.ts` (`score`), `src/planner/solver.ts` (`broughtScore`)
- Test: `src/planner/scorer.test.ts`, `src/planner/solver.test.ts`

**Interfaces:**
- Produces: `score(m, plan, justify = false, opts: ScoreOptions = {})` with
  `export interface ScoreOptions { freePick?: { slot: number; id: number }; ignoreConditional?: boolean }`
  (`ignoreConditional` is used from Task 7). `freePick`: the assignment of `id` at `slot` is scored with flag 0 — no
  rule gives way to it.
- `broughtScore(m, plan, slot, id)` returns `{ hard: s.hard, soft: overrides * OVERRIDE_WEIGHT + (f.hard - s.hard) *
  LIMIT_WEIGHT + f.soft }` where `s = score(m, plan)`, `f = score(m, plan, false, { freePick: { slot, id } })`, and
  `LIMIT_WEIGHT = 1e3` (below `OVERRIDE_WEIGHT`: a dish's days and meals outrank its limits).

- [ ] **Step 1: Tests.** scorer: "a free pick is charged the limits that give way to asked sides" (pair brings dish 2,
  count `hardMax 0` on dish 2 with `yieldsTo: 'ask'`: `score(...).hard === 0`, with `freePick` `=== 1`). solver:
  "broughtScore ranks a candidate under its limit ahead of one over it".
- [ ] **Step 2: Run** `npx vitest run src/planner/scorer.test.ts src/planner/solver.test.ts` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the planner tests and `npm run rule-cases` — PASS, including `limit-ranks-a-links-dishes`.
- [ ] **Step 5: Commit** `fix(planner): a link's dishes are picked by their limits, which no longer stop the link`.

## Part B — "Comes with … when the meal has"

### Task 4: Store and describe the condition

**Files:**
- Modify: `src/rules/templates.ts` (`ComesWithParams`, `comes_with` compile/describe/references),
  `src/rules/owned.ts` (`DishLink`, `linkRule`, `readLink`), `src/rules/link-text.ts`, `src/planner/constraints.ts`
  (`PairConstraint`, its zod schema)
- Test: `src/rules/templates.test.ts`, `src/rules/owned.test.ts`, `src/rules/link-text.test.ts`

**Interfaces:**
- `ComesWithParams` gains `when?: { curry?: number[]; subzi?: number[] }` (each `z.array(z.number().int()).min(1)`,
  strict, at least one key); refine: rejected when `of` names curries, or names subzis while `when.subzi` is set
  (message `'a link cannot bring a dish into a part it waits for'`).
- `PairConstraint` gains `inMeal?: Matcher[]`: the pair triggers only when, for every matcher, another dish in the meal
  matches it. `comes_with` compiles `when` to one matcher per part, curry first:
  `all(is('role', 'curry'), oneOf('id', when.curry))`, `all(is('role', 'subzi'), oneOf('id', when.subzi))`.
- `references` includes the `when` ids; `describe`: "With Rice, also Papad when the curry is Sambar or Rasam and the
  subzi is Beans Poriyal".
- `DishLink` gains `when?: { curry?: number[]; subzi?: number[] }`; `linkRule` writes it only for `mode: 'comes'` (throws
  for a curry target, or a subzi target with a subzi part);
  `readLink` reads it back.
- `describeLink`: "Rice always comes with Papad when the curry is Sambar", "… when the curry is Sambar and the subzi is
  Beans Poriyal"; `shortLink`: "Comes with Papad (with
  Sambar)", "Usually comes with Papad (with Sambar or Rasam)".

- [ ] **Step 1: Tests** — round trip `readLink(linkRule(rice, { mode: 'comes', target: 'extra_dish', values: [16],
  when: { curry: [8], subzi: [12] } }))` keeps `when`; a stored `comes_with` without `when` reads back without the key;
  schema rejects `when: {}`, `when: { curry: [] }`, `when` with a curry `of`, and `when.subzi` with a subzi `of`;
  compile emits `inMeal` with two matchers; references list 8 and 12; the sentences above.
- [ ] **Step 2: Run** `npx vitest run src/rules` — FAIL.
- [ ] **Step 3: Implement.** The scorer ignores `inMeal` until Task 6.
- [ ] **Step 4: Run** `npx vitest run src/rules src/planner` and `npx tsc --noEmit` — PASS.
- [ ] **Step 5: Commit** `feat(rules): a comes-with link can name the curry and subzi it waits for`.

### Task 5: Rule cases for the conditional link (failing)

**Files:**
- Modify: `src/rule-cases/cases/comes-with.ts` (case-only dish `MURUKKU`, id 907, extra, category 12 `crunchy`)

Rules use `linkRule(rice, { mode: 'comes', target: 'extra_dish', values: [papad.id], when: { curry: [sambar.id] } })`;
given always includes `CURRY_AT_EVERY_MEAL`. Each `why` cites "Papad only with Rice and Sambar".

- [ ] **Step 1: Add the cases.**
  - `when-curry-brings`: every Rice + Sambar meal has Papad; no Rice + other-curry meal and no Idli/Dosa + Sambar meal
    has Papad; `noHardProblems()`.
  - `when-curry-keeps-curry-count`: Rice + Sambar meal count over 8 weeks within ×1.5 of the no-rules count (inline,
    like `nearNoRulesCount` but counting meals with both).
  - `when-curry-usually`: Usually; Papad in at least 3 of 4 Rice + Sambar meals.
  - `when-curry-two-curries`: `when: { curry: [sambar, rasam] }`; every Rice + Sambar and Rice + Rasam meal has Papad.
  - `when-curry-and-subzi`: `when: { curry: [sambar], subzi: [beansPoriyal] }`; every Rice + Sambar + Beans Poriyal meal
    has Papad; no Rice + Sambar + other-or-no-subzi meal and no Rice + other-curry + Beans Poriyal meal has it.
  - `when-curry-chain`: plus Rice always comes with Sambar; every Rice meal has Sambar and Papad.
  - `when-curry-subzi`: brings Beans Poriyal; every Rice + Sambar meal has it.
  - `when-curry-scope`: scope `{ meals: ['lunch'] }`; no Rice + Sambar dinner has Papad from it, lunches do.
  - `when-curry-beats-plain-subzi`: rules: conditional Beans Poriyal; given: Rice usually comes with Aloo Gobi
    (lower rule id). Rice + Sambar meals have Beans Poriyal; other Rice meals mostly have Aloo Gobi.
  - `when-curry-ignores-limit`: given `limitRule(papad, 2, 'week')`; every Rice + Sambar meal has Papad, no hard
    problems, Rice + Sambar count as in `when-curry-keeps-curry-count`.
  - `when-curry-ranks-two-extras`: values `[papad, murukku]`, given `limitRule(papad, 2, 'week')`; every Rice + Sambar
    meal has one; Papad at most twice a week.
  - `when-curry-locked-curry`: pins Monday lunch `{ base_id: rice, curry_id: sambar }` → that meal has Papad in every
    week; pins `{ base_id: rice, curry_id: rasam }` (second case) → never Papad from it.
- [ ] **Step 2: Run `npm run rule-cases`** — the new cases FAIL (the schema accepts the rule from Task 4, the planner
  ignores the condition so Papad never comes or comes everywhere).
- [ ] **Step 3: Commit** `test(rule-cases): Papad with Rice only when the curry is Sambar`.

### Task 6: The planner applies the condition

**Files:**
- Modify: `src/planner/scorer.ts` (`compileModel`, `memoFor`, `score`'s `pairSlot`, `slotPairs`, new `mealBrings`),
  `src/planner/solver.ts` (`bring`'s `visit`, `broughtBy`, `isUnit`, `stillBrought`), `src/planner/index.ts`,
  `src/services/plan-generation.ts` (callers of `bringsWith` / `slotPairs`)
- Test: `src/planner/scorer.test.ts`

**Interfaces:**
- `CompiledPair` gains `inMeal: Int32Array` (matcher indices, empty when unconditional).
- `export function mealBrings(m: CompiledModel, s: SlotState, slot: number, id: number, role: Role): Brings` — like
  `bringsWith` but a conditional pair is a want only when every `inMeal` matcher is met by another dish of `s`. `bringsWith` stays for
  callers with no meal (keeps returning unconditional wants only).
- Role claims: in `memoFor` conditional pairs never claim or get suppressed. Where the meal is known (`pairSlot`,
  `mealBrings`, `slotPairs`), a met conditional pair claims its role first and suppresses the same dish's
  unconditional pairs for that role that share no candidate, whatever their rule ids or strengths. Unmet conditional
  pairs do nothing.

- [ ] **Step 1: Tests** — "a conditional pair holds only when the meal has its curry" (score hard 1 with Sambar, 0
  with Rasam, base 1 alone); "a met conditional pair takes the subzi role from its dish's plain pair";
  "mealBrings adds the conditional want only when the curry is there"; "a curry-and-subzi pair needs both".
- [ ] **Step 2: Run** `npx vitest run src/planner/scorer.test.ts` — FAIL.
- [ ] **Step 3: Implement**; the solver's `visit`/`broughtBy`/`isUnit`/`stillBrought` call `mealBrings` with `plan[i]`.
  A curry change already re-runs `bring` for the slot (`prev` from the old curry), so a replaced curry takes its
  conditional side away through `stillBrought`.
- [ ] **Step 4: Run** `npm test` and `npm run rule-cases` — PASS except `when-curry-keeps-curry-count` and
  `when-curry-ignores-limit` (Task 7) and `when-curry-locked-curry` if it needs the nudge (Task 8). Keep the planner fast: the
  rule-case run time stays within 20% of today's ~21 s.
- [ ] **Step 5: Commit** `feat(planner): a base's comes-with link can wait for the curry it names`.

### Task 7: The curry choice is blind to the conditional link

**Files:**
- Modify: `src/planner/scorer.ts` (`score` with `ignoreConditional`), `src/planner/solver.ts` (`evaluate`, `bring`'s
  `fits`, extras moves), `src/rule-cases/cases/comes-with.ts`
- Test: `src/planner/scorer.test.ts`, `src/planner/solver.test.ts`

**Interfaces:**
- `ScoreOptions.ignoreConditional`: an assignment present only because a met conditional pair brought it is left out
  of scoring entirely, and a missing conditional pair costs nothing. Without it (the final, justified score) a missing
  conditional pair is a **soft** justification at the pair's cost (`must` → 10), never hard.
- The solver's `evaluate` uses `ignoreConditional: true`; the returned `SolveResult.score` and justifications use the
  normal score.
- `bring` places a conditional pair's candidate only when placing it adds no hard violation to the normal score of
  that slot; otherwise it is left out (and reported by the final score).
- Extras moves never remove a side a met conditional pair brought (like unit members).

- [ ] **Step 1: Rule case (Review Focus 3)** `when-curry-extras-cap-full`: Rice usually comes with Pickle and Curd,
  breakfast-only Rice (given), conditional Usually Papad; breakfast cap 2 (default). Rice + Sambar breakfasts as many as
  without the conditional link; none has 3 extras; a soft problem names the link. Run it — FAIL.
- [ ] **Step 2: Unit tests** — scorer: "ignoreConditional leaves a conditionally brought side out of every count";
  solver: "a curry's chance is the same with and without a conditional link whose side breaks a limit" (same seed,
  compare curry picks for a small library).
- [ ] **Step 3: Run** them — FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run** `npm test` and `npm run rule-cases` — PASS, all Task 5 cases except `when-curry-locked-*` nudge
  (Task 8) pass.
- [ ] **Step 6: Commit** `fix(planner): a conditional side never changes which curry a meal gets`.

### Task 8: Lock nudge

**Files:**
- Modify: `src/planner/solver.ts`, `src/planner/scorer.ts`, `src/rule-cases/cases/comes-with.ts`
- Test: `src/planner/solver.test.ts`

**Interfaces:**
- `export function lockNudge(m: CompiledModel, plan: PlanState, slot: number, lockedExtras: readonly number[]): number`
  (scorer.ts): for each conditional pair whose trigger is the meal's base and whose candidate is in `lockedExtras` (or
  is the pinned subzi), the pair's cost (`must` → 10) when any `inMeal` part is unmet in the meal; else 0. With two parts the nudge is
  the same single cost, so it pulls toward meals meeting both.
- The solver adds `lockNudge` over slots with pinned extras/subzi to `evaluate`'s soft score. Pins of the base are not
  required (spec: applies when the base is the link's base, locked or not).

- [ ] **Step 1: Rule case** `when-curry-lock-nudge`: pins Monday lunch `{ base_id: rice, extra_ids: [papad] }`; the
  Monday lunch has Sambar in at least 6 of 8 weeks, and in more weeks than the same pins without the rule (inline,
  using `ctx.baseline()`). Run — FAIL.
- [ ] **Step 2: Unit test** "lockNudge charges a locked Papad meal whose curry is not Sambar". Run — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`, `npm run rule-cases` — PASS.
- [ ] **Step 5: Commit** `feat(planner): locking Papad with Rice makes Sambar more likely in that meal`.

### Task 9: The dish form, clashes and stored-data upkeep

**Files:**
- Modify: `src/components/library/links/LinkEditor.tsx`, `src/rules/link-warnings.ts`, `src/services/food-db.ts`
  (`deleteComponent`), `src/services/category-db.ts` (if it rewrites `comes_with` links), the curry merge path (find by
  `readLink` callers in `src/services`)
- Test: `src/components/library/links/LinkList.test.tsx`, `src/components/library/ComponentForm.test.tsx`,
  `src/rules/link-warnings.test.ts`, `src/services/food-db.test.ts`

**Interfaces:**
- LinkEditor: state `whenCurry: number[]` and `whenSubzi: number[]` from `initial?.when`; fieldsets "When the curry is"
  and "When the subzi is" (`OptionPicker`s, empty = any) shown only when `componentType === 'base'`, `mode === 'comes'`
  and the target is `extra_dish`, `extra_category` or `subzi_dish` — the subzi picker not for `subzi_dish`; the link
  built carries `when` with only the non-empty parts, and no `when` when both are empty; switching to a target without a
  picker clears it. The preview uses `describeLink`.
- link-warnings: a conditional link counts as always-bringing only in meals with its curry. Blocking when an Always
  conditional subzi link meets (a) the dish's unconditional unscoped Always subzi link, (b) an Always subzi dish served
  with this base, or (c) another Always conditional subzi link whose curry parts overlap (or either has none) — in each case sharing no dish.
  Message: "Rice already always comes with Aloo Gobi, and a meal holds one subzi." Existing checks skip conditional
  links otherwise.
- Deleting a curry or subzi removes it from its part of every `when`; a link with a part left empty is removed (never
  stored with a wider condition). Same for merges.

- [ ] **Step 1: Tests** — LinkEditor: picker present on a base's comes-with to Papad, absent on Sambar's form and for a
  curry target; saving a new conditional link stores `when`; the subzi picker absent for a subzi target; ComponentForm: open Rice with a stored conditional
  link before and after the lookup loads (`LibraryLookupProvider` only once `loaded`), save with no edits → stored
  rules unchanged; link-warnings: the three blocking cases and a non-clash (different curries); food-db: deleting
  Sambar drops it from `when.curry: [sambar, rasam]`, and removes a link with `when: { curry: [sambar], subzi: [beans] }`.
- [ ] **Step 2: Run** the four test files — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`, `npm run lint` — PASS.
- [ ] **Step 5: Commit** `feat(links): a base's comes-with link can be set to wait for a chosen curry and subzi`.

### Task 10: Assistant keeps the link intact and explains it

**Files:**
- Modify: `src/assistant/tools.ts` (`propose_pairing` merge, `explain_plan_slot` `how` text)
- Test: `src/assistant/tools.test.ts`

- [ ] **Step 1: Tests** — `propose_pairing` on Rice (which holds a stored conditional Papad link) adding a new comes-with
  leaves the conditional link's rule untouched in the draft; `explain_plan_slot` on a Rice + Sambar + Papad meal says
  "Rice comes with Papad when the curry is Sambar". The tool schema gains no `when` parameter.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run rule-cases` — all PASS.
- [ ] **Step 5: Commit** `feat(assistant): plan explanations name a link that waits for a curry`.
