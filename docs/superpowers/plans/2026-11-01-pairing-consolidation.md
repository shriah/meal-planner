# Pairing Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each pairing job have one concept, one stored form and one place to edit it, and fix the bugs those overlaps cause.

**Architecture:**
- "Served with" (an owned `require_with` rule, `serve:<target>`) is the one way a side gets added to a base.
- The planner is the only code that decides what a meal holds. Picking a base by hand re-plans that one meal, with every other meal held as it is.
- The base-side editors and the hand-fill helper are removed.
- Hand-written pairing rules are converted into dish-owned links by a v19 upgrade, which also removes leftover defaults and duplicate rules.
- Strength words come from one map.

**Tech Stack:** Next.js 16, React 19, Dexie (fake-indexeddb in tests), zod 4, Vitest + happy-dom + Testing Library.

**Spec:** There is no separate design document. The decisions were agreed in the 2026-11-01 conversation:
- Convert exact-shape hand-written pairings into served-with links.
- Remove "A curry in every meal" and "A subzi in every meal" when they are untouched.
- Clean up on `dish-meals` before opening pull requests.

Current behaviour is documented in `docs/architecture.md` ("Rules model").

## Global Constraints

- **Existing rules:** every stored rule keeps working and stays editable somewhere (the dish form or the Rules page). No rule is changed in meaning by an upgrade except the ones listed in Task 1.
- **Untouched links:** a link the user did not change is never rewritten on save.
- **Database upgrade:** exactly one new Dexie version, **v19**. Its upgrade is tested in `src/db/rule-migration.test.ts` in the style of the v17 and v18 tests.
- **Test style:** UI tests wait on observable state (`findBy*`, `waitFor`, and the `readyButton` helper that the ComponentForm and LinkList tests use). Data loads asynchronously, so no synchronous `getBy*` right after a render or click.
- **Copy:** sentence case, no em dashes in UI strings.
- **Code style:** match the code around it. Components use no semicolons; `src/rules`, `src/services` and `src/db` use semicolons. Comments are sparse and explain why.
- **Checks:** every task ends with `npx tsc --noEmit`, `npx eslint src`, and `npx vitest run` green (run it twice) before its commit.
- **Commit trailer:** `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A library that has run v19 twice, or a fresh seed:** no duplicate rules, and the seed runs once even when React runs effects twice. Covered in Task 1.
2. **Picking a base by hand on a meal that has a locked curry:** the locked curry stays. Other meals don't change. Sides follow every rule, including "never with" and the extras limits. Covered in Task 2.
3. **A converted hand-written pairing that was switched off, or limited to some days:** it stays off, or limited, as a link. Covered in Task 1.
4. **An existing "only with" link on a target the Add list no longer offers:** it is still listed, editable and removable. Covered in Task 6.
5. **The assistant pairing a dish that already exists:** the dish's form opens with the new served-with link merged over its stored links, and saving writes only that link. Covered in Task 4.

---

### Task 1: Seed once, and the v19 cleanup upgrade

**Files:**
- Modify: `src/db/seed.tsx` (`runSeed`)
- Modify: `src/db/client.ts` (add `db.version(19)`)
- Keep `RETIRED_DEFAULT_NAMES` in `src/rules/defaults.ts`: a very old library still passes through v17, which needs those names to key the rules that v19 then removes.
- Test: `src/db/seed.test.ts`, `src/db/rule-migration.test.ts`

**Interfaces:**
- Produces: `runSeed()` that seeds at most once, even when two calls overlap.
- Produces: a v19 upgrade.

**Steps:**
- [ ] **Step 1: Write failing tests.**
  - In `seed.test.ts`: `it('seeds once when two calls overlap')`. Run `await Promise.all([runSeed(), runSeed()])` on an empty database, then check that the component count and rule count equal those of a single run.
  - In `rule-migration.test.ts`: `it('v19 removes duplicate and retired rules and turns hand-written pairings into served-with links')`. Open a v18 database containing:
    - two identical unowned rules (same name, spec and enabled state), so one should remain (the lower id);
    - `want-curry` and `want-subzi` switched off with their original name and spec, so both should be deleted;
    - `want-subzi` switched on, or renamed, so it stays and loses its `default_key`;
    - an enabled `require_with` rule with `when: is('id', idli)` (or `oneOf('id', [idli, dosa])`) and `components: [sambar, chutney]`, `scope.meals: ['breakfast']`, `strength: 'prefer'`, `cost: 6`. It should become one owned rule per dish, where `readLink(...)` equals `{ mode: 'serve', target: 'base_dish', values: [idli, dosa], strength: 'moderately', scope: { meals: ['breakfast'] } }`, and the original rule is removed;
    - a switched-off pairing of the same shape, which should give switched-off links;
    - a `require_with` whose `when` is a base category leaf (`is('base_category_id', c)`), which should give target `base_category`;
    - a `require_with` that does not fit: its `when` names a curry, or it has `extraCategories`, or its `when` is a compound matcher. It should be left unchanged;
    - a dish that already owns a `serve:base_dish` link, plus a hand-written pairing for it. The values should be merged into the existing link, keeping the existing link's strength.
- [ ] **Step 2: Run them.** `npx vitest run src/db`. Expected: they fail.
- [ ] **Step 3: Implement.**
  - **`runSeed`:** guard it with a module-level in-flight promise, and do the count check and the inserts inside one `db.transaction('rw', …)`.
  - **v19:** use the same stores as v18. Its upgrade does three things:
    1. Removes duplicate unowned rules, comparing on `name` + `JSON.stringify(spec)` + `enabled`.
    2. Handles `want-curry` and `want-subzi`. If the rule is still `enabled: false` and its name and spec equal the original definitions (copy those into the upgrade as constants), delete it. Otherwise remove its `default_key`.
    3. Converts exact-shape `require_with` rules into owned serve links:
       - "Exact shape" means: unowned; `extraCategories` empty; `when` is a single leaf on `id` (every id a base in the library) or on `base_category_id`; `components` non-empty and every id an existing curry, subzi or extra.
       - Each component gets a `linkRule(component, { mode: 'serve', target, values, strength: strengthOf(params), scope })`. Keep `enabled` from the original rule.
- [ ] **Step 4:** Run the full checks. Expected: pass.
- [ ] **Step 5: Commit** `fix(db): seed once; v19 removes duplicate and retired rules and converts pairings to served-with links`.

### Task 2: Picking a base by hand re-plans that meal through the planner

**Files:**
- Modify: `src/planner/types.ts` (`SlotPins`), `src/planner/solver.ts`
- Modify: `src/stores/plan-store.ts` (`swapComponent`)
- Delete: `src/rules/served.ts`, `src/rules/served.test.ts`, and its export in `src/rules/index.ts`
- Test: `src/planner/solver.test.ts`, `src/stores/plan-store.test.ts`

**Interfaces:**
- Produces: `SlotPins.curry_id?: number | null` and `subzi_id?: number | null`. `null` means the role is held empty.
- Produces: `pinsForMeal(plan: WeeklyPlan, locks, day, meal): Pins` in `src/services/pins.ts`. Every other meal is pinned exactly as it is (an empty curry or subzi as `null`, extras as their list). In the target meal the base is pinned to the new base, and the other roles are pinned only if they are locked.

**Steps:**
- [ ] **Step 1: Write failing tests.**
  - In `solver.test.ts`: `it('keeps a role pinned empty')`. A `curry_id: null` pin leaves that meal's curry empty, even when a rule rewards a curry.
  - In `plan-store.test.ts`, replace the Task "served with" swap test with `it('re-plans only the meal whose base was picked by hand')`. The checks:
    - The served-with curry and extras arrive.
    - A "never with" link on that extra keeps it out.
    - A locked curry stays.
    - Every other meal is unchanged.
    - Run the planner in-thread, the way the existing store tests stub `planningService` (`vi.spyOn(planningService, 'generatePlan')` or the in-thread runner).
- [ ] **Step 2:** Run them. Expected: they fail.
- [ ] **Step 3: Implement.**
  - **Solver:** in `solve`, a `null` pin is not free and leaves the state `undefined`. `isFree` checks `=== undefined` on the raw pin.
  - **Plan store:** `swapComponent` for `'base'` sets the base, then calls `generatePlan({ pins: pinsForMeal(...) })` and takes only the target meal from the result. The rest of the plan stays the same object. The planning problems for the week are updated from the result.
  - **Cleanup:** remove `fillServed`, `servedWith` and `served.ts`.
- [ ] **Step 4:** Run the full checks. Expected: pass.
- [ ] **Step 5: Commit** `fix(plan): picking a base re-plans that meal through the planner`.

### Task 3: One base-side view, no base-side editor

**Files:**
- Modify: `src/components/library/CategoryManager.tsx` (remove the "Goes With" button, `renderPairings` and `handleTogglePairing`, and the pairing live query)
- Modify: `src/services/food-db.ts` (remove `setCategoryPairings`)
- Modify: `src/rules/owned.ts` and `index.ts` (remove `pairedCategories` if nothing else uses it)
- Modify: `src/components/library/ComponentForm.tsx` ("Base to")
- Test: `src/components/library/CategoryManager.test.tsx`, `src/services/food-db.test.ts`, `src/components/library/ComponentForm.test.tsx`

**Interfaces:**
- Produces: on a base's edit form, "Served with this base" lists the dishes whose served-with link names this base or its category, with their strength word, each linking to `/library#dish-<id>`.
  - It replaces "Base to" and is hidden when the list is empty.
  - It is read only. Pairings are edited on the side dish.

