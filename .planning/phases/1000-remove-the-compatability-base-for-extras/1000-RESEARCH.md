# Phase 1000: remove the compatability base for Extras - Research

**Researched:** 2026-04-02
**Domain:** Extra model simplification, Dexie migration, generator/picker contract cleanup
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
### Scope of removal
- **D-01:** Remove extra/base compatibility completely from the data model, Library UI, queries, picker filtering, and generator behavior.
- **D-02:** Extra records should stop storing `compatible_base_category_ids` as active application data.
- **D-03:** The phase should remove the extra-specific compatibility editing and summary surfaces from the Library rather than leaving dead UI around a removed runtime behavior.

### Runtime behavior after removal
- **D-04:** Rules become the only mechanism that can cause extras to be auto-added.
- **D-05:** If no matching rule requires an extra, auto-generation should add no extras by default.
- **D-06:** Manual extra picking should show all extras rather than filtering by the current base category.
- **D-07:** This phase should not reintroduce any fallback auto-fill behavior for extras after compatibility removal.

### Existing data migration
- **D-08:** Legacy `compatible_base_category_ids` on extra records should be stripped or ignored during migration/normalization so the old field does not survive as live behavior.
- **D-09:** Upgrade behavior must leave existing extra records otherwise intact; removing base compatibility should not require recreating or manually repairing the library.

### Scope guardrails
- **D-10:** Curry compatibility remains unchanged; this phase applies only to extras.
- **D-11:** Category IDs, rename safety, and delete normalization from Phase 14 remain in force for category-backed data that still exists after this removal.
- **D-12:** Meal composition logic such as curry-vs-subzi defaults remains deferred to backlog item `999.1` and is not part of this phase.

### Claude's Discretion
- Exact cleanup strategy for legacy extra compatibility fields, as long as old base-compatibility data no longer affects runtime behavior.
- Exact Library copy after removing extra compatibility controls, as long as the UI no longer implies extras are scoped to bases.
- Exact service/query refactor shape, as long as manual extra selection becomes unfiltered and auto-generation remains rule-driven only.

### Deferred Ideas (OUT OF SCOPE)
- Curry compatibility behavior remains part of v1.3 and is not reopened here.
- Meal composition modes for curry-vs-subzi defaults and overrides remain backlog work under Phase `999.1`.
- Any new extra recommendation or heuristic system is out of scope; this phase is removal/simplification only.
</user_constraints>

## Project Constraints (from CLAUDE.md)

- Read and follow `AGENTS.md`.
- For Next.js work, do not trust training-data assumptions; read the relevant guide in `node_modules/next/dist/docs/` before writing code.
- Heed deprecation notices in the shipped Next.js docs.

## Summary

This phase is a true contract removal, not a behavior toggle. Extras still carry base-compatibility fields through the type layer, Dexie storage, seed normalization, picker queries, and generator helpers. Those seams must be removed together. If only one layer changes, the app will keep a hidden compatibility model alive through stored rows, filtering helpers, or UI copy.

The current product contract already gives a clean target. Phase 13 established explicit-only extra behavior: unlocked generation adds no extras unless a `require_extra` rule fires. That means this phase should simplify the generator rather than replace one fallback with another. Manual extra picking should become a plain `getComponentsByType('extra')` flow, while rule-driven auto-add remains category-based through `require_extra.category_ids`.

The biggest planning risk is partial cleanup. Extra compatibility is represented twice today: canonical ID fields (`compatible_base_category_ids`) and transitional legacy fields (`compatible_base_types`). Both still influence behavior. The recommended implementation is to remove extra compatibility from types, forms, rows, queries, seeds, and generator selection in one pass, then add a Dexie migration that strips legacy extra compatibility data from persisted extra rows without touching curry compatibility.

