# Pairings as Units Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A base and the dishes paired with it are planned together. An Always pairing is never dropped or
overridden by the side dish's own rules, and no pairing of any strength stops its base being planned.

**Architecture:**
- `require_with` rules that name dishes compile to a new planner constraint kind, `pair`.
- The scorer works out which sides each meal's dishes bring:
  - unit members, from Always pairings;
  - asked-for sides, from any pairing.
- Rules flagged as giving way skip those sides. The rule compiler sets the flag:
  - owned rules and default rules give way;
  - hand-written rules and built-ins do not.
- The solver places a dish together with the sides it brings, and never moves a unit member away from its
  base.

**Tech Stack:** TypeScript, zod 4, Vitest (happy-dom, Testing Library), Next.js 16 / React 19, Dexie.

**Spec:** `docs/superpowers/specs/2026-11-08-pairing-units-design.md`

## Global Constraints

- No change to stored rules or stored plans, and no new Dexie version.
- `src/planner` stays headless. It imports nothing from `src/rules`, `src/services` or the UI.
- Unit membership is worked out when scoring, never stored in `SlotState` or `PlanSlot`.
- Which rules give way, per the spec's table:
  - Owned rules (`owner_component_id`): `yieldsTo: 'unit'` and `owner`.
  - Default rules (`default_key`): `yieldsTo: 'unit'`, except `sides-only-when-asked`, which is
    `yieldsTo: 'ask'`.
  - Hand-written rules and built-ins: no `yieldsTo`.
- Only `require_with.components` become `pair` constraints. `extraCategories` stay slot counts.
- Two Always pairings for one base in the same role (curry or subzi):
  - The constraint compiled from the lower rule id makes the unit.
  - The other is reported as a soft justification with cost 0, and never as a hard one.
- Pins win. A pinned or held-empty (`null`) role is never overwritten by a pairing.
- Follow CLAUDE.md:
  - never save what the user did not change;
  - test both load orders for forms that read the library lookup.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Verification for every task: `npx tsc --noEmit -p .`, `npx eslint src`, `npx vitest run`. All must be clean
  and green.

## Review Focus

1. **Soft pairings.** A base with only Usually pairings must be planned about as often as without them. The
   test is in Task 3's scenario.
2. **A unit member that is also another rule's trigger.** Chutney's own "never with Sambar" still applies to
   Chutney when Sambar is Pongal's unit member. Pongal's own "never with Sambar" does not apply. Tested in
   Task 1.
3. **A stored conflict.** Two Always curries for one base must not stop the base being planned. Tested in
   Tasks 1 and 3.
4. **Pins and hand picks.**
   - A pinned other curry is kept, and the problem says "replaced by your pick" (Task 4).
   - Picking Pongal by hand re-plans the meal with its sides (Task 3, through `pins`).
5. **Planning time.** Scoring now builds per-meal pair sets. The 300 ms default must still reach a plateau
   on the seed library (Task 3).

---

### Task 1: Planner — `pair` constraints and giving way in the scorer

**Files:**
- Modify: `src/planner/constraints.ts`, `src/planner/scorer.ts`, `src/planner/index.ts` (exports)
- Test: `src/planner/scorer.test.ts`, `src/planner/constraints.test.ts`

**Interfaces:**
- Produces:
  - `type Yield = 'unit' | 'ask'`.
  - `CountConstraint` and `PreferConstraint` gain `yieldsTo?: Yield` and `owner?: number`.
  - `PairConstraint extends Common { kind: 'pair'; when: Matcher; component: number; scope?: { days?: Day[]; meals?: Meal[] }; strength: 'must' | 'prefer'; cost?: number }`.
  - `Constraint = CountConstraint | PreferConstraint | PairConstraint`.
  - `ConstraintSchema` accepts all three.
  - `interface SlotPair { component: number; by: number; unit: boolean; suppressed?: boolean }`.
  - `slotPairs(m: CompiledModel, plan: PlanState, slot: number): SlotPair[]`. These are the pairings triggered
    in that meal, whether or not the side is present.
  - `bringsWith(m: CompiledModel, id: number, role: Role, slot: number): { unit: number[]; asked: number[] }`.
    It returns the dishes that placing `id` in that role and meal brings, after conflict resolution. The
    solver uses it.

