# Phase 20: Compatibility Regression Coverage - Research

**Researched:** 2026-04-01
**Domain:** Vitest regression architecture for the curry compatibility contract
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
### Coverage strategy
- **D-01:** Phase 20 should add one broader cross-flow regression harness as the backbone for `CURRY-08`, rather than only scattering more assertions across unrelated focused tests.
- **D-02:** Focused existing tests may still expand where needed, but they should support the backbone contract instead of being the only proof artifact.
- **D-03:** Planning should treat the backbone regression as the primary milestone-level evidence that migration, generator, picker, and override semantics all agree on the same compatibility rules.

### Rename/delete proof depth
- **D-04:** Phase 20 must prove rename/delete safety at the data/service layer and also through downstream runtime behavior after normalization.
- **D-05:** “Downstream runtime behavior” includes at least generator behavior and picker behavior after category normalization changes have been applied.
- **D-06:** It is not sufficient to prove only stored IDs are normalized; the tests must also prove that runtime selection logic no longer behaves as if deleted or renamed category references still exist.

### Scope guardrails
- **D-07:** Phase 20 should not add new compatibility features, override controls, fallback rules, or subzi/composition behavior.
- **D-08:** This phase is allowed to restructure or consolidate tests if that makes the compatibility contract easier to verify, but it should avoid unnecessary production refactors unless tests reveal a real drift.
- **D-09:** Manual verification is not a locked requirement for this phase; the planning default should favor automated proof unless research discovers a hard UI-only gap.

### Claude's Discretion
- Exact choice of backbone regression location and whether it lives in one existing test file or a small dedicated milestone-level regression file, as long as it becomes the clearest proof for `CURRY-08`.
- Exact split between migration/service tests and runtime tests, as long as rename/delete normalization is verified both before and after runtime consumption.
- Exact validation artifact structure, as long as it clearly traces `CURRY-08` to the milestone-wide regression commands.

### Deferred Ideas (OUT OF SCOPE)
- `2026-03-22-refactor-and-move-slot-setting-to-rules-tab.md` / “Meal Template rule type — unify slot settings and composition constraints” remains out of scope for Phase 20.
- Curry-vs-subzi composition modes remain deferred to backlog item `999.1`.
- Any new compatibility feature or override vocabulary remains out of scope; this phase only proves the current contract.
</user_constraints>

## Project Constraints (from CLAUDE.md)

- Read the relevant Next.js guide in `node_modules/next/dist/docs/` before writing code that touches Next.js conventions or APIs.
- Heed deprecation notices in those docs.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CURRY-08 | Library, generator, picker, migration, and regression tests all use the new curry compatibility model consistently | Add one dedicated milestone regression file as the backbone, keep focused library/service/picker/store tests as supporting proofs, and map validation to one focused Vitest run plus `npm test` |
</phase_requirements>

## Summary

The cleanest `CURRY-08` shape is a test-only phase with one dedicated milestone regression file as the backbone and a small number of focused expansions in existing seam-specific tests. The current code already has the correct behavior seams: migration/backfill in [`src/db/client.ts`](/Users/harish/workspace/food-planner/src/db/client.ts), runtime normalization in [`src/services/category-db.ts`](/Users/harish/workspace/food-planner/src/services/category-db.ts), automatic/default and explicit rule behavior in [`src/services/generator.ts`](/Users/harish/workspace/food-planner/src/services/generator.ts), picker grouping in [`src/components/plan/MealPickerSheet.tsx`](/Users/harish/workspace/food-planner/src/components/plan/MealPickerSheet.tsx), and manual/locked persistence in [`src/stores/plan-store.ts`](/Users/harish/workspace/food-planner/src/stores/plan-store.ts).

