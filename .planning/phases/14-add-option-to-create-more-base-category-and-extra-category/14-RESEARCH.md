# Phase 14: Add option to create more base category and extra category - Research

**Researched:** 2026-03-28
**Domain:** Dynamic category modeling in a Dexie-backed Next.js meal-planning app
**Confidence:** MEDIUM-HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
### Category management surface
- **D-01:** Category creation should live in a separate category-management UI, not inline inside the component form.
- **D-02:** The category-management surface must cover both base categories and extra categories in the same phase.

### Category lifecycle
- **D-03:** This phase includes add, rename, and delete for custom categories.
- **D-04:** Renames must cascade everywhere existing references are used.
- **D-05:** Deletes are allowed even when the category is in use; cleanup must be handled by the system rather than blocked in UI.
- **D-06:** Category identity must be a stable ID, not the display name.

### Existing built-ins
- **D-07:** Existing built-in categories should be converted into normal category records rather than treated as permanently locked literals.
- **D-08:** After migration, built-in and user-created categories should behave the same from the product point of view.

### Scope of dynamic behavior
- **D-09:** Dynamic categories must flow through the full system in this phase: library forms, rules, generator, picker filtering where relevant, descriptions, persistence, and migrations.
- **D-10:** Planning should treat this as a data-model migration plus UI/system propagation phase, not as an isolated UI enhancement.

### Compatibility UX
- **D-11:** Extra compatibility should keep the current multi-select checklist interaction, but the list of categories must become dynamic.
- **D-12:** Any existing rule or generator surface that currently enumerates base types or extra categories should switch to dynamic category-backed options rather than preserving hard-coded fallback enums.

### Delete semantics
- **D-13:** Because category identity is ID-based, rename should preserve identity and update visible names everywhere automatically.
- **D-14:** Delete should remove the category record and clear or normalize dependent references instead of leaving orphaned name strings behind.
- **D-15:** The planner/researcher should determine the safest exact normalization rules per reference type, but the product contract is that deletes are allowed and the system resolves fallout automatically.

### the agent's Discretion
- Exact shape of the category-management UI, as long as it is clearly separate from component create/edit.
- Whether category management belongs on the library page itself or in a dedicated settings-like route/modal, provided it remains part of the same delivered phase.
- Exact migration mechanics, Dexie version bump strategy, and whether category records are unified in one table or split by kind.
- Exact normalization policy for deleted references per surface, as long as deleted IDs do not remain dangling and user data remains coherent.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CAT-01 | Add persisted user-managed category records for both base and extra kinds, and migrate existing literals into those records. | Unified `categories` Dexie table, migration strategy, and seed rewrite are specified below. |
| CAT-02 | Component records and forms must reference category IDs instead of hard-coded names. | Component schema rewrite, form/query seams, and label-resolution layer are identified below. |
| CAT-03 | Rule targets and effects that currently store base-type or extra-category names must become category-ID based and render dynamic options. | `TargetSchema`, rule form state, compiler/decompiler, descriptions, and impact preview seams are enumerated below. |
| CAT-04 | Generator and picker behavior must resolve dynamic categories from data, preserving current compatibility semantics and explicit-extra rules. | Generator filtering, picker filtering, and compatibility rules are documented below. |
| CAT-05 | Users must get a separate category-management UI that supports add, rename, and delete for both category kinds. | Recommended UI structure and live-query pattern are documented below. |
| CAT-06 | Rename must cascade automatically through the full product without rewriting stored IDs. | Stable-ID model and centralized label resolver are the primary recommendation below. |
| CAT-07 | Delete must normalize all dependent references so no dangling category IDs remain. | Recommended normalization policy per reference type is documented below. |
| CAT-08 | Seed/default rules and regression tests must move off the old string unions. | Seed rewrite, migration coverage, and validation map are documented below. |
</phase_requirements>

## Summary

Phase 14 is a real data-model migration, not a form tweak. The current code hard-codes category names in the component type model, rule schemas, rule form state, seed rules, generator matching, picker filtering, descriptions, and multiple tests. The safest implementation is to introduce a first-class `categories` table in Dexie, replace name-based references with category IDs everywhere those literals currently persist, and centralize category label lookup so rename becomes a pure display concern.

The most important planning constraint is delete behavior. Base-category delete and extra-category delete cannot be handled the same way as rename. The least risky normalization is: allow deletion, remove the category row, clear direct references to the deleted ID, disable rules whose target becomes invalid, and strip deleted IDs out of multi-value fields. That preserves data coherence without silently broadening rules. For components, nullable category IDs are safer than inventing hidden fallback categories because they avoid fake semantics and keep built-in and user-created categories behaviorally identical.

