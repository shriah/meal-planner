# Architecture Patterns

**Domain:** Curry base compatibility in an existing Indian meal planner
**Researched:** 2026-03-29
**Confidence:** HIGH

## Recommended Architecture

Curry compatibility should be modeled exactly where extra compatibility already lives: on the component record, keyed by stable base category IDs. Do not create a separate join table, separate override table, or generator-only lookup. The existing architecture already has the right seams:

- `ComponentRecord` carries compatibility data.
- Category IDs are stable and already survive rename/delete safely.
- The generator selects base first, then chooses other components.
- Rules compile to structured effects and already contain one explicit override path: `require_one`.
- Locked/manual selections already bypass auto-selection pools.

The clean integration is:

1. Add curry compatibility as `compatible_base_category_ids` on curry records.
2. Apply that constraint only when building the automatic curry pool after base selection.
3. Keep override semantics out of the data model.
4. Treat explicit `require_one` rules and manual lock/swap flows as the override boundary.
5. Backfill existing curry records in-app, idempotently, before normal generation runs.

This keeps the system aligned with the current extras architecture and avoids inventing a second rule language just for compatibility.

### Recommended Architecture Diagram

```text
Library Form / Backfill
        |
        v
components[curry].compatible_base_category_ids
        |
        v
Generator
  1. pick base
  2. derive compatible curry pool from base_category_id
  3. apply normal rule filtering inside that pool
  4. allow explicit override only via require_one or locked/manual pick
        |
        v
Plan slot { base_id, curry_id?, ... }
```

## Integration Points

### Model Changes

Use the existing `ComponentRecord.compatible_base_category_ids` field for curries as well as extras/subzis.

**Recommendation:**

- Curry records should persist `compatible_base_category_ids: number[]`.
- Keep `compatible_base_types` only as a temporary legacy mirror if needed for transitional helpers or tests.
- Do not add a curry-specific category system. Base compatibility is about base categories, not curry categories.
- Do not add a rule-owned compatibility map. Compatibility is intrinsic component metadata.

**Why this boundary is correct:**

- Rename safety is already solved by category IDs.
- Delete cleanup already strips deleted base IDs from `compatible_base_category_ids` in `normalizeComponentCategoryRefs`.
- Extras already proved this pattern works in forms, services, and generator code.

**Data model rule:**

- `undefined` means legacy/unbackfilled only during migration work.
- Persisted steady-state should always be an explicit array.
- `[]` means compatible with no bases and should be treated as intentionally unusable until edited.

That avoids a permanent tri-state runtime model.

### Generator Changes

The current generator order is already the correct insertion point:

1. select base
2. derive first-pass composition effects from base
3. select curry
4. select subzi
5. derive extra requirements
6. select extras

Insert curry compatibility between base selection and curry pool rule filtering.

**Recommended curry pool flow:**

```typescript
const compatibleCurries = curries.filter((curry) => {
  if (!isOccasionAllowed(curry, day)) return false;
  if (selectedBase.base_category_id == null) return false;
  return (curry.compatible_base_category_ids ?? []).includes(selectedBase.base_category_id);
});

const noRepeatPool = noRepeatCurry
  ? compatibleCurries.filter((curry) => !usedCurryIds.has(curry.id!))
  : compatibleCurries;

let curryPool = applyFilterPool(noRepeatPool, validatedRules, day, meal_slot, warnings);
curryPool = applyExclude(curryPool, validatedRules, day, meal_slot, warnings);
```

**Behavioral rules:**

- Compatibility is a hard default constraint for automatic curry selection.
- `filter_pool` and `exclude` narrow the compatible pool. They do not lift compatibility.
- If the compatible curry pool is empty, emit a warning and leave `curry_id` unset.
- Do not relax to the full curry pool automatically. That would violate the milestone requirement.

This is important: compatibility should behave more like slot eligibility than like a soft preference.

### Rule Override Behavior

Do not add a new override effect unless milestone scope expands. The current rule model already has the right override primitive: `require_one`.

**Recommended override contract:**

- Automatic selection obeys compatibility.
- `require_one` remains the only rule-level explicit override because it already pulls from the full library via `applyRequireOne`.
- Locked curries also override compatibility because locked slots are applied before pool construction.
- Manual swaps should be treated as explicit user override, not auto-generation.

This produces a clear semantics split:

| Mechanism | Compatible-by-default? | Can override? | Notes |
|-----------|-------------------------|---------------|-------|
| Normal generator curry pick | Yes | No | Uses compatible pool only |
| `filter_pool` rule | Yes | No | Narrows within compatible pool |
| `exclude` rule | Yes | No | Narrows within compatible pool |
| `require_one` rule | No | Yes | Explicit override from full curry library |
| Locked curry | No | Yes | Preserves user intent during regenerate |
| Manual picker swap | No | Yes | Explicit user action |