The missing piece is not implementation coverage density. It is milestone-level readability. Current proofs are strong but distributed: migration semantics live in [`src/db/migrations.test.ts`](/Users/harish/workspace/food-planner/src/db/migrations.test.ts), normalization in [`src/services/food-db.test.ts`](/Users/harish/workspace/food-planner/src/services/food-db.test.ts), default and override generator behavior in [`src/services/generator.test.ts`](/Users/harish/workspace/food-planner/src/services/generator.test.ts), picker grouping in [`src/components/plan/MealPickerSheet.test.tsx`](/Users/harish/workspace/food-planner/src/components/plan/MealPickerSheet.test.tsx), store persistence in [`src/stores/plan-store.test.ts`](/Users/harish/workspace/food-planner/src/stores/plan-store.test.ts), and library rename/edit UI in [`src/components/library/ComponentForm.test.tsx`](/Users/harish/workspace/food-planner/src/components/library/ComponentForm.test.tsx) and [`src/components/library/ComponentRow.test.tsx`](/Users/harish/workspace/food-planner/src/components/library/ComponentRow.test.tsx). Phase 20 should not replace those tests; it should add a single contract story that ties them together.

**Primary recommendation:** Add `src/services/curry-compatibility-regression.test.ts` as the `CURRY-08` backbone, then make only targeted supporting expansions in existing picker/service tests for post-normalization runtime assertions that are too seam-specific to belong in the backbone.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `vitest` | 4.1.0 | Phase backbone and focused regression execution | Already the project test runner; fast targeted runs and full suite gate are both in place |
| `fake-indexeddb` | 6.2.5 | Dexie-backed IndexedDB behavior in tests | Matches the existing database test strategy in `src/test/setup.ts` |
| `@testing-library/react` | 16.3.2 | Picker/library UI behavior assertions | Already used for `MealPickerSheet`, `ComponentForm`, and `ComponentRow` |
| `happy-dom` | 20.8.4 | DOM environment for UI contract tests | Existing project pattern for component tests |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `dexie` | 4.3.0 | Real IndexedDB-backed runtime state in tests | Use for migration, category rename/delete, and generator/runtime flows |
| `zustand` | 5.0.12 | Store-level manual/locked persistence seam | Use where the contract must prove regenerate preserves explicit incompatible curry intent |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Dedicated milestone regression file | More assertions inside `src/services/generator.test.ts` only | Lower file count, but `CURRY-08` stays hard to trace because picker/store/library evidence remains scattered |
| Real browser E2E coverage | Playwright-style end-to-end test | Not standard in this repo, slower, and unnecessary for a contract already covered by Dexie + component/store seams |

**Installation:**
```bash
# None. Use existing workspace dependencies.
```

**Version verification:** Versions were verified from `package.json` and local CLI output (`npx vitest --version` returned `vitest/4.1.0`; `node --version` returned `v25.8.1`; `npm --version` returned `11.11.0`).

## Architecture Patterns

### Recommended Project Structure
```text
src/
├── services/
│   ├── curry-compatibility-regression.test.ts  # New milestone backbone for CURRY-08
│   ├── generator.test.ts                       # Focused generator/default + explicit-rule support
│   └── food-db.test.ts                        # Focused normalization/service support
├── components/
│   ├── library/                               # Existing library model/rename UI proofs
│   └── plan/                                  # Existing picker grouping proofs
└── stores/
    └── plan-store.test.ts                     # Existing locked/manual persistence proofs
```

### Pattern 1: Dedicated Milestone Backbone File
**What:** One new test file that seeds a minimal compatibility fixture and walks the milestone contract end-to-end: migrated/normalized data, default generator behavior, explicit rule override behavior, and explicit locked/manual preservation.
**When to use:** For `CURRY-08` evidence that must read like one contract instead of a pile of seam-local assertions.
**Example:**
```typescript
// Source: src/services/generator.test.ts + src/services/food-db.test.ts
await deleteCategory(breadBaseId);

const result = await generate();
const mondayLunch = result.plan.slots.find(
  (slot) => slot.day === 'monday' && slot.meal_slot === 'lunch',
);

expect(mondayLunch?.curry_id).not.toBe(deletedReferenceCurryId);
expect(result.warnings.some((warning) => warning.message.includes('no compatible curry'))).toBe(false);
```