**Primary recommendation:** Use one Dexie `categories` table with a `kind` discriminator and numeric `++id`, migrate all current literals to category IDs, and normalize deletes transactionally in one shared service instead of scattering ad hoc cleanup across UI handlers.

## Project Constraints (from CLAUDE.md)

- Read the relevant guide in `node_modules/next/dist/docs/` before writing code against this Next.js version.
- Heed deprecation notices in the bundled Next.js docs.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | repo `16.2.0`; latest `16.2.1` published 2026-03-20 | App Router shell and route structure | Already the project runtime; local Next 16 docs confirm App Router defaults and client/server boundaries. |
| `react` / `react-dom` | `19.2.4` published 2026-01-26 | Interactive library and rule/library UI | Already pinned and current in repo. |
| `dexie` | repo `4.3.0`; latest `4.4.1` published 2026-03-24 | IndexedDB schema, migrations, and transactions | Existing DB layer already uses versioned `stores().upgrade()` migrations. |
| `dexie-react-hooks` | repo `4.2.0`; latest `4.4.0` published 2026-03-18 | Live category/component/rule queries in client UI | Existing UI already depends on `useLiveQuery()`; category manager should reuse it. |
| `vitest` | repo `4.1.0`; latest `4.1.2` published 2026-03-26 | Unit and component regression coverage | Current test framework and config already cover DB, services, and client components. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `shadcn` + local UI primitives | repo `4.1.0` plus existing local components | Management UI controls | Use existing `Sheet`, `Tabs`, `Checkbox`, `Select`, `Button`, `Input`, and table/list patterns instead of adding UI dependencies. |
| `lucide-react` | repo `0.577.0` | Iconography for category-management actions | Use only if the new management surface needs add/edit/delete affordances beyond existing buttons. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| One `categories` table with `kind` discriminator (`base` / `extra`) | Separate `base_categories` and `extra_categories` tables | Separate tables add duplicate CRUD, duplicate UI wiring, and duplicate migrations without solving a current problem. |
| Numeric Dexie `++id` category IDs | String UUID category IDs | UUIDs are viable, but numeric IDs align with the repo’s current entity patterns and reduce surface-area churn in tests and schemas. |
| Nullable category references after delete | Hidden fallback category rows | Fallback rows create product-visible semantics the user did not ask for and complicate “built-in and custom behave the same.” |

**Installation:**
```bash
# No new library is required for the phase itself.
# Existing stack already supports the migration and UI work.
npm install
```

**Version verification:** Verified on 2026-03-28 with:
```bash
npm view next version time.16.2.0 time --json
npm view react version time.19.2.4 time --json
npm view dexie version time.4.3.0 time --json
npm view dexie-react-hooks version time.4.2.0 time --json
npm view vitest version time.4.1.0 time --json
```

## Architecture Patterns

### Recommended Project Structure
```text
src/
├── db/
│   ├── client.ts                  # Dexie schema + v11 migration for categories
│   └── seed-data.ts               # Built-in category records + component/category seed mapping
├── types/
│   ├── category.ts                # CategoryRecord, CategoryKind, label helpers
│   ├── component.ts               # component category_id fields replace literal unions
│   └── plan.ts                    # rule target/effect schemas store category IDs
├── services/
│   ├── category-db.ts             # CRUD + delete normalization transaction
│   ├── food-db.ts                 # component/category query helpers
│   └── rule-compiler.ts           # category-ID compile/decompile
├── lib/
│   └── category-labels.ts         # shared label resolution and fallback formatting
└── components/
    ├── library/
    │   ├── CategoryManager.tsx    # separate management UI
    │   └── ComponentForm.tsx      # dynamic category options only
    └── rules/
        └── RuleFormFields/        # dynamic category-backed controls
```

### Pattern 1: Category Records as the Single Source of Truth
**What:** Add a Dexie table like `categories: '++id, kind, name'`, migrate all built-ins into rows, and store only category IDs in components and rules.
**When to use:** Everywhere the current code stores `base_type`, `extra_category`, `compatible_base_types`, or `require_extra` category strings.
**Example:**
```ts
// Source: https://dexie.org/docs/Dexie/Dexie.version%28%29 and current src/db/client.ts pattern
db.version(11).stores({
  categories: '++id, kind, name',
  components: '++id, componentType, base_category_id, extra_category_id, *compatible_base_category_ids, *dietary_tags, *regional_tags, *occasion_tags',
  rules: '++id',
  meals: '++id, base_id, curry_id, subzi_id',
  meal_extras: '[meal_id+component_id], meal_id, component_id',
  saved_plans: '++id, week_start',
  preferences: 'id',
  active_plan: 'id',
}).upgrade(async tx => {
  // 1. Insert category rows for legacy built-ins
  // 2. Build legacy-name -> category-id maps by kind
  // 3. Rewrite component and rule rows to store category IDs
});
```

