# Meal Parts Stage 3a: Stored Rules and Links over Parts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stored rules and links name parts and categories by id instead of base, curry, subzi and extras. Every
stored rule is converted, and links always bring dishes from a higher part to a lower one.

**Architecture:** Converted parts get a stable identity (`legacy` on the part, v23), so a later rename changes nothing.
Rule templates and links get part-based shapes (`parts`, `category`, `when` keyed by part id, `LinkTarget = {part, kind}`).
A v24 upgrade rewrites every stored rule to them, while frozen copies of today's builders keep v15–v22 writing the
shapes those versions knew. The screens that edit rules and links read parts from the lookup and look the same on a
converted library. Link warnings over cap rules, the assistant's link drafting, new condition fields in the editor and
the planner's "joint part" are Stage 3b.

**Tech Stack:** TypeScript, zod, Dexie, React (Next.js), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-16-user-defined-meal-parts-design.md` (Stage 3 of Delivery). Stage 2:
`docs/superpowers/plans/2026-11-18-meal-parts-planner.md`, docs/architecture.md "Meal parts (Stage 2)".

## User decisions for this stage (2026-11-22)

- **Any part may link to any other part in the UI; the rule is always modelled top to bottom.** A higher dish decides
  and a lower one follows.
  - A link from a dish to a lower part is a **comes** link: the owner brings the target.
  - A link from a dish to a higher part is a **serve** link: the owner is added when the target is in the meal.
  - Example: Papad (Extras) "comes with Sambar" (Curry) is stored as "when Sambar is in a meal, Papad is added".
  - Today's "served with bases" is the serve link to the first part.
- **Existing upward links change meaning** in the upgrade. A subzi or extra that "comes with" a curry becomes "added when
  that curry is in the meal". Weeks with such links may change; the PR lists every rule case whose expectation changes.
- Stage 3 ships as two PRs: 3a (this plan) and 3b (link warnings over caps, assistant, condition editor fields,
  presets over parts, the planner's joint part).

## Global Constraints

- **Weeks do not change except where an upward link flips** (decision above). Guards:
  - `src/rule-cases/repair.snapshot.test.ts` stays untouched; its seeded-library links all go downward.
  - `npm run rule-cases` passes, with every changed case expectation listed in the PR with why.
  - Any other week change stops the task and is reported.
- Nothing else visible changes on a converted library: rule descriptions, link text and forms read the same. Part names
  come from stored parts. Lower-case them where today's words are lower case ("a curry", "extras").
- A **comes** link may name a `when` for any part except the part it brings into and the first part.
- After a reorder (Stage 4), a link pointing the wrong way is skipped by `compileRules` and named as a rule issue. That
  is a comes link whose target is not below its owner, or a serve link whose target is not above it.
- Database upgrades are additive and tested from the previous version with realistic rows (CLAUDE.md). The v15–v22
  upgrades keep writing exactly what they write today.
- CLAUDE.md "never save what the user did not change" holds for link and rule forms; test both load orders for any
  form that reads the shared lookup.
- Code that names base/curry/subzi/extras stays only in the legacy conversion files:
  - `src/db/parts.ts`, `src/db/seed.tsx` and `src/db/seed-data.ts`;
  - `src/db/legacy-rules.ts` (new);
  - `src/rules/legacy-parts.ts` and `src/rules/legacy.ts`;
  - `src/services/legacy-slots.ts`, `src/services/pins.ts` and `src/services/plan-generation.ts`, until Stage 5;
  - the upgrades;
  - and Stage 3b's files (`link-warnings.ts`, `src/assistant`).
- CLAUDE.md commit style; scopes `rules`, `links`, `db`, `rule-cases`.

## Review Focus

1. A stored link whose dish or category was deleted before the upgrade: v24 keeps it as today, skipped and named, not
   dropped silently (Task 6 test).
2. An owned link on a dish whose `part_id` is missing: the upgrade takes the part from `componentType` (Task 6 test).
3. Editing a converted link and saving without changes writes nothing (Task 5 test, both load orders).
4. A user's hand-written rule using `componentType`, `base_category_id` or `curry_category` leaves: converted and
   described exactly as before (Task 6 test, `describeSpec` before/after equal).
5. Deleting a dish or category named in a part-keyed `when` or a category link: removed from the link as today (Task 5
   tests for `deleteComponent` and `deleteCategory`).

---

### Task 1: Converted parts keep their identity

**Files:**
- Modify: `src/types/part.ts`, `src/db/parts.ts`, `src/db/parts-store.ts`, `src/db/client.ts` (v23)
- Test: `src/db/parts.test.ts`, `src/db/seed.test.ts`, `src/db/rule-migration.test.ts` (`describe('v23')`)

**Interfaces:**
- Produces:
  - `PartRecord.legacy?: ComponentType` marks the four converted parts.
  - `legacyPartIds(parts)` finds parts by `legacy`, no longer by name.
  - `ensurePartsAndTagGroups()` matches existing parts and tag groups by `legacy` (tag groups by a new
    `TagGroupRecord.legacy?: 'dietary' | 'protein' | 'regional' | 'occasion'`). It creates a missing one with `legacy`
    set, and never creates a part again because its name changed.
  - v23 sets `legacy` on the stored parts and tag groups whose names match the converted names. It runs once, on
    existing databases only; the seed sets it for new ones.

- [ ] **Step 1: Failing tests:**
  - After v23, the four parts carry `legacy` base/curry/subzi/extra.
  - A part renamed afterwards ("Mains") is still found by `legacyPartIds`.
  - `runSeed` on that library creates no fifth part.
  - A database already at v22 with no parts (never seeded) gets nothing from v23.
- [ ] **Step 2:** Run `npx vitest run src/db` — FAIL. Implement. PASS; `npm test`, `npx tsc --noEmit`, `npm run lint`.
- [ ] **Step 3:** Commit: `feat(db): the converted parts keep who they are when renamed`

### Task 2: Old upgrades keep their own builders

**Files:**
- Create: `src/db/legacy-rules.ts`
- Modify: `src/db/client.ts` (v14–v22 imports only), `src/db/rule-migration.test.ts` (imports only)

**Interfaces:**
- Produces: frozen copies of today's builders, under the same names, in `src/db/legacy-rules.ts`: `linkRule`,
  `readLink`, `pairingRule`, `dayRule`, `curryClashRule`, `strengthOf`, `defaultRules`, `capRules`, `defaultKeyForName`,
  and the types they need. Every upgrade v14–v22 imports from it. Nothing outside `src/db/client.ts` and its tests
  imports it.

- [ ] **Step 1:** Move the imports; `npx vitest run src/db/rule-migration.test.ts src/db/migrations.test.ts` stays PASS
  unchanged (a pure move: same tests, no expectation edited).
- [ ] **Step 2:** `npm test`, `npx tsc --noEmit`, `npm run lint`.
- [ ] **Step 3:** Commit: `refactor(db): old upgrades write the rule shapes of their own time`

### Task 3: Rule cases on any parts

**Files:**
- Modify: `src/rule-cases/types.ts`, `src/rule-cases/library.ts`, `src/rule-cases/run.ts`, `src/rule-cases/expect.ts`,
  `src/rule-cases/report.ts`
- Test: `src/rule-cases/run.test.ts`

**Interfaces:**
- Produces:
  - `CaseLibrary.parts` can be any part list.
  - `libraryOf(dishes, { parts?, categories? })` converts dishes against the given parts. The default stays the four
    converted parts with ids 1–4.
  - A case with its own library sets `PlanCase.library?: CaseLibrary`. Its weeks are `PartSlot` weeks (`CaseWeeks.parts`),
    with no legacy conversion, no `legacySlotCaps` and no `toLegacySlot`.
  - Expect helpers `partDishes(slot, partId)` and `everyMealHasInPart(partId, ids)`.
  - `CaseSuppressed` keys by part id. Converted cases keep their `'curry' | 'subzi'` reading through `legacy`.
  - The sample week in the report prints part names.

- [ ] **Step 1: Failing test:** a run of a trivial case on a Main/Side/Dessert library (ids 7, 3, 5 in that order; one
  Main, two Sides, one Dessert; no rules) gives 21 meals with one Main each and no Sides or Desserts.
- [ ] **Step 2:** Run `npx vitest run src/rule-cases/run.test.ts` — FAIL. Implement. PASS; `npm run rule-cases` unchanged.
- [ ] **Step 3:** Commit: `test(rule-cases): cases can run on a library with its own parts`

### Task 4: Rules name parts and categories

**Files:**
- Modify:
  - Rules: `src/rules/templates.ts` (only_allow, skip_when, no_repeat and the matcher-only templates),
    `src/rules/record.ts`, `src/rules/describe.ts`, `src/rules/form.ts`, `src/rules/conditions.ts`,
    `src/rules/defaults.ts`, `src/rules/legacy-parts.ts`, `src/rules/index.ts`.
  - Seed: `src/db/seed.tsx`, `src/db/seed-data.ts`.
  - Rule screens: `src/components/rules/editor/RuleEditor.tsx`, `ConditionEditor.tsx`, `src/components/rules/RuleList.tsx`,
    `presets.ts`.
  - Lookup: `src/components/library/LibraryLookup.tsx`.
  - Rule-case libraries and cases: as needed for the new builder signatures (no expectation changes).
  - Stage-3b files (`src/rules/link-warnings.ts`, `src/assistant/*`): adapt to new types only. Their logic reads part
    identity through `legacyPartIds`, and their behaviour and wording stay unchanged.
- Test: the matching `*.test.ts(x)` files

**Interfaces:**
- Produces (new stored shapes; the old ones no longer parse — v24 converts them):
  - Matcher leaves use `part` and `category`. New rules hold no `role`, `componentType`, `base_category_id`,
    `extra_category_id` or `curry_category` leaf.
  - `CONDITION_FIELDS` swaps `componentType` → `part` and the three category fields → `category`. The editor offers
    part names and every part's categories, labelled "<category> (<part>)".
  - Templates:
    - `only_allow.parts: number[]` (was `roles`).
    - `skip_when.skip: number[]` (part ids; never the first part).
    - `no_repeat.parts?: number[]` (was `roles`; absent = every part).
  - `Refs` and `KnownIds` hold `{ components, categories, parts }`; `missingReferences` names "part #n" and "category #n".
  - Defaults:
    - `defaultRules(parts, extraLimits?)` and `capRules(parts)` take the stored parts.
    - Variety and spacing match the varied parts; sides-only matches every part after the first.
    - The extras limits and caps match their part by `legacy`.
    - `partsSpec` compares a stored default against `defaultRules(parts)`, so a stock default still follows `varied` and
      new parts.
  - `Names` gains `part(id)` and `category(id)`. Descriptions use part names, lower-cased as today's words are ("a
    curry", "extras").
  - `LibraryLookup` gains `parts` (a fifth live query, included in `loaded`). `EditorData` gains `parts` and
    `categories`.

- [ ] **Step 1: Failing tests:**
  - For each of these templates, `describeSpec` gives the same sentence for today's example and its new-shape twin on
    the converted parts.
  - The rule editor offers part and category conditions and saves the new leaves.
  - `missingReferences` names a deleted category held in a `category` leaf.
  - RuleEditor and RuleList tests pass on the new data.
- [ ] **Step 2:** Run `npx vitest run src/rules src/components/rules src/db` — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run rule-cases`; repair snapshot untouched.
- [ ] **Step 5:** Commit: `refactor(rules): rules name parts and categories`

### Task 5: Links name parts, top to bottom

**Files:**
- Modify:
  - Rules: `src/rules/templates.ts` (comes_with, require_with, pairs_with, avoid_with), `src/rules/owned.ts`,
    `src/rules/link-text.ts`, `src/rules/describe.ts` (`describeWhen`).
  - Services and db: `src/services/food-db.ts` (`deleteComponent`), `src/services/category-db.ts` (`deleteCategory`),
    `src/db/dedupe.ts` (`remapSpec`), `src/db/seed.tsx`, `src/db/seed-data.ts`.
  - Link screens: `src/components/library/links/LinkEditor.tsx`, `LinkList.tsx`, `ComponentForm.tsx`.
  - Rule-case libraries and cases: as needed (no expectation changes).
  - Stage-3b files: adapt to the new types only.
- Test: the matching `*.test.ts(x)` files

**Interfaces:**
- Consumes: Task 4's leaves, `Names`, `KnownIds` and lookup `parts`.
- Produces:
  - Templates:
    - `pairs_with.categories: number[]` (categories of the first part; was `baseCategories`).
    - `require_with.categories: number[]` (was `extraCategories`).
    - `comes_with.of = all(is('part', p), oneOf('id' | 'category', values))`.
    - `comes_with.when?: Record<string, number[]>`, keyed by part id. It may not name `p` or the first part.
  - Link shapes:
    - `LinkTarget = { part: number; kind: 'dish' | 'category' }`.
    - `DishLink.when?: Record<number, number[]>`.
    - Link slots are `${mode}:${part}:${kind}`.
  - Building and reading links:
    - `linkRule(self: { id; name; part_id }, link, parts: readonly PlannerPart[])`.
    - `readLink(rule)`.
    - `bringMode(ownerPart, targetPart, parts): 'comes' | 'serve'` is what "comes with" in the editor stores. A lower
      target gives comes (the owner brings it); a higher one gives serve (the owner is added when it is in the meal).
    - Today's "served with bases" is serve to the first part.
  - `offersLink(ownerPart, target, parts)`: "only with" and "comes with" to any part except the owner's own; "never
    with" to any part.
  - The editor offers a `when` picker per part, for every part other than the target's and the first.

- [ ] **Step 1: Failing tests:**
  - `linkRule`/`readLink` round-trip every mode × target kind.
  - "Papad comes with Sambar" on Papad's form stores a serve link: Papad is added when Sambar is in a meal.
  - A comes `when` naming the target's own part is refused.
  - `deleteComponent` and `deleteCategory` remove an id from a part-keyed `when` and from a category link (Review
    Focus 5).
  - LinkEditor, LinkList and ComponentForm run under both load orders, and a no-edit save writes nothing (Review
    Focus 3).
- [ ] **Step 2:** Run `npx vitest run src/rules src/services src/components/library src/db` — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run rule-cases`; repair snapshot untouched.
- [ ] **Step 5:** Commit: `refactor(links): links name parts, and a higher dish brings a lower one`

### Task 6: Stored rules are converted (v24)

**Files:**
- Create: `src/db/rules-over-parts.ts` (the pure converter, used only by v24)
- Modify: `src/db/client.ts` (v24)
- Test: `src/db/rules-over-parts.test.ts`, `src/db/rule-migration.test.ts` (`describe('v24')`)

**Interfaces:**
- Produces:
  - `convertRuleSpec(spec: unknown, ctx: ConvertRulesContext): { spec: RuleSpec } | { skipped: string }`, where
    `ConvertRulesContext = { legacy: LegacyParts; curryCategory: Map<CurryCategory, number>; partOf: Map<number, number> }`.
    `partOf` maps dish id → part id, filled from `componentType` when `part_id` is missing (Review Focus 2).
  - What it converts:
    - every old leaf (`role`, `componentType` → `part`; `base_category_id`, `extra_category_id`, `curry_category` →
      `category`, with curry types mapped to their Curry-part category);
    - the old template params, to the Task 4 and Task 5 shapes;
    - `when {curry, subzi}` → keyed by part id;
    - an owned upward comes link (target part above the owner's) → a serve link.
  - A spec that no longer parses keeps its old spec untouched. A deleted id stays in place, so `compileRules` names it
    as today (Review Focus 1).
  - v24 runs `convertRuleSpec` over every rule in one transaction. It creates any Curry-part category a rule names but
    no dish uses, exactly as v21 named them. It changes no `id`, `name`, `enabled`, `default_key` or
    `owner_component_id`.

- [ ] **Step 1: Failing tests:**
  - A v23 database holds:
    - the stock defaults and caps;
    - a hand-written `skip_when` on `['subzi']`;
    - an `only_allow` on `roles`;
    - a `comes_with` with `when.curry`;
    - an extra's upward "comes with" a curry;
    - a served-with-bases link;
    - an "only with" base categories link;
    - a link naming a deleted dish.

    After v24, each spec matches its new shape. `describeSpec` is unchanged for all but the flipped link (Review Focus 4).
    The flipped link reads as "added when <curry> is in the meal", and the deleted-dish link is still named by
    `compileRules`.
  - Plans from the converted rules equal plans from the old rules on Stage 2's compile path for a library without upward
    links (seeds 1–3).
- [ ] **Step 2:** Run `npx vitest run src/db` — FAIL. Implement. PASS.
- [ ] **Step 3:** `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run rule-cases`.
- [ ] **Step 4:** Commit: `feat(db): stored rules and links name parts, and a lower dish follows a higher one`

### Task 7: Links follow the part order, with rule cases

**Files:**
- Modify: `src/rules/record.ts` (`compileRules`: wrong-way links), `src/components/library/links/LinkList.tsx` (shows a
  skipped link as today's "refers to something deleted" notice does)
- Create: rule cases in `src/rule-cases/cases/comes-with.ts` (and the matching group files)

**Interfaces:**
- Produces: `compileRules` skips a comes link whose target part is not below its owner's, and a serve link whose target
  part is not above it. The RuleIssue message is "points to <part>, which is no longer below <owner part>" (or "above").
  `KnownIds` carries `partOf` for owners.

- [ ] **Step 1:** Rule cases, each with a `why`. Each must fail without its subject.
  1. Main/Side/Dessert library: a Main with two Always "comes with" links to two different Sides gets both Sides.
  2. A general rule ("every Main has a Side", `require` over the Side part) and a Main's link to one Side, satisfied by
     that one Side.
  3. Upward link: an extra "comes with" a curry; that extra is in every meal holding that curry, and in no other.
  4. Wrong way: a comes link whose target is above its owner (a reordered library) is skipped and named, and plans as if
     absent.
- [ ] **Step 2:** `npm run rule-cases` — the new cases fail before the `compileRules` change (case 4) or pass with
  Task 4–6 behaviour (1–3; confirm each fails without its subject).
- [ ] **Step 3:** Implement the wrong-way skip and its LinkList notice; unit test in `record.test.ts`.
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run rule-cases`.
- [ ] **Step 5:** Commit: `feat(links): a link follows the order of the parts, and one pointing the wrong way is named`

### Task 8: Docs and full check

- [ ] **Step 1:** docs/architecture.md: a "Meal parts (Stage 3a)" note covering:
  - part identity (`legacy`);
  - the new rule and link shapes;
  - top-to-bottom links (comes and serve);
  - v24, and the frozen builders for v14–v22;
  - wrong-way links;
  - the rule-case runner for any parts;
  - what 3b still owns.

  CLAUDE.md Vocabulary:
  - "Served with" becomes a link that adds a dish when a dish of a higher part is in the meal.
  - "Comes with" brings a dish of a lower part.
- [ ] **Step 2:** `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run rule-cases`; repair snapshot untouched.
- [ ] **Step 3:** Speed: seeded library, seeds 1–8, median of 5, vs `main`; at most 10% slower; numbers in the PR.
- [ ] **Step 4:** Commit: `docs(rules): rules and links over parts`
