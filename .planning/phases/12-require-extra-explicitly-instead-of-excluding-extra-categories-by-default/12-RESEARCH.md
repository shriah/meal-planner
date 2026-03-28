# Phase 12: Require extra explicitly instead of excluding extra categories by default - Research

**Researched:** 2026-03-28
**Domain:** Meal-template rule UX, compiled-rule migration, and generator behavior for extras
**Confidence:** HIGH

<user_constraints>
## User Constraints

No `CONTEXT.md` exists for this phase.

Locked scope from roadmap, current code, and user report:
- Remove `exclude_extra_categories` from the meal-template rule UX and default behavior.
- Extra selection should be opt-in via explicit `require_extra`, not achieved by default exclusion.
- Preserve correctness for existing persisted rules when users edit or regenerate plans.
- Prefer the smallest safe change set over a broad rule-system redesign.
</user_constraints>

## Project Constraints (from CLAUDE.md)

- Read the relevant guide in `node_modules/next/dist/docs/` before writing code because this project uses a breaking-change-heavy Next.js version.
- Heed deprecation notices from local Next.js docs instead of relying on older framework knowledge.

## Summary

This phase is not just a checkbox removal. In the current unified rule model, `exclude_extra` is a persisted effect, a form-state field, a rule-description branch, and an active generator constraint applied before `require_extra`. If Phase 12 only hides the UI, old rules in IndexedDB will still either affect generation or continue to display stale behavior, which is how warning-heavy plans and confusing edits persist.

The smallest safe implementation is: remove `exclude_extra` from new/edit save paths, add one Dexie migration that strips legacy `exclude_extra` effects from persisted rules, and update generator/tests so extras are only shaped by compatibility, quantity limits, and explicit `require_extra`. That gives immediate product-correct behavior for existing users, keeps edit round-trips honest, and avoids carrying a hidden legacy field forever.

**Primary recommendation:** Treat Phase 12 as a rule-normalization change: delete `exclude_extra` from the active rule surface, migrate existing `rules.compiled_filter.effects[]` once in Dexie, and keep `require_extra` as the sole meal-template extra constraint.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js App Router | installed `16.2.0`; npm latest `16.2.1` published 2026-03-20 | App shell and client/server boundaries | Existing app already uses Next 16 and phase work stays inside current client/service files |
| React | installed `19.2.4`; npm latest `19.2.4` | Form state and rule editing UI | Current rule form and edit sheet are already reducer-driven React client components |
| Dexie | installed `4.3.0`; npm latest `4.4.1` published 2026-03-24 | IndexedDB schema versioning and rule migration | Existing project already uses versioned `db.version(n).upgrade(...)` migrations |
| dexie-react-hooks | installed `4.2.0`; npm latest `4.4.0` published 2026-03-18 | Reactive rules list updates | Existing rule list already depends on `useLiveQuery`, so migrated rows refresh without extra cache code |
| Vitest | installed `4.1.0`; npm latest `4.1.2` published 2026-03-26 | Unit and integration verification | Current repo already uses Vitest for migration, compiler, generator, and UI tests |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Testing Library | installed `16.3.2` | Rule form / edit UI interaction tests | For asserting removed UI controls and edit-save behavior |
| fake-indexeddb | installed `6.2.5` | IndexedDB-backed migration tests | For Dexie upgrade coverage |
| happy-dom | installed `20.8.4` | Component tests needing DOM rendering | For `RuleForm` / edit-sheet coverage if this phase touches UI tests |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Dexie data migration removing legacy `exclude_extra` effects | Ignore `exclude_extra` only at generator runtime | Smaller diff now, but leaves stale rule descriptions/edit state and hidden legacy data |
| Removing `exclude_extra` from form state and compiler | Keeping a hidden legacy field in form state | Preserves old data invisibly, which is harder to reason about and easier to regress |
| Updating tests to assert explicit `require_extra` behavior only | Leaving TMPL-04 coverage in place | Would lock the old product behavior in the test suite |

**Installation:**
```bash
npm install
```

No new packages are required.

**Version verification:** Versions above were verified on 2026-03-28 using local `package.json` plus `npm view next version`, `npm view react version`, `npm view dexie version`, `npm view dexie-react-hooks version`, and `npm view vitest version`.

## Architecture Patterns