### Pattern 2: Separate Management UI, Shared Data Layer
**What:** Put category CRUD in a distinct management surface on the library page, but keep all writes in a shared `category-db.ts` service.
**When to use:** Add/rename/delete flows and any surface that needs consistent delete normalization.
**Example:**
```tsx
// Source: https://dexie.org/docs/dexie-react-hooks/useLiveQuery%28%29
const baseCategories = useLiveQuery(
  () => getCategoriesByKind('base'),
  [],
  [],
);

const extraCategories = useLiveQuery(
  () => getCategoriesByKind('extra'),
  [],
  [],
);
```

### Pattern 3: Centralized Label Resolution
**What:** Introduce a shared resolver that maps category IDs to names, and use it in rule descriptions, row badges, impact preview, and management UIs.
**When to use:** Any display path that currently prints hard-coded category names or raw IDs.
**Example:**
```ts
// Source: project pattern inferred from src/components/rules/ruleDescriptions.ts
export function getCategoryLabel(
  categoriesById: Map<number, CategoryRecord>,
  id: number | null | undefined,
  fallback = 'Uncategorized',
): string {
  if (id === null || id === undefined) return fallback;
  return categoriesById.get(id)?.name ?? fallback;
}
```

### Pattern 4: Delete Normalization as a Transactional Service
**What:** Delete a category in one transaction that rewrites components and rules before removing the category row.
**When to use:** Any delete path. Do not let UI call `db.categories.delete(id)` directly.
**Recommended normalization rules:**
- Deleting a base category:
  - Set `components.base_category_id = null` for base components using it.
  - Remove the deleted ID from `components.compatible_base_category_ids` on extras and subzis.
  - Disable rules whose target is that base category.
- Deleting an extra category:
  - Set `components.extra_category_id = null` for extras using it.
  - Remove the deleted ID from every `require_extra.category_ids` effect.
  - Drop empty `require_extra` effects; disable rules left with no effects.
- In both cases:
  - Remove the category row last.
  - Never leave dangling IDs behind.

### Anti-Patterns to Avoid
- **Keeping display names in persisted rules:** Rename cascade will fail immediately.
- **Normalizing deletes in the UI only:** Direct service or migration calls will bypass cleanup.
- **Using hidden fallback categories:** This invents semantics the product did not request and complicates future delete behavior.
- **Leaving union literals in tests/types after migration:** This creates a mixed model where some surfaces are dynamic and others are still compile-time fixed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| IndexedDB migration orchestration | Runtime lazy conversion scattered across reads | Dexie `version().stores().upgrade()` migration chain | Existing project already uses versioned migrations; that is the safe and testable path. |
| Reactive category state | Manual event bus or prop-drilled refresh counters | `useLiveQuery()` over shared Dexie query helpers | Already used in the repo and gives fine-grained updates after CRUD. |
| Rename cascade | Search-and-replace on category names | Stable category IDs + shared label resolver | IDs make rename mostly free; only labels change. |
| Delete cleanup | Per-screen `if deleted then ...` fixes | One transactional normalization service | Keeps invariants coherent across components, rules, and generator logic. |
| Category UI framework | New modal/table package | Existing shadcn/local primitives | The repo already has enough UI primitives for a lightweight manager. |

**Key insight:** The hard part is not rendering one more select; it is preserving referential integrity while rename/delete propagate through IndexedDB state, rule schemas, and generator logic.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Browser IndexedDB `FoodPlannerDB` stores category literals in `components.base_type`, `components.extra_category`, `components.compatible_base_types`, and `rules.compiled_filter` (`target.base_type`, `require_extra.categories`). `saved_plans` and `active_plan` store only component IDs, not category names. | **Data migration + code edit.** Add a Dexie version bump that creates category rows, rewrites component/rule rows to IDs, and updates new writes to use IDs only. |
| Live service config | None verified. This app is repo-local and browser-local; no non-git workflow/UI service config for categories was found. | None. |
| OS-registered state | None verified. No scheduler/unit/pm2/launchd artifacts reference these category literals. | None. |
| Secrets/env vars | None verified for category names. No `.env`-driven category config was found. | None. |
| Build artifacts | No installed artifact stores category names as runtime config. `node_modules` does contain transitive `zod`, but the repo imports it directly without a top-level dependency declaration. | No category migration required. Consider adding top-level `zod` dependency if Phase 14 touches schema/tooling enough to make dependency hygiene relevant. |