**Steps:**
- [ ] **Step 1: Tests.**
  - Delete the Goes With tests (`CategoryManager.test.tsx` "sets which curries and subzis go with a base category", and the `setCategoryPairings` describe in `food-db.test.ts`).
  - Rewrite the "Base to" test as `it('lists the dishes served with a base')`. Use one link to the base and one to its category, which should be listed. A plain "only with" link should not be listed, and neither should a dish with no link.
- [ ] **Step 2:** Run it. Expected: it fails.
- [ ] **Step 3:** Implement the changes.
- [ ] **Step 4:** Run the full checks. Expected: pass.
- [ ] **Step 5: Commit** `refactor(library): one read-only served-with view on a base; remove the category-side pairing editor`.

### Task 4: The assistant pairs an existing dish with a link, not a loose rule

**Files:**
- Modify: `src/assistant/tools.ts` (new tool `propose_pairing`), `src/assistant/types.ts` (new effect), `src/assistant/prompt.ts`
- Modify: `src/components/assistant/AssistantPanel.tsx`, `src/components/assistant/DraftSheets.tsx`
- Modify: `src/components/library/ComponentForm.tsx` (`draftLinks` in edit mode)
- Test: `src/assistant/tools.test.ts`, `src/components/library/ComponentForm.test.tsx`, and the panel test if one covers drafts

