# Phase 1001: add-base-linked-meal-combo-rules-for-exact-companion-dishes - Research

**Researched:** 2026-04-04
**Domain:** Exact companion meal-combo rules on top of the existing Dexie-backed rule engine
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
### Rule model
- **D-01:** This should be a new dedicated rule type, not an overload of existing scheduling-rule or meal-template rule semantics.
- **D-02:** The new combo rule should target exact companion dishes, not just generic pool constraints or category requirements.

### Targeting scope
- **D-03:** Combo rules may target either a specific base component or a base category.
- **D-04:** The target flexibility should still preserve the exact-companion nature of the rule; this phase is not introducing broad composition defaults.
- **D-05:** When both a base-component combo and a base-category combo match the same slot, the base-component combo wins.

### Companion specificity
- **D-06:** Companion curry/subzi/extras are explicitly named components, not tags or categories.
- **D-07:** Extras in combo rules should be stored as an exact extra component list.
- **D-08:** Combo rules may specify any subset of companion slots: curry only, subzi only, extras only, or mixed exact bundles.
- **D-09:** When a combo rule applies, its explicitly named companion components are authoritative for that slot.

### Interaction with other rules
- **D-10:** Other rules should not further filter, replace, or reshape combo-selected companions once the combo rule is the active source of those companions.
- **D-11:** Combo rules should behave like a stronger explicit composition choice than normal scheduling or meal-template rule effects.

### Manual override boundary
- **D-12:** Explicit manual user choices still win over combo rules.
- **D-13:** Combo rules should not overwrite user-picked curry/subzi/extras on regenerate if the user has manually chosen something else.
- **D-14:** Combo rules govern normal generation behavior, not explicit user overrides.

### Broken reference behavior
- **D-15:** If a combo rule references a missing or deleted companion component, generation should apply the remaining valid companions and emit a warning.

### Claude's Discretion
- Exact persistence shape of the new combo rule, as long as it is clearly a separate rule type and supports base-component plus base-category targets.
- Exact UX copy and layout for combo-rule creation/editing, as long as it communicates exact companion dishes rather than generic constraints.
- Exact warning copy for partially broken combo rules, as long as the rule does not silently substitute other components or allow unrelated rules to rewrite the combo.

### Deferred Ideas (OUT OF SCOPE)
- General composition modes such as `curry-only`, `subzi-only`, `both`, and `one-of` remain Phase `999.1`.
- Authentication and sharing work remain in Phases `1002` and `1003`.
- Any broader “meal bundles” beyond base-linked exact companion dishes should be treated as future scope unless they fall directly out of this rule type.
</user_constraints>

## Project Constraints (from CLAUDE.md)

- Read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code because this project uses a breaking-change-heavy Next.js 16.
- Heed deprecation notices in the local Next.js docs.

## Summary

This phase should add a second persisted rule family, not new effects on the existing `type: 'rule'` union. The current rule form, compiler, description rendering, and generator all assume that `CompiledRule` is a generic target-plus-effects structure. Trying to encode exact companion bundles as more `effects` would fight that shape, complicate edit hydration, and make precedence rules much harder to reason about.

The clean seam is: keep existing scheduling/template behavior unchanged, introduce a dedicated combo-rule schema with base-only targeting (`component` constrained to bases, or `base_category`), and resolve one active combo immediately after base selection. Once a combo is active, explicitly specified companion slots are assigned from exact component IDs and become protected from downstream rule rewrites. Unspecified companion slots continue through the normal generator path.

Manual intent remains above combo intent. Locked/manual curry, subzi, and extras already persist through the existing `plan-store` regenerate flow, so the planner should preserve that seam and make combo application conditional on those slots not already being owned by manual/locked state.

