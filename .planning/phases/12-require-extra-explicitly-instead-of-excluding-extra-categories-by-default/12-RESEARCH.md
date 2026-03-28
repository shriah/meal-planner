# Phase 12: Require extra explicitly instead of excluding extra categories by default - Research

**Researched:** 2026-03-28
**Domain:** Meal-template extra semantics, persisted-rule normalization, and generator warning behavior
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
### Rule semantics
- **D-01:** Meal-template extra logic becomes require-or-none. If no required extra is selected, the rule imposes no extra-category constraint.
- **D-02:** The empty state of the require-extra control means "no extras logic." No extra default should be implied.

### UI shape
- **D-03:** Remove the entire "Exclude extra categories" section from create and edit rule UI.
- **D-04:** Keep the require-extra control as the only extra-related UI. It can be left empty to mean no extra logic.

### Existing saved rules
- **D-05:** Existing persisted `exclude_extra_categories` data must be stripped in a migration or normalization path so records are cleaned up, not merely hidden.
- **D-06:** Edit/save flows must not preserve or round-trip legacy exclude-extra behavior after the phase ships.

### Generator behavior and warnings
- **D-07:** The generator should emit no extra-related warnings unless a rule explicitly requires an extra category and that requirement cannot be satisfied.
- **D-08:** When no required extra is configured, extras remain otherwise unconstrained by meal-template rules.

### Rule list and user-visible copy
- **D-09:** Rule descriptions should only mention explicitly required extras. Exclusion language should disappear from user-visible copy.

### the agent's Discretion
- Exact presentation of the require-extra control can follow existing rule form patterns as long as the empty state clearly means "no extras logic."
- The migration helper name, exact Dexie version bump, and test naming can follow current project conventions.

### Deferred Ideas (OUT OF SCOPE)
### Reviewed Todos (not folded)
- `Meal Template rule type — unify slot settings and composition constraints` — reviewed as historical background only; Phase 12 stays focused on removing exclude-extra behavior from the active rule surface rather than broadening meal-template scope again.
</user_constraints>

## Project Constraints (from CLAUDE.md)

- Follow the `AGENTS.md` rule: this project is on a breaking-change-heavy Next.js version.
- Read relevant local Next.js docs under `node_modules/next/dist/docs/` before writing code.
- Prefer local Next.js docs and deprecation notices over framework assumptions from training data.

## Summary

Phase 12 is a persisted-semantics change, not a visual cleanup. Today `exclude_extra` is present in the rule form state, compiler/decompiler round-trip, rule descriptions, compiled-rule migration from legacy `meal-template` records, generator second-pass logic, and tests. Hiding the UI alone would leave old IndexedDB rules active, keep stale descriptions visible, and continue emitting extra-relaxation warnings that the locked context explicitly rejects.

The safe implementation is: add one new Dexie upgrade that strips legacy `exclude_extra` effects from already-compiled `rule` records, stop `migrateToCompiledRule()` from producing `exclude_extra` when it sees old `meal-template.exclude_extra_categories`, remove `exclude_extra_categories` from the active form/compiler/description surface, and simplify generator extras logic to `require_extra or none`. That makes empty require state mean exactly "no extras logic," cleans existing data instead of hiding it, and aligns warnings with the new product model.