### Recommended Project Structure
```text
src/
├── components/rules/
│   ├── types.ts                     # Rule form state shape
│   ├── form-state.ts                # Empty state, reducer, validation
│   ├── RuleFormFields/RuleFields.tsx
│   └── ruleDescriptions.ts
├── services/
│   ├── rule-compiler.ts             # compileRule / decompileRule
│   └── generator.ts                 # extra selection second pass
└── db/
    ├── client.ts                    # Dexie v10 migration
    └── migrations.test.ts
```

### Pattern 1: Normalize persisted rules, then simplify live code
**What:** Add a new Dexie schema version that removes any `{ kind: 'exclude_extra' }` entries from `rules.compiled_filter.effects`.

**When to use:** First. This phase changes persisted semantics for existing users, so runtime and edit behavior should start from normalized data.

**Why:** The repo already uses pure migration helpers plus `db.version(n).upgrade(...)` for rule-shape transitions. Reusing that pattern keeps Phase 12 aligned with previous rule-engine changes and avoids a hidden compatibility branch.

**Example:**
```ts
// Source: existing Dexie pure-migration pattern in src/db/client.ts
export function stripExcludeExtraEffect(cf: unknown): unknown {
  if (!cf || typeof cf !== 'object' || !('type' in cf)) return cf;
  const rule = cf as { type?: unknown; effects?: unknown };
  if (rule.type !== 'rule' || !Array.isArray(rule.effects)) return cf;

  return {
    ...rule,
    effects: rule.effects.filter(effect =>
      !(effect && typeof effect === 'object' && 'kind' in effect && (effect as { kind?: unknown }).kind === 'exclude_extra'),
    ),
  };
}
```

### Pattern 2: Make `require_extra` the only extra-shaping form effect
**What:** Remove `exclude_extra_categories` from `RuleFormState`, `FormAction`, reducer logic, `isFormValid`, and `RuleFields.tsx`.

**When to use:** After the migration shape is defined.

**Why:** The current form still treats `exclude_extra` as a first-class configurable effect. If Phase 12 wants explicit opt-in extras only, the UI state model must match that product rule instead of silently carrying dead fields.

### Pattern 3: Keep compile/decompile symmetrical around the new rule surface
**What:** `compileRule()` should stop emitting `exclude_extra`, and `decompileRule()` should stop hydrating it as an editable field.

**When to use:** In the same change set as form-state edits.

**Why:** Phase 11 established `compileRule`/`decompileRule` as a reversible pair for edit correctness. Once persisted rules are migrated, Phase 12 should keep that pair exact for the reduced effect set rather than preserving a hidden legacy branch.

### Pattern 4: Extra selection remains two-stage, but only one constraint family survives
**What:** Keep the current generator structure where extras are selected after base/curry/subzi, but drop the `excludedExtraCategories` branch and retain only explicit required categories plus normal random fill.

**When to use:** In `generator.ts` second-pass effects handling.

**Why:** The generator already computes second-pass composition effects specifically for extras. That is the right seam; do not redesign meal generation more broadly.

### Anti-Patterns to Avoid
- **UI-only deletion:** Hiding the checkboxes without migrating persisted rules leaves stale behavior and stale descriptions in place.
- **Runtime-only ignore branch:** Ignoring `exclude_extra` in `generator.ts` but keeping it in compiler/decompiler/types creates a dead field that future edits/tests can accidentally revive.
- **Type removal before migration coverage:** Old IndexedDB rows still exist for current users; deleting all references without a migration path risks silent behavior drift.
- **Keeping obsolete tests green:** TMPL-04 tests currently enforce the old exclusion behavior. If they stay unchanged, the suite will push the implementation back toward the rejected product model.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Legacy rule cleanup | Manual one-off scan in UI or service startup | Dexie versioned upgrade in `src/db/client.ts` | Existing project pattern already handles persisted rule-shape changes safely |
| Edit compatibility | Ad-hoc save-time field stripping | Existing `compileRule` / `decompileRule` boundary | Keeps create/edit semantics centralized |
| Rule list refresh after migration/edit | Custom local cache invalidation | Dexie writes + `useLiveQuery(getRules)` | Existing reactive query model already updates the UI |
| Extra requirement enforcement | New special-case meal-template pipeline | Existing second-pass extra selection in `generator.ts` | Current generator seam already separates extras from base/curry/subzi selection |