## Common Pitfalls

### Pitfall 1: Mixed Literal and ID Models
**What goes wrong:** Components migrate to IDs, but rules, descriptions, or tests still expect old literals.
**Why it happens:** The literals are spread across `component.ts`, `plan.ts`, `rule-compiler.ts`, form state, generator tests, and seed rules.
**How to avoid:** Treat this as one model-cutover. Replace literal unions and literal-backed rule variants in the same wave.
**Warning signs:** `rg` still finds `'rice-based'`, `'bread-based'`, `'other'`, `'liquid'`, `'condiment'`, etc. outside migration fixtures and seed legacy maps.

### Pitfall 2: Delete Broadens Rule Scope by Accident
**What goes wrong:** Removing a category target can turn a previously narrow rule into an overly broad one if the target is replaced with `null` or a fallback label.
**Why it happens:** It is tempting to “keep the rule alive” instead of disabling it.
**How to avoid:** Disable rules whose target category is deleted. For `require_extra`, remove only the deleted IDs from effect arrays.
**Warning signs:** A deleted-category rule still shows as enabled but no longer names a real category.

### Pitfall 3: Rename Cascade Rewrites Stored Data Unnecessarily
**What goes wrong:** Rename touches components and rules even though IDs already provide stable identity.
**Why it happens:** Old string-based habits carry over into the new model.
**How to avoid:** After migration, rename only updates the category row’s `name`.
**Warning signs:** Rename code loops over components/rules instead of only updating `categories`.

### Pitfall 4: Null Categories Are Not Handled End-to-End
**What goes wrong:** After delete normalization, some surfaces crash or show blank labels because they assume every component still has a category.
**Why it happens:** Current code assumes base and extra categories are mandatory literals.
**How to avoid:** Add explicit “Uncategorized” fallbacks in display helpers and conservative runtime handling in generator/picker code.
**Warning signs:** `undefined` labels, broken checklists, or `component.base_type!` style casts survive the migration.

### Pitfall 5: Seed and Default Rules Still Depend on Legacy Names
**What goes wrong:** Clean installs seed category-backed components but still create literal-based default rules.
**Why it happens:** `src/db/seed.tsx` currently seeds default meal-template rules using literal `base_type` strings.
**How to avoid:** Seed categories first, then seed default rules using the inserted category IDs.
**Warning signs:** Fresh DB boots fail schema validation or default rules no longer affect seeded bases.

## Code Examples

Verified patterns from official sources and current project conventions:

### Dexie Upgrade With Data Rewrite
```ts
// Source: https://dexie.org/docs/Dexie/Dexie.version%28%29
db.version(2).stores({
  friends: '++id,name,birthdate,sex',
  pets: '++id,name,kind',
}).upgrade(tx => {
  return tx.table('friends').toCollection().modify(friend => {
    friend.birthdate = new Date(Date.now() - friend.age * YEAR);
    delete friend.age;
  });
});
```

### Live Category Lists in React
```tsx
// Source: https://dexie.org/docs/dexie-react-hooks/useLiveQuery%28%29
const categories = useLiveQuery(
  () => db.categories.where('kind').equals('base').toArray(),
  [],
  [],
);
```

