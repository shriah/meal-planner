# Meal Parts Stage 3b: Warnings, Assistant and Picker over Parts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Stage 3. Link warnings read the cap rules, the assistant drafts rules and links over parts, the rule form
picks categories by part, and picking a dish by hand brings what it brings. The planner's last part-specific
exemptions are pinned by rule cases.

**Architecture:** No planner behaviour changes, so every week stays the same.
- `link-warnings.ts` takes the set of capped parts and words its clashes by part name.
- The assistant gets the part list (ids, names, categories) in its slice. It writes `part`/`category` leaves and drafts
  links by part through `bringMode`.
- The plan store re-plans a hand-picked meal with the picked dish pinned, so the planner brings that dish's sides.
- The joint part and the "higher part decides" precedence keep their current code and gain rule cases and docs.

**Tech Stack:** TypeScript, React (Next.js), Dexie, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-16-user-defined-meal-parts-design.md`. Stage 3a plan:
`docs/superpowers/plans/2026-11-22-meal-parts-rules-a.md`. Leftovers are listed in docs/architecture.md, "Meal parts (Stage 3a)"
→ "Stage 3b owns".

## Calls I made (from the leftovers list)

- **Which parts count as capped.** Warnings treat a part as capped when an enabled hard per-meal cap rule of 1 covers it
  (`cappedParts`). Until Stage 5, the legacy single parts (Curry, Subzi) also count, because `legacySlotCaps` keeps them
  single in the app. A deleted cap therefore still warns, matching what the planner does.
- **A higher part decides, as you chose.** Take a base that always brings one subzi and a curry whose upward link wants
  another subzi. The base's subzi wins and the curry's want is reported, as today. A rule case pins this. `fits` does
  not change.
- **Removing a dish does not take its sides with it.** The orphan stays until polish drops it, as before. Changing this
  would move weeks for no clear gain, so it waits for a real case.
- **Dish drafts by the assistant stay on old fields until Stage 4.** In Stage 4 the dish form edits parts. The assistant
  stops drafting old-field rules and drafts links by part now.

## Global Constraints

- **Weeks do not change.** `src/rule-cases/repair.snapshot.test.ts` stays untouched. `npm run rule-cases` passes with no
  existing expectation edited; new cases are added. Any planner change that moves a week stops the task.
- On a converted library, warnings, prompts and forms read as today. Words that name parts use the stored part name in
  lower case ("a meal holds one curry"). The assistant's tool argument shapes may change, because they are internal.
- CLAUDE.md applies:
  - never save what the user did not change;
  - test both load orders for forms reading the shared lookup;
  - every edge case becomes a rule case;
  - follow the commit style (scopes `links`, `assistant`, `rules`, `plan`, `rule-cases`, `planner`).
- Legacy names (base, curry, subzi, extra) stay only in the legacy files listed in docs/architecture.md.
  `src/assistant` is no longer one of them. Its prompt may keep plain food words in examples.

## Review Focus

1. **A library with Main/Side/Dessert parts.** Warnings, the assistant's part list and the picker work without the four
   converted parts. Nothing throws because `legacyPartIds` is missing a part (Tasks 1, 3, 4, 5 tests).
2. **A deleted cap rule before Stage 5.** The warning still blocks two Always curries, because the app still holds one
   (Task 1 test).
3. **A hand-picked dish that brings nothing.** The meal keeps its other dishes and the week is unchanged (Task 5 test).
4. **An assistant draft naming a deleted part or category.** `propose_rule` refuses it with "refers to … which no longer
   exists" (Task 3 test).
5. **A hand-picked curry in a meal whose base always brings a different curry.** The pick is kept. The base's link is
   reported as a problem, as today, and nothing re-plans it away silently (Task 5 test).

---

### Task 1: Link warnings read the cap rules

**Files:**
- Modify: `src/rules/link-warnings.ts`, `src/components/library/links/LinkList.tsx` (`useLinkWarnings`),
  `src/components/library/ComponentForm.tsx`, `src/assistant/tools.ts` (`pairingConflict`, types only)
- Test: `src/rules/link-warnings.test.ts`, `LinkList.test.tsx`, `ComponentForm.test.tsx`, `src/assistant/tools.test.ts`

**Interfaces:**
- Produces:
  - `linkWarnings(self: { id: number; name: string; part_id: number; category_id?: number | null }, links, lookup:
    Lookup, names: Names)`.
  - `Lookup` is `{ dishes, rules, parts }`.
  - Capped parts = `cappedParts(lookup.rules, { list: parts })`, plus the parts whose `legacy` is curry or subzi. The second
    set comes from a helper `appSingleParts(parts)` in `src/db/parts.ts`, documented as "until Stage 5".
  - Every "a meal holds one <role>" check works over capped parts after the first. `OTHER_ROLE` becomes "every other capped
    part". Messages keep their wording, with `<role>` replaced by the lower-cased part name.
  - The contradiction, never-plannable, hidden-by-scope and narrowing checks do not depend on caps.

- [ ] **Step 1: Failing tests.**
  - Every existing message test passes unchanged on the converted parts.
  - On a Main/Side/Dessert library with a cap rule on Side, two Always "comes with" links to different Sides give
    "…and a meal holds one side" and block.
  - Without that cap, the same links give no warning.
  - On converted parts with the curry cap rule deleted, two Always curries still block (Review Focus 2).
  - Nothing throws without the converted parts.
- [ ] **Step 2:** Run `npx vitest run src/rules/link-warnings.test.ts` — FAIL. Implement.
- [ ] **Step 3:** Run `npm test`, `npx tsc --noEmit` and `npm run lint` — PASS.
- [ ] **Step 4:** Commit: `refactor(links): link clashes are judged by the parts a rule caps`

### Task 2: The rule form picks categories by part

**Files:**
- Modify: `src/rules/form.ts` (field kinds `baseCategories`, `extraCategories`), `src/rules/templates.ts`
  (`require_with.categories` compile and describe for any part), `src/components/rules/editor/RuleEditor.tsx`
- Test: `src/rules/form.test.ts`, `RuleEditor.test.tsx`, `templates.test.ts`

**Interfaces:**
- Produces: a field kind `categories` with a `part: 'first' | 'any'` option.
  - `pairs_with` ("Only with a base from") offers the categories of the first part.
  - `require_with` ("And an extra from") offers every part's categories, labelled "<category> (<part>)".
  - The labels keep today's words on the converted parts.

- [ ] **Step 1: Failing tests.**
  - On converted parts, the two fields offer exactly today's options.
  - On Main/Side/Dessert, `pairs_with` offers Main's categories, and `require_with` offers every category labelled by part.
  - A no-edit save writes nothing.
- [ ] **Step 2:** Run the tests — FAIL. Implement. Run `npm test`, `tsc` and lint — PASS.
- [ ] **Step 3:** Commit: `refactor(rules): the rule form offers each part's categories`

