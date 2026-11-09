# Links That Bring Dishes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dish's link to side dishes or side types ("Comes with") brings one of them into every meal holding the dish; a dish may hold several such links; the planner chooses among a link's dishes and varies the choice.

**Architecture:** The planner's `pair` constraint names a set of candidates (a matcher) instead of one dish, and bringing chooses one candidate. A new owned rule template `comes_with` compiles to such a pair. Owned links are identified by rule id instead of by slot, so a dish can hold several "comes with" links. Softer pairings stop counting the sides they bring toward the variety and spacing defaults.

**Tech Stack:** TypeScript, Next.js 16 (client components), React 19, Dexie 4, Zod 4, Vitest 5 + Testing Library, happy-dom, fake-indexeddb.

**Spec:** `docs/superpowers/specs/2026-11-09-links-bring-dishes-design.md`

## Global Constraints

- No Dexie version and no upgrade: stored rules keep their meaning; existing `avoid_with` "only with" links still compile as limits.
- A form save writes only links that changed against the baseline it opened with; a save with no edits writes nothing (`CLAUDE.md`, "Forms over stored data").
- Strength words come only from `STRENGTH_WORDS` (`src/rules/levels.ts`): Always (`must`), Usually, Often, Sometimes (`prefer`, cost 10, 6, 3).
- A meal holds one base, at most one curry and one subzi; a curry never links to a curry, a subzi never to a subzi (`offersLink`).
- Links that point at bases (`base_category`, `base_dish`) keep today's meaning: "Only with" limits, "Served with" brings.
- Planner results are deterministic for a seed; rule cases use iteration budgets, never wall-clock time.
- Done means `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run rule-cases` pass.
- Commit messages follow `type(scope): plain-English outcome`, scopes `planner`, `rules`, `links`, `library`, `plan`, `assistant`, `rule-cases`.

## Review Focus

- A link whose candidates are all missing from the library (type with no curries, every dish deleted): the dish it is on must still be planned; the pair is ignored, the form warns. Test in Task 1.
- Two dishes whose links bring each other (Sambar comes with Papad, Papad comes with Sambar): bringing stops, no endless loop. Test in Task 1.
- A user pin holds a curry the link does not name: the pin stays and the problem says "replaced by your pick", for `comes_with` as for `require_with`. Test in Task 4.
- Deleting or renaming a dish when another dish holds two "comes with" links naming it: both links survive, only the deleted value goes. Test in Task 6.
- Opening the form before the library lookup has loaded and saving at once: no link rule is written or removed. Test in Task 7.

---

### Task 1: Pair constraints name a set of candidates

**Files:**
- Modify: `src/planner/constraints.ts:63-77, 149-160` (`PairConstraint`, `PairSchema`)
- Modify: `src/planner/scorer.ts` (`CompiledPair`, model compile ~160-175, `memoFor` pair triggering and role claims ~264-288, `Brings`/`bringsWith` ~93, 290-311, `SlotPair`/`slotPairs` ~313-342, `pairSlot` ~385-466, `Justification`)
- Modify: `src/planner/solver.ts:83-149` (`broughtBy`, `isUnit`, `bring`) and callers
- Modify: `src/rules/templates.ts:256-279` (`require_with` compile)
- Modify: `src/services/plan-generation.ts:155-232` (`broughtByBase`, `pairedSides`, `slotConflicts`), `src/stores/plan-store.ts:61`, `src/components/plan/MealCell.tsx:41`, `src/assistant/tools.ts:346-359`
- Test: `src/planner/scorer.test.ts`, `src/planner/solver.test.ts`, `src/planner/constraints.test.ts`