**Key insight:** The safe cut is not “add more compatibility.” It is “normalize once, then delete the obsolete concept everywhere that users and tests can touch.”

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | Browser IndexedDB `FoodPlannerDB.rules.compiled_filter.effects[]` may contain legacy `exclude_extra` entries on existing installations | **Data migration:** Dexie v10 upgrade strips `exclude_extra` from persisted rules so existing users immediately match new behavior |
| Live service config | None — verified by repo inspection; rule state is local Dexie data, not an external hosted service | None |
| OS-registered state | None — verified by repo inspection; no OS registrations participate in rule semantics | None |
| Secrets/env vars | None — verified by repo inspection; meal-template extra behavior is not configured via env or secret keys | None |
| Build artifacts | None specific to this phase — no generated artifact stores `exclude_extra` semantics outside source/tests | None |

## Common Pitfalls

### Pitfall 1: Hidden legacy effects keep affecting users
**What goes wrong:** Users stop seeing “exclude extra categories” in the form, but existing rules still remove extras or still describe extra exclusions in the rules list.

**Why it happens:** Persisted `exclude_extra` effects remain in IndexedDB and are still interpreted somewhere in the stack.

**How to avoid:** Strip the effect in a Dexie migration and remove the effect branch from descriptions/compiler/generator in the same phase.

**Warning signs:** Existing rules still render text like “exclude sweet extras” after the phase ships.

### Pitfall 2: Edit/save silently preserves a removed concept
**What goes wrong:** Opening and re-saving an old meal-template rule keeps a hidden exclusion effect even though the user can no longer see or control it.

**Why it happens:** `decompileRule()` hydrates a hidden `exclude_extra_categories` field or `compileRule()` still emits it.

**How to avoid:** Remove the field from `RuleFormState` and keep compile/decompile symmetric around the post-migration rule shape.

**Warning signs:** Round-trip tests still reference `exclude_extra_categories` after Phase 12.

### Pitfall 3: Generator warnings remain noisy for the wrong reason
**What goes wrong:** Plans still show warnings about `exclude_extra ... constraint relaxed`, even though the product change is supposed to stop default extra exclusion behavior.

**Why it happens:** The second-pass extra exclusion branch remains in `generator.ts`.

**How to avoid:** Delete the `excludedExtraCategories` computation and its relaxation warning path once no persisted rule can produce that effect.

**Warning signs:** Test fixtures or warning assertions still search for `exclude_extra`.

### Pitfall 4: Validation still encodes the old product model
**What goes wrong:** The implementation is correct, but tests fail because the suite still expects extra exclusions to work.

**Why it happens:** TMPL-04 generator tests and migration tests still assert `exclude_extra` support.

**How to avoid:** Replace them with migration-removal tests plus stronger `require_extra` behavior coverage.

**Warning signs:** `src/services/generator.test.ts` still has a dedicated `TMPL-04` block after the refactor.

## Code Examples

Verified patterns from current repo and official docs:

### Dexie rule migration pattern
```ts
// Source: existing repo pattern in src/db/client.ts
db.version(10).stores({
  components: '++id, componentType, base_type, extra_category, *dietary_tags, *regional_tags, *occasion_tags',
  meals: '++id, base_id, curry_id, subzi_id',
  meal_extras: '[meal_id+component_id], meal_id, component_id',
  rules: '++id',
  saved_plans: '++id, week_start',
  preferences: 'id',
  active_plan: 'id',
}).upgrade(tx => {
  return tx.table('rules').toCollection().modify(rule => {
    rule.compiled_filter = stripExcludeExtraEffect(rule.compiled_filter);
  });
});
```

### Generator seam to preserve
```ts
// Source: src/services/generator.ts
const requiredExtraCategories = [
  ...new Set(
    secondPassEffects
      .filter((e): e is RequireExtraEffect => e.kind === 'require_extra')
      .flatMap(e => e.categories),
  ),
];
```

