# Phase 19: Explicit Override Paths - Research

**Researched:** 2026-03-30
**Domain:** Curry/base compatibility override behavior across generator, picker, store, and rule engine
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Manual picker visibility
- **D-01:** The curry picker should normally split results into compatible and incompatible sections so override choices are visible as exceptions, not normal matches.
- **D-02:** If there are no compatible curries for the current base, do not segregate the list; show one flat list so the picker still feels usable.
- **D-03:** Incompatible picker choices are allowed in this phase, but their visibility should communicate that they are override behavior rather than standard compatibility.

### Manual and locked persistence
- **D-04:** If a user manually selects an incompatible curry, that exact choice must persist until the user changes it.
- **D-05:** Locking and regeneration must preserve the manually chosen incompatible curry exactly; regeneration must not auto-normalize it back to a compatible curry.
- **D-06:** Phase 19 should treat manual and locked incompatible picks as explicit user intent, not as validation errors to “fix.”

### Rule override shape
- **D-07:** Both specific-component `require_one` and tag-based `require_one` rules can act as explicit compatibility overrides when they are intentionally scoped.
- **D-08:** Phase 19 should not add a new dedicated “ignore compatibility” rule control if existing `require_one` forms can express the exception cleanly.
- **D-09:** Tag-based `require_one` must prefer compatible matches first, and only use incompatible matches when no compatible match satisfies the explicit rule.

### Warning and explanation UX
- **D-10:** Explicit overrides should look normal on the board once selected; do not add a badge, warning-style indicator, or extra visual explanation in this phase.
- **D-11:** Existing warning UI remains for automatic omitted-curry behavior from Phase 18, but not for explicit override outcomes.

### Override precedence
- **D-12:** Manual and locked selections win over everything else.
- **D-13:** Explicit override rules win over the default compatibility constraint, but only when no manual/locked selection already owns the slot.
- **D-14:** Default compatibility still applies everywhere else.

### Claude's Discretion
- Exact section titles and copy in the curry picker, as long as compatible vs incompatible choices are clearly distinguishable when both exist.
- Exact internal implementation seam for explicit rule overrides, as long as existing rule forms are reused and override behavior remains scoped and testable.
- Exact handling of empty incompatible sections in the picker, as long as the user only sees meaningful grouping.

### Deferred Ideas (OUT OF SCOPE)
- Special board badges or warning-style override indicators are out of scope for this phase.
- A dedicated “ignore compatibility” rule control is deferred unless research proves existing `require_one` semantics are insufficient.
- Curry-vs-subzi composition modes remain deferred to backlog item `999.1`.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CURRY-05 | Manual picker and locked/manual selections can still use an incompatible curry as an explicit user override | Picker grouping, store persistence, regeneration precedence, and focused picker/store/generator coverage |
| CURRY-06 | Rule behavior can explicitly override curry/base compatibility for scoped exceptions without changing the default compatibility contract | Reuse `require_one`, add compatibility-aware fallback only on explicit rule path, preserve Phase 18 default narrowing elsewhere |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Treat local Next.js behavior as authoritative. Do not rely on stale model knowledge for framework APIs or file conventions.
- Before changing Next-specific code, read the relevant guide under `node_modules/next/dist/docs/`.
- Heed deprecation notices when touching framework-facing code.

## Summary

Phase 19 should not broaden the compatibility contract. The current code already has the right seams: manual swaps in [`src/stores/plan-store.ts`](/Users/harish/workspace/food-planner/src/stores/plan-store.ts), locked-slot precedence and `require_one` handling in [`src/services/generator.ts`](/Users/harish/workspace/food-planner/src/services/generator.ts), and curry picker presentation in [`src/components/plan/MealPickerSheet.tsx`](/Users/harish/workspace/food-planner/src/components/plan/MealPickerSheet.tsx). The plan should extend those seams rather than adding new rule vocabulary or new persisted state.

The core implementation shape is: keep Phase 18's compatibility filter as the default automatic path, keep manual and locked selections authoritative, and make `require_one` the only rule path that may intentionally cross the compatibility boundary. Specific-component `require_one` should be allowed to pick the exact incompatible curry when scoped to a slot. Tag-based `require_one` should remain compatibility-first and only fall back to incompatible matches when no compatible curry satisfies the rule.

Picker UX should communicate override intent without changing board UX. Group compatible and incompatible curries only when both groups exist; if a base has zero compatible curries, show one flat list so the picker remains usable. Once an incompatible curry is selected manually or preserved via lock/regenerate, the board should render it normally with no extra warning banner or badge.