**Interfaces:**
- Produces:
  - `PairConstraint { kind: 'pair'; when: Matcher; of: Matcher; scope?; strength: 'must' | 'prefer'; cost? }` — `component: number` is removed; one dish is `of: is('id', id)`.
  - `interface Want { of: readonly number[]; unit: boolean }` — candidate ids in library order.
  - `bringsWith(m, id, role, slot): { wants: Want[] }` (replaces `{ unit, asked }`).
  - `SlotPair { candidates: number[]; component?: number /* the candidate present */; by: number; unit: boolean; suppressed?: boolean }`.
  - `Justification.candidates?: number[]` on a pair justification naming more than one dish; `group.componentId` is the first candidate.
  - `require_with` compiles each component to `{ kind: 'pair', when, of: is('id', component), ... }`.

- [ ] **Step 1: Write the failing tests**

In `scorer.test.ts`:
- `'a pair of two candidates is met by either'` — library base 1, curries 11 and 12; pair `{ when: is('id', 1), of: oneOf('id', [11, 12]), strength: 'must' }`; a meal `{ base: 1, curry: 12 }` scores `hard: 0`; `{ base: 1 }` scores `hard: 1`.
- `'two pairs claiming the curry role are suppressed only when they share no candidate'` — pairs `of [11, 12]` and `of [12, 13]` both met by `{ base: 1, curry: 12 }` (`hard: 0`); pairs `of [11]` and `of [13]`, both `must`: the second (constraint order) is suppressed, `{ base: 1, curry: 11 }` scores `hard: 0` and its justification has `suppressed.by === 1`.
- `'a pair with no candidate in the library is ignored'` — `of: is('id', 99)`; `{ base: 1 }` scores `hard: 0, soft: 0`.
- `'bringsWith lists the candidates of each want'` — `bringsWith(m, 1, 'base', 0)` equals `{ wants: [{ of: [11, 12], unit: true }] }`.

In `solver.test.ts`:
- `'bringing places one candidate of a want'` — with the pair above and only base 1 allowed, every slot of `solve(...)` (seed 1) has `curry` 11 or 12.
- `'bringing stops when two dishes bring each other'` — curry 11 `of: is('id', 21)` and extra 21 `of: is('id', 11)` (`when: is('id', …)`); `solve` returns, and every meal with 11 holds 21.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/planner/scorer.test.ts src/planner/solver.test.ts`
Expected: FAIL (type errors on `of`, `wants`).

- [ ] **Step 3: Implement**

- `CompiledPair`: replace `ci` with `cis: Int32Array` (library indices matching `of`); `roleBit` from the first candidate's type; a pair with no candidates is never triggered.
- Triggering: the assignment's own id must not be a candidate (was `!== component`).
- Role claims in `memoFor`: a later pair for a claimed role is suppressed only when its candidate set shares no id with the claiming pair's set.
- `pairSlot`: "present" means any candidate present; flag that assignment.
- `bring`: for each want with no candidate in the meal, place the first candidate in `of` (choosing comes in Task 4). `broughtBy` returns the union of candidates; `isUnit(s, i, id)` is true when `id` is in a unit want's `of` of another dish in the meal.
- Update every consumer listed under Files; `pairedSides` emits `component` = the candidate present.

- [ ] **Step 4: Run the planner, services and rule-case tests**

Run: `npx vitest run src/planner src/services src/rule-cases src/stores src/assistant`
Expected: PASS (one-candidate pairs behave as before).

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(planner): a pairing can name several dishes; any one of them meets it"
```

### Task 2: The `comes_with` rule and the "Comes with" link mode

**Files:**
- Modify: `src/rules/templates.ts` (params schema, `RuleSpecSchema`, template entry)
- Modify: `src/rules/owned.ts` (`LinkMode`, `LinkSlot`, `linkRule`, `readLink`, `ownedSlot`, `NAME_SUFFIX`, `offersComes`)
- Modify: `src/rules/link-text.ts` (`describeLink`, `shortLink`)
- Test: `src/rules/templates.test.ts`, `src/rules/owned.test.ts`, `src/rules/link-text.test.ts`