**Primary recommendation:** Add a new `combo_rule` persisted union type with its own form/compiler path, then apply the winning combo after base selection and before normal curry/subzi/extra selection.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | `16.2.0` | App framework and UI runtime | Already shipped stack; no phase need to change framework |
| `react` | `19.2.4` | UI rendering | Matches current app and tests |
| `dexie` | `4.3.0` | IndexedDB schema, migrations, persistence | Existing rules/components/plans all persist through Dexie |
| `zod` | `4.3.6` | Runtime schema validation for persisted rule payloads | Current rule validation boundary in generator |
| `zustand` | `5.0.12` | Plan board/manual override state | Existing regenerate/manual-pick seam already proven |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `dexie-react-hooks` | `4.2.0` | Live form/rule/category reads | Rule form/category-driven combo UI |
| `vitest` | `4.1.0` | Unit/component regression tests | Compiler, generator, store, picker, rule UI coverage |
| `@testing-library/react` | `16.3.2` | React interaction tests | Combo rule form and edit flow |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `combo_rule` union member | Overload `CompiledRule.effects` with combo semantics | Reject: violates D-01 and makes precedence/rehydration harder |
| Separate combo persistence table | Store combo rules in the same `rules` table as a second discriminated payload | Use same table: simpler migrations, list UI, enable/disable flow |
| Reuse current `RuleFormState` | Add dedicated combo form state/compiler | Dedicated combo form is clearer because targets and effects are narrower and exact-ID based |

**Installation:**
```bash
# No new packages recommended for this phase.
```

**Version verification:** Verified with `package.json`, installed environment, and `npm view` on 2026-04-04. Current repo pins are stable for this phase. Registry check showed newer versions exist for `next` (`16.2.2`), `dexie` (`4.4.2`), and `vitest` (`4.1.2`), but no upgrade is required to implement Phase 1001.

## Architecture Patterns

### Recommended Project Structure
```text
src/
├── types/plan.ts                              # Add combo-rule discriminated union
├── db/client.ts                              # Dexie schema version bump + combo migration handling
├── services/rule-compiler.ts                 # Keep existing rule compiler, add combo compile/decompile helpers
├── services/generator.ts                     # Resolve/apply winning combo after base selection
├── components/rules/types.ts                 # Separate combo form state/actions
├── components/rules/form-state.ts            # Existing generic rule form stays focused on current rule type
├── components/rules/RuleFormFields/          # Add combo-specific fields component
└── components/rules/                         # Rule list, descriptions, edit sheet support both rule families
```

### Pattern 1: Persist One `compiled_filter` Union, Not Multiple Ad Hoc Shapes
**What:** Widen `RuleRecord.compiled_filter` from `CompiledRule` to a new `CompiledFilter` discriminated union.
**When to use:** Immediately, because the generator already validates persisted rules from one payload field.
**Example:**
```typescript
const CompiledComboRuleSchema = z.object({
  type: z.literal('combo_rule'),
  target: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('component'), component_id: z.number() }),
    z.object({ mode: z.literal('base_category'), category_id: z.number() }),
  ]),
  scope: RuleScopeSchema,
  companions: z.object({
    curry_id: z.number().optional(),
    subzi_id: z.number().optional(),
    extra_ids: z.array(z.number()).default([]),
  }),
});

const CompiledFilterSchema = z.discriminatedUnion('type', [
  CompiledRuleSchema,
  CompiledComboRuleSchema,
]);
```

### Pattern 2: Resolve a Single Winning Combo After Base Selection
**What:** After selecting or locking the base, find all scoped combo rules whose target matches that base, choose the most specific match, then assign exact companions.
**When to use:** During slot generation, before curry/subzi/extra pools are built.
**Example:**
```typescript
function resolveComboRule(
  comboRules: ValidatedComboRule[],
  base: ComponentRecord,
  day: DayOfWeek,
  slot: MealSlot,
): ValidatedComboRule | null {
  const matches = comboRules.filter((rule) =>
    scopeMatches(rule.compiled.scope, day, slot) &&
    (
      (rule.compiled.target.mode === 'component' && rule.compiled.target.component_id === base.id) ||
      (rule.compiled.target.mode === 'base_category' && rule.compiled.target.category_id === base.base_category_id)
    ),
  );

  const componentMatch = matches.find((rule) => rule.compiled.target.mode === 'component');
  return componentMatch ?? matches[0] ?? null;
}
```