### Project-Style Rule Description Resolution
```ts
// Source: current project pattern in src/components/rules/ruleDescriptions.ts
function describeBaseCategoryTarget(
  categoryId: number,
  categoriesById: Map<number, CategoryRecord>,
): string {
  return getCategoryLabel(categoriesById, categoryId, 'Deleted category');
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hard-coded string unions for categories | Data-backed category records with stable IDs | This phase | Rename becomes cheap and new categories stop requiring code changes. |
| Rule targets/effects storing category names | Rule targets/effects store category IDs | This phase | Rule persistence survives rename and supports delete normalization. |
| Category options declared in components | Dynamic options loaded from Dexie | This phase | Forms, picker filtering, and descriptions all share the same source of truth. |

**Deprecated/outdated:**
- Literal `BaseType` and `ExtraCategory` unions as persisted domain identifiers.
- Seed/default rules that refer to built-in category names directly.
- Tests that assert the full allowed category set as compile-time literals.

## Open Questions

1. **Should `zod` be added as a declared top-level dependency during this phase?**
   - What we know: `src/types/plan.ts` imports `zod`, but `npm ls zod --depth=0` is empty and the package is only present transitively in `package-lock.json`.
   - What's unclear: Whether the repo intentionally relies on transitive hoisting or this is accidental drift.
   - Recommendation: If Phase 14 touches `plan.ts` or schema tooling, add `zod` explicitly in the same wave or as a Wave 0 hygiene task.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `4.1.0` in repo; latest `4.1.2` available |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run src/db/migrations.test.ts src/services/food-db.test.ts src/services/rule-compiler.test.ts src/services/generator.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CAT-01 | Migration creates category rows and rewrites legacy component/rule literals to IDs | unit/db | `npx vitest run src/db/migrations.test.ts -t "category"` | ❌ Wave 0 |
| CAT-02 | Component CRUD uses dynamic category IDs and renders options from data | unit/service + component | `npx vitest run src/services/food-db.test.ts src/components/library/CategoryManager.test.tsx` | ❌ Wave 0 |
| CAT-03 | Rule compile/decompile stores category IDs and hydrates dynamic selections | unit/service | `npx vitest run src/services/rule-compiler.test.ts src/components/rules/form-state.test.ts` | ⚠️ expand existing |
| CAT-04 | Generator and picker resolve compatibility from category IDs | unit/service + component | `npx vitest run src/services/generator.test.ts src/components/plan/MealPickerSheet.test.tsx` | ⚠️ expand existing |
| CAT-05 | Rename updates visible labels everywhere without rewriting stored references | component + integration-ish service | `npx vitest run src/components/rules/ruleDescriptions.test.ts src/components/library/CategoryManager.test.tsx` | ❌ Wave 0 |
| CAT-06 | Delete normalization clears/drops invalid references and disables affected rules | unit/db + service | `npx vitest run src/db/migrations.test.ts src/services/food-db.test.ts src/services/generator.test.ts` | ⚠️ expand existing |
| CAT-08 | Seed/default rules boot with category IDs, not literals | unit/db | `npx vitest run src/db/seed.test.ts` | ⚠️ expand existing |

### Sampling Rate
- **Per task commit:** `npx vitest run src/db/migrations.test.ts src/services/food-db.test.ts src/services/rule-compiler.test.ts src/services/generator.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/components/library/CategoryManager.test.tsx` — add coverage for separate management UI, add/rename/delete, and empty states.
- [ ] `src/db/migrations.test.ts` — add Phase 14 migration fixtures for literal-to-ID rewrite and delete normalization.
- [ ] `src/services/food-db.test.ts` — add category CRUD helpers and transactional delete normalization coverage.
- [ ] `src/services/rule-compiler.test.ts` — replace literal category assertions with category-ID compile/decompile coverage.
- [ ] `src/services/generator.test.ts` — cover category-ID compatibility, deleted/uncategorized components, and required-extra cleanup.
- [ ] `src/db/seed.test.ts` — verify seeded category rows and ID-backed default rules.

## Sources

### Primary (HIGH confidence)
- Local phase context: `.planning/phases/14-add-option-to-create-more-base-category-and-extra-category/14-CONTEXT.md`
- Local repo files:
  - `src/types/component.ts`
  - `src/types/plan.ts`
  - `src/db/client.ts`
  - `src/components/library/ComponentForm.tsx`
  - `src/components/library/ComponentLibrary.tsx`
  - `src/components/library/ComponentRow.tsx`
  - `src/components/rules/RuleFormFields/RuleFields.tsx`
  - `src/components/rules/ruleDescriptions.ts`
  - `src/components/rules/RuleImpactPreview.tsx`
  - `src/services/rule-compiler.ts`
  - `src/services/food-db.ts`
  - `src/services/generator.ts`
  - `src/components/plan/MealPickerSheet.tsx`
  - `src/db/seed.tsx`
  - `src/db/seed-data.ts`
- Dexie docs:
  - https://dexie.org/docs/Dexie/Dexie.version%28%29 - versioned schema and `upgrade()` pattern
  - https://dexie.org/docs/dexie-react-hooks/useLiveQuery%28%29 - reactive query pattern for category manager/forms
- Bundled Next 16 docs:
  - `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
  - `node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md`
- npm registry verification commands run on 2026-03-28 for `next`, `react`, `dexie`, `dexie-react-hooks`, and `vitest`

### Secondary (MEDIUM confidence)
- `.planning/phases/12-require-extra-explicitly-instead-of-excluding-extra-categories-by-default/12-CONTEXT.md`
- `.planning/phases/13-only-include-extras-when-explicitly-required/13-CONTEXT.md`

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Verified against repo pins, npm registry metadata, and official docs.
- Architecture: MEDIUM-HIGH - Strongly grounded in the current codebase plus Dexie/Next official patterns, but delete normalization still includes product-policy inference.
- Pitfalls: HIGH - Derived directly from current repo seams and migration/delete requirements.

**Research date:** 2026-03-28
**Valid until:** 2026-04-27