**Primary recommendation:** Implement Phase 12 as a migration-first require-or-none normalization: delete `exclude_extra` from all active create/edit/runtime paths, strip it from stored rules, and leave only explicit unsatisfied `require_extra` as an extra-related warning path.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js App Router | installed `16.2.0`; latest `16.2.1` published 2026-03-20 | App shell and client/server boundaries | Existing app already uses Next 16; this phase stays inside current client/service files |
| React | installed `19.2.4`; latest `19.2.4` published 2026-01-26 | Rule form state and edit UX | Current rule create/edit flows are reducer-driven React components |
| Dexie | installed `^4.3.0`; latest `4.4.1` published 2026-03-24 | IndexedDB schema versioning and data cleanup | Existing project already uses versioned upgrades for rule-shape migrations |
| dexie-react-hooks | installed `^4.2.0`; latest `4.4.0` published 2026-03-18 | Reactive rule list refresh | Current rule list and edit views already depend on `useLiveQuery` |
| Vitest | installed `^4.1.0`; latest `4.1.2` published 2026-03-26 | Compiler, migration, generator, and UI verification | Current repo test infrastructure is already Vitest-based |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @testing-library/react | installed `^16.3.2`; latest `16.3.2` published 2026-01-19 | Rule form and edit-sheet interaction tests | Use for asserting the exclude-extra UI is removed and save/edit flows stay correct |
| fake-indexeddb | installed `^6.2.5`; latest `6.2.5` published 2025-11-07 | Dexie migration tests | Use for upgrade-path coverage of stripped legacy rule data |
| happy-dom | installed `^20.8.4`; latest `20.8.9` published 2026-03-26 | Component tests needing DOM rendering | Use for `RuleForm` and `RuleRow` UI assertions where the default node environment is insufficient |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Dexie upgrade that rewrites persisted compiled rules | Runtime-only ignore branch in `generator.ts` | Smaller diff, but stale records, stale edit round-trips, and stale descriptions remain |
| Removing `exclude_extra` from form/compiler/types now | Keeping a hidden legacy field in form state | Hidden fields are easy to accidentally re-save and violate D-06 |
| `require_extra or none` generator model | Preserving exclusion relaxations as a compatibility path | Conflicts with D-07 and keeps warning noise the phase is supposed to remove |

**Installation:**
```bash
npm install
```

No new packages are required.

**Version verification:** Versions and publish dates were verified on 2026-03-28 via local `package.json` and `npm view <package> version time --json`.

## Architecture Patterns

### Recommended Project Structure
```text
src/
├── components/rules/
│   ├── types.ts                     # Active rule form shape
│   ├── form-state.ts                # Empty state, reducer, validation
│   ├── RuleFormFields/RuleFields.tsx
│   ├── RuleForm.test.tsx
│   ├── RuleRow.test.tsx
│   └── ruleDescriptions.ts
├── services/
│   ├── rule-compiler.ts             # compileRule / decompileRule boundary
│   ├── rule-compiler.test.ts
│   ├── generator.ts                 # extra selection and warnings
│   └── generator.test.ts
└── db/
    ├── client.ts                    # Dexie versioned migrations
    └── migrations.test.ts
```

### Pattern 1: Normalize stored rules before simplifying runtime behavior
**What:** Add a new Dexie schema upgrade after the current `db.version(9)` that strips `{ kind: 'exclude_extra' }` from already-compiled `rule` records.

**When to use:** First. Existing users can already have compiled rules in IndexedDB.

**Why:** This repo already treats persisted rule-shape changes as versioned Dexie upgrades. Phase 12 should use that same seam instead of introducing ad hoc startup cleanup.

**Example:**
```ts
// Source: repo migration pattern in src/db/client.ts
export function stripLegacyExcludeExtra(cf: unknown): unknown {
  if (!cf || typeof cf !== 'object' || !('type' in cf)) return cf;
  const rule = cf as { type?: unknown; effects?: unknown };
  if (rule.type !== 'rule' || !Array.isArray(rule.effects)) return cf;

  return {
    ...rule,
    effects: rule.effects.filter(
      effect =>
        !(
          effect &&
          typeof effect === 'object' &&
          'kind' in effect &&
          (effect as { kind?: unknown }).kind === 'exclude_extra'
        ),
    ),
  };
}
```

### Pattern 2: Stop legacy compiled migration from reintroducing the removed effect
**What:** Update `migrateToCompiledRule()` so legacy `meal-template.exclude_extra_categories` is ignored while `require_extra_category` still maps to `require_extra`.

**When to use:** In the same change set as the new Dexie upgrade.

**Why:** Existing old-format `meal-template` records could still flow through the v9 upgrade path. If that helper keeps generating `exclude_extra`, a later cleanup upgrade has to undo work the migration just reintroduced.

