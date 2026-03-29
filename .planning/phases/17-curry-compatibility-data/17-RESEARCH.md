# Phase 17: Curry Compatibility Data - Research

**Researched:** 2026-03-29
**Domain:** Dexie-backed data migration and library UI for curry/base compatibility
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
### Backfill policy
- **D-01:** Ship curated compatibility mappings for seeded/default curries where the pairing is known.
- **D-02:** Any existing curry that is not covered by curated seed mappings should fall back to "all current base categories" on upgrade so no current library breaks.
- **D-03:** Phase 17 must cover both seeded/default curry data and a safe in-app fallback path for already-existing non-curated user-library curries.

### Empty compatibility semantics
- **D-04:** An empty `compatible_base_category_ids` array means "compatible with none," not "all."
- **D-05:** Zero compatible bases is allowed in stored data and editing flows; it represents a curry the generator should never auto-pick.
- **D-06:** The Library must surface zero-compatible-base curries with a clear warning/badge so the state is explicit to the user.

### Library editing UX
- **D-07:** Reuse the existing extra-compatibility checklist pattern for curry compatibility rather than introducing a new picker interaction.
- **D-08:** Collapsed curry rows should show the selected compatible base labels, matching the existing compatibility-summary pattern used elsewhere in the library.
- **D-09:** The phase should keep the editing experience lightweight and library-native rather than creating a separate category-management-style flow for curry compatibility.

### Delete normalization
- **D-10:** When a base category is deleted, remove that ID from curry compatibility lists and keep any remaining IDs.
- **D-11:** If delete normalization leaves a curry with zero compatible base IDs, keep it empty and let the empty-state warning behavior apply; do not silently reset it back to all-bases.
- **D-12:** Category identity remains ID-based, so rename/delete safety must follow the same normalization contract established in Phase 14.

### Scope guardrails
- **D-13:** This phase does not define generator fallback behavior beyond the meaning of the stored compatibility data; enforcement belongs to Phase 18.
- **D-14:** This phase does not add curry-vs-subzi composition logic, subzi compatibility, or a new rule surface.

### the agent's Discretion
- Exact copy for the zero-compatible-base warning state, as long as it clearly communicates that the curry will not be auto-selected.
- Exact placement/styling of compatibility labels on collapsed curry rows, as long as the summary remains visible.
- Exact curated seed mapping mechanism and migration implementation details, as long as seeded curries get explicit mappings and non-curated curries get the safe all-bases fallback.

### Deferred Ideas (OUT OF SCOPE)
- Curry-vs-subzi composition modes remain deferred to backlog item `999.1` and are not part of this phase.
- Generator enforcement and explicit override behavior are handled in Phases 18 and 19, not here.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CURRY-01 | User can assign one or more compatible base categories to each curry in the Library | Reuse the existing checklist UI in `ComponentForm`, add collapsed-row summary badges, and persist `compatible_base_category_ids` on curry records |
| CURRY-02 | Existing curry records are backfilled in-app with editable compatibility data so the current library remains usable after upgrade | Add a Dexie migration that writes curated mappings for known seeded curries and falls back to all current base category IDs for unmatched legacy curries |
| CURRY-07 | Curry compatibility remains category-ID based and stays safe across category rename/delete normalization | Extend `normalizeComponentCategoryRefs()` and category delete flow so curry compatibility IDs survive rename and drop deleted IDs without reintroducing labels |
</phase_requirements>

## Project Constraints (from AGENTS.md)

- This repo uses Next.js 16.x, not older Next.js conventions.
- Before writing code that depends on Next.js APIs or file conventions, read the relevant guide under `node_modules/next/dist/docs/`.
- Treat deprecation notices in those docs as binding.

## Summary

Phase 17 fits the patterns already established in Phase 14 and Phase 16. The project already stores extra compatibility as `compatible_base_category_ids`, already resolves category labels from live category records, and already normalizes deleted category references inside `normalizeComponentCategoryRefs()` during `deleteCategory()`. The clean plan is to make curries participate in those same seams rather than inventing a parallel model.

The main technical work is a Dexie migration plus UI propagation. Existing curry records currently have no compatibility field at all, so the migration must distinguish legacy `undefined` from explicit empty arrays. The safest implementation is: add `compatible_base_category_ids` to curry records, populate seeded/default curries from a curated mapping, populate every unmatched legacy curry with all current base-category IDs, and leave later edits fully user-controlled. Empty arrays must remain meaningful and must never be auto-expanded back to all bases.