**Primary recommendation:** Plan Phase 19 as three coordinated changes: grouped curry picker UI, persistence/regeneration tests that codify manual intent, and a narrow `require_one` override extension that preserves compatibility-by-default everywhere else.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | installed `16.2.0`; current npm `16.2.1` | App shell and client/server framework | Existing app framework; all UI/store work lands inside current Next app structure |
| React | installed `19.2.4`; current npm `19.2.4` | UI runtime | Existing rendering model for picker and rule UI |
| Dexie | installed `4.3.0`; current npm `4.4.1` | IndexedDB access for components/rules/plans | Existing source of truth for components and rules |
| Zustand | installed `5.0.12`; current npm `5.0.12` | Plan board client state and mutations | Current persistence/regeneration seam already lives here |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vitest | installed `4.1.0`; current npm `4.1.2` | Unit and component regression testing | Focused generator/store/picker tests for Phase 19 behavior |
| Testing Library React | installed `16.3.2`; current npm `16.3.2` | UI interaction testing | Picker grouping and PlanBoard handoff assertions |
| dexie-react-hooks | installed via workspace deps | Live queries in UI | Existing query pattern for picker and rule form category data |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Reusing `require_one` | New `ignore_compatibility` rule effect | Adds new rule vocabulary, migration surface, and UI complexity for a narrow exception path |
| Grouped picker sections | Warning badges on board cells | Violates locked scope decision to keep explicit overrides visually normal on the board |
| Store/generator precedence reuse | New persisted "manual override" flag per slot | Unnecessary state surface; current manual swap and lock semantics already encode user intent |

**Installation:**
```bash
npm install
```

**Version verification:**
- `next`: installed `16.2.0`; latest `16.2.1` published 2026-03-20
- `react`: installed `19.2.4`; latest `19.2.4` published 2026-01-26
- `dexie`: installed `4.3.0`; latest `4.4.1` published 2026-03-24
- `zustand`: installed `5.0.12`; latest `5.0.12` published 2026-03-16
- `vitest`: installed `4.1.0`; latest `4.1.2` published 2026-03-26
- `@testing-library/react`: installed `16.3.2`; latest `16.3.2` published 2026-01-19

## Architecture Patterns

### Recommended Project Structure
```text
src/
├── components/plan/      # Picker grouping and plan-board handoff
├── services/             # Generator compatibility and rule evaluation
├── stores/               # Manual swap + lock/regenerate persistence
└── components/rules/     # Existing rule UI surface reused, not expanded
```

### Pattern 1: Preserve Manual Intent In Existing Store Path
**What:** Keep manual curry swaps as direct slot mutations with no extra override flag.
**When to use:** Manual picker selection and subsequent regeneration/locking flows.
**Example:**
```typescript
// Source: /Users/harish/workspace/food-planner/src/stores/plan-store.ts
if (componentType === 'curry') updatedSlot.curry_id = componentId
```

### Pattern 2: Compatibility First, Explicit Override Second
**What:** Run compatibility narrowing before normal curry selection, but let explicit override paths bypass it in narrowly defined cases.
**When to use:** Automatic curry selection and `require_one` processing.
**Example:**
```typescript
// Source: /Users/harish/workspace/food-planner/src/services/generator.ts
const compatibleCurries = curries.filter(
  c => isOccasionAllowed(c, day) && isCurryCompatibleWithBase(c, selectedBase),
)
```

### Pattern 3: Scoped Rule Overrides On `require_one`
**What:** Extend only the `require_one` path for explicit incompatible curry exceptions.
**When to use:** Slot-scoped or narrowly scoped curry rules that must deliberately break compatibility.
**Example:**
```typescript
// Source: /Users/harish/workspace/food-planner/src/services/generator.ts
picked = applyRequireOne(
  picked,
  validatedRules,
  compatibleCurries,
  day,
  meal_slot,
  warnings,
)
```

### Recommended Override Precedence
1. Manual or locked slot selection
2. Explicit `require_one` override
3. Default compatibility-constrained auto generation

### Recommended `require_one` Semantics
- Specific-component target:
  Use the exact required component even if it is incompatible. This is the clearest explicit override form.
- Tag target:
  Search compatible matching curries first. If one exists, stay within compatibility. Only fall back to incompatible matching curries when the explicit rule would otherwise fail.
- Component-type target `curry`:
  Do not treat this as an override tool. It is too broad to count as intentional incompatibility by itself.

### Anti-Patterns to Avoid
- **New override state flag per slot:** The store already persists manual choices and locks. A new flag duplicates intent and invites drift.
- **Global compatibility relaxation inside generator helpers:** Override behavior must remain scoped to manual/locked and `require_one`, not leak into `filter_pool`, `exclude`, or default selection.
- **Board-level override badges or warning banners:** Out of scope for this phase and contradicts D-10/D-11.
- **Tag-based `require_one` jumping straight to incompatible matches:** This would weaken the compatible-by-default contract more than the context allows.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Explicit rule overrides | New rule type or boolean override flag | Existing `require_one` target/effect vocabulary | The current rule form already supports specific component and tag targeting |
| Manual override persistence | Extra per-slot override metadata | Existing `swapComponent` + lock regeneration path | The current store already preserves chosen IDs exactly |
| Compatibility explanation UX | New status chips/banners for override selections | Picker grouping only | The board should stay visually normal once the override is chosen |
| Compatibility matching | Separate duplicated curry compatibility logic in UI and generator | Reuse `isCurryCompatibleWithBase` semantics and equivalent UI helper | Reduces divergence between picker grouping and generator behavior |