### Task 3: The assistant knows the parts

**Files:**
- Modify: `src/assistant/prompt.ts`, `src/assistant/retrieve.ts`, `src/assistant/compare.ts`, `src/assistant/tools.ts`
  (`checkSpec` / `propose_rule`)
- Test: `prompt.test.ts`, `retrieve.test.ts`, `compare.test.ts`, `tools.test.ts`

**Interfaces:**
- Produces:
  - `Slice.summary.parts: { id; name; categories: { id; name }[] }[]`, in part order. It lists every part, including the
    Curry part's curry types.
  - The prompt lists `CONDITION_FIELDS` (`part`, `id`, `category`, `tags`, `frequency`) in place of `MATCH_FIELDS`. It tells
    the model to use the part and category ids from the summary.
  - The sentences about one curry and one subzi become "a part capped by an 'At most one … per meal' rule holds one dish".
  - The off-topic `VOCABULARY` check also accepts any part or category name from the slice.
  - `compare.ts` `touches` maps the library through `dishesWithParts` first.
  - `propose_rule` refuses a draft holding `role`, `componentType`, `base_category_id`, `extra_category_id` or
    `curry_category` leaves. The reason is "use part and category ids".
  - The `parts`/`skip` params of only_allow, skip_when and no_repeat take part ids from the summary.

- [ ] **Step 1: Failing tests.**
  - The slice holds the parts with their ids and categories, on converted parts and on Main/Side/Dessert.
  - The prompt names `part` and `category`, and not `componentType`.
  - A message mentioning "dessert" on a Main/Side/Dessert library is not off-topic.
  - `propose_rule` with a `componentType` leaf is refused.
  - `propose_rule` with a deleted category id is refused (Review Focus 4).
  - `touches` marks a dish with no `part_id` by its type.
- [ ] **Step 2:** Run `npx vitest run src/assistant` — FAIL. Implement. Run `npm test`, `tsc` and lint — PASS.
- [ ] **Step 3:** Commit: `feat(assistant): the assistant drafts rules over the stored parts`

### Task 4: The assistant drafts links by part

**Files:**
- Modify: `src/assistant/tools.ts` (`comesLinks`, `servedWithLinks`, `propose_pairing`, `propose_dish` link params,
  `howBrought`), `src/assistant/prompt.ts`
- Test: `src/assistant/tools.test.ts`

**Interfaces:**
- Consumes: Task 1's `linkWarnings` and `Lookup`, and Task 3's slice parts.
- Produces:
  - One link argument shape, `links: { part: string; dishes?: string[]; categories?: string[]; strength?: Strength }[]`,
    with part and names resolved against the slice.
  - The mode comes from `bringMode(ownerPart, targetPart, parts)`: a lower part means comes, a higher part means serve.
  - A dish's own part is allowed only where `offersLink` allows it (not first, not capped).
  - `served_with_bases` and `served_with_base_categories` are replaced by `links` aimed at the first part.
  - A dish of the first part cannot be served with the first part.
  - Nothing calls `legacyPartIds` for links.