### Pattern 3: Make the form model match the product model exactly
**What:** Remove `exclude_extra_categories` from `RuleFormState`, `FormAction`, reducer state, `EMPTY_RULE_FORM_STATE`, presets, validation, and `RuleFields.tsx`.

**When to use:** Immediately after the data shape is normalized.

**Why:** Phase 11 established `compileRule()` and `decompileRule()` as a reversible edit boundary. Once the product model becomes require-or-none, the form state must reflect that directly. Empty `require_extra_categories` must be a true no-op.

### Pattern 4: Keep generator extras logic simple: required first, otherwise unconstrained
**What:** Preserve the existing second-pass extras stage, but remove excluded-category filtering and its relaxation warning. Only explicit unsatisfied `require_extra` emits a warning.

**When to use:** In `src/services/generator.ts`.

**Why:** The generator already has the correct seam for extra handling. This phase should simplify that seam, not redesign meal generation broadly.

### Pattern 5: Rule copy should describe only active semantics
**What:** Remove `exclude_extra` branches from `ruleDescriptions.ts` and leave only `require_extra` language for extras.

**When to use:** With the compiler/decompiler cleanup.

**Why:** User-visible rule descriptions are part of the feature contract. If exclude-extra disappears from behavior but remains in copy, the product still looks inconsistent.

### Anti-Patterns to Avoid
- **UI-only removal:** Hiding the checkboxes without stripping stored rule effects leaves old behavior alive for existing users.
- **Migration-only cleanup without form/compiler cleanup:** Old data disappears, but edit/save can still recreate the obsolete effect.
- **Generator compatibility branch:** Keeping exclude-extra warnings or relaxations "just in case" violates D-07 and keeps noise in plan output.
- **Treating empty require-extra as implicit exclusion:** D-02 is explicit that empty means no extras logic, not a hidden default.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Persisted rule cleanup | Manual scan on app startup or in UI render | Dexie versioned upgrade in `src/db/client.ts` | Existing project pattern already handles stored rule migrations safely |
| Edit compatibility | One-off field stripping in save handlers | Existing `compileRule()` / `decompileRule()` boundary | Centralizes create/edit semantics and prevents round-trip drift |
| Post-migration UI refresh | Custom invalidation layer | Dexie writes plus `useLiveQuery` | Existing rule list already reacts to Dexie-backed changes |
| Extra requirement enforcement | New bespoke meal-template pipeline | Existing second-pass extras selection in `generator.ts` | The current pipeline already separates extras from base/curry/subzi selection |

**Key insight:** Do not preserve a hidden compatibility concept. Normalize stored data once, then remove the obsolete effect everywhere users, tests, and future phases can touch it.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | Browser IndexedDB `FoodPlannerDB.rules.compiled_filter.effects[]` can contain `{ kind: 'exclude_extra' }` in already-compiled rules; older meal-template-shaped records can also still carry `exclude_extra_categories` before v9 migration | **Data migration:** add a new Dexie upgrade that strips compiled `exclude_extra`; **code edit:** stop `migrateToCompiledRule()` from emitting new `exclude_extra` effects |
| Live service config | None — verified by repo inspection; rule semantics are local browser data, not external service config | None |
| OS-registered state | None — verified by repo inspection; no OS registration stores rule effect names | None |
| Secrets/env vars | None — verified by repo inspection; extra semantics are not configured via env or secrets | None |
| Build artifacts | None specific to this phase — no installed artifact or generated file caches extra rule semantics outside IndexedDB and source/tests | None |

## Common Pitfalls

### Pitfall 1: Old rules keep acting excluded after the UI is simplified
**What goes wrong:** Existing users still see plans behave as if extra categories are excluded, even though the new UI only shows required extras.

**Why it happens:** Stored compiled rules in IndexedDB still contain `exclude_extra`.

**How to avoid:** Strip the effect in a Dexie upgrade and verify legacy rows are normalized in tests.

**Warning signs:** Reopening the app with seeded legacy data still changes extras without any required-extra selection.