**Interfaces:**
- Consumes: `PairConstraint.of` (Task 1).
- Produces:
  - Template `comes_with`, params `{ match: Matcher; of: Matcher; scope?; strength; cost? }`, compiles to `[{ kind: 'pair', when: match, of, scope, strength, cost }]`; `references` = `refsOf(match, of)`; label `'Comes with'`.
  - `LinkMode = 'with' | 'never' | 'serve' | 'comes'`; `LinkSlot` gains `` `comes:${SideTarget}` ``.
  - `type SideTarget = Exclude<LinkTarget, 'base_category' | 'base_dish'>`; `isSideTarget(t): t is SideTarget`.
  - `offersComes(componentType, target): boolean` = `isSideTarget(target) && offersLink(componentType, target)`.
  - `linkRule(c, { mode: 'comes', target, values, strength, scope })` → owned `comes_with` with `match: is('id', c.id)`, `of: all(is('componentType', T), oneOf(field, values))`, name `ownedRuleName('comes:<target>', c.name)` = `"<dish>: comes with"`.
  - `readLink` reads `comes_with` back to `{ mode: 'comes', ... }`.

- [ ] **Step 1: Write the failing tests**

- `templates.test.ts` `'comes_with compiles to one pair naming its candidates'`: params `{ match: is('id', 1), of: all(is('componentType', 'curry'), oneOf('id', [11, 12])), strength: 'must' }` compile to one body `{ kind: 'pair', when: is('id', 1), of: <same>, strength: 'must' }`.
- `owned.test.ts` `'a comes link round-trips through its rule'`: for each `SideTarget` offered to a base, `readLink(linkRule({ id: 1, name: 'Idiyappam' }, link))` equals `link` (with `strength: 'usually'` and a breakfast scope in one case).
- `owned.test.ts` `'an old only-with link to side dishes still reads as with'`: an `avoid_with` from `linkRule(..., { mode: 'with', target: 'curry_dish', values: [11] })` reads back with `mode: 'with'`.
- `link-text.test.ts`: `describeLink('Idiyappam', { mode: 'comes', target: 'curry_dish', values: [11, 12], strength: 'always' }, names)` = `'Idiyappam always comes with Kerala Stew (Veg) or Kerala Stew (Non-Veg)'`; with `strength: 'usually'` and Rasam: `'Mutton Curry usually comes with Rasam'`; `shortLink` gives `'Comes with Rasam'` and `'Usually comes with Rasam'`.

- [ ] **Step 2: Run and see them fail**

Run: `npx vitest run src/rules`
Expected: FAIL (unknown template, mode).

- [ ] **Step 3: Implement as in Interfaces.** `describeSpec` for `comes_with`: `"With Idiyappam, also one of Kerala Stew (Veg) or Kerala Stew (Non-Veg)"` plus scope and strength words, as `require_with` does.

- [ ] **Step 4: Run** `npx vitest run src/rules` — Expected: PASS.

- [ ] **Step 5: Commit** `feat(rules): a comes-with rule brings one of the dishes a link names`

### Task 3: Rule cases for links that bring dishes

**Files:**
- Create: `src/rule-cases/cases/comes-with.ts` (cases, group `'Pairings'`, case-only dishes from id 900)
- Modify: `src/rule-cases/cases/index.ts`
- Modify: `src/rule-cases/expect.ts` (helpers below)

**Interfaces:**
- Consumes: `linkRule` with `mode: 'comes'` (Task 2).
- Produces: `everyMealWithOneOf(dish: string, oneOf: string[]): PlanExpectation`; `eachPlanned(names: string[], with: string): PlanExpectation` ("each of X is planned with Y at least once").

Case-only dishes (`dishes` on each case, shared as a const): Idiyappam (900, base, Tiffin), Kerala Stew (Veg) (901, curry, stew), Kerala Stew (Non-Veg) (902, curry, stew), Mutton Curry (903, curry, mutton), Pepper Rasam (904, extra, Condiments; the test library already has a curry named Rasam). Idiyappam has `mealRule(['breakfast'])` in `given`.