**Key insight:** Phase 19 is not a new feature family. It is a narrow exception layer over the Phase 18 contract. Reuse existing rule/store seams and keep the exception paths visible, scoped, and testable.

## Common Pitfalls

### Pitfall 1: Letting `require_one` Relax Compatibility Everywhere
**What goes wrong:** A generic helper starts pulling incompatible curries for any `require_one` rule.
**Why it happens:** The current helper accepts a `fullLibrary` pool and can already override filter constraints.
**How to avoid:** Split `require_one` behavior by target mode. Only explicit specific-component or fallback tag matches may cross compatibility.
**Warning signs:** Existing Phase 18 test `keeps require_one curry overrides inside the compatibility-scoped curry library` starts failing without a replacement test that is more narrowly scoped.

### Pitfall 2: Treating Manual Incompatible Picks As Invalid Data
**What goes wrong:** Regenerate or base changes silently replace the chosen curry with a compatible one.
**Why it happens:** Planner assumes compatibility is a universal invariant instead of a default invariant.
**How to avoid:** Preserve store semantics: manual swap writes the chosen `curry_id`, and locked regeneration must pass it back through `lockedSlots`.
**Warning signs:** A manual incompatible curry disappears after regeneration or lock toggling.

### Pitfall 3: Diverging Picker Logic From Generator Logic
**What goes wrong:** Picker marks a curry as compatible when generator would reject it, or vice versa.
**Why it happens:** UI reimplements compatibility rules inconsistently, especially around `base_category_id === undefined`.
**How to avoid:** Use the same compatibility contract as Phase 18, especially the legacy rule that bases without category IDs only accept curries with missing compatibility metadata.
**Warning signs:** User can select something from the "compatible" section that later triggers default omitted-curry behavior after unlock/regenerate.

### Pitfall 4: Over-scoping the Rule Override
**What goes wrong:** Broad rules such as unscoped "require a veg curry" start producing many incompatible pairings.
**Why it happens:** The explicit override mechanism is technically correct but not intentionally scoped enough.
**How to avoid:** Treat broad component-type rules as non-override paths and require tests for scoped component/tag overrides.
**Warning signs:** A single global tag rule changes curry compatibility behavior across the entire week unexpectedly.

## Code Examples

Verified patterns from the current codebase:

### Manual Curry Persistence
```typescript
// Source: /Users/harish/workspace/food-planner/src/stores/plan-store.ts
if (componentType === 'curry') updatedSlot.curry_id = componentId
```

### Locked Curry Precedence
```typescript
// Source: /Users/harish/workspace/food-planner/src/services/generator.ts
if (locked?.curry_id !== undefined) {
  const lockedCurry = curries.find(c => c.id === locked.curry_id)
  if (lockedCurry) selectedCurry = lockedCurry
}
```

### Current Compatibility Default
```typescript
// Source: /Users/harish/workspace/food-planner/src/services/generator.ts
if (compatibleCurries.length === 0) {
  warnings.push({
    slot: { day, meal_slot },
    rule_id: null,
    message: `no compatible curry available for base "${selectedBase.name}" on ${day} ${meal_slot} — skipped`,
  })
}
```

