# Meal Parts Stage 2: Planner over Parts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The planner works over the ordered list of stored parts instead of base, curry, subzi and extras, with today's
weeks unchanged on every converted library.

**Architecture:** The planner takes `parts` (ordered) as input and keeps one dish array per part in each meal. Stored
rules still say `role`/`componentType`; `compileRules` rewrites those leaves to `part` leaves (legacy conversion, in
`src/rules/legacy-parts.ts`), and the default variety, spacing and "sides only when asked" rules are compiled from each
part's `varied` flag and position. "One curry, one subzi" moves out of the built-ins into two stored Always rules (v22);
the scorer and solver learn which parts hold one dish from those caps. Stored plans, locks and pins keep today's shape:
services convert at the planner boundary (`src/services/legacy-slots.ts`). Stage 5 changes storage.

**Tech Stack:** TypeScript, Vitest, Dexie, zod.

**Spec:** `docs/superpowers/specs/2026-11-16-user-defined-meal-parts-design.md` (Stage 2 of "Delivery"); Stage 1 plan:
`docs/superpowers/plans/2026-11-16-user-defined-meal-parts.md`.

## Global Constraints

- **Weeks do not change.** `src/rule-cases/repair.snapshot.test.ts` (seeds 1–8 on the seeded library plus its cases)
  passes with the snapshot file untouched, and all 91 rule cases pass with no expectation edited. Keep the RNG consumed in
  exactly today's order for a converted library (see Task 5). If a task cannot keep a week, stop and report; do not
  re-snapshot.
- Planner stays deterministic for a seed. Planner isolation (`src/planner/isolation.test.ts`): planner imports only zod,
  relative files and `@/types/component`.