- [ ] **Step 1: Write the cases** (each with `why` naming the 2026-11-09 Idiyappam report):
  - `comes-with-either-stew`: Idiyappam comes with 901, 902 (Always). Expect `everyMealWithOneOf('Idiyappam', [both stews])`, `eachPlanned([both stews], 'Idiyappam')`, `nearNoRulesCount('Idiyappam')`, `noHardProblems()`.
  - `comes-with-curry-to-extra`: Mutton Curry comes with Pepper Rasam (Always); `given`: "a curry at every meal" (as in `days-meals.ts`). Expect `everyMealWith('Mutton Curry', ['Pepper Rasam'])`.
  - `comes-with-from-base-and-curry`: Rice comes with Papad; Mutton Curry comes with Pepper Rasam; pins `monday-lunch: { base_id: Rice, curry_id: Mutton Curry }`. Expect the Monday lunch holds exactly the extras Papad and Pepper Rasam.
  - `comes-with-two-links`: Idli comes with Coconut Chutney; Idli comes with Tomato Chutney (two links). Expect `everyMealWith('Idli', ['Coconut Chutney', 'Tomato Chutney'])`.
  - `comes-with-usually`: Idiyappam comes with 901 (Usually). Expect `nearNoRulesCount('Idiyappam')` and Kerala Stew (Veg) in at least half of Idiyappam meals.
  - `comes-with-curry-type`: Idiyappam comes with curry type `stew`. Expect `everyMealWithOneOf('Idiyappam', [both stews])`.
  - `comes-with-chain`: Idiyappam comes with 901; 901 comes with Pepper Rasam. Expect `everyMealWith('Idiyappam', ['Kerala Stew (Veg)', 'Pepper Rasam'])`.
  - `only-with-bases-still-limits`: Sambar `with base_dish [Idli, Dosa]`; `given`: "a curry at every meal". Expect `neverWith('Sambar', 'Pongal')` (add helper only if `neverWith` does not fit) and `plannedAtLeast('Sambar', 1)`.
  - `old-only-with-still-limits`: Idiyappam `with curry_dish [901, 902]` (old link). Expect some Idiyappam meal has no curry (it limits, it does not bring).
  - `comes-with-clash`: Idiyappam comes with 901 (Always) and comes with Mutton Curry (Always). Expect `plannedAtLeast('Idiyappam', 4)`, `everyMealWith('Idiyappam', ['Kerala Stew (Veg)'])`, `yieldsTo('Mutton Curry', 'Kerala Stew (Veg)')`, `noHardProblems()`.

- [ ] **Step 2: Run** `npx vitest run src/rule-cases`. Expected: `comes-with-either-stew` fails on `eachPlanned` (first candidate always) and `comes-with-usually` fails on `nearNoRulesCount`; set `known` on those two with that reason. Everything else PASS, including the subject check.

- [ ] **Step 3: Commit** `test(rule-cases): links that bring dishes, two known gaps`

### Task 4: Choose among a link's dishes

**Files:**
- Modify: `src/planner/solver.ts` (`bring`; export `chooseCandidate`)
- Modify: `src/services/plan-generation.ts` (`slotConflicts` uses `chooseCandidate`; `pinnedRole` covers `comes_with`)
- Modify: `src/rule-cases/cases/comes-with.ts` (remove `known` from `comes-with-either-stew`)
- Test: `src/planner/solver.test.ts`, `src/services/plan-generation.test.ts`

**Interfaces:**
- Produces: `chooseCandidate(candidates: readonly number[], slot: number, scoreWith: (id: number) => Score, timesPlanned: (id: number) => number): number` — the candidate with the best score; ties go to the one planned fewest times in the week, then to `candidates[(slot + k) % n]` order. Deterministic; at most `constructionSample` candidates scored, taken in that rotated order.