The planner should treat this as one coherent data-contract phase: type changes, seed-path updates, Dexie migration/backfill, delete normalization, library form wiring, collapsed-row summaries, and curry-specific regression tests. No new package is needed, and no generator behavior should be changed in this phase beyond persisting the new contract.

**Primary recommendation:** Implement curry compatibility by extending the existing extra-compatibility ID model, ship the backfill in a new Dexie version upgrade, and cover the legacy `undefined` vs explicit `[]` distinction with tests before UI work lands.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `dexie` | `4.4.1` | IndexedDB schema versioning and in-place data migration | The app already uses Dexie for every persistence concern, and `version().stores().upgrade()` is the established migration path |
| `dexie-react-hooks` | `4.4.0` | Live category/component reads in form and row UIs | Existing library UI already relies on `useLiveQuery()` for category-backed labels and selectors |
| `react` | `19.2.4` | Client-side library editing UI | Existing component form and row surfaces are client React components |
| `next` | `16.2.1` | App/runtime framework | Existing app stack; keep phase work within current Next conventions |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | `4.1.2` | Unit/component/db migration tests | For migration fixtures, library UI behavior, and normalization regressions |
| `@testing-library/react` | `16.3.2` | Interaction testing for `ComponentForm` and row summaries | For checkbox flows, warnings, and renamed/deleted category rendering |
| `fake-indexeddb` | `6.2.5` | IndexedDB emulation in tests | Required for Dexie migration and service tests under Vitest |
| `happy-dom` | `20.8.4` | Browser-like environment for component tests | Use where form/row rendering needs DOM APIs |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Dexie versioned migration | Ad hoc backfill during app bootstrap | Worse reliability; misses one-time migration semantics and is harder to test |
| Existing checklist UI in `ComponentForm` | New picker or category-management flow | Adds scope with no product benefit and contradicts D-07/D-09 |
| Category ID storage | Base-category labels or legacy `base_type` strings | Breaks rename/delete safety and duplicates Phase 14's solved problem |

**Installation:**
```bash
# No new packages required for Phase 17.
```

**Version verification:** Verified on 2026-03-29 with:
```bash
npm view dexie version time.modified
npm view dexie-react-hooks version time.modified
npm view vitest version time.modified
npm view next version time.modified
```

## Architecture Patterns

### Recommended Project Structure
```text
src/
├── types/                     # Curry record shape and shared component unions
├── db/                        # Dexie schema versions, migrations, seed materialization
├── services/                  # Category delete normalization and CRUD helpers
├── lib/                       # Category label resolution helpers
├── components/library/        # Inline editing form, collapsed rows, warnings/badges
└── test/                      # Global IndexedDB test setup
```

### Pattern 1: Curry Compatibility Uses the Existing Category-ID Contract
**What:** Store curry compatibility in `compatible_base_category_ids` on curry records, using the same numeric ID contract already used for extras.
**When to use:** For all persisted curry compatibility data, UI reads, migration output, and delete normalization.
**Example:**
```typescript
// Source: local pattern from src/types/component.ts and src/components/library/ComponentForm.tsx
export interface CurryRecord extends BaseComponentFields {
  componentType: 'curry';
  curry_category?: string;
  compatible_base_category_ids: number[];
}
```

### Pattern 2: Backfill Through a New Dexie Version Upgrade
**What:** Add a new `db.version(...).stores(...).upgrade(...)` step that rewrites existing curry rows exactly once.
**When to use:** For browser-resident legacy data already stored in `FoodPlannerDB`.
**Example:**
```typescript
// Source: Dexie migration pattern from https://dexie.org/docs/Version/Version.upgrade%28%29
db.version(12).stores({
  categories: '++id, kind, name',
  components: '++id, componentType, base_type, base_category_id, extra_category, extra_category_id, *compatible_base_types, *compatible_base_category_ids, *dietary_tags, *regional_tags, *occasion_tags',
  meals: '++id, base_id, curry_id, subzi_id',
  meal_extras: '[meal_id+component_id], meal_id, component_id',
  rules: '++id',
  saved_plans: '++id, week_start',
  preferences: 'id',
  active_plan: 'id',
}).upgrade(async (tx) => {
  const baseIds = (await tx.table('categories').where('kind').equals('base').toArray())
    .map((category) => category.id)
    .filter((id): id is number => id !== undefined);

  await tx.table('components').where('componentType').equals('curry').modify((component) => {
    if (Array.isArray(component.compatible_base_category_ids)) {
      return;
    }

    component.compatible_base_category_ids =
      curatedCompatibilityIdsFor(component.name) ?? baseIds;
  });
});
```