- Nothing visible changes except the two new rules on the Rules page ("At most one Curry per meal", "At most one Subzi
  per meal"). Stored plans, locks, pins and lock keys keep today's shape.
- Old dish fields (`componentType`, category refs, tag arrays) stay the source of truth until Stage 4; the planner reads
  the derived `part_id`. Code that names base/curry/subzi/extras is allowed only in the legacy conversion files:
  `src/db/parts.ts`, `src/db/seed.tsx`, `src/rules/legacy-parts.ts`, `src/services/legacy-slots.ts`, the v22 upgrade.
- Database upgrades are additive and tested from the previous version (CLAUDE.md).
- Speed (my call): generating the seeded library is at most 10% slower than `main` (seeds 1–8, median of 5), recorded
  in the PR.
- CLAUDE.md commit style; scopes `planner`, `rules`, `db`, `plan`, `rule-cases`.

## Review Focus

1. A stored dish with no `part_id` (written by some path Stage 1 missed): planning still places it by its type (Task 2
   test: `loadPlanningInput` fills `part_id` from `componentType`).
2. A locked meal whose curry is locked empty (`curry_id: null`): stays empty after conversion to part pins (Task 4 test).
3. The user deleted or disabled the "At most one Curry per meal" rule: two Always links to different curries give two
   curries (spec consequence) instead of a clash (Task 6 rule case).
4. v22 on a library that was never seeded (no components): no cap rules added; the seed adds them (Task 3 test).
5. A stored rule using `role` that the rewrite misses would silently match nothing: the planner rejects any `role` leaf
   it is given (Task 5 test: `buildModel` throws `InvalidConstraintError`).

---

### Task 1: Planner vocabulary for parts (additive)

**Files:**
- Modify: `src/planner/types.ts`, `src/planner/matcher.ts`, `src/planner/test-utils.ts`, `src/planner/index.ts`,
  `src/db/parts.ts`, `src/rule-cases/library.ts`, `src/rule-cases/seeded-library.ts`
- Test: `src/planner/matcher.test.ts`, `src/db/parts.test.ts`, `src/rule-cases/run.test.ts`

**Interfaces:**
- Produces:
  - `interface PlannerPart { id: number; name: string; varied: boolean }` (planner/types.ts). A meal's parts are a
    `readonly PlannerPart[]` in order; index 0 is the first part.
  - `ComponentLike` gains `part_id?: number; category_id?: number | null; tags?: Readonly<Record<number, readonly number[]>>`
    (made required for `part_id` in Task 5).
  - Matcher fields: `part` (kind `id`, reads `a.c.part_id`), `category` (kind `id`, reads `a.c.category_id ?? undefined`),
    `tags` (kind `set`, values are strings `"<groupId>:<valueId>"`, reads the flattened `a.c.tags`; value schema
    `z.string().regex(/^\d+:\d+$/)`). Not added to `CONDITION_FIELDS` (Stage 3).
  - `TEST_PARTS: readonly PlannerPart[]` in `planner/test-utils.ts`: ids 1–4, names Base, Curry, Subzi, Extras,
    `varied` true, true, true, false; `component()` sets `part_id` from its type (base 1, curry 2, subzi 3, extra 4).
  - `type LegacyParts = Record<ComponentType, number>` and `legacyPartIds(parts: readonly Pick<PartRecord,'id'|'name'>[]): LegacyParts`
    in `src/db/parts.ts` (match by `CONVERTED_PARTS` names; throws if one is missing).
  - Rule-case libraries: every dish in `library.ts` and `seeded-library.ts` (and case-only dishes built through
    `libraryOf`) carries `part_id`, `category_id`, `tags` from `convertDish`; `CaseLibrary` gains `parts: PlannerPart[]`
    (the four converted parts, ids 1–4).

- [ ] **Step 1: Failing tests:** matcher reads `part`, `category`, `tags` (`has('tags','2:5')` true for a dish with
  `tags {2:[5]}`; a malformed tag value `'x'` fails `MatcherSchema`); `legacyPartIds` maps names to ids and throws on a
  missing Curry; every rule-case library dish has `part_id` equal to `legacyPartIds(parts)[componentType]`.
- [ ] **Step 2:** Run `npx vitest run src/planner/matcher.test.ts src/db/parts.test.ts src/rule-cases/run.test.ts` — FAIL.
- [ ] **Step 3:** Implement. Run the same, then `npm test`, `npx tsc --noEmit`, `npm run lint` — PASS; the 18-dish count in
  `run.test.ts` is unchanged.
- [ ] **Step 4:** Commit: `feat(planner): dishes carry their part, category and tags into the planner`

### Task 2: Rules compile to parts

**Files:**
- Create: `src/rules/legacy-parts.ts`, `src/rules/legacy-parts.test.ts`
- Modify: `src/rules/record.ts` (`compileRules`), `src/services/plan-generation.ts` (`PlanningInput`, `modelFromData`),
  `src/services/planning.ts` (`loadPlanningInput`), `src/services/compare-rules.ts`, `src/rule-cases/run.ts`,
  `src/rule-cases/seeded-library.ts`, every other `compileRules` caller (`grep -rn "compileRules(" src`)
- Test: `src/rules/record.test.ts`, `src/services/planning.test.ts`

**Interfaces:**
- Consumes: `PlannerPart`, `LegacyParts`, `legacyPartIds` (Task 1).
- Produces:
  - `interface RuleParts { list: readonly PlannerPart[]; legacy: LegacyParts }` (src/rules/legacy-parts.ts).
  - `toPartMatcher(m: Matcher, legacy: LegacyParts): Matcher` — rewrites every `role` and `componentType` leaf
    (`eq`, `neq`, `in`) to the same op on `part` with the mapped ids; other leaves unchanged.
  - `constraintOverParts(c: Constraint, legacy: LegacyParts): Constraint` — applies `toPartMatcher` to every matcher a
    constraint holds (`select`, `when.exists`, pair `when`, `of`, `inMeal[]`, and any other matcher in
    `src/planner/constraints.ts`).
  - `compileRules(rules, known, parts: RuleParts)` — every compiled constraint goes through `constraintOverParts`. For
    `default_key` `variety` and `spacing`, the `match` is `oneOf('part', ids of parts with varied)`; for
    `sides-only-when-asked`, `oneOf('part', ids of every part after the first)`. Stored rule rows are not changed.
  - `PlanningInput` gains `parts: PartRecord[]`; `loadPlanningInput` reads them through `ensurePartsAndTagGroups()` in a
    `rw` transaction on `db.parts`, `db.tag_groups`, and fills a missing dish `part_id` from
    `legacyPartIds(parts)[componentType]` (Review Focus 1). Planner input keeps today's shape otherwise.

- [ ] **Step 1: Failing tests:** `toPartMatcher(oneOf('componentType',['base','curry']))` → `oneOf('part',[1,2])`;
  `is('role','extra')` → `is('part',4)`; a `day` leaf unchanged; `compileRules` output holds no `role` or `componentType`
  leaf for the full `defaultRules()` set plus a `comes_with` link with `when: { curry: [...] }`; variety's select names
  parts 1–3 and, with Subzi `varied: false`, parts 1–2; `loadPlanningInput` gives a stored dish without `part_id` its part.
- [ ] **Step 2:** Run `npx vitest run src/rules src/services` — FAIL.
- [ ] **Step 3:** Implement; update every caller to pass parts (rule cases use `CaseLibrary.parts`).
- [ ] **Step 4:** `npm test` (the repair snapshot unchanged), `npx tsc --noEmit`, `npm run lint`, `npm run rule-cases`
  (91/91) — PASS.
- [ ] **Step 5:** Commit: `refactor(rules): rules reach the planner as rules about parts`

### Task 3: "One curry, one subzi" become stored rules

**Files:**
- Modify: `src/db/client.ts` (v22), `src/db/seed.tsx`, `src/rules/defaults.ts` or a new `capRules()` beside it,
  `src/planner/builtins.ts`, `src/planner/scorer.ts` (`roleBitOf`, `claimRoles`, `resolveWith`, `holders`, `unitRoles`,
  `Justification.suppressed`), `src/services/plan-generation.ts` (suppressed text), `src/rule-cases/run.ts`,
  `src/rule-cases/types.ts` (`CaseWeeks.suppressed`)
- Test: `src/db/rule-migration.test.ts` (`describe('v22')`), `src/db/seed.test.ts`, `src/planner/scorer.test.ts`,
  `src/planner/builtins.test.ts`

**Interfaces:**
- Produces:
  - `capRules(): Omit<RuleRecord,'id'|'enabled'|'created_at'>[]` — two rules, no `default_key`, no owner: names
    `At most one Curry per meal` and `At most one Subzi per meal`; spec
    `{ template: 'limit', params: { match: is('componentType', 'curry'|'subzi'), per: 'meal', max: 1, strength: 'must' } }`.
    They compile to level `rule` (hand-written, never give way) — the same as the built-ins they replace.
  - v22: adds `capRules()` (enabled) only when `components.count() > 0` (the v16 guard; Review Focus 4). Same stores
    block as v21. The seed adds them after the default rules.
  - Rule cases: `run.ts` adds `capRules()` to every case after the defaults. `PlanCase.without` also accepts
    `'cap:curry'` and `'cap:subzi'`, which drop that cap (used by Task 6's case).
  - `builtinConstraints()` loses `builtin:max-curry` and `builtin:max-subzi`; the others stay until Task 5.
  - Scorer: the parts that hold one dish are those with a hard per-meal cap of 1 — a count constraint with
    `groupBy: 'slot'`, no `scope`, `bounds.hardMax === 1` and `select` exactly `is('part', id)` (or `oneOf` of one id).
    `capped(model): ReadonlySet<number>` (part ids) is computed in `compileModel`. A pair claims its candidates' part
    when that part is capped (replaces `roleBitOf`); `holders` is keyed by part id. Extras stay unclaimed as today.
  - `Justification.suppressed.role` becomes `part: number` (part id). plan-generation's text uses the part's name in
    lower case ("a meal holds one curry"), so the words are unchanged; `CaseWeeks.suppressed` keeps `'curry' | 'subzi'`
    by mapping back through `LegacyParts` in `run.ts`.

- [ ] **Step 1: Failing tests:** v22 on a v21 database with components adds the two rules once, enabled, rules otherwise
  deep-equal; on one with no components adds nothing; the seed gives a new library both rules; scorer: with the curry cap
  removed from the constraints, two Always curry pairs in one meal are both kept (no suppression); with it, the second is
  suppressed with `part` = the Curry id.
- [ ] **Step 2:** Run `npx vitest run src/db src/planner` — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` (repair snapshot unchanged), `npx tsc --noEmit`, `npm run lint`, `npm run rule-cases` (91/91).
- [ ] **Step 5:** Commit: `feat(db): one curry and one subzi per meal are rules the user can see and edit`

### Task 4: Part slots and part pins, with legacy converters

**Files:**
- Modify: `src/planner/types.ts`, `src/planner/index.ts` (types only)
- Create: `src/services/legacy-slots.ts`, `src/services/legacy-slots.test.ts`

**Interfaces:**
- Produces (planner, types only, unused until Task 5):
  - `interface PartSlot { day: Day; meal_slot: Meal; parts: Record<number, number[]> }` — every part id of the model
    present, `[]` when empty; the first part holds exactly one dish.
  - `type PartPins = Readonly<Record<number, readonly number[]>>` — a part id present is locked to exactly that list
    (`[]` = locked empty); absent = free. `type WeekPartPins = Partial<Record<\`${Day}-${Meal}\`, PartPins>>`; Task 5
    makes it the planner's `Pins` and moves today's `Pins`/`SlotPins` to `src/services/pins.ts` as `LegacyPins`/`SlotPins`.
- Produces (services):
  - `toLegacySlot(s: PartSlot, legacy: LegacyParts): PlanSlot`, `fromLegacySlot(s: PlanSlot, legacy: LegacyParts): PartSlot`
  - `toPartPins(p: SlotPins, legacy: LegacyParts): PartPins` (`curry_id: null` → `{[curry]: []}`, `undefined` → absent,
    `extra_ids: []` → `{[extras]: []}`) and `toWeekPartPins(p: Pins, legacy): WeekPartPins` for a whole week
    (today's planner `Pins`).

- [ ] **Step 1: Failing tests:** round trip `fromLegacySlot(toLegacySlot(s))` for a meal with base+curry+2 extras and for
  base only; `toPartPins` for each case above (Review Focus 2); a part slot with two curries throws in `toLegacySlot`
  (a legacy slot holds one).
- [ ] **Step 2:** Run `npx vitest run src/services/legacy-slots.test.ts` — FAIL. Implement. PASS; `npx tsc --noEmit`.
- [ ] **Step 3:** Commit: `feat(plan): meals and locks convert between today's shape and parts`

### Task 5: The planner keeps one dish list per part

**Files:**
- Modify: `src/planner/types.ts`, `src/planner/scorer.ts`, `src/planner/solver.ts`, `src/planner/plan.ts`,
  `src/planner/builtins.ts`, `src/planner/matcher.ts`, `src/planner/index.ts`, all planner tests;
  callers: `src/services/plan-generation.ts` (incl. `slotConflicts`), `src/services/pins.ts`,
  `src/services/compare-rules.ts`, `src/stores/plan-store.ts`, `src/assistant/tools.ts`, `src/rule-cases/run.ts`,
  `src/rule-cases/expect.ts`, and anything else `npx tsc --noEmit` names.

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - `ModelInput { library; parts: readonly PlannerPart[]; constraints? }`; `ComponentLike.part_id` required.
  - Field meanings: `part` is the dish's own part (`c.part_id`, what Task 2's rewrite targets); `slot_part` is the part
    the dish is placed in. They agree in every plan `builtin:wrong-part` accepts, as `role` and `componentType` do today.
  - `SlotState { parts: number[][] }` indexed by part position; `emptyPlan(partCount)`; `dishesIn`, `withDish`,
    `withoutDish` take a part index. `PARTS`, `PartDef`, `partOf`, `Role` as a slot concept, `ROLES` in the scorer,
    `PickRole`, `PIN_KEY` go. `Assignment` gets `part: number` (the slot's part id) in place of `role`; matcher field
    `slot_part` (kind `id`, reads `a.part`, planner-internal). `FIELDS.role` stays for stored-rule schemas until Stage 3,
    but `buildModel` throws `InvalidConstraintError` for any constraint holding a `role` leaf (Review Focus 5).
  - `planWeek(input, opts: SolveOptions & { pins?: Pins })` returns `slots: PartSlot[]`; public scorer helpers
    (`bringsWith`, `mealBrings`, `ownRulesOverridden`, `yieldedPreferWeight`, `slotPairs`) take a part id where they took
    a `Role`.
  - Built-ins over parts: `builtin:one-dish-first-part` (`is('slot_part', first)`, slot, hardMin 1, hardMax 1),
    `builtin:wrong-part` (`any(parts.map(p => all(is('slot_part',p.id), not(is('part',p.id)))))`, hardMax 0),
    `builtin:dish-twice` (all dishes, `groupBy: ['component','slot']`, hardMax 1).
  - Callers keep storing `PlanSlot` and reading legacy locks: they convert with Task 4's functions and
    `legacyPartIds(input.parts)`.

**Keeping weeks unchanged (decided):**
- A part is **single** if it is the first part or capped at 1 (Task 3's `capped`); otherwise **many**.
- Pools are per part, filled from `part_id` in library order.
- Construction order: the first part, then single parts in position order, then many parts — today's base, curry,
  subzi, extras.
- The pick move draws from `[first, ...single parts]` (today's `PICK_ROLES`). The joint move pairs the first part with the
  first single part after it (today: base + curry). The add/remove move uses the only many part without an RNG draw; it
  draws among many parts only when there are several.
- Sweep's curry exemption becomes "the first single part after the first part", with its comment kept. Stage 3 turns it
  into a rule case.
- Snapshot, clone, `hardBefore` and the "never mutate a many part's array in place" rule apply to every part.
- `lockNudge` takes the locked dishes of every part after the first, where today it took the pinned subzi and extras.
- Memo key: `(ci * parts.length + partIndex) * SLOT_COUNT + slot`.

- [ ] **Step 1: Failing tests:**
  - `buildModel` throws for a `role` leaf.
  - On a library with parts Main, Side, Dessert (no caps): a link from a Main to two Sides gives both in one meal.
  - A pinned meal keeps its pinned dishes per part.
  - `planWeek` returns `PartSlot`s whose first part holds exactly one dish.
- [ ] **Step 2:** Run `npx vitest run src/planner` — FAIL.
- [ ] **Step 3:** Implement in the planner, then switch every caller (`npx tsc --noEmit` guides).
- [ ] **Step 4:** Run `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run rule-cases` (91/91). All must pass with
  the repair snapshot file untouched. Update exact-shape tests (`types.test.ts`, `solver.test.ts`) only where the
  assertion is about the old shape, not the week.
- [ ] **Step 5:** Commit: `refactor(planner): meals hold one dish list per part, in the order the parts are stored`

### Task 6: Many dishes in a part, docs and checks

**Files:**
- Create: a rule case in `src/rule-cases/cases/comes-with.ts` (or the matching group file)
- Modify: `docs/architecture.md`, `CLAUDE.md` (Vocabulary: a meal is one dish of the first part plus dishes per lower
  part; the four converted parts are today's base, curry, subzi, extras)

- [ ] **Step 1:** Rule case (Review Focus 3): two Always "comes with" links on one base, to two different curries;
  `without` the "At most one Curry per meal" cap, both curries are in that base's meals. Its `why` names the spec
  consequence. It must fail without its subject (`rule-cases.test.ts` enforces).
- [ ] **Step 2:** `npm run rule-cases` (92/92), `npm test`, `npx tsc --noEmit`, `npm run lint`.
- [ ] **Step 3:** Speed: seeded library, seeds 1–8, median of 5, this branch vs `main`; record the numbers in the PR body.
  More than 10% slower fails.
- [ ] **Step 4:** Docs: a "Meal parts (Stage 2)" note in `docs/architecture.md`. Cover the planner input `parts`; single
  and many parts from caps; the compile-time rewrite of `role`/`componentType`; the cap rules; and that storage keeps
  today's shape until Stage 5.
- [ ] **Step 5:** Commit: `docs(planner): the planner works over parts`