### Pattern 3: Protect Combo-Owned Slots, Leave Unspecified Slots Alone
**What:** If combo sets `curry_id`, normal curry selection and downstream `require_one`/`filter_pool`/`exclude` should not run for curry in that slot. Same for subzi and extras. If combo omits a slot, existing logic still runs there.
**When to use:** In generator control flow and regenerate handling.
**Example:**
```typescript
const combo = resolveComboRule(comboRules, selectedBase, day, meal_slot);

const comboOwned = {
  curry: combo?.compiled.companions.curry_id !== undefined,
  subzi: combo?.compiled.companions.subzi_id !== undefined,
  extras: (combo?.compiled.companions.extra_ids.length ?? 0) > 0,
};

// Manual/locked selection still wins.
if (!locked?.curry_id && comboOwned.curry) {
  selectedCurry = getExactComboCurry(combo, curries, warnings);
}
```

### Pattern 4: Broken References Degrade Partially With Warnings
**What:** Validate each referenced companion ID against current component records and expected type. Keep valid companions, warn on missing/deleted/wrong-type references, never substitute alternatives.
**When to use:** Both generator runtime and edit hydration.

### Anti-Patterns to Avoid
- **Overloading current `effects`:** Makes exact bundles look like generic filters and breaks D-01/D-02.
- **Applying combo before base is known:** Cannot honor component-over-category precedence without the chosen base.
- **Letting `require_one` or `require_extra` rewrite combo-owned slots:** Violates D-09 and D-10.
- **Normalizing broken combo IDs away during load with no warning:** Violates D-15; broken references must remain visible as warnings or inert edit state.
- **Broadening target modes to tag or component type:** That drifts into Phase 999.1 composition defaults.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Persisted rule validation | Manual `typeof` trees everywhere | `zod` discriminated unions in `src/types/plan.ts` | Existing generator already trusts Zod as the validation gate |
| IndexedDB migration | Ad hoc startup repair pass | Dexie versioned `.stores(...).upgrade(...)` | Project already carries migration history through v13 |
| Manual override tracking | New combo-specific override metadata | Existing locked/manual slot state in `plan-store` | Current regenerate flow already preserves explicit user choices |
| Rule edit hydration | One-off mapping in UI components | Compiler/decompiler helpers in `rule-compiler.ts` | Existing edit flow depends on reversible compiled payload mapping |

**Key insight:** The app already has the right primitives. The hard part is precedence, not infrastructure.

## Common Pitfalls

### Pitfall 1: Treating Combo Rules as Just Another Selection Effect
**What goes wrong:** Combo selection gets mixed with `filter_pool` / `require_one`, and downstream logic rewrites exact companions.
**Why it happens:** The current rule system is target-plus-effects, which invites reusing it for everything.
**How to avoid:** Put combo behavior in a separate discriminated union branch and gate downstream selection by combo ownership.
**Warning signs:** Combo-selected curry disappears after `applyRequireOne`, or extra categories append to exact combo extras.

### Pitfall 2: Losing Manual Intent During Regenerate
**What goes wrong:** A manually selected curry/subzi/extra gets replaced by combo output after regenerate.
**Why it happens:** Generator sees the base combo but ignores per-slot locked/manual ownership.
**How to avoid:** Keep current locked-slot forwarding untouched and apply combo only to unowned slots.
**Warning signs:** `plan-store` tests need new metadata or existing manual-persistence tests regress.

### Pitfall 3: Broken Combo References Fail Closed
**What goes wrong:** One deleted companion causes the whole combo to disappear, or the generator silently substitutes a random match.
**Why it happens:** Runtime validation is done at bundle level instead of per companion slot.
**How to avoid:** Validate each companion independently and emit one warning per broken reference or per combo application.
**Warning signs:** Deleted coconut chutney also removes a valid exact sambar selection.

