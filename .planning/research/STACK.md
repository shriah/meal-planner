# Technology Stack

**Project:** Indian Food Planner v1.3 curry base compatibility
**Researched:** 2026-03-29

## Recommended Stack

This milestone does not need a stack expansion. Stay on the existing stack from `PROJECT.md`: Next.js 16.2.0, React 19.2.4, TypeScript 5.x, Dexie 4.3.0, Zustand 5.0.12, Zod 4.3.6, shadcn/ui.

The work is a data-model and service-layer extension inside the current local-first architecture:

1. Add curry compatibility data to `ComponentRecord`.
2. Ship a Dexie `version(12)` upgrade that backfills existing curry rows.
3. Enforce compatibility in generator curry selection as a default hard constraint.
4. Add one minimal rule-level override seam for intentional incompatibility.

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Next.js | 16.2.0 | Existing app shell and route structure | No new framework concern exists here. This feature is local schema, UI form, and generator logic. |
| TypeScript | 5.x | Type/model safety across schema, generator, and rules | The change is mostly type-driven. Keep it typed end to end so migration, UI, and generator semantics cannot drift. |
| Dexie | 4.3.0 | IndexedDB schema evolution and backfill | The app already depends on versioned upgrades. Curry compatibility is exactly the kind of additive field plus upgrade callback Dexie is designed for. |
| Zod | 4.3.6 | Rule contract validation | If a new rule effect is introduced for override semantics, it should be added to the existing compiled-rule schema instead of creating an ad hoc flag outside validation. |
| Zustand | 5.0.12 | Existing plan-board/manual swap flow | No store redesign is needed. At most, picker inputs gain `currentBaseCategoryId`-aware curry filtering. |

### Database

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Dexie `components` table | v12 schema upgrade | Persist curry compatibility on the existing component record | Do not add a new table. Compatibility belongs on the curry row the same way extra compatibility already lives on the extra row. |
| Existing `categories` table | v11 shape retained | Source of stable base-category IDs for curry compatibility | Stable category IDs are already the project rule. Reuse them; do not reintroduce label-based compatibility as the primary source of truth. |

### Infrastructure

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| IndexedDB local migration | Dexie upgrade callback | Backfill existing curry rows in-app | `PROJECT.md` requires backwards-compatible app-side migration with no library rebuild. |
| Existing synchronous generator | Current service layer | Apply compatibility during automatic selection | The generator already loads components and rules synchronously. Keep compatibility enforcement inside that flow. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `dexie-react-hooks` | 4.2.0 | Live-update curry edit UI and filtered picker UI | Use for the curry form checklist and any category-aware picker queries. No extra state library is needed. |
| Existing shadcn `Checkbox`/`Select` components | current repo versions | Curry compatibility editing UI | Reuse the extra-category checklist pattern already present in `ComponentForm`. |

## Schema And Service Changes

### 1. `ComponentRecord` changes

Recommended addition:

| Field | Type | Applies To | Why |
|-------|------|------------|-----|
| `compatible_base_category_ids` | `number[]` | `curry` | Numeric base-category IDs match the current category system and existing extra/subzi compatibility pattern. |

Recommended shape decisions:

| Decision | Recommendation | Reason |
|----------|----------------|--------|
| Curry compatibility requiredness | Persist as an array and normalize to `[]` only during migration staging, then backfill to a non-empty set for existing rows | Generator logic is simpler and safer when curry compatibility is always an array. |
| Legacy string alias | Do not add `compatible_base_types` for curry | That field is legacy carryover for pre-category migrations. Adding a new string alias now expands migration and delete/rename surface area for no gain. |
| New table | Do not add a join table like `curry_base_compatibility` | Overkill for a small local-first app. The existing record-level array plus multiEntry index is enough. |

### 2. Dexie migration

Ship `db.version(12)` with the same table layout pattern unless you decide to query curries by compatibility via Dexie index more often. The critical part is the upgrade callback, not a structural redesign.

Backfill recommendation:

| Case | Backfill value |
|------|----------------|
| Existing curry with no compatibility data | All current base category IDs |
| New curry created after v1.3 | User-selected `compatible_base_category_ids` from the Library form |
| Curry whose referenced category gets deleted later | Remove the deleted ID from the array, same normalization pattern as extras/subzi |

Why default to all base categories on backfill:

- It preserves current generator behavior for old data until the user refines compatibility.
- It avoids accidental empty curry pools right after migration.
- It matches the milestone requirement that existing rows become editable without rebuilding the library.

Migration guardrails:

- Read base categories from the `categories` table inside the upgrade transaction.
- Backfill only rows where `componentType === 'curry'`.
- Normalize missing arrays to a concrete array value during the upgrade.
- Add migration tests covering v11 -> v12 upgrade, empty category edge case, and delete-normalization behavior.

### 3. Service-layer seams

Recommended additions:

| Service | Change | Why |
|---------|--------|-----|
| `food-db.ts` | Add `getCurriesByBaseCategoryId(baseCategoryId: number)` | Gives the UI the same category-aware query seam that extras already use. |
| `generator.ts` | Add `isCurryCompatibleWithBase(curry, base)` helper | Keeps generator enforcement explicit and testable. Mirror `isExtraCompatibleWithBase()`. |
| `generator.ts` | Filter automatic curry pool by compatibility before weighted selection | Compatibility is the new hard default constraint. This is the core behavior change. |
| `ComponentForm.tsx` | Add curry compatibility checklist using live base categories | Existing curry rows become editable through the same pattern already used for extras. |
| `MealPickerSheet.tsx` | If touched, default curry picker to base-aware results | Keeps manual selection aligned with generator defaults without redesigning the planner. |

Recommended query path:

- Prefer `db.components.where('compatible_base_category_ids').equals(baseCategoryId).distinct()` for curries if you add a dedicated service helper.
- This works with the existing multiEntry index pattern already declared on `components`.

### 4. Rule override semantics

The current rule model is not quite enough if “override compatibility” means more than “force one specific incompatible curry”. `require_one` can override to a named component, but it does not express “allow incompatible curries for this scoped case” as a first-class rule.

Recommended minimal addition:

| Layer | Change | Why |
|-------|--------|-----|
| `types/plan.ts` | Add one new effect, e.g. `allow_incompatible_curry` | Makes override intent explicit and keeps it inside the validated rule system. |
| Rule compiler/form | Surface that single effect only where relevant | Smallest possible extension to existing rule UX. |
| Generator | When scoped rule matches, skip compatibility filtering for curry selection in that slot | This preserves “hard default, explicit override” exactly. |

Scope recommendation:

- Target should stay on existing rule targets, preferably base-category-targeted rules.
- Do not build a generic compatibility matrix rule language in this milestone.
- Do not add override behavior for subzi or extras now.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Curry compatibility storage | `compatible_base_category_ids` on curry record | Separate compatibility table | Too much schema and migration complexity for a single-user IndexedDB app. |
| Backfill strategy | Default old curries to all current base categories | Leave old curries empty and force users to edit everything | Creates immediate generator regressions and migration friction. |
| Override semantics | One explicit rule effect for compatibility bypass | Reuse `require_one` only | Too narrow if users want scoped override without naming one fixed curry. |
| UI editing | Reuse checklist pattern in `ComponentForm` | New dedicated “compatibility manager” screen | Scope creep. The data lives on the curry row; edit it there. |
| Picker behavior | Optional thin curry-by-base service helper | Broad planner-side override UI | Not needed to deliver the milestone goal. |

## Installation

No new packages are recommended.

```bash
# No dependency additions for this milestone
npm test
```

## Explicit Non-Goals For This Milestone

Do not add the following:

| Avoid | Why | Use Instead |
|------|-----|-------------|
| New database tables for compatibility | Unnecessary normalization for a local app with small records | Store compatibility directly on curry records |
| New backend/API layer | Compatibility is local data plus local generation | Keep using Dexie + synchronous generator |
| Subzi compatibility expansion | `PROJECT.md` explicitly keeps subzi composition out of scope | Touch only curry compatibility |
| General meal-composition engine rewrite | The existing generator already has component-specific selection stages | Add a small curry compatibility filter plus explicit override seam |
| Category-label-based curry compatibility as primary storage | Category IDs are the current stable identity | Store numeric IDs only |
| Rich override UX for arbitrary per-slot manual exceptions | Too broad for this milestone | If needed, a single scoped rule effect is enough |
| Bulk “smart inference” or AI pairing suggestions | No LLM/runtime complexity is needed | Backfill to all categories, then let users edit |

## Implementation Notes

- Treat compatibility as a default hard constraint only for automatic curry selection.
- Locked/manual selections should not silently rewrite stored plan data during migration.
- If a rule explicitly overrides compatibility, log a warning only when the override still produces no eligible curry.
- Keep delete/rename safety symmetric with extras:
  - rename: no row churn because IDs remain stable
  - delete: strip removed category IDs from curry compatibility arrays
- Add generator tests for:
  - compatible curry selected by default
  - incompatible curry excluded by default
  - backfilled curry remains eligible after migration
  - override rule allows otherwise incompatible curry

## Sources

- `PROJECT.md` in this repo, updated 2026-03-29: milestone scope, existing stack, and out-of-scope constraints. Confidence: HIGH.
- Dexie docs, `Version.upgrade()`: official upgrade callback pattern for in-place schema/data migration. https://old.dexie.org/docs/Version/Version.upgrade() Confidence: HIGH.
- Dexie docs, `MultiEntry Index`: array properties can be indexed and queried directly with `where(...).equals(...)`; use `distinct()` where relevant. https://dexie.org/docs/MultiEntry-Index Confidence: HIGH.

