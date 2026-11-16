# User-Defined Meal Parts Implementation Plan (Stage 1 in full, Stages 2–5 outlined)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal (whole project):** The user defines the parts of a meal, their order, each part's categories and the tag groups;
the planner, rules, links, forms, plan board and assistant read them instead of naming base, curry, subzi and extras.

**Goal (this plan, Stage 1):** Parts, part categories and tag groups are stored; every existing library is converted to
Base, Curry, Subzi, Extras with its categories, curry types and tags carried over; new and edited dishes keep the new
fields in step with the old ones. Nothing the user sees changes.

**Architecture:** New Dexie tables `parts` and `tag_groups`; `categories` gain `part_id`; `components` gain `part_id`,
`category_id` and `tags`. A pure `convertLibrary` does the mapping, used by the v21 upgrade, by the seed, and (per dish) by
the save path, so the old fields stay the source of truth until Stage 4 flips it.

**Tech Stack:** TypeScript, Dexie, Vitest, fake-indexeddb (as the existing migration tests use).

**Spec:** `docs/superpowers/specs/2026-11-16-user-defined-meal-parts-design.md`

**Depends on:** search budget, rule levels and repair loop plans merged first (Stage 2 needs the repair loop's `PARTS`).

## Global Constraints

- Conversion order and names: parts `Base` (position 0), `Curry` (1), `Subzi` (2), `Extras` (3).
- Per-part "Keep this part varied across the week" (`varied`): on for Base, Curry, Subzi; off for Extras; a new part
  starts on.
- Today's base categories → Base part's categories; extra categories → Extras part's; each value of `CURRY_CATEGORIES`
  used by at least one curry → a category of the Curry part, named as today's label; Subzi gets none.
- Tag groups converted, in order: Dietary (several values), Protein (one value), Region (several), Occasion (several),
  values from today's lists. `frequency` stays a fixed field.
- A dish belongs to one part. The first part holds exactly one dish per meal (Stage 2).
- Database upgrades are additive and tested from the previous version with realistic rows (CLAUDE.md). Old fields are
  kept until Stage 5.
- Forms: never save what the user did not change (CLAUDE.md); the sync on save writes only derived fields of the dish
  being saved.
- No visible change in Stage 1: all tests and 91 rule cases pass unchanged.
- CLAUDE.md conventions; scope `db` for this stage's commits.

## Review Focus

1. A curry with no `curry_category`: `category_id` stays unset, no crash (Task 1 test).
2. A dish whose `base_category_id` points at a deleted category: `category_id` unset, the dish kept (Task 1 test).
3. A library with no curries at all: the Curry part exists with no categories (Task 1 test).
4. Upgrade run on an empty database (fresh install before seeding): parts and tag groups created, nothing else (Task 2).
5. Editing a dish's curry type on the form after the upgrade: its `category_id` follows (Task 4 test).

---

### Task 1: Types and `convertLibrary`

**Files:**
- Create: `src/types/part.ts`, `src/types/tags.ts`, `src/db/parts.ts`, `src/db/parts.test.ts`
- Modify: `src/types/category.ts` (`part_id?: number`), `src/types/component.ts` (`part_id?`, `category_id?`, `tags?`),
  `src/types/index.ts`

**Interfaces:**
- Produces:
  - `interface PartRecord { id: number; name: string; position: number; varied: boolean; created_at: string }`
  - `interface TagValue { id: number; name: string }`;
    `interface TagGroupRecord { id: number; name: string; position: number; multiple: boolean; values: TagValue[]; created_at: string }`
  - `ComponentRecord` gains `part_id?: number; category_id?: number | null; tags?: Record<number, number[]>` (group id →
    value ids).
  - `CONVERTED_PARTS` (names, positions, `varied` as above) and `CONVERTED_TAG_GROUPS` (names, `multiple`, values from
    `DIETARY_TAGS`, `PROTEIN_TAGS`, `REGIONAL_TAGS`, `OCCASION_TAGS`; value ids 1..n within each group) in `src/db/parts.ts`.
  - `function convertLibrary(input: { categories: CategoryRecord[]; components: ComponentRecord[] }, ids: { parts: Record<ComponentType, number>; tagGroups: Record<'dietary' | 'protein' | 'regional' | 'occasion', number> }): { newCategories: Omit<CategoryRecord, 'id'>[]; categories: CategoryRecord[]; components: ComponentRecord[] }`
    — sets `part_id` on categories and components; returns curry-type categories to create (`newCategories`, part Curry);
    `category_id` of a curry is filled by `convertDish` after the new categories have ids.
  - `function convertDish(c: ComponentRecord, lookup: ConvertLookup): ComponentRecord` — derives `part_id`,
    `category_id`, `tags` from the old fields; pure; used by the upgrade, the seed and the save path.
    `interface ConvertLookup { parts: Record<ComponentType, number>; curryCategory: Map<CurryCategory, number>; knownCategories: ReadonlySet<number>; tagGroups: Record<'dietary' | 'protein' | 'regional' | 'occasion', { id: number; valueId: Map<string, number> }> }`

- [ ] **Step 1: Failing tests** in `parts.test.ts`:
  - Sambar (curry, `curry_category: 'lentil'`, dietary `['veg']`, protein `'dal'`, regional `['south-indian']`) converts to
    `part_id` Curry, `category_id` = the 'lentil' category id, `tags` = `{ [dietary]: [veg id], [protein]: [dal id], [regional]: [south id], [occasion]: [] }`.
  - Rice (base, `base_category_id` 1) → part Base, `category_id` 1. Papad (extra, `extra_category_id` 12) → part Extras,
    `category_id` 12. A subzi → part Subzi, `category_id` unset.
  - Review Focus 1, 2, 3 as listed above.
  - `convertLibrary` creates curry-type categories only for curry types in use, each with `part_id` Curry and `kind`
    unchanged semantics (`kind: 'curry'` added to `CategoryKind`).
- [ ] **Step 2:** `npx vitest run src/db/parts.test.ts` — FAIL.
- [ ] **Step 3:** Implement. Extend `CategoryKind` to `'base' | 'extra' | 'curry'` (only the converter creates `curry`
  categories in this stage; existing category UI filters by kind, so they stay hidden).
- [ ] **Step 4:** Run — PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5:** Commit: `feat(db): parts, part categories and tag groups as data, with a converter from today's library`

### Task 2: Dexie v21 upgrade

**Files:**
- Modify: `src/db/client.ts` (tables `parts`, `tag_groups`; `version(21)`; indexes `components: … part_id, category_id`,
  `categories: … part_id`)
- Test: `src/db/rule-migration.test.ts` (new `describe('v21')`, following the v19/v20 pattern)

- [ ] **Step 1: Failing test:** open a v20 database with realistic rows (the seeded categories, 6 components covering
  every type including a curry without `curry_category`, rules, a saved plan with locks), upgrade, and assert: 4 parts in
  order with `varied` flags; 4 tag groups; curry-type categories created; every component converted as in Task 1; rules,
  `saved_plans`, `active_plan` byte-for-byte unchanged. Second test: an empty v20 database gets parts and tag groups only
  (Review Focus 4).
- [ ] **Step 2:** Run `npx vitest run src/db/rule-migration.test.ts` — FAIL.
- [ ] **Step 3:** Implement the upgrade with `convertLibrary`/`convertDish` in one transaction.
- [ ] **Step 4:** Run `npx vitest run src/db` — PASS.
- [ ] **Step 5:** Commit: `feat(db): existing libraries gain parts Base, Curry, Subzi and Extras, keeping every dish, rule and plan`

### Task 3: New libraries are seeded with parts

**Files:**
- Modify: `src/db/seed.tsx` (`seed` creates parts and tag groups first, then categories with `part_id`, then components
  through `convertDish`; transaction includes the new tables)
- Test: `src/db/seed.test.ts`

- [ ] **Step 1: Failing test:** after `runSeed()` on an empty database, 4 parts, 4 tag groups, every component has
  `part_id` and `tags`, every curry with a curry type has `category_id`; running `runSeed()` twice creates no duplicates.
- [ ] **Step 2:** Run — FAIL. Implement. Run — PASS.
- [ ] **Step 3:** Commit: `feat(db): a new library starts with the four parts and tag groups`

### Task 4: Saves keep the new fields in step

**Files:**
- Modify: `src/services/food-db.ts` (`addComponent`, `updateComponent`, `saveComponent`), `src/services/category-db.ts`
  (`addCategory` sets `part_id` from `kind`)
- Create: `src/services/parts-db.ts` (`getParts()`, `getTagGroups()`, `loadConvertLookup()`)
- Test: `src/services/food-db.test.ts`, `src/services/category-db.test.ts` (create if missing)

**Interfaces:**
- Produces: `getParts(): Promise<PartRecord[]>` (by position), `getTagGroups(): Promise<TagGroupRecord[]>` (by position),
  `loadConvertLookup(): Promise<ConvertLookup>`.

- [ ] **Step 1: Failing tests:**
  - Adding a curry with `curry_category: 'paneer'` sets `part_id` Curry and `category_id` of 'paneer', creating the
    'paneer' Curry category if it did not exist.
  - Updating a curry's `curry_category` from 'lentil' to 'legume' updates `category_id` (Review Focus 5).
  - Updating only a dish's `notes` writes no change to `part_id`, `category_id` or `tags` beyond what they already were.
  - `addCategory({ kind: 'extra', name: 'pickle' })` gets `part_id` Extras.
- [ ] **Step 2:** Run — FAIL. Implement. Run `npm test` — PASS.
- [ ] **Step 3:** Commit: `feat(db): saving a dish keeps its part, category and tags in step`

### Task 5: Docs and full check

- [ ] **Step 1:** `docs/architecture.md`: a "Meal parts (Stage 1)" note — tables, conversion, old fields still the source
  of truth until Stage 4.
- [ ] **Step 2:** Run `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run rule-cases` — all pass, nothing visible
  changed.
- [ ] **Step 3:** Commit: `docs(db): meal parts stored alongside today's fields`

---

## Stages 2–5 (each gets its own detailed plan when the previous stage is merged)

**Stage 2 — Planner over parts.** `SlotState` becomes `{ parts: number[][] }` indexed by part position (first part one
dish), built from the `PARTS` list the repair loop introduced, now read from stored parts. Matcher fields `part`,
`category`, `tag:<groupId>` (by id) added next to the old ones. Builtins `max-curry`/`max-subzi` removed; a v22 upgrade adds
the Always rules "At most one Curry per meal" and "At most one Subzi per meal" so converted libraries behave as before. The
default "sides only when a rule asks" covers every part below the first; variety and spacing read each part's `varied`.
Plan storage (`PlanSlot`) and pins gain a per-part shape with a converter; old shape still read. Entry check: all rule
cases pass on the converted test library.

**Stage 3 — Rules and links over parts.** Templates, link targets (`LinkTarget` becomes part + dish/category), the
conditional "when the meal has" link for any part other than the one it brings into, link warnings (clashes read the cap
rules), descriptions and `link-text.ts` read part names. A link pointing the wrong way after a reorder is skipped and named.
New rule cases: a Main/Side/Dessert library; a Main with two "comes with a Side" links gets two Sides; a general rule and a
link satisfied by one dish.

**Stage 4 — Library UI.** Parts page: add, rename, reorder (drag or up/down), delete only when empty, `varied` toggle.
Part categories and tag groups editable. Dish form: choose part, category from that part, tags by group; move a dish to
another part. The new fields become the source of truth; old fields derived from them for any code not yet converted.

**Stage 5 — Plan board, export, assistant; old fields removed.** Plan board rows in part order, lock/swap per dish, add a
dish to a part by hand; past weeks shown as stored, deleted parts under "Other"; locks re-keyed by dish (v23). Export image
and the assistant's prompt and tools read parts. Old fields (`componentType`, `base_category_id`, `curry_category`,
`extra_category_id`, the tag arrays) removed with a final upgrade. Acceptance from the spec: a Main/Side/Dessert library
with a "Spice level" tag group built in the UI plans correctly, and no source file outside conversion and seed names a part.
