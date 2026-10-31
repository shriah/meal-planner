# Dish Links Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the dish form's "Goes with" section from a wall of dropdowns into a short list of links. Each link gets a plain-language summary, a searchable picker, optional day/meal limits, warnings before save and a preview of its effect on the current week.

**Architecture:** A link becomes a list item (`DishLink`), not one fixed entry per target. The form edits `DishLink[]`, and `ownedChanges` turns the whole list into owned-rule changes. Storage is unchanged: `pairs_with` for "only with base categories", `avoid_with` for everything else. Both gain an optional `scope` (days/meals), so existing rules read back unchanged. The UI pieces are small components under `src/components/library/links/`. Pure logic (summary text, warnings, rule-set comparison) lives in `src/rules` and `src/services` so it can be tested without React.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` before touching routing or config), React 19, Dexie + `dexie-react-hooks`, zod 4, shadcn/Radix UI, Vitest + happy-dom + Testing Library, fake-indexeddb.

**Spec:** There is no separate design document. The agreed scope is the 2026-10-31 conversation's list, recorded in Goals and Non-goals below. The current behaviour is documented in `docs/architecture.md` ("Rules model": goes with / never with links).

## Goals and non-goals

Goals, from the conversation's list:
- (1) A collapsed list of set links plus an "Add link" flow.
- (2) Search in dish pickers.
- (3) A sentence per link.
- (4) Warnings before save.
- (6) Day/meal limits per link.
- (8) "Only with" and "never with" allowed on the same target.
- (10) A "moderately" strength.
- (12) A preview of the effect on this week.
- (13) One shared dish/category lookup for rows.
- (14) A read-only list of hand-written rules that mention the dish.

Non-goals: more targets (tags, region), mutual links, bulk linking across dishes, a why-not button on the plan, and any database version bump.

## Global Constraints

- **Storage:** stored rules keep their shapes. Old links (no scope, `must`, or `prefer` with any cost) read back with the same meaning. No Dexie version bump.
- **Slots:** one rule per owned slot per dish (`with:<target>`, `never:<target>`). Both slots of one target may now be set at once.
- **Strengths** are written exactly as follows:
  - `always` → `strength: 'must'`
  - `usually` → `prefer`, cost 10
  - `moderately` → `prefer`, cost 6
  - `sometimes` → `prefer`, cost 3
- **Reading a strength back:** cost ≥ 8 → usually, 5–7 → moderately, ≤ 4 → sometimes.
- **Which links a dish is offered:** unchanged (`offersLink`). A base gets no base targets; a curry gets no `curry_dish`, a subzi no `subzi_dish`. A dish never appears in its own picker.
- **"Only with" with every option ticked and no scope** is the same as no rule: the slot is removed.
- **Copy style:** sentence case, no em dashes in UI strings. Toasts follow the existing `toast.success` pattern (`vendor/sonner`).
- **Code style:** match the existing code. Components use no semicolons, `src/rules` and `src/services` use semicolons, and comments are sparse and explain why.
- **Checks:** every task ends with `npx tsc --noEmit`, `npx eslint src`, and `npx vitest run` green before its commit.
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Existing data:** a dish saved before this plan (an extra with "not with soup", a curry with a base pairing, a link with `prefer` cost 10) must open, show the same links, and save unchanged when untouched. Covered in Task 1 (`readOwned` on legacy shapes) and Task 4 (an untouched save writes nothing).
2. **Base-side editor with a scoped or soft pairing:** Manage Categories → Goes With must keep the pairing's strength and scope when it adds or removes a category. Covered in Task 1 (`setCategoryPairings` keeps scope).
3. **Same target in both modes:** "only with Idli, Dosa" plus "never with Dosa" must save as two rules and show a contradiction warning, not crash or merge. Covered in Task 1 (round-trip) and Task 5 (warning).
4. **A new dish:** links on a dish being added must save once the dish has an id, and the preview button must not appear. Covered in Task 4 (add-mode save) and Task 7 (no preview in add mode).
5. **Deletes:** deleting a category or dish that a scoped, soft link uses must keep the link's scope and strength and remove only that value. Covered in Task 1.

---

### Task 1: Link model as a list, with scope and a fourth strength

**Files:**
- Modify: `src/rules/templates.ts` (`PairsWithParams` gains `scope: ScopeSchema.optional()`; `pairs_with.compile` passes `p.scope` to `slotCount`; `describe` appends `describeScope(p.scope)`)
- Modify: `src/rules/owned.ts`, `src/rules/index.ts`
- Modify: `src/services/food-db.ts` (`setCategoryPairings`, `deleteComponent`), `src/services/category-db.ts` (`deleteCategory`)
- Modify: `src/components/library/ComponentForm.tsx`, `LinksEditor.tsx`, `ComponentRow.tsx`. Adapt them only enough to compile; the editor itself is rebuilt in Task 4.
- Test: `src/rules/owned.test.ts`, `src/rules/templates.test.ts`, `src/services/food-db.test.ts`

**Interfaces:**
- Produces:
  - `type LinkStrength = 'always' | 'usually' | 'moderately' | 'sometimes'`
  - `interface LinkScope { days?: Day[]; meals?: Meal[] }`
  - `interface DishLink { mode: 'with' | 'never'; target: LinkTarget; values: LinkValue[]; strength: LinkStrength; scope?: LinkScope }`
  - `linkRule(component, link: Omit<DishLink, 'strength'> & { strength?: LinkStrength }): OwnedRule`. The single-object form replaces the positional one; update every caller.
  - `readLink(rule): DishLink | undefined`, which reads `scope` from params
  - `OwnedValues.links: DishLink[]`, at most one per slot, in `LINK_SLOTS` order
  - `ownedChanges(type, { links?: DishLink[]; days; meals; neverAuto })`. With `links` given, every offered link slot is set or `null`. With it left out, no link slot is touched.
  - `linkSlotOf(link: DishLink): LinkSlot`
  - `pairingRule(component, cats, strength?, scope?)`
- Removes: the `Links` record, `LinkEdit`, `LinkMode` (`'any'` disappears) and `noLinks`.

- [ ] **Step 1: Write failing tests** in `owned.test.ts`:
  - `it('round-trips scope and every strength through each link shape')`: for `with:base_category`, `never:extra_category` and `with:base_dish`, with `scope: { days: ['monday'], meals: ['lunch'] }` and each strength, `readLink(linkRule(dish, link))` equals `link`. Expect `moderately` → `{ strength: 'prefer', cost: 6 }`.
  - `it('reads legacy rules as before')`: `pairingRule(dish, [1])` and `curryClashRule(dish, ['soup'])` read as `strength: 'always'` with no `scope` key. A hand-built `avoid_with` with `strength: 'prefer', cost: 5` reads as `moderately`.
  - `it('keeps both modes of one target')`: `readOwned([with base_dish [1,2], never base_dish [2]])` returns 2 links.
  - `it('sets or clears every offered slot from a list')`: `ownedChanges('extra', { ...NONE, links: [one never:curry_category] })` has a builder for `never:curry_category`, `null` for every other offered link slot, and no `with:base_dish`-style keys for unoffered slots. `ownedChanges('extra', NONE)` has no link keys.
  - In `templates.test.ts`: `it('compiles a scoped pairing to a scoped constraint')`, asserting the constraint carries `scope`.
  - In `food-db.test.ts`: `it('keeps a pairing\'s scope and strength when the base side changes it')`, plus extended category/dish delete tests asserting scope and strength survive.
- [ ] **Step 2:** Run `npx vitest run src/rules src/services`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** `strengthOf(params)` gets the thresholds from Global Constraints. `linkRule` writes `scope` into params only when it has days or meals. The `with`/dish self-listing stays. In `setCategoryPairings`, read the current link with `readLink` and rebuild it with `linkRule({ ...current, values: next })`.
- [ ] **Step 4:** Run the full checks. Expected: PASS.
- [ ] **Step 5: Commit** `refactor(rules): dish links as a list with scope and a moderately strength`.

### Task 2: One library lookup shared by rows and forms

**Files:**
- Create: `src/components/library/LibraryLookup.tsx`
- Modify: `ComponentTab.tsx` (provides it), `ComponentRow.tsx` and `ComponentForm.tsx` (consume it; remove their own `getAllComponents` / `getCategoriesByKind` live queries)
- Test: `src/components/library/ComponentRow.test.tsx`

**Interfaces:**
- Produces:
  - `interface LibraryLookup { dishes: ComponentRecord[]; baseCategories: CategoryRecord[]; extraCategories: CategoryRecord[]; rules: RuleRecord[]; loaded: boolean }`
  - `LibraryLookupProvider({ children })`: one `useLiveQuery` for each of the four sources
  - `useLibraryLookup(): LibraryLookup`: outside a provider, it falls back to its own live queries, so a form opened on its own (the assistant's draft sheet) still works
  - `linkNames(lookup): Names`, used by Task 3. It is a `Names` value from `src/rules/describe.ts`, extended with `dish(id)`.

- [ ] **Step 1: Failing test** `it('renders 25 rows from one lookup')`. Spy on `getAllComponents` and render a `ComponentTab` with 30 dishes. Expect exactly one call, and badges such as "Only with Idli" to render.
- [ ] **Step 2:** Run it. Expected: FAIL (one call per row today).
- [ ] **Step 3: Implement** the provider and fallback hook. Rows read `getOwnedRules` from `lookup.rules` filtered by `owner_component_id`.
- [ ] **Step 4:** Run the full checks. Expected: PASS.
- [ ] **Step 5: Commit** `perf(library): share one dish and rule lookup across rows`.

### Task 3: A sentence for each link

**Files:**
- Create: `src/rules/link-text.ts` (export it from `src/rules/index.ts`)
- Modify: `ComponentRow.tsx` (badges use the short form)
- Test: `src/rules/link-text.test.ts`

**Interfaces:**
- Consumes: `DishLink` (Task 1), `linkNames` (Task 2)
- Produces:
  - `describeLink(dishName: string, link: DishLink, names: Names): string`. Example: `"Sambar is usually planned only with Idli or Dosa, on weekdays at breakfast"`.
  - `shortLink(link: DishLink, names: Names): string`. Example: `"Usually only with Idli, Dosa"`. For an `always` `with:base_category` link with no scope, it is the bare category names, as the badges show today.

- [ ] **Step 1: Failing tests** with exact strings for:
  - each strength word: always → "always", usually → "usually", moderately → "often", sometimes → "sometimes"
  - each mode
  - a scope with days only, with meals only, and with both, using `describeDays` / `describeMeals` wording
  - a deleted value, shown as "a deleted dish" or "a deleted category"
  - more than 4 values, where the long form lists the first 3 and then "and 2 more"
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement `describeLink` and `shortLink`, and switch the row badges to `shortLink`.
- [ ] **Step 4:** Run the full checks. The existing row tests keep "Rice-based" and "Not with soup". Expected: PASS.
- [ ] **Step 5: Commit** `feat(library): describe each dish link in plain words`.

### Task 4: Link list with an "Add link" flow and searchable picker

**Files:**
- Create: `src/components/library/links/LinkList.tsx`, `links/LinkEditor.tsx`, `links/OptionPicker.tsx`
- Delete: `src/components/library/LinksEditor.tsx`
- Modify: `ComponentForm.tsx` (state `links: DishLink[] | null`, where `null` means untouched and is not sent to `ownedChanges`)
- Test: `src/components/library/links/LinkList.test.tsx`; update `ComponentForm.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–3
- Produces:
  - `LinkList({ dishName, componentType, selfId, links, onChange })`. It shows each link as its `describeLink` sentence with Edit and Remove buttons, plus an "Add link" button. With no links it shows the text "Goes with anything."
  - `LinkEditor({ componentType, selfId, initial?: DishLink, taken: LinkSlot[], onDone(link), onCancel })`. An inline panel with these steps:
    1. "Link to": the offered targets, minus slots in `taken` (except `initial`'s own slot), labelled by `LINK_LABEL`.
    2. A mode toggle: "Only with" / "Never with".
    3. Strength: Always / Usually / Often / Sometimes.
    4. `OptionPicker`.
    5. An optional "Only on" area with day and meal checkboxes, collapsed behind a "Limit to days or meals" button.
    6. A live `describeLink` preview line.
    7. Done (disabled with no value ticked) and Cancel.
  - `OptionPicker({ options: { value: LinkValue; label: string }[]; selected: LinkValue[]; onChange })`:
    - A search box appears when there are more than 8 options. It filters by a case-insensitive substring of the label.
    - It shows "N selected", and "Select all" / "Clear" buttons.
    - The checkbox list is scrollable.

- [ ] **Step 1: Failing tests** in `LinkList.test.tsx`:
  - `it('shows each link as a sentence with edit and remove')`
  - `it('adds a link through the editor and hides slots already used')`
  - `it('filters dish options by search and keeps ticks across searches')`
  - `it('limits a link to days and meals')`: the saved `DishLink` has `scope`
  - `it('edits a link in place')`

  In `ComponentForm.test.tsx`, rewrite the link tests to the new flow:
  - `it('adds an only-with base link and saves it as a pairing rule')`
  - `it('saves both modes of one target')`
  - `it('removing a link deletes its rule')`
  - `it('saving without touching links writes no link rule changes')`: spy on `saveComponent`'s third argument and assert it has no `with:`/`never:` keys
  - `it('saves links on a new dish')`
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement.** The form normalises on save: a `with` link with every option ticked and no scope is dropped. The "Pick at least one…" save block goes away because Done can't be pressed without a value. Keep the "Saved as a rule. View rule" links under the list.
- [ ] **Step 4:** Run the full checks. Expected: PASS.
- [ ] **Step 5: Commit** `feat(library): list dish links with an add-link flow and searchable picker`.

### Task 5: Warnings before saving

**Files:**
- Create: `src/rules/link-warnings.ts` (export it)
- Modify: `links/LinkList.tsx` (shows the warnings under the list), `ComponentForm.tsx`
- Test: `src/rules/link-warnings.test.ts`

**Interfaces:**
- Consumes: `DishLink`, `LibraryLookup`
- Produces: `linkWarnings(self: { id?: number; componentType: ComponentType }, links: DishLink[], lookup: Pick<LibraryLookup, 'dishes' | 'rules'>): { link: number; message: string }[]`, where `link` is an index into `links`. The checks, in order:
  1. Contradiction: the same target in both modes shares a value. Message: "Dosa is both allowed and ruled out."
  2. Nothing to pair with: an `always` `with` link whose chosen values match no dish in the library, counting dishes that never plan automatically (an `exclude` rule) as missing. Message: "No dish in Rice-based can be planned, so Sambar would never be planned."
  3. Hidden by another rule: an `always` `with` link where every chosen dish is ruled out by its own `allowed_meals` / `allowed_days`, so nothing remains inside the link's scope. Message: "None of these are planned at breakfast."

  Warnings never block saving.

- [ ] **Step 1: Failing tests:** one per warning, with exact messages; no warning for `usually` links; no warning for a valid link.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement the checks and render them in amber text (`text-amber-700 dark:text-amber-400`) beside the link they name.
- [ ] **Step 4:** Run the full checks. Expected: PASS.
- [ ] **Step 5: Commit** `feat(library): warn about dish links that cannot work`.

### Task 6: Hand-written rules that mention the dish

**Files:**
- Modify: `ComponentForm.tsx`
- Test: `ComponentForm.test.tsx`

**Interfaces:**
- Consumes: `LibraryLookup.rules`, `specReferences` and `describeSpec` from `src/rules`
- Produces: a read-only "Other rules mentioning this dish" section on the edit form. It lists rules that are not owned by this dish and whose `specReferences(spec).components` includes its id. Each shows its description, an "(off)" mark when disabled, and a link to `/rules#rule-<id>`. The section is hidden when the list is empty.

- [ ] **Step 1: Failing test** `it('lists rules from the Rules page that mention the dish')`. Use one enabled and one disabled rule that reference the dish, and one owned rule that must not appear.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement it. Parse each rule with `parseSpec` and skip any that fail.
- [ ] **Step 4:** Run the full checks. Expected: PASS.
- [ ] **Step 5: Commit** `feat(library): show other rules that mention a dish`.

### Task 7: Preview a dish's links on this week

**Files:**
- Modify: `src/assistant/compare.ts`. Extract the core into `src/services/compare-rules.ts` and keep `makeCompare` as a thin wrapper.
- Create: `src/components/library/links/LinkPreview.tsx`
- Modify: `ComponentForm.tsx`
- Test: `src/services/compare-rules.test.ts`, `links/LinkPreview.test.tsx`; the existing `src/assistant/compare.test.ts` must stay green unchanged.

**Interfaces:**
- Produces:
  - `compareRuleSets(input: PlanningInput, after: RuleRecord[], opts: { seed: number; pins?: Pins; touches?: (componentId: number) => boolean }, run?): Promise<Comparison>`. Its result is the same `Comparison` type the assistant uses.
  - `pendingRules(rules: RuleRecord[], dishId: number, changes: OwnedRuleChanges, dishName: string): RuleRecord[]`. It applies the form's unsaved owned-rule changes to a copy of the rules: it replaces or removes the dish's rule in each changed slot and adds new ones with `id: -1, -2, …`.
  - `LinkPreview({ dishId, dishName, changes })`. A "Preview on this week" button that, when clicked, runs the comparison against the stored plan and its locks (as `AssistantPanel` does) and renders the existing `ComparisonView`. It is hidden in add mode and when no plan exists. It shows "This would not change the week." when nothing changes.

- [ ] **Step 1: Failing tests:**
  - `compareRuleSets` returns `identical: true` for the same rules.
  - `pendingRules` replaces, removes and adds by slot.
  - `LinkPreview` shows the diff from a stubbed `run`, and is absent in add mode.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement it. `touches` marks slots containing the edited dish.
- [ ] **Step 4:** Run the full checks. Expected: PASS.
- [ ] **Step 5: Commit** `feat(library): preview a dish's links on the current week`.

### Task 8: Docs and cleanup

**Files:**
- Modify: `docs/architecture.md` ("Rules model": links as a list, scope, four strengths, warnings, preview, shared lookup)
- Modify: `src/assistant/prompt.ts` / `tools.ts`, only if they describe dish pairing as base-only. Check with `grep -n "pair" src/assistant/*.ts`.

- [ ] **Step 1:** Update the docs, and remove any dead exports left from Task 1. Check with `npx eslint src` and `grep -rn "noLinks\|LinkEdit" src`, which should return nothing.
- [ ] **Step 2:** Run the full checks. Expected: PASS.
- [ ] **Step 3: Commit** `docs: dish links as a list with scope, strengths, warnings and preview`.