### Pitfall 4: Specificity Precedence Is Implemented Late
**What goes wrong:** Base-category combos win because the generic rule is applied first and cached.
**Why it happens:** Generator runs first matching rule instead of resolving all matches first.
**How to avoid:** Collect scoped matches, then choose `component` target over `base_category`.
**Warning signs:** `Pongal` still uses a generic rice-based combo when an exact Pongal combo exists.

## Code Examples

Verified patterns from official/project sources:

### Dexie Migration Shape
```typescript
db.version(14).stores({
  // existing stores...
  rules: '++id',
}).upgrade((tx) => {
  return tx.table('rules').toCollection().modify((rule) => {
    // migrate persisted compiled_filter union if needed
  });
});
```
Source: Dexie docs on versioned upgrades and project pattern in `src/db/client.ts`

### Existing Manual Override Contract
```typescript
if (locks[`${planSlot.day}-${planSlot.meal_slot}-curry`] && planSlot.curry_id !== undefined) {
  constraint.curry_id = planSlot.curry_id; hasLock = true
}
```
Source: `src/stores/plan-store.ts`

### Existing Generator Validation Boundary
```typescript
const parsed = CompiledRuleSchema.safeParse(ruleRecord.compiled_filter);
if (parsed.success) {
  validatedRules.push({ compiled: parsed.data, id: ruleRecord.id! });
}
```
Source: `src/services/generator.ts`

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single generic rule payload only | Discriminated unions with Zod + reversible compiler/decompiler | v1.2-v1.3 | New rule families can be added without bespoke persistence pipes |
| Base compatibility as relaxable behavior | Hard automatic constraints with explicit override seams | Phase 18-19 | This phase should follow the same explicit-intent precedence model |
| Extras influenced by base compatibility | Extras are explicit-only and base-agnostic | Phase 1000 | Exact combo extras are now the right way to model base-linked extras |

**Deprecated/outdated:**
- Reusing legacy `scheduling-rule` / `meal-template` semantics for new concepts: no longer fits the current rule architecture.

## Open Questions

1. **Should combo rules share the current create/edit sheet or get a separate flow within Rules UI?**
   - What we know: Existing `RuleFormState` is tightly shaped around generic target/effects.
   - What's unclear: Whether the current Rules UI has a stable top-level “rule kind” switch already worth extending.
   - Recommendation: Plan for a separate combo form component under the same Rules manager/sheet shell, not a heavy reuse of current `RuleFields`.

2. **How should combo-owned extras interact with locked manual extras when the locked list has multiple items?**
   - What we know: `extra_ids` locks already forward the entire exact array back into generator.
   - What's unclear: Whether the UI ever distinguishes “manual extras chosen” from “extras locked after generation.”
   - Recommendation: Treat any locked `extra_ids` as explicit user ownership and skip combo extras for that slot.

3. **Should broken combo references disable the rule in the edit surface or merely warn at runtime?**
   - What we know: D-15 requires partial application with warning, not silent substitution.
   - What's unclear: Desired edit-sheet UX for deleted IDs that can no longer hydrate to valid component options.
   - Recommendation: Keep runtime permissive with warnings; in edit flow, surface missing references as removed/inert selections the user must resave.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build/tests/Next runtime | ✓ | `v25.8.1` | — |
| npm | Package scripts / registry checks | ✓ | `11.11.0` | — |
| Vitest | Validation architecture | ✓ | `4.1.0` via repo | — |

**Missing dependencies with no fallback:**
- None.