### Pitfall 2: Edit/save silently preserves removed semantics
**What goes wrong:** An edited meal-template rule still round-trips `exclude_extra` even though the field is no longer visible.

**Why it happens:** `decompileRule()` still hydrates the obsolete field or `compileRule()` still emits it.

**How to avoid:** Remove the field from active types and keep compile/decompile symmetric around the reduced rule shape.

**Warning signs:** Compiler tests still expect `exclude_extra`, or re-saving a legacy rule produces an unchanged compiled effect list.

### Pitfall 3: Empty require-extra is treated as a hidden default
**What goes wrong:** A rule with no required extras still constrains extra categories.

**Why it happens:** Validation or generator logic infers an implicit behavior from an empty array.

**How to avoid:** Treat `require_extra_categories.length === 0` as a pure no-op everywhere.

**Warning signs:** Rules with only slot or skip-component effects still alter extra selection.

### Pitfall 4: Warning output stays noisy after the semantic change
**What goes wrong:** Plans still emit extra-related warnings when no explicit required extra is configured.

**Why it happens:** The old exclude-extra relaxation branch remains in `generator.ts`.

**How to avoid:** Delete the excluded-extra path entirely and retain only the unsatisfied `require_extra` warning.

**Warning signs:** Warning assertions still look for `exclude_extra` or `constraint relaxed` in extra-related test cases.

## Code Examples

Verified patterns from current repo:

### Strip legacy compiled exclude-extra effects
```ts
// Source: apply via new Dexie upgrade in src/db/client.ts
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
    rule.compiled_filter = stripLegacyExcludeExtra(rule.compiled_filter);
  });
});
```

### Keep only explicit required-extra collection in generator
```ts
// Source: current second-pass seam in src/services/generator.ts
const requiredExtraCategories = [
  ...new Set(
    secondPassEffects
      .filter((e): e is RequireExtraEffect => e.kind === 'require_extra')
      .flatMap(e => e.categories),
  ),
];
```

### Empty require-extra means no extras logic
```ts
// Source: current extras fill structure in src/services/generator.ts
for (const category of requiredExtraCategories) {
  const candidates = eligibleExtras.filter(
    e => e.extra_category === category && !selectedExtraIds.includes(e.id!),
  );
  if (candidates.length === 0) {
    warnings.push({
      slot: { day, meal_slot },
      rule_id: null,
      message: `require_extra category '${category}' has no eligible extras on ${day} ${meal_slot} - skipped`,
    });
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Meal-template extras shaped by both exclusion and requirement effects | Extras are shaped only by explicit `require_extra`; empty state means no extras logic | Phase 12 | Removes inverted UI semantics and extra-relaxation noise |
| Compatibility handled by leaving stale rule data in storage | Compatibility handled by schema upgrades that normalize stored rules | Already established by earlier Dexie migrations in this repo | Phase 12 should follow the same migration-first pattern |
| User-visible descriptions mirrored every historical effect | User-visible descriptions should mirror only supported active semantics | Phase 12 | Prevents stale copy from implying removed behavior |

**Deprecated/outdated:**
- `exclude_extra` as an active meal-template effect: remove from form state, compiler/decompiler, rule descriptions, generator behavior, and post-migration stored data.
- Extra-related relaxation warnings without an explicit required extra: conflicts with D-07 and should disappear.

## Open Questions

1. **Should `exclude_extra` stay in the Zod union only long enough to parse legacy records, or be removed immediately from the active type system?**
   - What we know: Runtime behavior and user-facing code should not depend on it after this phase.
   - What's unclear: Whether there are any persisted pre-v9 rows still needing direct parsing in tests or upgrade paths.
   - Recommendation: Keep any legacy awareness only inside migration helpers and tests; remove it from active behavior everywhere else.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified). This is a code-and-data-normalization phase on existing repo infrastructure.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `^4.1.0` installed; latest `4.1.2` verified 2026-03-26 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run src/services/rule-compiler.test.ts src/db/migrations.test.ts src/components/rules/form-state.test.ts src/components/rules/ruleDescriptions.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PH12-01 | Create/edit rule UI removes exclude-extra and leaves require-extra empty state as no-op | component | `npx vitest run src/components/rules/RuleForm.test.tsx src/components/rules/RuleRow.test.tsx` | ✅ |
| PH12-02 | `compileRule()` and `decompileRule()` no longer emit or hydrate `exclude_extra` | unit | `npx vitest run src/services/rule-compiler.test.ts src/components/rules/form-state.test.ts` | ✅ |
| PH12-03 | Legacy stored rules are normalized so compiled rules no longer contain `exclude_extra` | unit | `npx vitest run src/db/migrations.test.ts` | ✅ |
| PH12-04 | Generator emits extra-related warnings only for unsatisfied explicit `require_extra` | integration | `npx vitest run src/services/generator.test.ts -t \"TMPL-04|TMPL-05|require_extra|exclude_extra\"` | ✅ |
| PH12-05 | Rule descriptions mention only required extras, never excluded extras | unit | `npx vitest run src/components/rules/ruleDescriptions.test.ts` | ✅ |