**Primary recommendation:** Implement this as a full extra-only schema/runtime simplification: delete extra compatibility fields and queries, migrate stored extra rows to remove them, keep `require_extra` as the sole auto-extra path, and leave curry compatibility unchanged.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | repo `16.2.0`; npm latest `16.2.2` published 2026-04-01 | App/runtime shell | Already pinned in repo; phase touches client components, not framework selection. |
| React | repo `19.2.4`; npm latest `19.2.4` | Client UI state | Existing form/picker code already uses React 19 patterns. |
| Dexie | repo `4.3.0`; npm latest `4.4.2` published 2026-03-31 | IndexedDB schema and migrations | Existing migrations, category normalization, and test setup are already Dexie-based. |
| dexie-react-hooks | repo `4.2.0`; npm latest `4.4.0` published 2026-03-18 | Live query bindings in Library and picker UI | Existing Library rows/forms and picker rely on `useLiveQuery`. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Zod | repo `4.3.6`; npm latest `4.3.6` published 2026-01-22 | Rule schema typing | Keep using it for rule contract validation; no new schema library needed. |
| Vitest | repo `4.1.0`; npm latest `4.1.2` published 2026-03-26 | Regression coverage | Use for migration, service, generator, and component regression tests in this phase. |
| fake-indexeddb | repo dependency | IndexedDB test runtime | Required by Dexie-backed tests and migration coverage. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Dexie migration + in-app normalization | One-off manual data repair | Worse: not repeatable, not testable, and misses existing browsers with persisted rows. |
| Removing only query-time filtering | Keeping stored extra compatibility fields ignored | Worse: dead data survives, UI/tests drift, and later code can accidentally revive the behavior. |
| New rule vocabulary for extras | Existing `require_extra` effect | Unnecessary: the rule model already expresses the post-phase contract. |

**Installation:**
```bash
npm install
```

**Version verification:** Verified with `npm view next version`, `npm view react version`, `npm view dexie version`, `npm view dexie-react-hooks version`, `npm view vitest version`, and `npm view zod version` on 2026-04-02. Current repo pins are slightly behind latest for Next.js, Dexie, dexie-react-hooks, and Vitest, but upgrading them is out of scope for this phase.

## Architecture Patterns

### Recommended Project Structure
```text
src/
├── db/                   # Dexie schema, migration helpers, seed normalization
├── services/             # Query/runtime seams used by generator and UI
├── components/library/   # Library edit/create surfaces and collapsed summaries
├── components/plan/      # Manual picker and plan board flows
└── types/                # Component and rule contracts
```

### Pattern 1: Remove extra compatibility at the type boundary first
**What:** `ExtraRecord` and the extra branch of `ComponentRecord` should stop declaring `compatible_base_category_ids` and `compatible_base_types` as active extra fields.
**When to use:** At the start of implementation, so downstream compile errors reveal every remaining extra-only dependency.
**Example:**
```typescript
// Source: local repo pattern, refine in src/types/component.ts
export interface ExtraRecord extends BaseComponentFields {
  componentType: 'extra';
  extra_category_id?: number | null;
  extra_category: ExtraCategory;
  incompatible_curry_categories?: string[];
}
```

### Pattern 2: Use Dexie versioned migration for persisted extra-row cleanup
**What:** Add a new `db.version(...).upgrade(...)` step that scans `components` and removes legacy compatibility fields only from `componentType === 'extra'`.
**When to use:** For existing browser data, seeded data already imported into IndexedDB, and older libraries created before the phase.
**Example:**
```typescript
// Source: Dexie upgrade pattern + local migration chain
db.version(NEXT_VERSION).stores({
  components: '++id, componentType, base_type, extra_category, *dietary_tags, *regional_tags, *occasion_tags',
  meals: '++id, base_id, curry_id, subzi_id',
  meal_extras: '[meal_id+component_id], meal_id, component_id',
  rules: '++id',
  saved_plans: '++id, week_start',
  preferences: 'id',
  active_plan: 'id',
}).upgrade((tx) => {
  return tx.table('components').toCollection().modify((component) => {
    if (component.componentType !== 'extra') return;
    delete component.compatible_base_category_ids;
    delete component.compatible_base_types;
  });
});
```