**Missing dependencies with fallback:**
- None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `4.1.0` |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- src/services/rule-compiler.test.ts src/components/rules/form-state.test.ts src/components/rules/RuleFormFields/RuleFields.test.tsx src/components/plan/MealPickerSheet.test.tsx src/stores/plan-store.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PH1001-COMPILER | Combo rule compile/decompile, deleted-reference hydration | unit | `npm test -- src/services/rule-compiler.test.ts` | ❌ Wave 0 |
| PH1001-FORM | Combo create/edit UI for base component/category + exact companions | component | `npm test -- src/components/rules/RuleForm.test.tsx src/components/rules/RuleFormFields/RuleFields.test.tsx` | ⚠️ Extend existing |
| PH1001-GENERATOR | Winning combo resolution, partial broken-reference warnings, combo-owned slot protection | unit | `npm test -- src/services/generator.test.ts` | ⚠️ Extend existing |
| PH1001-MANUAL | Manual/locked curry-subzi-extra choices still beat combos on regenerate | unit | `npm test -- src/stores/plan-store.test.ts` | ⚠️ Extend existing |
| PH1001-RULE-LIST | Rule summary/edit rendering for combo rules | component | `npm test -- src/components/rules/ruleDescriptions.test.ts src/components/rules/RuleRow.test.tsx` | ⚠️ Extend existing |

### Sampling Rate
- **Per task commit:** `npm test -- src/services/rule-compiler.test.ts src/components/rules/form-state.test.ts src/components/rules/RuleFormFields/RuleFields.test.tsx src/components/plan/MealPickerSheet.test.tsx src/stores/plan-store.test.ts`
- **Per wave merge:** `npm test -- src/services/generator.test.ts src/components/rules/RuleForm.test.tsx src/components/rules/ruleDescriptions.test.ts src/components/rules/RuleRow.test.tsx src/stores/plan-store.test.ts`
- **Phase gate:** `npm test`

### Wave 0 Gaps
- [ ] `src/services/rule-compiler.test.ts` — add combo compile/decompile and broken-reference cases
- [ ] `src/services/generator.test.ts` — add base-category vs base-component precedence, partial broken-reference warnings, and combo-owned-slot protection
- [ ] `src/components/rules/RuleForm.test.tsx` — add combo create/edit flow coverage
- [ ] `src/components/rules/RuleFormFields/RuleFields.test.tsx` or a new combo-fields test file — cover exact companion pickers and category/component targeting
- [ ] `src/components/rules/ruleDescriptions.test.ts` — cover combo rule summaries
- [ ] `src/stores/plan-store.test.ts` — prove locked/manual companion slots survive combo regeneration

## Sources

### Primary (HIGH confidence)
- Project context files:
  - `.planning/phases/1001-add-base-linked-meal-combo-rules-for-exact-companion-dishes/1001-CONTEXT.md`
  - `.planning/STATE.md`
  - `.planning/ROADMAP.md`
  - `.planning/PROJECT.md`
- Project implementation seams:
  - `src/types/plan.ts`
  - `src/db/client.ts`
  - `src/services/rule-compiler.ts`
  - `src/services/generator.ts`
  - `src/stores/plan-store.ts`
  - `src/components/rules/types.ts`
  - `src/components/rules/form-state.ts`
  - `src/components/rules/RuleFormFields/RuleFields.tsx`
  - `src/components/rules/ruleDescriptions.ts`
  - `src/components/plan/MealPickerSheet.tsx`
- Tests and config:
  - `vitest.config.ts`
  - `src/services/rule-compiler.test.ts`
  - `src/services/generator.test.ts`
  - `src/components/rules/RuleForm.test.tsx`
  - `src/components/rules/RuleFormFields/RuleFields.test.tsx`
  - `src/components/plan/MealPickerSheet.test.tsx`
  - `src/stores/plan-store.test.ts`
- Official docs:
  - Dexie docs: https://dexie.org/docs/Tutorial/Design#database-versioning
  - Zod API: https://zod.dev/api?id=discriminated-unions
  - Local Next.js docs index: `node_modules/next/dist/docs/index.md`

### Secondary (MEDIUM confidence)
- npm registry version checks on 2026-04-04 via `npm view next|react|dexie|zod|zustand|vitest`

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all recommendations reuse the shipped project stack and were verified from local files plus npm registry checks.
- Architecture: HIGH - recommendations line up with current compiler/generator/store seams and the phase’s locked decisions.
- Pitfalls: HIGH - derived from validated v1.3/v1.4 rule precedence decisions and current generator control flow.

**Research date:** 2026-04-04
**Valid until:** 2026-05-04