**Why this is the right model:**

- It matches existing generator semantics. `applyRequireOne` already bypasses the filtered pool.
- It keeps “override” meaning explicit and rare.
- It avoids adding a new effect like `ignore_compatibility`, which would expand compiler, UI, validation, and migration scope for little gain.

### Manual Picker Boundary

The plan board should pass the current slot base category into the curry picker the same way it already does for extras.

**Recommendation:**

- Default curry picker view shows only compatible curries for the selected base.
- Add an explicit `Show incompatible curries` toggle for manual override.
- Keep the resulting swap path unchanged. `swapComponent` already writes whatever component ID the user picked.

This preserves a strong default while still allowing exceptional pairings without rule authoring.

### Migration and Backfill Pipeline

Use a two-part pipeline:

1. Dexie schema/version upgrade for storage shape and indexes.
2. App-level idempotent backfill for existing curry records.

Do not try to encode all backfill logic inside the Dexie upgrade callback. The milestone explicitly says backfill is normal in-app work, and this data needs domain-aware matching.

**Recommended migration shape:**

- Add or confirm `*compatible_base_category_ids` is indexed for curries.
- No new table.
- No rule migration required if override uses existing `require_one`.

**Recommended backfill service boundary:**

- New service: `backfillCurryCompatibility()`
- Called during bootstrap after categories exist and before the app is considered ready.
- Safe to run repeatedly.

**Backfill algorithm:**

1. Load current base categories.
2. Load all curry components.
3. For each curry with missing compatibility:
   - If it matches a curated shipped preset, write the preset category IDs.
   - Otherwise, assign all current base category IDs as a permissive fallback.
4. Never overwrite a curry that already has an explicit compatibility array.

**Why “fallback to all current bases” is the right default for unmatched legacy curries:**

- It preserves pre-v1.3 behavior for unknown user-created curries.
- It avoids silently breaking generation for legacy libraries.
- It keeps runtime simple because every curry ends in an explicit array.

**What not to do:**

- Do not leave unmatched curries with `undefined` forever.
- Do not infer compatibility from fuzzy name parsing at generation time.
- Do not auto-append future newly-created base categories to old curries. That changes user intent implicitly.

### Category Delete / Rename Implications

This feature should reuse existing category normalization behavior.

**Rename:**

- No data rewrite needed.
- Curry compatibility stays valid because IDs remain stable.

**Delete base category:**

- Existing `normalizeComponentCategoryRefs` should strip deleted IDs from curry compatibility arrays.
- Any curry that becomes `[]` after deletion remains valid data but no longer auto-selects for any base.

This is a good outcome. It exposes missing compatibility rather than hiding it.

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `src/types/component.ts` | Add curry compatibility typing | Library form, generator, migration |
| `src/components/library/ComponentForm.tsx` | Edit curry compatibility arrays | Category service, food DB service |
| `src/components/library/ComponentRow.tsx` | Display curry compatibility labels | Category service |
| `src/services/food-db.ts` | Curry query helpers if needed | Dexie |
| `src/services/generator.ts` | Enforce default curry compatibility and warnings | Components, rules |
| `src/db/client.ts` | Schema versioning and data normalization reuse | Dexie |
| Bootstrap path (`src/db/seed.tsx` or adjacent bootstrap service) | Run idempotent curry backfill before ready | Dexie, backfill service |
| `src/components/plan/MealPickerSheet.tsx` | Compatible-by-default curry manual selection, optional override toggle | Plan store, food DB |

## Data Flow

### Automatic Generation

```text
Load components + enabled rules
  -> pick base
  -> read base.base_category_id
  -> filter curries by compatible_base_category_ids
  -> apply no-repeat / filter_pool / exclude
  -> pick curry
  -> apply require_one override from full library if explicitly configured
  -> write curry_id or leave empty with warning
```

### Rule Override Path

```text
Compiled rule with effect require_one
  -> selected curry does not satisfy rule
  -> applyRequireOne searches full curry library
  -> chosen curry may be incompatible with base
  -> slot records explicit override result
```

### Backfill Path

```text
App bootstrap
  -> ensure categories exist
  -> run backfillCurryCompatibility()
  -> write explicit arrays onto legacy curry records
  -> app becomes ready
```

## Patterns to Follow

### Pattern 1: Default Constraint in Generator, Not in Rules

**What:** Curry compatibility is enforced as a generator invariant, not as a generated rule.

**When:** Always, unless user intent is explicit via `require_one`, lock, or manual swap.

**Why:** This keeps the default behavior predictable and avoids hidden auto-created rules that users cannot reason about.