- [ ] **Step 1: Write the failing tests**
  - `solver.test.ts` `'a want of two allowed candidates plans both over a week'` — pair `of [11, 12]` must, base 1 only base, seed 1: both 11 and 12 appear in `solve(...)`.
  - `solver.test.ts` `'a candidate the week forbids is passed over'` — curry 12 `hardMax 0` everywhere (exclude-style count): every slot has 11, `hard: 0`.
  - `plan-generation.test.ts` `'a comes-with link replaced by a pin says so'` — Idiyappam comes with Kerala Stew (Veg) (Always), pin `monday-breakfast: { base_id: Idiyappam, curry_id: Sambar }`: the problem message ends with `'— replaced by your pick'`.
- [ ] **Step 2: Run and see them fail** — `npx vitest run src/planner/solver.test.ts src/services/plan-generation.test.ts`.
- [ ] **Step 3: Implement** `chooseCandidate` and use it in `bring` (unit and asked wants) and in `slotConflicts`; extend `pinnedRole` to `require_with` or `comes_with`.
- [ ] **Step 4: Run** `npx vitest run src/planner src/services src/rule-cases` — PASS, and `comes-with-either-stew` passes without `known`. Check the default 300 ms budget still reaches a plateau: `npx vitest run src/planner/scenarios.test.ts` PASS.
- [ ] **Step 5: Commit** `fix(planner): a link naming several dishes varies which one comes`

### Task 5: Sides a softer pairing brings do not count for variety and spacing

**Files:**
- Modify: `src/rules/record.ts:49-54` (`givesWayTo`)
- Modify: `src/rule-cases/cases/comes-with.ts` (remove `known` from `comes-with-usually`)
- Test: `src/rules/record.test.ts`, `src/planner/scenarios.test.ts` (only if an expectation there encodes the old behaviour)

- [ ] **Step 1: Write the failing test** — `record.test.ts` `'variety and spacing give way to asked-for sides'`: compiled constraints of the `variety` and `spacing` default rules carry `yieldsTo: 'ask'`; the extras caps and `prefer-frequent` keep `yieldsTo: 'unit'`.
- [ ] **Step 2: Run and see it fail** — `npx vitest run src/rules/record.test.ts`.
- [ ] **Step 3: Implement** — `default_key` `'variety'` or `'spacing'` → `{ yieldsTo: 'ask' }`.
- [ ] **Step 4: Run** `npm test && npm run rule-cases` — PASS; `comes-with-usually` passes without `known`; `pairing-usually-gives-way-to-never-auto` still passes.
- [ ] **Step 5: Commit** `fix(planner): a softer pairing's side no longer makes its base rarer`

### Task 6: Links are identified by rule id

**Files:**
- Modify: `src/rules/owned.ts` (`DishLink.ruleId`, `readOwned`, `addableSlots`, new `linkChanges`, `OwnedValues` comment; `ownedChanges` keeps days/meals/never-auto and drops links)
- Modify: `src/services/food-db.ts:62-90` (`saveComponent`, `getOwnedRule`)
- Modify: `src/services/compare-rules.ts:38-55` (`pendingRules`)
- Test: `src/rules/owned.test.ts`, `src/services/food-db.test.ts`, `src/services/compare-rules.test.ts`

**Interfaces:**
- Produces:
  - `DishLink.ruleId?: number` — the stored rule's id; absent on a link not yet saved.
  - `readOwned(rules: readonly Pick<RuleRecord, 'spec' | 'id'>[]): OwnedValues` — every link, each with its `ruleId`, ordered by `LINK_SLOTS` then rule id; nothing dropped.
  - `type LinkChange = { kind: 'add'; link: DishLink } | { kind: 'update'; ruleId: number; link: DishLink } | { kind: 'remove'; ruleId: number }`.
  - `linkChanges(base: readonly DishLink[], next: readonly DishLink[]): LinkChange[]` — a link with a `ruleId` in both and `sameLink` gives nothing; changed gives `update`; in `base` only gives `remove`; without `ruleId` gives `add`. Move `sameLink` from `ComponentForm.tsx` into `owned.ts` and export it.
  - `addableSlots` never treats a `comes:*` slot as taken.
  - `saveComponent(id, component, owned: OwnedRuleChanges = {}, links: readonly LinkChange[] = []): Promise<number>` — `update` writes the rule with `enabled: true`; `remove` deletes by id.
  - `pendingRules(rules, dishId, changes, dishName, links: readonly LinkChange[] = []): RuleRecord[]`.