**Interfaces:**
- **Tool:** `propose_pairing({ dish: string | number, served_with_bases?: string[], served_with_base_categories?: string[], served_with_strength?: 'always'|'usually'|'often'|'sometimes' })`. It resolves the dish (a curry, subzi or extra in the library) and the bases by name or id, with the same errors `propose_dish` gives. The registry becomes ten tools; update the registry test.
- **Effect:** `{ kind: 'dish-links'; dishId: number; dishName: string; links: DishLink[] }`.
- **Panel:** "Review pairing" opens a sheet with `ComponentForm mode="edit"` for that dish, with `draftLinks`.
- **Form:** in edit mode, `draftLinks` are merged over the stored links once the lookup has loaded. Each draft link replaces the stored link in its slot, or is added. `linksBase` is the stored list, so saving writes only the drafted slots.

**Steps:**
- [ ] **Step 1: Failing tests.**
  - **Tool:** resolves names, rejects bases and unknown names, and returns the effect.
  - **Form:** `it('merges drafted links over a dish\'s stored links and saves only those')`. The dish has a stored `never:curry_category` link with a hand-edited cost of 5, which must be unchanged after the save. The draft adds `serve:base_dish`.
- [ ] **Step 2:** Run them. Expected: they fail.
- [ ] **Step 3: Implement.** In the prompt, replace "To pair a dish already in the library, use propose_rule with require_with…" with an instruction to use `propose_pairing`.
- [ ] **Step 4:** Run the full checks. Expected: pass.
- [ ] **Step 5: Commit** `feat(assistant): pair an existing dish through its served-with links`.