### Pattern 3: Curated Seeds and Legacy Backfill Must Converge on One Resolver
**What:** Define a single curry-compatibility resolver for seeded curries and reuse it in both seed materialization and migration backfill.
**When to use:** When deciding whether a curry gets explicit curated IDs or the all-bases fallback.
**Example:**
```typescript
// Source: local seed materialization pattern from src/db/seed-data.ts
function resolveSeededCurryCompatibilityIds(
  curryName: string,
  baseLookup: Record<string, number>,
  fallbackBaseIds: number[],
): number[] {
  const curated = CURRY_COMPATIBILITY_BY_SEED_NAME[curryName];
  if (!curated) return fallbackBaseIds;
  return curated.map((name) => baseLookup[name]).filter((id): id is number => id !== undefined);
}
```

### Pattern 4: Reuse the Existing Checklist and Label-Resolver UI
**What:** Mirror the extra compatibility checklist in `ComponentForm` and the collapsed-row label summary in `ComponentRow`.
**When to use:** For curry create/edit and read-only library summaries.
**Example:**
```typescript
// Source: local UI pattern from src/components/library/ComponentForm.tsx and src/components/library/ComponentRow.tsx
{componentType === 'curry' && (
  <fieldset>
    <legend>Compatible Base Categories</legend>
    {(baseCategories ?? []).map((category) => (
      <label key={category.id}>
        <Checkbox
          checked={form.compatible_base_category_ids.includes(category.id!)}
          onCheckedChange={() => toggleCategory(category.id!)}
        />
        {category.name}
      </label>
    ))}
  </fieldset>
)}
```

### Anti-Patterns to Avoid
- **Inferring compatibility from `curry_category`:** `curry_category` is a loose label field today, not a rename-safe contract.
- **Treating missing and empty arrays as the same state:** `undefined` means legacy/unmigrated; `[]` means explicit compatibility with none.
- **Backfilling by re-running seed/bootstrap:** Existing user libraries live in IndexedDB and need an in-place migration, not a rebuild.
- **Adding a curry-specific category management surface:** The existing checklist pattern already matches the product decision.
- **Normalizing extras but forgetting curries on base delete:** Phase 17 must extend the same normalization seam, not bypass it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Browser data migration | A custom startup walker outside Dexie versioning | `db.version(...).upgrade(...)` | One-time, transactional, and already used by this repo |
| Category rename propagation | Manual rewrites of label strings across rows/forms | Live category lookup plus stored IDs | Renames already resolve automatically through category maps |
| Category delete cleanup | Ad hoc curry-specific delete logic in UI handlers | `normalizeComponentCategoryRefs()` inside `deleteCategory()` | Keeps delete behavior centralized and transactional |
| Library summary rendering | Duplicated label formatting for curries | Existing `buildCategoryMap()` and `getBaseCategoryLabel()` helpers | Reuses the established deleted-category fallback and rename-safe labels |
| Backfill classification | Guessing by `curry_category` only | Curated seed-name mapping plus all-base fallback | Avoids false precision and respects D-02 |

**Key insight:** The hard part is not storing another array. The hard part is preserving semantic meaning across legacy data, category lifecycle changes, and UI clarity. The repo already solved those problems for extras and rules; Phase 17 should extend those exact seams.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Browser IndexedDB `FoodPlannerDB`, table `components`, currently stores curry rows without `compatible_base_category_ids`; this is the primary runtime state for CURRY-02 | **Data migration:** add a Dexie upgrade that writes curated IDs for known seeded curries and all current base IDs for unmatched legacy curries. **Code edit:** update new-save paths so future curries always persist the field |
| Live service config | None verified. The app is local-first and current phase scope does not depend on external UI-managed services or remote configs | None |
| OS-registered state | None verified. No task runners, schedulers, or OS registrations appear to cache curry/base compatibility state | None |
| Secrets/env vars | None found for this feature. No env-var-driven compatibility behavior or secret-backed category config appears in repo | None |
| Build artifacts | Existing installed browser DB versions are the only upgrade-sensitive artifact. No compiled package name or OS-installed artifact needs renaming/re-registration | **Data migration:** browser clients must open the new Dexie version to upgrade persisted data. No separate artifact migration needed |