### Reactive rule list pattern
```tsx
// Source: Dexie useLiveQuery docs and current RuleList usage
const rules = useLiveQuery(() => getRules(), [], [])
if (!rules) return null
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Meal-template extras shaped by both `exclude_extra` and `require_extra` | Extra behavior should be opt-in via `require_extra` only | Phase 12 | Removes warning-heavy default exclusion behavior and simplifies edit semantics |
| Persisted rule-shape changes left to feature code | Persisted rule-shape changes handled through Dexie pure migrations | Established by DB v5-v9 in this repo | Phase 12 should follow the same migration-first pattern |
| Form state mirrored every persisted effect | Form state should expose only supported product concepts | Phase 11 made compile/decompile reversible; Phase 12 narrows the supported surface | Prevents hidden legacy fields from surviving edits |

**Deprecated/outdated:**
- `exclude_extra` as a supported meal-template effect: outdated for the new product direction and should be removed from active code paths.

## Open Questions

1. **Should Phase 12 fully delete `exclude_extra` from the Zod schema/type system, or keep it only inside the migration boundary?**
   - What we know: Existing persisted rows may still contain it today; post-migration live code should not depend on it.
   - What's unclear: Whether the team wants a zero-runtime-reference cleanup now or a brief transitional helper limited to `src/db/client.ts`.
   - Recommendation: Keep any `exclude_extra` handling only inside the migration helper and remove it everywhere else.

2. **Do we want a user-visible rename in rule descriptions such as “Require extra categories” -> “Require extras”?**
   - What we know: Product intent is clearer now that exclusion is gone.
   - What's unclear: Whether copy cleanup belongs in this phase or a later UI polish pass.
   - Recommendation: If the change is one-line and low-risk, include it; otherwise keep Phase 12 focused on behavior and data normalization.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified). This phase is code/config-only work on existing Next.js, Dexie, and test infrastructure already present in the repo.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `4.1.0` installed; docs current at `4.1.2` |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run src/services/rule-compiler.test.ts src/db/migrations.test.ts src/components/rules/form-state.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PH12-01 | Meal-template create/edit UI no longer exposes `exclude_extra_categories` | component | `npx vitest run src/components/rules/RuleForm.test.tsx src/components/rules/RuleRow.test.tsx` | ✅ |
| PH12-02 | `compileRule` / `decompileRule` no longer round-trip `exclude_extra`, but still round-trip remaining meal-template effects | unit | `npx vitest run src/services/rule-compiler.test.ts` | ✅ |
| PH12-03 | Existing persisted rules with `exclude_extra` are normalized by Dexie migration | unit | `npx vitest run src/db/migrations.test.ts src/db/client.test.ts` | ✅ |
| PH12-04 | Generator ignores legacy extra exclusion behavior and only enforces explicit `require_extra` | integration | `npx vitest run src/services/generator.test.ts -t \"require_extra|TMPL-04|TMPL-05\"` | ✅ |

### Sampling Rate
- **Per task commit:** `npx vitest run src/services/rule-compiler.test.ts src/db/migrations.test.ts src/components/rules/form-state.test.ts`
- **Per wave merge:** `npx vitest run src/services/generator.test.ts src/components/rules/RuleForm.test.tsx src/components/rules/RuleRow.test.tsx`
- **Phase gate:** `npm test`

### Wave 0 Gaps
- [ ] Update `src/db/migrations.test.ts` with a dedicated case proving `exclude_extra` is stripped from legacy compiled rules.
- [ ] Update `src/services/rule-compiler.test.ts` to remove `exclude_extra` round-trip expectations and assert the reduced meal-template shape.
- [ ] Replace or rewrite the `TMPL-04` block in `src/services/generator.test.ts`; current tests encode removed behavior.
- [ ] Add or update a UI test in `src/components/rules/RuleForm.test.tsx` confirming no exclude-extra controls are rendered.

## Sources

### Primary (HIGH confidence)
- Repo source: `src/components/rules/RuleFormFields/RuleFields.tsx`, `src/components/rules/types.ts`, `src/components/rules/form-state.ts`, `src/services/rule-compiler.ts`, `src/services/generator.ts`, `src/db/client.ts`
- Repo tests: `src/services/generator.test.ts`, `src/services/rule-compiler.test.ts`, `src/db/migrations.test.ts`, `src/components/rules/form-state.test.ts`
- Dexie Table.update docs: https://dexie.org/docs/Table/Table.update()
- Dexie `useLiveQuery` docs: https://dexie.org/docs/dexie-react-hooks/useLiveQuery()
- Vitest config reference: https://vitest.dev/config/
- npm registry metadata verified via `npm view` on 2026-03-28

### Secondary (MEDIUM confidence)
- `package.json` and `vitest.config.ts` for installed dependency and test-runner configuration

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Derived from installed repo dependencies and current npm registry metadata checked on 2026-03-28.
- Architecture: HIGH - Based on the repo's existing Dexie migration pattern, unified compiled-rule boundary, and current generator/form seams.
- Pitfalls: HIGH - Directly supported by current code paths that still reference `exclude_extra` across UI, compiler, generator, description, and tests.

**Research date:** 2026-03-28
**Valid until:** 2026-04-04