- [ ] **Step 1: Write the failing tests**
  - `owned.test.ts` `'readOwned keeps two links of the same kind'` — two `comes_with` rules (ids 5, 7) on one dish read as two links with `ruleId` 5 and 7.
  - `owned.test.ts` `'linkChanges writes only what changed'` — base `[A(5), B(7)]`, next `[A(5), B'(7), C]` gives `[update 7, add C]`; next equal to base gives `[]`.
  - `food-db.test.ts` `'two comes-with links are saved, edited and removed on their own'` — save Idli with two links; update one: the other rule is byte-identical; remove one: the other stays.
  - `food-db.test.ts` `'deleting a dish keeps every link of the same kind on other dishes'` — Idli comes with Coconut Chutney and comes with [Tomato Chutney, Pickle]; delete Pickle: both links stay, the second names only Tomato Chutney. Rename Idli: both rules are named `'Idli: comes with'`.
  - `compare-rules.test.ts` `'pendingRules applies link changes by rule id'`.
- [ ] **Step 2: Run and see them fail** — `npx vitest run src/rules/owned.test.ts src/services`.
- [ ] **Step 3: Implement** as in Interfaces; keep slot-based `ownedSlot` for days, meals and never-auto.
- [ ] **Step 4: Run** `npx vitest run src/rules src/services` — PASS.
- [ ] **Step 5: Commit** `feat(links): a dish can hold several links of the same kind`

### Task 7: The form and link editor

**Files:**
- Modify: `src/components/library/links/LinkEditor.tsx` (modes per target, "How firmly" label, old link opens as Comes with)
- Modify: `src/components/library/links/LinkList.tsx` (keys and editing by `ruleId ?? 'new-<index>'`, `offRuleIds`, old-link note)
- Modify: `src/components/library/ComponentForm.tsx` (`linkChanges` against `linksBase`, `offRuleIds`, draft merge, preview passes link changes)
- Modify: `src/components/library/links/LinkPreview.tsx`, `src/components/library/ComponentRow.tsx:50-52` (keys)
- Test: `src/components/library/ComponentForm.test.tsx`, `src/components/library/links/LinkList.test.tsx`

**Interfaces:**
- Consumes: `linkChanges`, `saveComponent(..., links)`, `pendingRules(..., links)` (Task 6); `offersComes`, `isSideTarget` (Task 2).
- Produces: `MODE_LABEL = { serve: 'Served with', with: 'Only with', never: 'Never with', comes: 'Comes with' }`; modes offered for a side target: `comes`, `never`; for a base target: `serve` (non-bases), `with`, `never`. An initial link with `mode: 'with'` on a side target opens with `comes` selected. The strength row has a visible label `How firmly` (keep `aria-label`). An old side-target `with` link's sentence is followed by ` (only limits: edit it to have it come with the meal)`.

- [ ] **Step 1: Write the failing tests** (render under `LibraryLookupProvider` both before and after `useLibraryLookup().loaded`, as the library page does):
  - `'Add link offers Comes with again for a kind already used'`.
  - `'two comes-with links are edited independently'` — edit the second, save: only that rule changed.
  - `'a save with no edits writes no link rule'` — both load orders; rules table unchanged (compare rows).
  - `'opening an old only-with link and saving stores it as comes with'` — the `avoid_with` rule becomes `comes_with` with the same id; the dish's other link is untouched.
  - `'the strength row is labelled How firmly'`.