### Pattern 3: Manual extras use the flat query path
**What:** Extra picking should use `getComponentsByType('extra')`, then local search/tag filtering only.
**When to use:** `MealPickerSheet` and any future manual extra selection flow.
**Example:**
```typescript
// Source: local repo seam in src/components/plan/MealPickerSheet.tsx
const components = useLiveQuery(
  () => getComponentsByType('extra'),
  [],
  [],
);
```

### Pattern 4: Auto extras remain rule-driven only
**What:** Generator adds extras only when `require_extra` effects match the selected slot; no base-driven fallback fill remains.
**When to use:** In extra-selection logic inside `src/services/generator.ts`.
**Example:**
```typescript
// Source: existing rule contract in src/types/plan.ts
z.object({ kind: z.literal('require_extra'), category_ids: z.array(z.number()) })
```

### Anti-Patterns to Avoid
- **Extra-only ignore patch:** Leaving `compatible_base_category_ids` in `ExtraRecord`, seed data, or tests while only bypassing it in one service.
- **Shared curry/extra cleanup helper:** Curry compatibility is still live. Do not generalize removal logic across both types.
- **Fallback auto-fill:** Do not replace removed compatibility with random extras or category-default extras.
- **Hidden migration via render path:** Do not rely on forms or generators to lazily mutate old rows. Migration belongs in Dexie upgrade or explicit normalization.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Persisted row cleanup | Manual user repair instructions | Dexie `version().upgrade()` migration | Existing browsers already hold extra rows in IndexedDB; cleanup must be automatic and testable. |
| Manual extra filtering | New ad hoc base-aware selector logic | Existing `getComponentsByType('extra')` + `filterComponents` | Manual extras are supposed to be globally pickable after this phase. |
| Auto extra heuristics | New scoring/default-selection layer | Existing `require_extra` rule effect | Product contract is already explicit-only extras. |
| Category cleanup | Extra-specific delete/rename codepath | Existing category normalization seams, scoped to surviving fields only | Phase 14 already centralized category normalization. |

**Key insight:** The codebase already has the right primitives. The work is deleting the obsolete extra-compatibility contract cleanly, not inventing new runtime behavior.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Browser IndexedDB `FoodPlannerDB` stores extra rows in `components` that may still contain `compatible_base_category_ids` and `compatible_base_types`. `saved_plans`, `active_plan`, and `meal_extras` store component IDs only and do not embed extra/base compatibility. | **Data migration + code edit.** Add a Dexie upgrade that strips legacy compatibility fields from persisted extra rows only. Update runtime types/seed data so new writes no longer produce those fields. |
| Live service config | None verified. This app is local/browser-backed; no external admin UI or hosted service config was found in repo evidence. | **None.** |
| OS-registered state | None verified. No scheduler, daemon, or process registration was found that stores extra compatibility metadata. | **None.** |
| Secrets/env vars | None verified for this feature. No env-var or secret name in repo controls extra/base compatibility behavior. | **None.** |
| Build artifacts | None feature-specific. No generated artifact or installed package stores `compatible_base_category_ids` for extras outside IndexedDB. | **None.** |

## Common Pitfalls

### Pitfall 1: Removing the UI but leaving stored/runtime fields alive
**What goes wrong:** Extra compatibility disappears from the form, but hidden filtering survives in services, generator helpers, or persisted data.
**Why it happens:** The current model duplicates the concept across types, seed data, service queries, generator logic, and Dexie rows.
**How to avoid:** Let type removal drive the refactor; then add migration and focused regression tests.
**Warning signs:** `rg "getExtrasByBase|compatible_base_category_ids|compatible_base_types"` still returns extra-only runtime references after implementation.

### Pitfall 2: Accidentally deleting curry compatibility behavior
**What goes wrong:** Shared cleanup removes or weakens curry compatibility warnings, picker grouping, or delete normalization.
**Why it happens:** Curries and extras currently reuse some field names and UI structure.
**How to avoid:** Scope every delete/migration branch with `componentType === 'extra'` unless the change is purely generic.
**Warning signs:** Curry tests start failing around zero-compatible warnings, override grouping, or delete normalization.