- [ ] **Step 1: Write the failing tests** in `scorer.test.ts`, under `describe('pairings')`. Library:
  - Pongal (base 1);
  - Sambar (curry 2);
  - Rasam (curry 5);
  - Chutney (extra 4);
  - Idli (base 6).

  Constraints:
  - `pair(when: is('id', 1), component: 2, strength: 'must')`;
  - `pair(when: is('id', 1), component: 4, strength: 'must')`.

  Cases:
  - **Pongal alone at Monday breakfast:** `hard === 2`. There are two justifications with
    `bound.kind === 'hardMin'`, with `group.componentId` 2 and 4.
  - **Pongal + Sambar + Chutney:** `hard === 0`.
  - **Sambar breakfast-only** (`count`, `yieldsTo: 'unit'`, `owner: 2`), with Sambar in a lunch Pongal meal:
    `hard === 0`. The same rule without `yieldsTo` gives `hard === 1`.
  - **Unpaired Sambar at lunch:** a free pick with the same `yieldsTo: 'unit'` rule gives `hard === 1`.
  - **Prefer with `yieldsTo: 'ask'`** (`weight: 2` on curries): costs 0 for a curry that a `prefer` pair asks
    for, and 2 for an unasked curry.
  - **Prefer with `yieldsTo: 'unit'`:** costs 2 for a curry that only a `prefer` pair asks for, since it is
    not a unit member.
  - **Owner trigger.** Count `select: is('id', 1)`, `when: is('id', 2)`, `bounds: { hardMax: 0 }`,
    `owner: 1`, `yieldsTo: 'unit'` (Pongal "never with Sambar"): `hard === 0` in a Pongal + Sambar unit.
  - **Another owner's trigger.** Use only the Sambar pair (Chutney is a free pick). The same shape with
    `select: is('id', 4)`, `when: is('id', 2)`, `owner: 4` (Chutney "never with Sambar"), in a meal of
    Pongal + Sambar + Chutney: `hard === 1`. Sambar still triggers Chutney's rule, and Chutney gives way.
  - **Conflict.** Add `pair(when: is('id', 1), component: 5, strength: 'must')` after the Sambar pair, in a
    Pongal + Sambar meal:
    - `hard === 0`;
    - one soft justification with `cost === 0` and `group.componentId === 5`;
    - `slotPairs` marks 5 as `suppressed`;
    - `bringsWith(m, 1, 'base', slot).unit` equals `[2, 4]`.
  - **Scope.** A pair scoped to `meals: ['breakfast']` is not triggered at lunch, and `slotPairs` there is
    empty.
  - **No self-trigger.** A pair whose `when` also matches its own component does not trigger itself.

  In `constraints.test.ts`:
  - a `pair` with an unknown key is rejected;
  - `strength: 'prefer'` without `cost` is accepted.

- [ ] **Step 2: Run** `npx vitest run src/planner/scorer.test.ts src/planner/constraints.test.ts`.
  Expected: FAIL (no `pair` kind, no `slotPairs`).

- [ ] **Step 3: Implement.**
  - `constraints.ts`: add the types and the schema. `cost` is 1–10, and defaults to 10 when scoring a prefer
    pair.
  - `scorer.ts`:
    - In `compileModel`, compile pairs with their `when` matcher and in-scope mask.
    - Memoise `bringsWith` per (component, role, slot), resolving conflicts there:
      - a `must` pair is dropped when an earlier `must` pair from the same trigger already fills that
        component's role (curry or subzi);
      - extras never conflict.
    - In `score`, before the counting pass, build the unit and asked id sets of each slot from
      `bringsWith` over the slot's assignments.
    - In the counting loop:
      - skip `selected` for a unit member when `yieldsTo` is set;
      - skip `selected` for an asked side when `yieldsTo === 'ask'`;
      - skip the trigger when the member is a unit member and `cc.def.owner` is the slot's base id.
      - Apply the same skips to prefer constraints. Keep the per-assignment prefer sum split into
        "gives way" and "always" parts on the memo.
    - Score each triggered pair: a missing `must` pair adds 1 hard; a missing `prefer` pair adds `cost` soft.
      Justify both with `group: { day, meal, componentId }`. Suppressed pairs add a soft justification with
      cost 0.
  - Export the new names from `src/planner/index.ts`.