## Common Pitfalls

### Pitfall 1: Collapsing Legacy `undefined` Into Explicit `[]`
**What goes wrong:** All pre-v1.3 curries appear intentionally incompatible with every base after upgrade.
**Why it happens:** `compatible_base_category_ids` is missing today on curries, but Phase 17 defines an empty array as an explicit "none" state.
**How to avoid:** In the migration, only treat `undefined` as "needs backfill." Preserve actual arrays, including `[]`, once the field exists.
**Warning signs:** Existing user libraries suddenly show every curry with the zero-compatible warning immediately after upgrade.

### Pitfall 2: Seed-Only Curated Data Leaves User Curries Broken
**What goes wrong:** Default curries look correct, but any user-added or renamed seeded curry remains uneditable or semantically incomplete.
**Why it happens:** Seed files cover fresh installs only; live IndexedDB rows need a separate backfill path.
**How to avoid:** Reuse one resolver for seeds and migration, then fall back unmatched curries to all current base IDs.
**Warning signs:** Fresh install passes, but upgrade fixture tests fail or existing libraries require manual recreation.

### Pitfall 3: Matching Curated Mappings Too Aggressively
**What goes wrong:** A user-created curry gets a wrong curated mapping because its name happens to resemble a seeded curry.
**Why it happens:** Overly loose matching logic during migration.
**How to avoid:** Match curated mappings only on exact seeded/default identifiers you control; everything else gets the safe all-bases fallback.
**Warning signs:** Non-seeded curries receive surprisingly narrow compatibility after upgrade.

### Pitfall 4: Delete Normalization Removes Extras but Not Curries
**What goes wrong:** Deleted base categories still linger inside curry compatibility arrays, creating orphaned IDs and misleading row summaries.
**Why it happens:** `normalizeComponentCategoryRefs()` currently strips `compatible_base_category_ids` generically, but curry-specific tests do not exist yet.
**How to avoid:** Treat curries as first-class coverage for the existing normalization helper and add delete tests for curry records.
**Warning signs:** Collapsed curry rows show "Deleted base category" after a base delete when the ID should have been removed entirely.

### Pitfall 5: Zero-Compatible Curries Look Like a Bug
**What goes wrong:** Users think compatibility failed to load rather than understanding the curry is intentionally excluded from auto-pick.
**Why it happens:** Empty arrays are valid but silent.
**How to avoid:** Render an explicit badge/warning in both edit and collapsed states.
**Warning signs:** Supportive copy is missing, or empty-compatible curries are visually indistinguishable from legacy loading states.

## Code Examples

Verified patterns from official sources and local code:

### Dexie One-Time Upgrade for Legacy Curry Rows
```typescript
// Source: https://dexie.org/docs/Version/Version.upgrade%28%29
db.version(12).stores(schema).upgrade((tx) => {
  return tx.table('components').where('componentType').equals('curry').modify((component) => {
    if (component.compatible_base_category_ids === undefined) {
      component.compatible_base_category_ids = computeBackfill(component);
    }
  });
});
```

### Live Category-Label Resolution in React
```typescript
// Source: https://dexie.org/docs/dexie-react-hooks/useLiveQuery%28%29
const baseCategories = useLiveQuery(() => getCategoriesByKind('base'), [], undefined);
const baseCategoriesById = useMemo(
  () => buildCategoryMap(baseCategories ?? []),
  [baseCategories],
);
```