### Pitfall 3: Rule-driven extras regress because eligibility still assumes base compatibility
**What goes wrong:** `require_extra` warnings appear even when matching extra categories exist, because extra candidates are still narrowed by base compatibility.
**Why it happens:** The generator currently has an `isExtraCompatibleWithBase()` helper and related test assumptions.
**How to avoid:** Remove base-compatibility gating from extra candidate selection; filter only by category IDs and any surviving explicit rules.
**Warning signs:** Bread/rice-specific extra tests fail after migration, or warning counts increase on slots with valid rule-matched extras.

### Pitfall 4: Migration strips too much or too little
**What goes wrong:** Existing extra rows keep dead fields, or curries lose real compatibility data.
**Why it happens:** Both types use `compatible_base_category_ids`, but only extras should be cleaned.
**How to avoid:** Write migration tests that seed one extra and one curry, run upgrade, and assert only the extra row is stripped.
**Warning signs:** `db.migrations.test.ts` passes only for all-or-nothing field removal, or manual inspection shows extra rows still carry arrays after upgrade.

## Code Examples

Verified patterns from official sources and current repo seams:

### Dexie migration pattern
```typescript
// Source: https://dexie.org/docs/Version/Version.upgrade%28%29.html
db.version(2).stores({
  friends: '++id,name,age'
}).upgrade((tx) => {
  return tx.table('friends').toCollection().modify((friend) => {
    friend.birthdate = new Date();
  });
});
```

### Dexie schema version chaining
```typescript
// Source: https://dexie.org/docs/Version/Version.stores%28%29
db.version(2).stores({
  friends: '++id,name,age,*tags'
});
```

### Existing extra picker seam to simplify
```typescript
// Source: local repo, src/components/plan/MealPickerSheet.tsx
if (componentType === 'extras') {
  return getComponentsByType('extra');
}
```