- [ ] **Step 4: Run** the same tests, then the whole planner folder: `npx vitest run src/planner`.
  Expected: PASS.

- [ ] **Step 5: Commit:** `feat(planner): pair constraints; sides a meal's dishes bring skip rules that give way`

### Task 2: Rules — compile pairings and mark what gives way

**Files:**
- Modify: `src/rules/templates.ts` (`require_with.compile`, `compileSpec`), `src/rules/record.ts` (`compileRules`)
- Test: `src/rules/templates.test.ts`, `src/rules/record.test.ts`

**Interfaces:**
- Consumes: `PairConstraint` and `Yield` from Task 1.
- Produces:
  - `require_with` compiles to one `pair` per `components` id, with `when`, `scope`, `strength` and `cost`
    (`PREFER_COST` when a prefer rule has none). It also compiles to the existing slot counts for
    `extraCategories`.
  - `compileRules` sets `yieldsTo` and `owner` per the Global Constraints. Pairs get neither.

- [ ] **Step 1: Write the failing tests.**
  - `templates.test.ts`:
    - `compileSpec({ template: 'require_with', params: { when: is('id', 12), components: [31], extraCategories: [LIQUID], strength: 'prefer', cost: 6 } })`
      gives:
      - one `{ kind: 'pair', component: 31, strength: 'prefer', cost: 6 }`;
      - one `count` for the liquid category.
    - The existing seeded "Sambar brings Rasam" case still passes.
  - `record.test.ts`, with a rule owned by dish 7, a `default_key: 'variety'` rule, a
    `default_key: 'sides-only-when-asked'` rule and a hand-written rule:
    - Every constraint from the owned rule has `owner: 7` and `yieldsTo: 'unit'`.
    - Variety has `yieldsTo: 'unit'` and no `owner`.
    - Sides-only has `yieldsTo: 'ask'`.
    - The hand-written rule has neither.
    - An owned `serve:*` rule compiles to a `pair` with neither field.

- [ ] **Step 2: Run** `npx vitest run src/rules/templates.test.ts src/rules/record.test.ts`.
  Expected: FAIL.

- [ ] **Step 3: Implement.** In `compileSpec`, leave `pair` bodies alone when applying `cost` to counts.

- [ ] **Step 4: Run** `npx vitest run src/rules src/planner`. Expected: PASS.

- [ ] **Step 5: Commit:** `feat(rules): pairings compile to pair constraints; owned and default rules give way to them`

### Task 3: Solver — place a dish with what it brings

**Files:**
- Modify: `src/planner/solver.ts`
- Test: `src/planner/solver.test.ts`, `src/planner/scenarios.test.ts`

**Interfaces:**
- Consumes: `bringsWith` from Task 1.
- Produces: no new exports. Behaviour:
  - **`bring(i)`.** After any change to a slot's base, curry or subzi, bring that slot's unit members and
    asked-for sides:
    - into roles that are free (`isFree`) and empty, or that hold a side the previous dish brought;
    - unit members always overwrite such a role; asked-for sides only fill an empty role;
    - extras are appended when `isFree(i, 'extras')`;
    - repeat until nothing changes, at most 3 rounds.
  - **Construction.** Each base candidate is applied with `bring` before it is scored. The curry and subzi
    steps skip a role that holds a unit member.
  - **Local search:**
    - The single-role change move and the extra-removal move skip unit members.
    - The base, base+curry and swap moves call `bring` on each touched slot. Their `undo` restores the whole
      slot.
  - **Polish** never removes a unit member.