- [ ] **Step 2: Run and see them fail** — `npx vitest run src/components/library`.
- [ ] **Step 3: Implement** as in Interfaces; `useLinkWarnings` blocking keys use `ruleId ?? index`.
- [ ] **Step 4: Run** `npx vitest run src/components` — PASS.
- [ ] **Step 5: Commit** `feat(library): add "Comes with" links on a dish's form, several of a kind`

### Task 8: Warnings for links that cannot all hold

**Files:**
- Modify: `src/rules/link-warnings.ts`
- Modify: `src/assistant/tools.ts:310-313` (`pairingConflict` reuses it)
- Test: `src/rules/link-warnings.test.ts`, `src/assistant/tools.test.ts`

- [ ] **Step 1: Write the failing tests**
  - `'two Always comes-with links needing the one curry block Save'` — Idiyappam comes with [901] and comes with [903] (Always, both curries, disjoint) → second has `blocking: true`, message `'Idiyappam already always comes with Kerala Stew (Veg), and a meal holds one curry.'`; with overlapping sets → no warning.
  - `'an Always served-with on another curry blocks a disjoint comes-with'` — Sambar Always served with Idiyappam; Idiyappam comes with [901, 902] Always → blocking.
  - `'an Always served-with that narrows a comes-with link warns'` — Kerala Stew (Veg) Always served with Idiyappam; Idiyappam comes with [901, 902] → non-blocking `'Kerala Stew (Veg) is always served with Idiyappam, so Kerala Stew (Non-Veg) will never be picked. Remove that link on Kerala Stew (Veg) to let either come.'`
  - `'a comes-with link to nothing plannable warns'` — reuse the `with` Always checks for `comes` ("None of … can be planned").
  - `tools.test.ts` `'propose_pairing refuses a pairing clashing with a comes-with link'`.
- [ ] **Step 2: Run and see them fail** — `npx vitest run src/rules/link-warnings.test.ts src/assistant/tools.test.ts`.
- [ ] **Step 3: Implement.** Only a conflict the edit introduces blocks (existing `storedBlocking` logic in the form).
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(links): refuse comes-with links that cannot both hold`

### Task 9: The assistant drafts comes-with links

**Files:**
- Modify: `src/assistant/tools.ts` (`propose_dish`, `propose_pairing` declarations and handlers; `explain_plan_slot` text), `src/assistant/prompt.ts`
- Test: `src/assistant/tools.test.ts`

**Interfaces:**
- `propose_dish` and `propose_pairing` gain `comes_with: { dishes?: string[]; curry_types?: string[]; extra_categories?: string[]; strength?: 'always' | 'usually' | 'often' | 'sometimes' }[]`, each entry one link on the dish itself (names resolved like `served_with_bases`; unknown names are an error).
- Drafted `comes` links are appended to the form's links, never merged into a stored one; served-with drafts merge as today.

- [ ] **Step 1: Write the failing tests** — `'propose_pairing drafts two comes-with links on one dish'`; `'propose_dish drafts Mutton Curry coming with Rasam'`; `'explain_plan_slot says Kerala Stew (Veg) comes with Idiyappam'`.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/assistant src/components/assistant` — PASS.
- [ ] **Step 5: Commit** `feat(assistant): draft links that bring dishes`

### Task 10: Docs and final check

**Files:**
- Modify: `docs/architecture.md` (Rules model links paragraph; "Pairings as units" compile and scoring bullets; new "comes with" text)
- Modify: `docs/superpowers/specs/2026-11-08-pairing-units-design.md` (table: variety and spacing give way to asked-for sides)

- [ ] **Step 1: Update both docs** to describe `comes_with`, candidate sets, choosing, links by rule id, and the variety/spacing change.
- [ ] **Step 2: Run** `npm test && npx tsc --noEmit && npm run lint && npm run rule-cases` — all PASS, no `known` left in `comes-with.ts`.
- [ ] **Step 3: Commit** `docs: links that bring dishes`