- [ ] **Step 1: Failing tests.**
  - On converted parts, every existing pairing test passes with the new argument shape. The test arguments change; the
    results must not.
  - On Main/Side/Dessert, "Raita comes with Biryani" from Raita is stored as serve, and "Biryani comes with Raita and
    Salan" is two comes links.
  - A link to a capped own part is refused with the reason `offersLink` gives.
  - A clash is refused with Task 1's message.
- [ ] **Step 2:** Run `npx vitest run src/assistant` — FAIL. Implement. Run `npm test`, `tsc` and lint — PASS.
- [ ] **Step 3:** Commit: `feat(assistant): the assistant links dishes by part, higher deciding lower`

### Task 5: A hand-picked dish brings what it brings

**Files:**
- Modify: `src/services/pins.ts` (`pinsForMeal`), `src/stores/plan-store.ts` (`swapComponent`, `replanMeal`)
- Test: `src/services/pins.test.ts`, `src/stores/plan-store.test.ts`

**Interfaces:**
- Produces:
  - `pinsForMeal(plan, locks, day, slot, picked?: { part: 'base' | 'curry' | 'subzi' | 'extras'; id: number })`. These are
    legacy slot names, kept until Stage 5. The picked dish is pinned in its part along with the base. The meal's other
    unlocked parts are free.
  - `swapComponent` on any part writes the pick, then re-plans the meal with it pinned. Today it re-plans only for a base.
  - The result applies only while the meal is still as picked, as today.

- [ ] **Step 1: Failing tests.**
  - On the converted library, hand-picking Sambar in a meal where Papad is served with Sambar ends with Sambar and Papad.
  - Hand-picking a dish that brings nothing leaves the meal's other dishes as they were (Review Focus 3).
  - Hand-picking a curry where the base always brings another curry keeps the pick and reports the base's link
    (Review Focus 5).
  - Locked parts stay as they were.
  - Other meals are unchanged in every case.
- [ ] **Step 2:** Run `npx vitest run src/services/pins.test.ts src/stores` — FAIL. Implement. Run `npm test`, `tsc` and lint
  — PASS.
- [ ] **Step 3:** Commit: `fix(plan): a dish picked by hand brings the dishes it brings`

### Task 6: The planner's last part exemptions are pinned

**Files:**
- Modify: `src/planner/solver.ts` (comments and a named helper only)
- Create: rule cases in `src/rule-cases/cases/comes-with.ts` (or the matching group file)

**Interfaces:**
- Produces:
  - `jointPart` keeps its derivation, "the first single part after the first". It moves into a named, documented helper,
    `pivotPart(single: boolean[]): number | undefined`.
  - Its three uses keep their exact behaviour and RNG draws: the joint move, the `lockNudge` exemption and the sweep
    exemption.

- [ ] **Step 1: Rule cases, each with a `why`, each failing without its subject.**
  1. **Sweep exemption.** A conditional link waits on the curry. A hard rule breaks only when the curry is in the meal.
     The sweep removes the conditional side, never the curry it waits on. Pin what today's planner does.
  2. **A higher part decides.** Idli always comes with Avial (subzi). Beans Poriyal (subzi) is "served with" Sambar.
     Sambar comes with Idli. Idli's meals hold Avial, and the Sambar→Beans want is reported, not planned.
- [ ] **Step 2:** Run `npm run rule-cases`. The new cases pass on today's planner; record each failing without its subject.
- [ ] **Step 3:** Move the derivation into `pivotPart` with its doc comment, with no behaviour change. Run
  `npx vitest run src/rule-cases/repair.snapshot.test.ts` with the snapshot file untouched, then `npm test`, `tsc` and lint.
- [ ] **Step 4:** Commit: `test(rule-cases): the sweep spares the part a link waits on, and a higher part's side wins`

### Task 7: Docs and full check

- [ ] **Step 1:** In docs/architecture.md, add a "Meal parts (Stage 3b)" note and close the "Stage 3b owns" list. Cover:
  - warnings over caps, with legacy single parts until Stage 5;
  - the assistant over parts;
  - the form's part categories;
  - the picker's re-plan;
  - the pivot part and the two rule cases;
  - what stays as before (no removal cascade; dish drafts on old fields until Stage 4).

  Also update the legacy-file list, removing `src/assistant`.
- [ ] **Step 2:** Run `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run rule-cases`, with the repair snapshot
  untouched.
- [ ] **Step 3:** Commit: `docs(rules): stage 3 finished over parts`