### Phase 19 Rule Override Pattern
```typescript
// Recommended shape based on /src/services/generator.ts
if (requireRule.target.mode === 'component') {
  return exactTargetIfFound
}

if (requireRule.target.mode === 'tag') {
  const compatibleMatch = compatibleCurries.find(c => targetMatches(requireRule.target, c))
  if (compatibleMatch) return compatibleMatch

  const explicitFallback = allCurries.filter(c => targetMatches(requireRule.target, c))
  if (explicitFallback.length > 0) return pickExplicitFallback(explicitFallback)
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flat curry picker with no compatibility grouping | Group picker results into compatible and incompatible sections only when both groups exist | Recommended for Phase 19 | Makes override intent visible without changing board UI |
| `require_one` on curries stays inside compatible library only | Scoped `require_one` may cross compatibility only as an explicit override | Phase 18 -> Phase 19 boundary | Preserves compatible-by-default while restoring intentional exceptions |
| Locked incompatible curries already preserved | Keep this behavior unchanged and add matching manual-picker coverage | Already true as of Phase 18 verification | Prevents "helpful correction" regressions |

**Deprecated/outdated:**
- Treating all `require_one` curry rules as compatibility-limited is now incomplete for Phase 19. Only the default path should remain fully compatibility-limited.
- A flat picker list for curries is no longer sufficient because it makes override choices look like normal matches.

## Open Questions

1. **Should unscoped tag-based `require_one` count as "intentional enough" for incompatible fallback?**
   - What we know: Context requires tag-based `require_one` overrides to exist and to prefer compatible matches first.
   - What's unclear: Whether planner should add stronger UI guidance or plan-time guardrails for overly broad tag rules.
   - Recommendation: Keep behavior code-level and test-level only in Phase 19; do not add new rule-form restrictions unless planning reveals a concrete UX failure.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `4.1.0` installed (`4.1.2` current on npm) |
| Config file | [`vitest.config.ts`](/Users/harish/workspace/food-planner/vitest.config.ts) |
| Quick run command | `npx vitest run src/services/generator.test.ts src/components/plan/MealPickerSheet.test.tsx src/stores/plan-store.test.ts src/components/plan/PlanBoard.test.tsx` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CURRY-05 | Manual picker shows explicit override choices distinctly and manual/locked incompatible curry survives regenerate | component + unit | `npx vitest run src/components/plan/MealPickerSheet.test.tsx src/stores/plan-store.test.ts src/services/generator.test.ts` | ✅ |
| CURRY-06 | Scoped `require_one` can force incompatible curry when explicit, while default generator still rejects incompatible pairings otherwise | unit | `npx vitest run src/services/generator.test.ts` | ✅ |

### Sampling Rate
- **Per task commit:** `npx vitest run src/services/generator.test.ts src/components/plan/MealPickerSheet.test.tsx src/stores/plan-store.test.ts src/components/plan/PlanBoard.test.tsx`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] [`src/stores/plan-store.test.ts`](/Users/harish/workspace/food-planner/src/stores/plan-store.test.ts) — add regenerate coverage proving locked/manual incompatible curry stays unchanged
- [ ] [`src/components/plan/MealPickerSheet.test.tsx`](/Users/harish/workspace/food-planner/src/components/plan/MealPickerSheet.test.tsx) — add compatible/incompatible grouping coverage and flat-list fallback when no compatible curries exist
- [ ] [`src/services/generator.test.ts`](/Users/harish/workspace/food-planner/src/services/generator.test.ts) — add explicit `require_one` override cases for specific-component and tag fallback semantics
- [ ] [`src/components/plan/PlanBoard.test.tsx`](/Users/harish/workspace/food-planner/src/components/plan/PlanBoard.test.tsx) — extend picker handoff assertions if picker needs additional props or section metadata

## Sources

### Primary (HIGH confidence)
- [`19-CONTEXT.md`](/Users/harish/workspace/food-planner/.planning/phases/19-explicit-override-paths/19-CONTEXT.md) - locked phase decisions, precedence, scope, and canonical refs
- [`18-CONTEXT.md`](/Users/harish/workspace/food-planner/.planning/phases/18-generator-compatibility-contract/18-CONTEXT.md) - default compatibility boundary deferred from Phase 18
- [`18-VERIFICATION.md`](/Users/harish/workspace/food-planner/.planning/phases/18-generator-compatibility-contract/18-VERIFICATION.md) - verified current locked/manual and compatibility-default behavior
- [`src/services/generator.ts`](/Users/harish/workspace/food-planner/src/services/generator.ts) - current compatibility filter, lock precedence, and `require_one` helper
- [`src/stores/plan-store.ts`](/Users/harish/workspace/food-planner/src/stores/plan-store.ts) - manual swap persistence and regenerate lock encoding
- [`src/components/plan/MealPickerSheet.tsx`](/Users/harish/workspace/food-planner/src/components/plan/MealPickerSheet.tsx) - current flat picker implementation
- [`src/components/rules/RuleFormFields/RuleFields.tsx`](/Users/harish/workspace/food-planner/src/components/rules/RuleFormFields/RuleFields.tsx) - existing `require_one` UI surface and target modes
- [`vitest.config.ts`](/Users/harish/workspace/food-planner/vitest.config.ts) - current test framework configuration

### Secondary (MEDIUM confidence)
- `npm ls next react dexie zustand vitest @testing-library/react --depth=0` - installed workspace versions
- `npm view next/react/dexie/zustand/vitest/@testing-library/react version` - current registry versions
- `npm view <package> time --json` - verified publish dates for current registry versions

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - verified against installed workspace versions and current npm registry versions on 2026-03-30
- Architecture: HIGH - driven by current project code seams plus locked Phase 19 decisions
- Pitfalls: HIGH - based on verified existing tests, current helper behavior, and explicit phase boundary from Phase 18/19 context

**Research date:** 2026-03-30
**Valid until:** 2026-04-29