### Pattern 2: Keep Seam-Specific Proofs Where They Already Belong
**What:** Leave migration, library rename/edit UI, picker grouping UI, and store regeneration semantics in their existing test files; only add cases that close a concrete gap.
**When to use:** When the behavior is already well-isolated and moving it into the backbone would make the backbone brittle.
**Example:**
```typescript
// Source: src/components/plan/MealPickerSheet.test.tsx
expect(screen.getByText('Compatible Curries')).toBeTruthy();
expect(screen.getByText('Override Choices')).toBeTruthy();
```

### Pattern 3: Prove Delete Normalization Through Runtime Consumers
**What:** Apply `deleteCategory()` to real Dexie-backed data, then assert generator and picker behavior off the normalized state.
**When to use:** For Phase 20's rename/delete requirement; data-layer assertions alone are insufficient.
**Example:**
```typescript
// Source: src/services/category-db.ts + src/components/plan/MealPickerSheet.tsx
await deleteCategory(breadBaseId);

render(<MealPickerSheet {...props} componentType="curry" currentBaseCategoryId={riceBaseId} />);

expect(screen.queryByText('Deleted-only curry')).toBeNull();
expect(screen.getByText('Compatible Curries')).toBeTruthy();
```

### Anti-Patterns to Avoid
- **Backbone by accretion inside `generator.test.ts` only:** It keeps the requirement traceability diffuse and still forces the reader to mentally assemble picker/store/library coverage.
- **New production helpers just for tests:** The current seams are sufficient; Phase 20 should stay test-only unless a real drift is exposed.
- **Snapshot-heavy UI proof:** This contract is about category-ID behavior and override semantics, so explicit behavioral assertions are more stable than snapshots.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Milestone contract tracing | Ad hoc markdown-only reasoning | One dedicated Vitest backbone file | The planner and verifier need executable proof, not a narrative only |
| IndexedDB/runtime simulation | Custom in-memory fake services | Real Dexie + `fake-indexeddb` | Existing tests already rely on the actual persistence and normalization paths |
| UI regression proof | Snapshot dumps of picker sections | Testing Library behavioral assertions | Section labels and selectable items are the real contract |
| Override persistence proof | New override metadata or test-only store API | Existing `swapComponent` and `generate({ lockedSlots })` seams | Phase 19 already proved the correct runtime boundary |

**Key insight:** Phase 20 should compose existing proven seams into one contract story. It should not introduce new runtime abstractions just to make the tests look cleaner.

## Common Pitfalls

### Pitfall 1: Treating Migration Coverage As Sufficient Proof
**What goes wrong:** Tests prove `compatible_base_category_ids` are rewritten, but never prove the runtime stopped behaving as if deleted or renamed category references still mattered.
**Why it happens:** `src/db/migrations.test.ts` and `src/services/food-db.test.ts` already have good data assertions, so it is easy to stop there.
**How to avoid:** After normalization, always assert at least one runtime consumer result: generator pool outcome and picker grouping/list membership.
**Warning signs:** The test only checks stored arrays or direct `db.components.bulkGet()` results.

### Pitfall 2: Duplicating Existing Focused Proofs Inside The Backbone
**What goes wrong:** The new file becomes long, brittle, and overlaps entire existing test suites.
**Why it happens:** Trying to make the backbone “complete” by moving every phase-specific assertion into one place.
**How to avoid:** Put only the milestone contract story in the new file; keep UI and seam-local details in their current files.
**Warning signs:** The backbone starts recreating `ComponentForm`, `ComponentRow`, or every picker edge case.

### Pitfall 3: Proving Delete But Not Explicit Override Precedence
**What goes wrong:** The suite proves default generation respects compatibility, but does not reassert the explicit override boundaries that make the contract coherent.
**Why it happens:** Delete/rename work can pull the focus back to Phase 17-only concerns.
**How to avoid:** Keep one locked/manual assertion and one `require_one` override assertion in the backbone.
**Warning signs:** `CURRY-08` proof mentions default generation only.

## Code Examples

Verified patterns from current code:

### Default Compatibility Narrowing
```typescript
// Source: src/services/generator.ts
const compatibleCurries = eligibleCurries.filter(
  c => isCurryCompatibleWithBase(c, selectedBase),
);
```

### Explicit Rule Override Stays Narrow
```typescript
// Source: src/services/generator.ts
selectedCurry = applyRequireOne(
  selectedCurry,
  validatedRules,
  compatibleCurries,
  day,
  meal_slot,
  warnings,
  {
    componentType: 'curry',
    overrideLibrary: eligibleCurries,
  },
);
```

### Locked/Manual Selection Wins
```typescript
// Source: src/stores/plan-store.ts
if (locks[`${planSlot.day}-${planSlot.meal_slot}-curry`] && planSlot.curry_id !== undefined) {
  constraint.curry_id = planSlot.curry_id;
  hasLock = true;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Compatibility behavior proved per phase only | Phase 20 should add one milestone backbone contract and keep phase-local tests as support | 2026-04-01 planning decision | `CURRY-08` becomes directly traceable and easier to verify |
| Rename/delete proof mostly ends at normalized stored IDs | Rename/delete proof must continue into generator and picker runtime behavior | Locked by Phase 20 context on 2026-04-01 | Prevents stale-behavior regressions hiding behind clean data |

**Deprecated/outdated:**
- “Generator tests alone are enough for milestone proof”: outdated for Phase 20 because the milestone goal explicitly includes library, picker, migration, and override flows.

## Open Questions

1. **Should the dedicated backbone render `MealPickerSheet` directly, or should picker-after-normalization stay only in `MealPickerSheet.test.tsx`?**
   - What we know: Picker grouping already has strong focused tests, and mixing DOM/UI with generator/store in one file raises brittleness.
   - What's unclear: Whether the planner wants one all-in-one file or one primary file plus one supporting picker expansion.
   - Recommendation: Keep the backbone service-first and add one focused picker-after-normalization case in [`src/components/plan/MealPickerSheet.test.tsx`](/Users/harish/workspace/food-planner/src/components/plan/MealPickerSheet.test.tsx). This is lower risk and still honors D-01/D-02 because the dedicated file remains the primary artifact.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `node` | Vitest execution | ✓ | 25.8.1 | — |
| `npm` | Script execution | ✓ | 11.11.0 | `npx vitest run ...` |
| `vitest` | Focused and full regression runs | ✓ | 4.1.0 | `npm test` invokes the same runner |

**Missing dependencies with no fallback:**
- None.

**Missing dependencies with fallback:**
- None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run src/services/curry-compatibility-regression.test.ts src/db/migrations.test.ts src/services/food-db.test.ts src/components/plan/MealPickerSheet.test.tsx src/stores/plan-store.test.ts src/components/library/ComponentForm.test.tsx src/components/library/ComponentRow.test.tsx` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CURRY-08 | Migration, library, generator, picker, and override flows follow one curry compatibility contract | unit/integration | `npx vitest run src/services/curry-compatibility-regression.test.ts src/db/migrations.test.ts src/services/food-db.test.ts src/components/plan/MealPickerSheet.test.tsx src/stores/plan-store.test.ts src/components/library/ComponentForm.test.tsx src/components/library/ComponentRow.test.tsx` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/services/curry-compatibility-regression.test.ts src/db/migrations.test.ts src/services/food-db.test.ts src/components/plan/MealPickerSheet.test.tsx src/stores/plan-store.test.ts src/components/library/ComponentForm.test.tsx src/components/library/ComponentRow.test.tsx`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] [`src/services/curry-compatibility-regression.test.ts`](/Users/harish/workspace/food-planner/src/services/curry-compatibility-regression.test.ts) — new milestone backbone covering default, override, locked/manual, and post-delete runtime behavior for `CURRY-08`
- [ ] [`src/components/plan/MealPickerSheet.test.tsx`](/Users/harish/workspace/food-planner/src/components/plan/MealPickerSheet.test.tsx) — add one normalization-after-delete picker case so runtime UI proof is explicit
- [ ] [`src/services/food-db.test.ts`](/Users/harish/workspace/food-planner/src/services/food-db.test.ts) — if needed, tighten the service assertion to feed the same fixture shape the new backbone consumes

## Sources

### Primary (HIGH confidence)
- [`20-CONTEXT.md`](/Users/harish/workspace/food-planner/.planning/phases/20-compatibility-regression-coverage/20-CONTEXT.md) - locked Phase 20 decisions, scope, and proof depth requirements
- [`ROADMAP.md`](/Users/harish/workspace/food-planner/.planning/ROADMAP.md) - milestone goal, Phase 20 success criteria, and `CURRY-08` mapping
- [`REQUIREMENTS.md`](/Users/harish/workspace/food-planner/.planning/REQUIREMENTS.md) - `CURRY-08` definition
- [`PROJECT.md`](/Users/harish/workspace/food-planner/.planning/PROJECT.md) - milestone framing and current validated compatibility decisions
- [`STATE.md`](/Users/harish/workspace/food-planner/.planning/STATE.md) - current milestone focus and carry-forward concern
- [`17-CONTEXT.md`](/Users/harish/workspace/food-planner/.planning/phases/17-curry-compatibility-data/17-CONTEXT.md) - data/backfill/delete-normalization contract
- [`18-CONTEXT.md`](/Users/harish/workspace/food-planner/.planning/phases/18-generator-compatibility-contract/18-CONTEXT.md) - default generator compatibility contract
- [`19-CONTEXT.md`](/Users/harish/workspace/food-planner/.planning/phases/19-explicit-override-paths/19-CONTEXT.md) - explicit override boundary
- [`19-VERIFICATION.md`](/Users/harish/workspace/food-planner/.planning/phases/19-explicit-override-paths/19-VERIFICATION.md) - verified runtime truths and command evidence
- [`src/db/migrations.test.ts`](/Users/harish/workspace/food-planner/src/db/migrations.test.ts) - migration/backfill and delete-normalization tests
- [`src/services/food-db.test.ts`](/Users/harish/workspace/food-planner/src/services/food-db.test.ts) - live category rename/delete normalization tests
- [`src/services/generator.test.ts`](/Users/harish/workspace/food-planner/src/services/generator.test.ts) - current default, override, and locked/manual compatibility tests
- [`src/components/plan/MealPickerSheet.test.tsx`](/Users/harish/workspace/food-planner/src/components/plan/MealPickerSheet.test.tsx) - picker grouping behavior
- [`src/stores/plan-store.test.ts`](/Users/harish/workspace/food-planner/src/stores/plan-store.test.ts) - regenerate/lock persistence
- [`src/components/library/ComponentForm.test.tsx`](/Users/harish/workspace/food-planner/src/components/library/ComponentForm.test.tsx) - library edit/rename proofs
- [`src/components/library/ComponentRow.test.tsx`](/Users/harish/workspace/food-planner/src/components/library/ComponentRow.test.tsx) - library summary/rename proofs
- Local validation run on 2026-04-01: `npx vitest run src/db/migrations.test.ts src/services/food-db.test.ts src/services/generator.test.ts src/components/plan/MealPickerSheet.test.tsx src/stores/plan-store.test.ts src/components/library/ComponentForm.test.tsx src/components/library/ComponentRow.test.tsx` → 7 files passed, 110 tests passed
- Local validation run on 2026-04-01: `npm test` → 22 files passed, 197 tests passed

### Secondary (MEDIUM confidence)
- [`package.json`](/Users/harish/workspace/food-planner/package.json) - dependency versions for the existing test stack
- [`vitest.config.ts`](/Users/harish/workspace/food-planner/vitest.config.ts) - framework configuration

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - this phase uses the repository's existing test stack and local version checks passed
- Architecture: HIGH - recommendations are based on the current code seams and successful focused/full test runs
- Pitfalls: HIGH - each pitfall is derived from concrete gaps between existing seam-local tests and the Phase 20 locked requirement

**Research date:** 2026-04-01
**Valid until:** 2026-04-08