### Delete Normalization Contract
```typescript
// Source: local pattern from src/db/client.ts
if (Array.isArray(nextComponent.compatible_base_category_ids)) {
  nextComponent.compatible_base_category_ids =
    nextComponent.compatible_base_category_ids.filter((id) => id !== category.id);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Curries have no persisted base-compatibility field and rely on broad generator selection | Curries should persist `compatible_base_category_ids` exactly like extras persist base compatibility IDs | Phase 17 | Compatibility becomes explicit, editable, and safe across category lifecycle events |
| Category logic used hard-coded label unions | Base and extra categories already moved to stable numeric IDs via Phase 14 and Phase 16 | 2026-03-28 to 2026-03-29 | Curry compatibility should join the same ID-based model instead of adding a new label-based exception |
| Missing curry compatibility data is effectively implicit | Missing data must be converted into explicit stored arrays during migration | Phase 17 | Upgrade behavior becomes deterministic and testable |

**Deprecated/outdated:**
- Using `base_type` labels as the durable compatibility contract: outdated for post-Phase-14 data.
- Treating seed bootstrap as sufficient migration coverage: outdated for persisted user libraries.

## Open Questions

1. **What exact identifier should the curated mapping use for seeded curries?**
   - What we know: The current seed source exposes curry names and optional `curry_category`, but names are the only stable surfaced value in `SEED_COMPONENTS`.
   - What's unclear: Whether the team wants an internal slug constant for seeds to avoid future display-name edits.
   - Recommendation: Plan a small Wave 0 choice. If no slug exists yet, use exact seeded names in one map and document that unmatched names intentionally fall back to all bases.

2. **Should the zero-compatible warning appear only on collapsed rows, or also inside the expanded form?**
   - What we know: D-06 requires a clear warning/badge, and D-08 requires collapsed summaries.
   - What's unclear: Whether the planner wants both inline and summary visibility.
   - Recommendation: Put it in both places. This is low implementation cost and reduces accidental confusion.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | App tooling, tests, local scripts | ✓ | `v25.8.1` | — |
| npm | Package scripts and registry verification | ✓ | `11.11.0` | — |
| Vitest CLI | Validation commands | ✓ | `4.1.0` installed locally | `npm test` script |

**Missing dependencies with no fallback:**
- None

**Missing dependencies with fallback:**
- None

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `vitest` `4.1.0` locally installed, with `@testing-library/react` and `fake-indexeddb` |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run src/db/migrations.test.ts src/components/library/ComponentForm.test.tsx src/services/food-db.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CURRY-01 | Curry create/edit supports selecting one or more compatible base categories and shows summaries/warnings | component | `npx vitest run src/components/library/ComponentForm.test.tsx src/components/library/ComponentRow.test.tsx` | `ComponentForm`: ✅, `ComponentRow`: ❌ Wave 0 |
| CURRY-02 | Legacy curry rows upgrade to editable compatibility data using curated mappings or all-base fallback | db migration | `npx vitest run src/db/migrations.test.ts src/db/seed.test.ts` | ✅ |
| CURRY-07 | Curry compatibility remains ID-based across rename/delete normalization | service + component | `npx vitest run src/services/food-db.test.ts src/components/library/ComponentForm.test.tsx` | ✅ |

### Sampling Rate
- **Per task commit:** `npx vitest run src/db/migrations.test.ts src/components/library/ComponentForm.test.tsx src/services/food-db.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/db/migrations.test.ts` — add curry-specific upgrade cases for curated mappings, unmatched all-base fallback, and preservation of explicit `[]`
- [ ] `src/components/library/ComponentForm.test.tsx` — add curry create/edit checklist coverage plus zero-compatible warning assertions
- [ ] `src/services/food-db.test.ts` — add delete-normalization coverage for curry compatibility arrays, not just extras
- [ ] `src/components/library/ComponentRow.test.tsx` — new file for collapsed curry summary labels and zero-compatible badge state

## Sources

### Primary (HIGH confidence)
- Local codebase: `src/types/component.ts`, `src/db/client.ts`, `src/services/category-db.ts`, `src/components/library/ComponentForm.tsx`, `src/components/library/ComponentRow.tsx`, `src/db/seed-data.ts`
- Dexie `Version.upgrade()` docs: https://dexie.org/docs/Version/Version.upgrade%28%29
- Dexie `Version.stores()` docs: https://dexie.org/docs/Version/Version.stores%28%29
- Dexie `useLiveQuery()` docs: https://dexie.org/docs/dexie-react-hooks/useLiveQuery%28%29
- Next.js Vitest guide: https://nextjs.org/docs/app/guides/testing/vitest

### Secondary (MEDIUM confidence)
- `npm view` registry verification run locally on 2026-03-29 for `dexie`, `dexie-react-hooks`, `vitest`, and `next`

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Based on the repo's installed dependencies plus current registry verification
- Architecture: HIGH - Directly aligned with existing extra/category patterns and Dexie migration seams already in code
- Pitfalls: HIGH - Derived from the current legacy-vs-explicit data shape, delete normalization behavior, and existing test coverage gaps

**Research date:** 2026-03-29
**Valid until:** 2026-04-28