### Existing extra rule contract to preserve
```typescript
// Source: local repo, src/types/plan.ts
z.object({ kind: z.literal('require_extra'), category_ids: z.array(z.number()) })
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Extras narrowed by `compatible_base_category_ids` / `compatible_base_types` in data, picker, and generator | Extras are explicit, rule-driven add-ons only; manual picker is global and auto-generation adds extras only through `require_extra` | Product contract established by Phase 13 (2026-04-02 context) and completed by this phase | Simplifies mental model and removes hidden base coupling from extras. |
| Transitional legacy mirrors (`compatible_base_types`) kept alongside ID fields | Category IDs remain where still meaningful; extra/base compatibility fields are removed entirely for extras | This phase | Prevents stale mirrors from reviving deleted behavior. |

**Deprecated/outdated:**
- `getExtrasByBaseCategoryId()` / `getExtrasByBaseType()`: outdated for extras after this phase; replace with flat extra queries.
- Extra compatibility checklist/edit summary in Library: outdated UI once extra/base compatibility is removed.
- `isExtraCompatibleWithBase()` in generator: outdated once `require_extra` becomes the sole auto-extra gate.

## Open Questions

1. **Should the migration physically delete legacy fields or just ignore them at runtime?**
   - What we know: D-08 allows either strip or ignore, but hidden data is a known drift risk.
   - What's unclear: Whether there is any mixed-client scenario that still depends on those fields.
   - Recommendation: Physically strip both fields from persisted extra rows during Dexie upgrade and remove them from new writes.

2. **Should defensive normalization for deleted base categories still touch extra rows after the phase?**
   - What we know: After migration, extra rows should no longer carry base-compatibility fields.
   - What's unclear: Whether the codebase wants temporary defensive cleanup for rows created by older builds still in the wild.
   - Recommendation: Keep migration authoritative. Post-migration normalization can remain defensive for one release if cheap, but it should not define active behavior.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `4.1.0` in repo (`4.1.2` latest verified) |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- src/components/library/ComponentForm.test.tsx src/components/plan/MealPickerSheet.test.tsx src/services/food-db.test.ts src/services/generator.test.ts src/db/migrations.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PH1000-01 | Extra forms no longer edit/store base compatibility | component | `npm test -- src/components/library/ComponentForm.test.tsx src/components/library/ComponentRow.test.tsx` | ✅ |
| PH1000-02 | Manual extra picker shows all extras and no longer depends on base category | component | `npm test -- src/components/plan/MealPickerSheet.test.tsx src/components/plan/PlanBoard.test.tsx` | ✅ |
| PH1000-03 | Generator adds no extras unless `require_extra` rules match | service | `npm test -- src/services/generator.test.ts` | ✅ |
| PH1000-04 | Rule-required extras are selected without base-compatibility gating | service | `npm test -- src/services/generator.test.ts` | ✅ |
| PH1000-05 | Existing extra rows are normalized so legacy compatibility fields no longer survive | migration | `npm test -- src/db/migrations.test.ts src/services/food-db.test.ts` | ✅ |
| PH1000-06 | Curry compatibility behavior remains unchanged | service/component | `npm test -- src/services/curry-compatibility-regression.test.ts src/components/plan/MealPickerSheet.test.tsx src/components/library/ComponentForm.test.tsx` | ✅ |

### Sampling Rate
- **Per task commit:** `npm test -- src/components/library/ComponentForm.test.tsx src/components/plan/MealPickerSheet.test.tsx src/services/food-db.test.ts src/services/generator.test.ts src/db/migrations.test.ts`
- **Per wave merge:** `npm test -- src/services/curry-compatibility-regression.test.ts src/components/plan/PlanBoard.test.tsx`
- **Phase gate:** `npm test`

### Wave 0 Gaps
- [ ] `src/db/migrations.test.ts` needs new coverage proving extra rows lose legacy compatibility fields while curry rows keep theirs.
- [ ] `src/services/generator.test.ts` needs old extra-compatibility assertions rewritten to the new contract: no base-based gating, no default extras, `require_extra` only.
- [ ] `src/components/plan/MealPickerSheet.test.tsx` needs the extras path rewritten from `getExtrasByBaseCategoryId()` to flat extra loading.
- [ ] `src/components/library/ComponentForm.test.tsx` and `src/components/library/ComponentRow.test.tsx` need extra-specific compatibility UI assertions removed and replaced with extra-category-only expectations.

## Sources

### Primary (HIGH confidence)
- Phase context: local file `.planning/phases/1000-remove-the-compatability-base-for-extras/1000-CONTEXT.md` - locked decisions, scope, and canonical seams.
- Current implementation: local files `src/types/component.ts`, `src/components/library/ComponentForm.tsx`, `src/components/library/ComponentRow.tsx`, `src/services/food-db.ts`, `src/components/plan/MealPickerSheet.tsx`, `src/services/generator.ts`, `src/db/client.ts`, `src/db/seed-data.ts`.
- Current regression suite: local files `src/services/food-db.test.ts`, `src/services/generator.test.ts`, `src/services/curry-compatibility-regression.test.ts`, `src/components/library/ComponentForm.test.tsx`, `src/components/library/ComponentRow.test.tsx`, `src/components/plan/MealPickerSheet.test.tsx`, `src/db/migrations.test.ts`.
- Dexie official docs: https://dexie.org/docs/Version/Version.upgrade%28%29.html - upgrade migration pattern.
- Dexie official docs: https://dexie.org/docs/Version/Version.stores%28%29 - versioned schema declaration behavior.
- npm registry metadata: https://www.npmjs.com/package/next, https://www.npmjs.com/package/react, https://www.npmjs.com/package/dexie, https://www.npmjs.com/package/dexie-react-hooks, https://www.npmjs.com/package/vitest, https://www.npmjs.com/package/zod - package versions cross-checked with `npm view`.

### Secondary (MEDIUM confidence)
- None needed.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - verified against repo `package.json` and current npm registry metadata on 2026-04-02.
- Architecture: HIGH - derived from current code seams and existing migration/query/test patterns in the repo.
- Pitfalls: HIGH - directly supported by current duplicated extra-compatibility references and regression coverage.

**Research date:** 2026-04-02
**Valid until:** 2026-05-02
