# Rules Usability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the usability problems found in the rules/UI review: inert or misleading controls, unreadable rule messages, an unmanageable Rules page, a confusing rule editor, and duplicated UI/rule code.

**Architecture:** Pure helpers go in `src/rules` (no React/Dexie; isolation test enforces this) and are consumed by the Library form, Library row, Rules page and plan screens. Stored rule specs stay compatible: only optional fields are added, schema ranges are widened, never narrowed. One Dexie version (v17) is added, for default-rule keys.

**Tech Stack:** Next.js 16 (App Router, client components), React, Dexie, Zod, Vitest + Testing Library (happy-dom). No new Next.js APIs are used, so the `node_modules/next/dist/docs` check in AGENTS.md has nothing to apply to.

**Spec:** The usability review in this conversation (items 1–13). Item 7b (merging `allowed_meals` + `allowed_days` into one rule type) is out of scope: it needs a stored-rule migration and is a separate decision.

## Global Constraints

- Branch off `dish-rules-as-constraints` (PR #3 is unmerged); do not commit or push without being asked.
- `src/rules` may import only `zod`, `@/planner`, `@/types/component` and relative files; `src/planner` only `zod`, `@/types/component` and relative files.
- After every task: `npx tsc --noEmit -p .`, `npx eslint src`, `npx vitest run` all clean.
- Planner behaviour must not change: the seeded-library parity check (seeds 1–10, `hard=0`, soft scores 14,8,10,8,10,12,12,10,12,10) stays identical.
- Stored rule specs written by earlier versions keep validating (`RuleSpecSchema`).
- Existing UI labels tests rely on (e.g. "Save Curry", "Never plan automatically", combobox "Days") keep their text.

## Review Focus

- A rule is renamed or its owner dish deleted while the Rules page shows it: lists must not crash on stale ids.
- Search on the Rules page matches nothing: show a message, not an empty page with section headings.
- "Restore defaults" pressed twice: must not duplicate rules, and must not overwrite a default the user edited.
- A default rule renamed by the user is still recognised as that default (matched by key, not name).
- Banner link to a rule that was since deleted: scroll target missing must be a no-op.
- Editor auto-check running while the user keeps typing: a stale result must never overwrite a newer one.

## File Structure

| File | Responsibility |
|---|---|
| `src/components/ui/TagFilter.tsx` (new) | Keyboard-operable dietary + regional filter chips, shared by Library tab and meal picker |
| `src/rules/owned.ts` | Add `OwnedValues`, `readOwned`, `ownedChanges`, day-mode helpers; move `OwnedRuleChanges` here |
| `src/components/library/ComponentForm.tsx` | Use the helpers; "Planning" section; "How often"; occasion hint |
| `src/components/library/ComponentRow.tsx` | Use `readOwned` / `describeDays`; frequency badge |
| `src/services/plan-generation.ts` | `PlanProblem.reason`; rule problems described by `describeSpec` |
| `src/components/plan/MealCell.tsx`, `PlanProblemsBanner.tsx`, `MealPickerSheet.tsx` | Show the new messages; no hover-only text; banner links |
| `src/rules/templates.ts`, `src/components/rules/editor/RuleEditor.tsx` | Template `group`; named strength levels; default name; live check |
| `src/rules/defaults.ts`, `src/rules/record.ts`, `src/rules/groups.ts` (new) | `default_key`; `groupRules` |
| `src/db/client.ts`, `src/db/seed.tsx`, `src/services/food-db.ts` | v17 backfill; seed keys; `restoreDefaultRules` |
| `src/components/rules/RuleList.tsx`, `RuleRow.tsx` | Sections, search, restore button, deep-link anchors |
| `src/components/library/ComponentLibrary.tsx`, `ComponentTab.tsx` | Open the tab and row named in `#dish-<id>` |

---

### Task 1: Shared tag filter (review items 12, 4a)

**Files:**
- Create: `src/components/ui/TagFilter.tsx`, `src/components/ui/TagFilter.test.tsx`
- Modify: `src/components/library/ComponentTab.tsx`, `src/components/plan/MealPickerSheet.tsx`, `src/components/library/ComponentForm.tsx` (use `DIETARY_TAGS`/`REGIONAL_TAGS` from `@/types/component`)

**Interfaces:**
- Produces: `TagFilter(props: { dietary: readonly DietaryTag[]; regional: readonly RegionalTag[]; onToggleDietary(tag: DietaryTag): void; onToggleRegional(tag: RegionalTag): void; isDisabled?(kind: 'dietary' | 'regional', tag: string): boolean })` renders each tag as a `<button type="button" aria-pressed>`.

- [ ] **Step 1: Failing test** (`TagFilter.test.tsx`): renders all 5 dietary + 4 regional tags as buttons; `aria-pressed` is `true` only for active ones; pressing Enter/Space on a focused button calls the toggle with that tag; a tag for which `isDisabled` returns true is `disabled` and does not call the toggle.
- [ ] **Step 2:** Run `npx vitest run src/components/ui/TagFilter.test.tsx` — expect FAIL (module missing).
- [ ] **Step 3:** Implement `TagFilter` in `src/components/ui/TagFilter.tsx`, reusing the existing `Badge` styling classes on a `button`; replace the two inline chip blocks and the three copied constant arrays.
- [ ] **Step 4:** Run full verification (see Global Constraints) — the existing `ComponentTab`/`MealPickerSheet` tests that click chips by text must still pass.

### Task 2: Owned-rule values helpers (review item 13)

**Files:**
- Modify: `src/rules/owned.ts`, `src/rules/index.ts`, `src/services/food-db.ts` (import `OwnedRuleChanges` from `@/rules`), `src/components/library/ComponentForm.tsx`, `src/components/library/ComponentRow.tsx`
- Test: `src/rules/owned.test.ts` (new)

**Interfaces:**
- Produces, all exported from `@/rules`:
  - `interface OwnedValues { bases: number[]; clashes: CurryCategory[]; days: Day[]; neverAuto: boolean }`
  - `type OwnedRuleChanges = Partial<Record<OwnedTemplate, ((c: { id: number; name: string }) => OwnedRule) | null>>` (moved from `food-db.ts`, which re-exports it)
  - `readOwned(rules: readonly Pick<RuleRecord, 'spec'>[]): OwnedValues`
  - `ownedChanges(componentType: ComponentType, v: OwnedValues): OwnedRuleChanges` — `allowed_days` is built when `v.days.length`, else `null`; `exclude` when `v.neverAuto`, else `null`; `pairs_with` only for curry/subzi (built when `v.bases.length`, else `null`); `avoid_with` only for extra (built when `v.clashes.length`, else `null`); keys for other types are omitted.
  - `type DayMode = 'any' | 'weekdays' | 'weekends' | 'specific'`; `dayModeOf(days: readonly Day[]): DayMode`; `daysOfMode(mode: DayMode, specific: readonly Day[]): Day[]`; `describeDays(days: readonly Day[]): string | undefined` → `'Weekdays'`, `'Weekends'`, `'Only Mon, Fri'` (three-letter capitalised, week order), or `undefined` for none.

- [ ] **Step 1: Failing tests** in `owned.test.ts`: `readOwned([])` equals `{ bases: [], clashes: [], days: [], neverAuto: false }`; round trip — build each rule with `pairingRule`, `curryClashRule`, `dayRule`, `exclusionRule` and `readOwned` returns the values; `ownedChanges('subzi', { bases: [] ... })` has `pairs_with: null` and no `avoid_with` key; `ownedChanges('extra', …)` has no `pairs_with` key; `dayModeOf`/`daysOfMode` agree for weekdays, weekends, a custom set, and empty; `describeDays` returns the three strings above, in week order regardless of input order.
- [ ] **Step 2:** Run `npx vitest run src/rules/owned.test.ts` — expect FAIL.
- [ ] **Step 3:** Implement the five functions in `owned.ts`; switch `ComponentForm` (`initialFormState`, `handleSave`, day-mode state) and `ComponentRow` (badges, never-auto flag) to them and delete their private copies (`WEEKDAYS`, `WEEKEND`, `dayModeOf`, `ownedValue`).
- [ ] **Step 4:** Full verification; no test outside `owned.test.ts` should need changing.

### Task 3: Dish form — Planning section, "How often", occasion hint (review items 1, 3, 11)

**Files:**
- Modify: `src/components/library/ComponentForm.tsx`, `src/components/library/ComponentRow.tsx`
- Test: `src/components/library/ComponentForm.test.tsx`, `src/components/library/ComponentRow.test.tsx`

**Interfaces:**
- Consumes: `OwnedValues`, `readOwned`, `ownedChanges`, `DayMode` helpers (Task 2); `FREQUENCIES`/`Frequency` from `@/types/component`.
- Produces: form combobox labelled "How often" with options `Often` (`frequent`), `Normal` (`normal`), `Rarely` (`rare`), on every dish type; saved as `frequency` on the component record. Form heading "Planning" (text) above bases/curry clashes/Days/"Never plan automatically", followed by the note "Saved as rules you can also see on the Rules page." Helper text under Occasion Tags: "Tags describe a dish; use them in rules, for example “festive dishes only on weekends”."

- [ ] **Step 1: Failing tests:** (a) choosing "Often" in "How often" and saving stores `frequency: 'frequent'`; editing a stored `rare` dish shows "Rarely"; (b) the "Planning" heading and note are present for curry and for extra; (c) `ComponentRow` shows a "Frequent" badge for `frequent`, "Rare" for `rare`, none for `normal`/unset.
- [ ] **Step 2:** Run the two test files — expect FAIL.
- [ ] **Step 3:** Add `frequency` to `FormState`/`initialFormState`/save record; move the pairing, clash, Days and never-auto controls into one `<section>` headed "Planning" after the tag fields; add the hint; add the row badge.
- [ ] **Step 4:** Full verification.

### Task 4: Plain-language rule problems (review item 2)

**Files:**
- Modify: `src/services/plan-generation.ts`, `src/components/plan/MealPickerSheet.tsx`
- Test: `src/services/planning.test.ts`, `src/components/plan/MealPickerSheet.test.tsx`

**Interfaces:**
- Produces: `PlanProblem` gains `reason: string` — for a problem from a stored rule, the rule's `describeSpec(spec, names)` (names include components, base and extra categories); otherwise the justification `label`. `message` is unchanged for non-rule problems; for rule problems `message` becomes `${reason} — ${where}` where `where` is `Monday lunch` (day + meal), `Monday` (day only), `this week` (no day). `slotConflicts` and the picker use `reason`.

- [ ] **Step 1: Failing tests:** in `planning.test.ts`, the existing "No Idli" test expects `reason` equal to the exclude rule's `describeSpec` text and `message` equal to `reason + ' — Monday breakfast'`; in the `slotConflicts` test, `reason` for Chole equals `'Chole only with rice-based bases'` (category names resolved) and no message contains `must be at most`; builtin problems keep `reason === label`.
- [ ] **Step 2:** Run both files — expect FAIL.
- [ ] **Step 3:** Implement: build full `Names` in the model-building helper, find the rule by `ruleId` (stored rules are already in `PlanningInput`), fall back to `explain` when the rule is missing or unparseable; show `reason` in the picker instead of `message`.
- [ ] **Step 4:** Full verification (update only the assertions that quoted the old wording).

### Task 5: Broken-meal explanation without hover (review item 4b)

**Files:**
- Modify: `src/components/plan/MealCell.tsx`
- Test: `src/components/plan/PlanBoard.test.tsx`

**Interfaces:**
- Produces: in a meal with hard problems, a `<button aria-expanded>` labelled "Rule broken" toggles an inline list of `problem.reason`s; no `Tooltip`.

- [ ] **Step 1: Failing test:** the existing "explains broken rules in the banner and highlights the meal" test additionally clicks "Rule broken" and expects each problem's reason text to appear inside the cell and `aria-expanded` to flip `false → true`.
- [ ] **Step 2:** Run `npx vitest run src/components/plan/PlanBoard.test.tsx` — expect FAIL.
- [ ] **Step 3:** Replace the tooltip with the toggle and inline list.
- [ ] **Step 4:** Full verification.

### Task 6: Rule editor — grouped types, named strength, default name (review items 7a, 8, 9)

**Files:**
- Modify: `src/rules/templates.ts` (`RuleTemplate.group`, widen `PreferParams.weight` to 1–10, keep default 2), `src/rules/form.ts` (`kind: 'cost'` and `'weight'` share a named-level control), `src/components/rules/editor/RuleEditor.tsx`, `src/components/rules/editor/widgets.tsx`
- Test: `src/rules/templates.test.ts`, `src/components/rules/editor/RuleEditor.test.tsx`

**Interfaces:**
- Produces: `TEMPLATE_GROUPS: { label: string; templates: TemplateId[] }[]` exported from `@/rules` — "Where and when": `allowed_meals`, `allowed_days`, `only_allow`; "Keep out": `exclude`, `skip_when`, `avoid_with`; "Pair and require": `require`, `require_with`, `pairs_with`; "Count and spread": `limit`, `no_repeat`; "Preference": `prefer`.
- Produces: `LEVELS = [{ label: 'Slightly', cost: 3, weight: 1 }, { label: 'Moderately', cost: 6, weight: 2 }, { label: 'Strongly', cost: 10, weight: 4 }]` and `nearestLevel(kind: 'cost' | 'weight', value: number): (typeof LEVELS)[number]` in `widgets.tsx`. Stored numbers are unchanged; the control shows the nearest level and writes that level's number (cost 10 is stored as absent).
- Default name: rule name input is optional; empty name uses `describeSpec(...)`.

- [ ] **Step 1: Failing tests:** `TEMPLATE_GROUPS` covers every `TEMPLATE_IDS` entry exactly once; `RuleSpecSchema` accepts `prefer` weight 10 and rejects 11; `nearestLevel('cost', 5).label === 'Moderately'` and `nearestLevel('cost', 2).label === 'Slightly'`; editor: with the name left empty and a valid rule, saving stores `name` equal to the rule's description; the "Rule type" listbox shows the five group labels; a prefer-strength rule saved with "Strongly" stores no `cost`, with "Slightly" stores `cost: 3`.
- [ ] **Step 2:** Run both files — expect FAIL.
- [ ] **Step 3:** Implement; use `SelectGroup`/`SelectLabel` for the type picker; relabel the name field "Rule name (optional)" with the description as placeholder. `validateDraft` keeps requiring a name — the editor passes the effective name.
- [ ] **Step 4:** Full verification (update the editor test that expected "Give the rule a name" only if it exercised an empty name through the UI).

### Task 7: Rule editor — live conflict check (review item 10a)

**Files:**
- Modify: `src/components/rules/editor/RuleEditor.tsx`
- Test: `src/components/rules/editor/RuleEditor.test.tsx`

**Interfaces:**
- Consumes: `checkDraftRule(draft, replacingId?)` (unchanged).
- Produces: when the draft is valid, the check runs 600 ms after the last edit; results from an older draft are discarded; the "Check against my library" button is removed.

- [ ] **Step 1: Failing tests** (fake timers): editing a valid draft calls `checkDraftRule` once after 600 ms and not before; two edits 300 ms apart produce one call with the latest spec; a slow first call resolving after a second call started does not replace the second result; an invalid draft never calls it.
- [ ] **Step 2:** Run `npx vitest run src/components/rules/editor/RuleEditor.test.tsx` — expect FAIL.
- [ ] **Step 3:** Implement with an effect keyed on the validated spec; guard with a cancelled flag per effect run.
- [ ] **Step 4:** Full verification; rewrite "checks a draft against the library and reports conflicts" to wait for the automatic result.

### Task 8: Default keys, restore, and v17 (review item 6)

**Files:**
- Modify: `src/rules/defaults.ts`, `src/rules/record.ts`, `src/db/client.ts`, `src/db/seed.tsx`, `src/services/food-db.ts`
- Test: `src/rules/defaults.test.ts`, `src/db/rule-migration.test.ts`, `src/services/food-db.test.ts`

**Interfaces:**
- Produces: `RuleRecord.default_key?: string`; `DefaultRule` gains `default_key: string` — `extras-limit-breakfast|lunch|dinner`, `want-curry`, `want-subzi`, `variety`, `spacing`, `extras-only-when-asked`, `prefer-frequent`, `avoid-rare`.
- Produces: `restoreDefaultRules(): Promise<number>` in `food-db.ts` — adds every default whose key no stored rule has, returns how many were added; existing rules (edited, disabled) are untouched.
- v17: for each stored rule without `default_key` whose name exactly equals a `defaultRules()` name, set its `default_key`; idempotent.

- [ ] **Step 1: Failing tests:** every `defaultRules()` entry has a unique `default_key`; seeding stores them; v17 test starts from a v16 database with default rules lacking keys and one renamed default (expect it left without a key) and ends with keys on the unrenamed ones; `restoreDefaultRules()` on a library missing two defaults returns 2 and a second call returns 0; deleting a default and restoring does not touch an edited sibling.
- [ ] **Step 2:** Run the three files — expect FAIL.
- [ ] **Step 3:** Implement; v16 and `runSeed` write keys; add `db.version(17)` with the same stores as v16.
- [ ] **Step 4:** Full verification.

### Task 9: Rules page sections, search, restore (review items 5, 6)

**Files:**
- Create: `src/rules/groups.ts`, `src/rules/groups.test.ts`
- Modify: `src/rules/index.ts`, `src/components/rules/RuleList.tsx`
- Test: `src/components/rules/RuleList.test.tsx` (new)

**Interfaces:**
- Consumes: `restoreDefaultRules` (Task 8).
- Produces: `groupRules(rules: readonly RuleRecord[]): { mine: RuleRecord[]; defaults: RuleRecord[]; dish: RuleRecord[] }` — `dish` = has `owner_component_id`; `defaults` = has `default_key` and no owner; `mine` = the rest; order preserved. `RuleList` shows "Your rules", then collapsed `<details>` "Planner defaults (N)" with a "Restore defaults" button and "Dish settings (N) — edit these from the Library"; a search box filters all sections by rule name and description and opens the details while the query is non-empty; zero matches shows "No rules match “…”".

- [ ] **Step 1: Failing tests:** `groupRules` splits correctly and keeps order; a rule with both owner and `default_key` counts as `dish`; `RuleList`: sections and counts render for a seeded-like set; searching "paneer" shows only matching rows and opens the details; searching a non-match shows the message and no section headings; "Restore defaults" re-adds a deleted default and shows how many were added.
- [ ] **Step 2:** Run both files — expect FAIL.
- [ ] **Step 3:** Implement `groupRules`; rebuild `RuleList` around it (reuse `RuleRow`).
- [ ] **Step 4:** Full verification.

### Task 10: Deep links to rules and dishes (review item 10b, 10c)

**Files:**
- Modify: `src/components/rules/RuleRow.tsx` (anchor `id="rule-<id>"`, "Edit in Library" → `/library#dish-<componentId>`), `src/components/rules/RuleList.tsx` (on mount and `hashchange`, scroll to and briefly highlight the target row; open its section), `src/components/plan/PlanProblemsBanner.tsx` (rule problems link "Open rule" → `/rules#rule-<ruleId>`, or the dish for owned rules), `src/components/library/ComponentLibrary.tsx` and `ComponentTab.tsx` (select the tab of the dish named in `#dish-<id>` and expand its row)
- Test: `src/components/rules/RuleList.test.tsx`, `src/components/library/ComponentRow.test.tsx` or a new `ComponentLibrary.test.tsx`, `src/components/plan/PlanBoard.test.tsx`

**Interfaces:**
- Produces: `parseHash(hash: string): { rule?: number; dish?: number }` in `src/lib/hash-target.ts` (`'#rule-12'` → `{ rule: 12 }`, `'#dish-3'` → `{ dish: 3 }`, anything else → `{}`), unit-tested.

- [ ] **Step 1: Failing tests:** `parseHash` cases incl. garbage and negative numbers → `{}`; with `location.hash = '#rule-5'` the rule's row calls `scrollIntoView` and, if it is in "Planner defaults" or "Dish settings", that section is open; a missing target is a no-op; the banner renders "Open rule" with the right `href` for a rule problem and the dish link for an owned rule; `ComponentLibrary` with `#dish-<curryId>` shows the Curries tab with that row expanded.
- [ ] **Step 2:** Run those files — expect FAIL.
- [ ] **Step 3:** Implement; keep all hash reading in effects (no render-time `window` access).
- [ ] **Step 4:** Full verification.

### Task 11: Final checks and docs

**Files:**
- Modify: `docs/architecture.md`

- [ ] **Step 1:** Run the seeded parity script (seeds 1–10) and compare with the baseline in Global Constraints — expect identical.
- [ ] **Step 2:** Update `docs/architecture.md`: default keys and "Restore defaults", Rules page sections, `PlanProblem.reason`, hash deep links.
- [ ] **Step 3:** `npx tsc --noEmit -p . && npx eslint src && npx vitest run` — all clean.

## Self-Review

- **Spec coverage:** items 1→T3, 2→T4, 3→T3, 4→T1+T5, 5→T9, 6→T8+T9, 7a→T6 (7b explicitly excluded), 8→T6, 9→T6, 10a→T7, 10b/10c→T10, 11→T3, 12→T1, 13→T2.
- **Type consistency:** `OwnedValues`/`OwnedRuleChanges` defined in T2 and used by T3; `restoreDefaultRules` defined in T8 and used by T9; `PlanProblem.reason` defined in T4 and used by T5 and T10.
- **Proportion:** tasks give signatures, assertions and exact strings; bodies are left to the implementer.