### Task 5: One set of strength words

**Files:**
- Modify: `src/rules/levels.ts`, `src/rules/link-text.ts`, `src/components/library/links/LinkEditor.tsx`, `src/assistant/tools.ts` (`SERVE_STRENGTH`), `src/components/rules/editor/widgets.tsx`, `src/rules/templates.ts` (the `prefer` describe)
- Test: `src/rules/levels.test.ts`, plus the existing link-text and editor tests

**Interfaces:**
- **In `levels.ts`:** `STRENGTH_WORDS: Record<LinkStrength, { label: string; word: string }>`:
  - always: label "Always", word "always"
  - usually: label "Usually", word "usually"
  - moderately: label "Often", word "often"
  - sometimes: label "Sometimes", word "sometimes"
- **Soft-strength select on the Rules page:** the `cost`-based select in `widgets.tsx` shows these same labels for costs 10, 6 and 3 (Usually, Often, Sometimes).
- **Prefer/avoid templates:** their weights keep Slightly / Moderately / Strongly. That is a nudge, not a "how often".
- **Code:** the link editor, `link-text`, and the assistant's strength parameter (whose enum stays `always|usually|often|sometimes`) all read from this one map.

**Steps:**
- [ ] **Step 1: Tests.** `levels.test.ts` asserts the map. Update the editor test to expect Usually / Often / Sometimes for a soft rule's cost.
- [ ] **Step 2:** Run them. Expected: they fail.
- [ ] **Step 3:** Implement it, and remove the duplicate maps (`STRENGTH_LABEL`, `STRENGTH_WORD`, `SHORT_WORD`, `SERVE_STRENGTH`).
- [ ] **Step 4:** Run the full checks. Expected: pass.
- [ ] **Step 5: Commit** `refactor: one set of strength words for rules, links and the assistant`.

### Task 6: A simpler Add-link flow that still shows every existing link

**Files:**
- Modify: `src/components/library/links/LinkEditor.tsx`, `LinkList.tsx`
- Test: `src/components/library/links/LinkList.test.tsx`, `ComponentForm.test.tsx`

**Interfaces:**
- **Add flow, when it offers what:**
  - **New link:** it offers "Served with" first (base dishes and base categories, for non-base dishes), then "Never with" for every offered target.
  - **"Only with":** offered only for base categories, base dishes and extra categories.
  - **Specific curries, subzis and extras as targets:** offered only when the dish already has a link on that target.
- **Editing an existing link:** Edit always shows its own target and mode, even when Add would not offer them, so legacy links stay editable and removable.
- **Unchanged:** `offersLink`, `offersServe` and `ownedChanges`.

**Steps:**
- [ ] **Step 1: Failing tests.**
  - Add offers exactly that set for a curry and for an extra, with "Served with" selected first.
  - A stored `with:curry_dish` link is listed, editable and removable.
- [ ] **Step 2:** Run them. Expected: they fail.
- [ ] **Step 3:** Implement it with one helper, `addableSlots(componentType, links): LinkSlot[]`, used by both `LinkList` and `LinkEditor` instead of their duplicated free-slot logic.
- [ ] **Step 4:** Run the full checks. Expected: pass.
- [ ] **Step 5: Commit** `refactor(library): a shorter add-link flow, with served-with first`.

### Task 7: Docs and dead code

**Files:**
- Modify: `docs/architecture.md` ("Rules model": served with as the way to add a side; the base view; no category-side editor; re-planning a single meal; v19; one set of strength words; the assistant's `propose_pairing`)

**Steps:**
- [ ] **Step 1:** Update the docs. Run `grep -rn "servedWith\|setCategoryPairings\|pairedCategories\|STRENGTH_LABEL\|SHORT_WORD\|SERVE_STRENGTH" src` and remove anything left unused. Run `npx eslint src`.
- [ ] **Step 2:** Run the full checks. Expected: pass.
- [ ] **Step 3: Commit** `docs: pairing consolidated around served-with links`.