### Sampling Rate
- **Per task commit:** `npx vitest run src/services/rule-compiler.test.ts src/db/migrations.test.ts src/components/rules/form-state.test.ts src/components/rules/ruleDescriptions.test.ts`
- **Per wave merge:** `npx vitest run src/services/generator.test.ts src/components/rules/RuleForm.test.tsx src/components/rules/RuleRow.test.tsx`
- **Phase gate:** `npm test`

### Wave 0 Gaps
- [ ] Update `src/db/migrations.test.ts` to prove legacy meal-template data and already-compiled rules both lose exclude-extra semantics.
- [ ] Update `src/services/rule-compiler.test.ts` and `src/components/rules/form-state.test.ts` to remove obsolete `exclude_extra_categories` expectations.
- [ ] Replace `TMPL-04` generator assertions so they verify removal of exclude-extra behavior, not continued support for it.
- [ ] Add a UI assertion in `src/components/rules/RuleForm.test.tsx` or `src/components/rules/RuleRow.test.tsx` confirming no exclude-extra controls render in create or edit mode.
- [ ] Add or update `src/components/rules/ruleDescriptions.test.ts` so meal-template descriptions mention only required extras.

## Sources

### Primary (HIGH confidence)
- Local repo sources:
  - `src/components/rules/RuleFormFields/RuleFields.tsx`
  - `src/components/rules/types.ts`
  - `src/components/rules/form-state.ts`
  - `src/components/rules/ruleDescriptions.ts`
  - `src/services/rule-compiler.ts`
  - `src/services/generator.ts`
  - `src/db/client.ts`
  - `src/services/rule-compiler.test.ts`
  - `src/services/generator.test.ts`
  - `src/db/migrations.test.ts`
  - `src/components/rules/RuleForm.test.tsx`
  - `src/components/rules/RuleRow.test.tsx`
  - `src/components/rules/ruleDescriptions.test.ts`
- Next.js local docs:
  - `node_modules/next/dist/docs/index.md`
  - `node_modules/next/dist/docs/01-app/index.md`
- Official docs:
  - https://dexie.org/docs/Dexie/Dexie.version()
  - https://dexie.org/docs/dexie-react-hooks/useLiveQuery()
  - https://vitest.dev/config/
  - https://nextjs.org/docs/app
- npm registry metadata verified via `npm view <package> version time --json` on 2026-03-28

### Secondary (MEDIUM confidence)
- `package.json` and `vitest.config.ts` for installed dependency and test configuration state

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Based on installed repo dependencies and registry metadata verified on 2026-03-28.
- Architecture: HIGH - Directly supported by current repo seams: Dexie migrations, compile/decompile boundary, second-pass extras selection, and description rendering.
- Pitfalls: HIGH - Each pitfall is tied to a current code path or test that still references `exclude_extra`.

**Research date:** 2026-03-28
**Valid until:** 2026-04-04