- [ ] **Step 1: Write the failing tests.**
  - `solver.test.ts`: library from the file, plus `pair(when: is('id', 1), component: 11, strength: 'must')`
    and an `exclude`-like count on 11 with `yieldsTo: 'unit'`, `owner: 11`, `bounds: { hardMax: 0 }`. Over
    seeds 1–5:
    - base 1 is planned at least once a week;
    - every slot with base 1 has curry 11;
    - `score.hard === 0`.
  - With `pins` `{ 'monday-lunch': { base_id: 1, curry_id: 12 } }`:
    - the slot keeps curry 12;
    - the result has one hard justification for the pair, with `group.componentId === 11`.
  - `scenarios.test.ts` (seed library, `DEFAULTS` plus the defaults' `yieldsTo` values: variety and spacing
    `'unit'`, the sides-cost prefer `'ask'`). This is the acceptance test. Pongal paired with Sambar and
    Coconut Chutney, Sambar owned-`allowed_meals` lunch-only, over 8 seeds:
    - **Always:** Pongal planned ≥ 4 times in total; every Pongal slot holds both; no hard justifications.
    - **Usually** (`strength: 'prefer', cost: 10`): Pongal planned ≥ 4 times in total.
    - **Breakfast-scoped Always:** every breakfast Pongal holds Sambar; lunch Pongal is not required to.
    - **Category Always** (`when` on `base_category_id` of Pongal's category): every base in that category
      holds Sambar.
    - **Stored conflict** (a second Always curry, Rasam, after Sambar): Pongal is planned ≥ 4 times, with
      Sambar, and no hard justifications.
    - **Timing:** with `{ seed: 1 }` and the default `timeLimitMs`, `stats.stopReason === 'plateau'`.

- [ ] **Step 2: Run** `npx vitest run src/planner/solver.test.ts src/planner/scenarios.test.ts`.
  Expected: the pairing cases FAIL (Pongal 0 times).

- [ ] **Step 3: Implement** the behaviour above.

- [ ] **Step 4: Run** `npx vitest run src/planner`. Expected: PASS, including the existing scenarios.

- [ ] **Step 5: Commit:** `fix(planner): plan a base together with the dishes paired with it`

### Task 4: Services and assistant — pairings in conflicts, outcomes and explanations

**Files:**
- Modify:
  - `src/services/plan-generation.ts`
  - `src/assistant/tools.ts` (`explain_plan_slot` result and description)
  - `src/assistant/prompt.ts`
- Test: `src/services/plan-generation.test.ts`, `src/assistant/tools.test.ts`

**Interfaces:**
- Consumes: `slotPairs` and `bringsWith` from Task 1.
- Produces:
  - `interface PairedSide { day: DayOfWeek; meal: Meal; component: number; by: number }`.
  - `PlanningOutcome.paired: PairedSide[]`. It lists the sides present in their meal and brought by a
    pairing, either unit or asked.
  - `pairedSides(input: PlanningInput, plan: WeeklyPlan): PairedSide[]`.
  - `slotConflicts`, for `part === 'base'`, places each candidate together with its `bringsWith(...).unit`
    sides in free roles before counting.
  - A hard pair problem in a slot whose role was pinned by the caller (`opts.pins`) has a `message` ending
    "— replaced by your pick".
  - `explain_plan_slot`:
    - its result gains `pairedWith: { dish: string; by: string }[]`;
    - for a base left out with no blocking rule, its `note` says "No rule blocks {name} here; its paired dishes
      come with it." The description text drops "the planner left it out for variety or preferences" in
      favour of "the planner chose other dishes this time".

- [ ] **Step 1: Write the failing tests.**
  - `plan-generation.test.ts`, with Pongal (owned serve link Always from Sambar):
    - `slotConflicts(..., 'base', [pongal])` returns no entry for Pongal.
    - `planFromData(...).paired` contains `{ component: sambar, by: pongal }` for every Pongal meal.
    - With `pins` holding Pongal and another curry at Monday breakfast, the pair problem's `message` ends with
      "— replaced by your pick".
  - `tools.test.ts`:
    - `explain_plan_slot` on a slot holding Pongal + Sambar returns
      `pairedWith: [{ dish: 'Sambar', by: 'Pongal' }]`.
    - With `dish: 'Pongal'` on a slot without it, `blockedBy` is empty.

- [ ] **Step 2: Run** the two test files. Expected: FAIL.

- [ ] **Step 3: Implement.** Add to `prompt.ts`, under the economy rules: "Give only reasons a tool returned.
  If no tool says why a dish is missing, say no rule blocks it." Update `PlanningOutcome` consumers that
  build outcomes by hand in tests.

- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.

- [ ] **Step 5: Commit:** `feat(plan): pairings in slot conflicts, plan outcomes and the assistant's explanations`

### Task 5: Plan view — "with Pongal"

**Files:**
- Modify:
  - `src/stores/plan-store.ts` (keep `paired` from every outcome, and clear it with `problems`)
  - `src/components/plan/MealCell.tsx`
  - `src/components/plan/PlanComponentRow.tsx`
- Test: `src/components/plan/PlanComponentRow.test.tsx`, `src/components/plan/PlanBoard.test.tsx`

**Interfaces:**
- Consumes: `PlanningOutcome.paired` from Task 4.
- Produces:
  - `PlanComponentRow` takes an optional `pairedWith?: string` (the base's name) and renders
    "with {name}" after the dish name, as muted text.
  - Extras show it for each paired extra in the list.

- [ ] **Step 1: Write the failing tests.**
  - `PlanComponentRow` with `pairedWith="Pongal"` shows "with Pongal".
  - `PlanBoard`, with a store holding a Pongal + Sambar slot and `paired` for it, shows "with Pongal" in that
    cell only.

- [ ] **Step 2: Run** the two files. Expected: FAIL.

- [ ] **Step 3: Implement.** After a hand swap (`swapComponent` without a re-plan), drop the `paired` entries
  for that slot. They come back with the next outcome.

- [ ] **Step 4: Run** `npx vitest run src/components/plan src/stores`. Expected: PASS.

- [ ] **Step 5: Commit:** `feat(plan): label a paired side with the base it is served with`

### Task 6: Save guard — one Always curry and one Always subzi per base

**Files:**
- Modify:
  - `src/rules/link-warnings.ts` (`LinkWarning` gains `blocking?: boolean`; the "also always served with"
    warning sets it)
  - `src/components/library/links/LinkList.tsx` (marks blocking warnings)
  - `src/components/library/ComponentForm.tsx` (Save disabled while a blocking warning shows)
  - `src/assistant/tools.ts` (`propose_dish` and `propose_pairing` return an error for the same case)
- Test:
  - `src/rules/link-warnings.test.ts`
  - `src/components/library/ComponentForm.test.tsx`
  - `src/assistant/tools.test.ts`

**Interfaces:**
- Consumes: `linkWarnings` (existing).
- Produces:
  - `LinkWarning.blocking`.
  - Error text, shared by the form and the tools:
    `"{rival} is already always served with {base}, and a meal holds one {curry|subzi}."`

- [ ] **Step 1: Write the failing tests.**
  - `link-warnings.test.ts`: the existing rival case now has `blocking: true`, and a Usually rival is not
    flagged.
  - `ComponentForm.test.tsx`: Rasam's form, adding an Always serve link to Idli while Sambar has one. Cover
    both load orders: opened before the library loads, and under a loaded `LibraryLookupProvider`.
    - Save is disabled and the message shows.
    - Switching the strength to Usually enables Save.
  - `tools.test.ts`:
    - `propose_pairing` for Rasam with Idli at `always` returns `ok: false` with the message.
    - At `usually` it succeeds.

- [ ] **Step 2: Run** the three files. Expected: FAIL.

- [ ] **Step 3: Implement.** In the tools, check against enabled stored `serve` links in `data.rules`, the same
  way `linkWarnings` does.

- [ ] **Step 4: Run** `npx vitest run`, `npx tsc --noEmit -p .` and `npx eslint src`. Expected: all clean.

- [ ] **Step 5: Commit:** `feat(links): refuse a second curry or subzi always served with the same base`