### Pattern 2: Explicit Overrides Only Punch Through One Boundary

**What:** Only `require_one`, locks, and manual swaps can bypass compatibility.

**When:** Exceptional pairing scenarios.

**Why:** If every rule type can implicitly bypass compatibility, the constraint stops being meaningful.

### Pattern 3: Backfill to Stable Runtime State

**What:** Migration may temporarily observe legacy/null data, but steady-state runtime should not.

**When:** During v1.3 rollout only.

**Why:** Generator code stays simple if it only has to reason about explicit arrays.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Making Compatibility a Soft Warning

**What:** Falling back to any curry when no compatible curry exists.

**Why bad:** It defeats the milestone goal and hides broken data quality.

**Instead:** Leave curry empty, warn, and let user fix compatibility or add an explicit override.

### Anti-Pattern 2: Adding a New Rule Effect for v1.3

**What:** Effects like `ignore_curry_compatibility` or `allow_incompatible_curry`.

**Why bad:** It expands rule schema, compiler UI, validation, migration, and test surface unnecessarily.

**Instead:** Reuse `require_one` as the explicit override.

### Anti-Pattern 3: Permanent Tri-State Compatibility

**What:** Treating `undefined`, `[]`, and populated arrays as long-term runtime states.

**Why bad:** It makes generator behavior ambiguous and hard to test.

**Instead:** Backfill to explicit arrays and reserve `undefined` for migration only.

## Scalability Considerations

| Concern | At current scale | At larger library scale | Recommendation |
|---------|------------------|-------------------------|----------------|
| Curry compatibility lookup | In-memory filter is fine | Still fine for local IndexedDB app | Keep generator in-memory |
| Backfill cost | One-time small write set | Still bounded by component count | Keep idempotent and startup-scoped |
| Picker filtering | Simple compatible subset | May need memoized helper later | No new indexing layer yet |
| Override semantics | Easy to reason about | Remains understandable | Keep override mechanisms limited |

## Build Order

1. **Model and schema**
   - Extend curry typing and persistence to use `compatible_base_category_ids`.
   - Add Dexie version bump only if schema/index metadata needs to change.
   - Reuse existing category normalization for delete safety.

2. **Backfill pipeline**
   - Add curated preset map for shipped curries.
   - Add idempotent `backfillCurryCompatibility()` bootstrap step.
   - Verify unmatched legacy curries receive all-current-base fallback.

3. **Generator integration**
   - Insert compatibility filtering into curry pool construction.
   - Preserve `require_one` as explicit override.
   - Warn and leave curry empty when no compatible curry exists.

4. **Library and picker UI**
   - Add curry compatibility editing to the library form.
   - Show compatibility labels in library rows.
   - Filter curry picker by current base, with explicit “show incompatible” manual override.

5. **Regression tests**
   - Cover migration/backfill, generator defaults, override behavior, picker behavior, and category delete cleanup.

This order matters because generator behavior depends on stable migrated data, and UI should sit on top of settled semantics rather than define them.

## Test Boundaries

### Model / Migration Tests

- Curry records persist numeric base category IDs.
- Backfill is idempotent.
- Preset-matched curries get expected category arrays.
- Unmatched legacy curries get all current base category IDs.
- Deleting a base category strips it from curry compatibility arrays.

### Generator Tests

- Auto-generation only selects curries compatible with the chosen base.
- `filter_pool` does not bypass compatibility.
- `exclude` does not bypass compatibility.
- `require_one` by component overrides compatibility intentionally.
- `require_one` by tag overrides compatibility intentionally.
- Locked incompatible curry survives regenerate unchanged.
- Empty compatible curry pool leaves `curry_id` unset and emits warning.

### UI Tests

- Curry form loads and saves compatibility checklist values.
- Curry row renders compatibility labels using category names.
- Plan board passes current base category to curry picker.
- Curry picker defaults to compatible options only.
- Manual override toggle reveals incompatible curries.

## Sources

- `/Users/harish/workspace/food-planner/.planning/PROJECT.md`
- `/Users/harish/workspace/food-planner/src/types/component.ts`
- `/Users/harish/workspace/food-planner/src/types/plan.ts`
- `/Users/harish/workspace/food-planner/src/db/client.ts`
- `/Users/harish/workspace/food-planner/src/services/generator.ts`
- `/Users/harish/workspace/food-planner/src/services/food-db.ts`
- `/Users/harish/workspace/food-planner/src/services/category-db.ts`
- `/Users/harish/workspace/food-planner/src/components/library/ComponentForm.tsx`
- `/Users/harish/workspace/food-planner/src/components/plan/MealPickerSheet.tsx`
- `/Users/harish/workspace/food-planner/src/stores/plan-store.ts`
