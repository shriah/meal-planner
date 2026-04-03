# Phase 18: Generator Compatibility Contract - Research

**Researched:** 2026-03-29
**Domain:** Generator-side curry/base compatibility enforcement
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### No-compatible-curry outcome
- **D-01:** If the selected base has no compatible curry candidates, automatic generation must skip the curry for that slot rather than silently inserting an incompatible curry.
- **D-02:** “Skip the curry” means the slot still keeps its selected base and any independently valid components, but `curry_id` remains unset.
- **D-03:** Phase 18 must not introduce a relaxed fallback such as “pick any curry anyway” or “pretend zero-compatible means unrestricted.”

### Enforcement boundary
- **D-04:** Phase 18 stays limited to default automatic-generation enforcement.
- **D-05:** Rule-based incompatible curry overrides are explicitly deferred to Phase 19 even if the current rule engine already has nearby seams.
- **D-06:** Planning and implementation should avoid reshaping the roadmap by folding override semantics into this phase.

### Warning behavior
- **D-07:** Reuse the existing per-slot generator warning path when curry selection is skipped because compatibility leaves no eligible candidates.
- **D-08:** This phase should not add a new warning banner type or a stronger dedicated warning style; existing warning presentation is sufficient for now.
- **D-09:** Warning copy should make it clear that the curry was omitted because no compatible curry existed for the selected base.

### Zero-compatible curries
- **D-10:** Curries with an explicit empty `compatible_base_category_ids` array are incompatible with every base for automatic generation.
- **D-11:** Zero-compatible curries must never enter automatic curry pools unless a later explicit override path intentionally allows them.
- **D-12:** Phase 18 must preserve the distinction established in Phase 17 between explicit `[]` and legacy missing data.

### Manual and locked exceptions
- **D-13:** Manual picker swaps and locked/manual incompatible curry selections remain unchanged in this phase.
- **D-14:** Phase 18 should not restrict the manual picker or reinterpret locked/manual state; it only changes normal automatic generation.
- **D-15:** Any UI or store behavior needed for explicit incompatible manual choices belongs to Phase 19, not here.

### the agent's Discretion
- Exact warning string wording, as long as it clearly states that auto-generation skipped curry because no compatible curry was available for the chosen base.
- Whether the compatibility filter is enforced as a dedicated helper or inline pool narrowing, as long as the generator contract stays readable and testable.
- Whether skipped-curry handling is shared with existing empty-pool generator behavior or implemented as a separate narrow branch, as long as it does not silently relax compatibility.

### Deferred Ideas (OUT OF SCOPE)
- Rule-based incompatible curry overrides remain Phase 19 work and should not be merged into this phase.
- Manual picker restriction or incompatible-picker affordances remain Phase 19 work.
- Curry-vs-subzi composition modes remain deferred to backlog item `999.1`.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CURRY-03 | Automatic generation only selects curries compatible with the chosen base by default | Filter the auto-curry pool from `selectedBase`, treat compatibility as a hard constraint, and keep `require_one` from escaping that scoped pool |
| CURRY-04 | If no compatible curry exists for a slot, the generator does not silently pick an incompatible curry | Leave `curry_id` unset, emit a slot warning through the existing warning path, and avoid any relax-to-full-pool fallback |
</phase_requirements>

## Summary

Phase 17 already delivered the data contract this phase needs: curries now carry `compatible_base_category_ids`, explicit empty arrays mean "compatible with none," and category identity remains stable-ID based. The generator is therefore not missing data; it is missing enforcement. Today, automatic curry selection in [`src/services/generator.ts`](src/services/generator.ts) ignores the chosen base entirely, while extras already use the correct hard-filter shape via `isExtraCompatibleWithBase()`.

The safest Phase 18 plan is to localize the change to the automatic curry branch in [`src/services/generator.ts`](src/services/generator.ts), using the already-selected base as an input and reusing the existing `Warning` plumbing in [`src/types/plan.ts`](src/types/plan.ts), [`src/components/plan/MealCell.tsx`](src/components/plan/MealCell.tsx), and [`src/components/plan/WarningBanner.tsx`](src/components/plan/WarningBanner.tsx). Locked/manual curries must remain untouched because those branches are the explicit-exception seam reserved for Phase 19.

The main trap is that the existing rule helpers are relaxable by design. `applyFilterPool()` intentionally falls back to the original pool when a rule empties it, and `applyRequireOne()` intentionally overrides from the full library. Compatibility cannot be modeled by reusing those semantics directly. It must be a non-relaxing constraint on automatic curry selection, and `require_one` for curries must operate only within the compatibility-scoped pool during this phase.

**Primary recommendation:** Enforce curry compatibility as a dedicated hard narrowing step inside the automatic curry path, before selection and without any relax-to-full-library escape hatch.

## Project Constraints (from CLAUDE.md)

- Read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code.
- Heed deprecation notices.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.2.0 (project-pinned) | App runtime/build system | Existing app framework; Phase 18 does not require framework changes |
| React | 19.2.4 (project-pinned) | UI/state rendering | Existing UI surface for warnings and picker/manual flows |
| Dexie | 4.3.0 (project-pinned) | IndexedDB persistence | Generator reads current component/rule data through existing services |
| Zod | 4.3.6 (project-pinned/current) | Rule validation | Generator already validates compiled rules before generation |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Zustand | 5.0.12 (project-pinned) | Plan/warning store | Reuse existing `warnings` store flow; no new state channel needed |
| Vitest | 4.1.0 (project-pinned) | Generator/UI regression tests | Add focused phase coverage in existing generator and plan component tests |
| Testing Library | 16.3.2 (project-pinned) | Component interaction tests | Only if warning presentation or untouched manual flows need regression assertions |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Dedicated hard compatibility narrowing | `applyFilterPool()` | Reject: `applyFilterPool()` relaxes to the original pool on zero matches, which violates CURRY-04 |
| Compatibility-scoped `require_one` candidates | Existing full-library `applyRequireOne()` behavior | Reject for Phase 18: full-library override can reintroduce incompatible curries before Phase 19 |
| Local generator change | New DB query/helper abstraction first | Optional later, but unnecessary for planning; the enforcement seam is already local to the curry branch |

**Installation:**
```bash
# No new packages recommended for Phase 18
```

**Version verification:** Registry check on 2026-03-29 shows `next` current at `16.2.1` (published 2026-03-20), `react` current at `19.2.4` (published 2026-01-26), `dexie` current at `4.4.1` (published 2026-03-24), `vitest` current at `4.1.2` (published 2026-03-26), and `zod` current at `4.3.6` (published 2026-01-22). This phase should stay on repo-pinned versions rather than introduce dependency churn.

## Architecture Patterns

### Recommended Project Structure
```text
src/
├── services/
│   ├── generator.ts        # Automatic base/curry/subzi/extra selection
│   └── food-db.ts          # Data-loading helpers used by generator and picker
├── types/
│   ├── component.ts        # Compatibility field contract
│   └── plan.ts             # Warning/result shapes
├── stores/
│   └── plan-store.ts       # Persists generator warnings to UI
└── components/plan/
    ├── MealCell.tsx        # Slot-scoped warning tooltip
    ├── WarningBanner.tsx   # Aggregate warning banner
    ├── PlanBoard.tsx       # Warning entry point
    └── MealPickerSheet.tsx # Manual picker path to leave unchanged
```

### Pattern 1: Hard compatibility narrowing after base selection
**What:** Once `selectedBase` exists, derive the automatic curry candidate pool from curries that explicitly include `selectedBase.base_category_id`.
**When to use:** Every non-locked, non-manual automatic curry selection.
**Example:**
```typescript
// Source: src/services/generator.ts + src/types/component.ts
function isCurryCompatibleWithBase(curry: ComponentRecord, base: ComponentRecord): boolean {
  const baseCategoryId = base.base_category_id;
  if (baseCategoryId === undefined || baseCategoryId === null) return false;
  return (curry.compatible_base_category_ids ?? []).includes(baseCategoryId);
}

const compatibleCurries = curries.filter(
  (curry) => isOccasionAllowed(curry, day) && isCurryCompatibleWithBase(curry, selectedBase),
);
```

### Pattern 2: Keep compatibility non-relaxing, but reuse existing slot warnings
**What:** If compatibility empties the automatic curry pool, omit `curry_id` and push a normal slot warning.
**When to use:** When no compatible automatic curry exists after compatibility narrowing and any in-scope rule effects.
**Example:**
```typescript
// Source: src/services/generator.ts + src/types/plan.ts
if (compatiblePool.length === 0) {
  warnings.push({
    slot: { day, meal_slot },
    rule_id: null,
    message: `Auto-generation skipped curry: no compatible curry exists for "${selectedBase.name}"`,
  });
}
```

### Pattern 3: Preserve explicit override boundaries
**What:** Leave locked curry handling and manual picker selection semantics alone in this phase.
**When to use:** Always; compatibility enforcement is only for the normal auto-generation branch.
**Example:**
```typescript
// Source: src/services/generator.ts + src/stores/plan-store.ts
if (locked?.curry_id !== undefined) {
  // Preserve explicit locked curry selections unchanged in Phase 18.
}

// MealPickerSheet -> swapComponent remains unchanged in Phase 18.
```

### Pattern 4: Scope `require_one` to compatible curry candidates
**What:** If a curry `require_one` rule applies during auto-generation, search only the compatibility-scoped curry candidates for a satisfying replacement.
**When to use:** Any `require_one` path affecting curries in Phase 18.
**Example:**
```typescript
// Source: src/services/generator.ts
const compatibleLibrary = curries.filter((curry) => isCurryCompatibleWithBase(curry, selectedBase));
picked = applyRequireOne(picked, validatedRules, compatibleLibrary, day, meal_slot, warnings);
```

### Anti-Patterns to Avoid
- **Compatibility via `applyFilterPool()`:** Wrong abstraction. That helper relaxes on empty results and would silently re-allow incompatible curries.
- **Filtering only before pick, not after `require_one`:** Current `applyRequireOne()` bypasses the narrowed pool via full-library search, so compatibility can still be broken unless the candidate library is also scoped.
- **Changing `MealPickerSheet` in Phase 18:** Manual override behavior is deferred to Phase 19; this phase should not tighten or redesign manual flows.
- **Treating `compatible_base_category_ids: []` as legacy/missing:** Phase 17 explicitly made `[]` meaningful. These curries must never enter auto pools.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Slot warning UX | New banner/toast/warning type | Existing `Warning` objects + `MealCell` tooltip + `WarningBanner` | The full slot-scoped warning path already exists and matches the locked phase decision |
| Compatibility data source | New compatibility table or derived lookup cache | Existing `compatible_base_category_ids` on curry records | Phase 17 already shipped the persisted contract and normalization behavior |
| Override semantics | New exception UI/rule surface in this phase | Existing locked/manual branches untouched; Phase 19 for overrides | Keeps roadmap boundaries clean and avoids mixing default enforcement with exceptions |
| Picker-side enforcement | Parallel manual-picker restriction logic now | No Phase 18 picker change | Manual picker exceptions are explicitly out of scope for this phase |

**Key insight:** Phase 18 is a contract-enforcement phase, not a modeling or UX-expansion phase. The cheapest correct implementation is to narrow one existing generator seam and reuse existing warning/result plumbing.

## Common Pitfalls

### Pitfall 1: Using relaxable rule helpers for compatibility
**What goes wrong:** An empty compatibility pool snaps back to a broader pool, causing silent incompatible curry selection.
**Why it happens:** `applyFilterPool()` and `applyExclude()` were designed for relax-and-warn rule semantics.
**How to avoid:** Treat compatibility as a separate hard constraint, not a normal selection effect.
**Warning signs:** Warning text says "constraint relaxed" and the slot still gets an incompatible curry.

### Pitfall 2: `require_one` bypasses compatibility
**What goes wrong:** A curry that satisfies a rule but not the selected base can still be inserted.
**Why it happens:** `applyRequireOne()` currently searches the full library passed to it.
**How to avoid:** For curries, pass a compatibility-scoped library or add a curry-specific wrapper that enforces the same scope.
**Warning signs:** Tests pass for basic pool narrowing but fail when `require_one` is enabled.

### Pitfall 3: Breaking explicit overrides too early
**What goes wrong:** Locked curries or manual swaps start being rejected or auto-normalized.
**Why it happens:** Compatibility checks are added outside the automatic branch and catch explicit user-intent paths.
**How to avoid:** Keep enforcement inside the auto-curry branch only; leave locked/manual paths untouched.
**Warning signs:** Existing locked/manual tests or user flows lose incompatible curries unexpectedly.

### Pitfall 4: Collapsing `[]` into missing compatibility data
**What goes wrong:** Zero-compatible curries re-enter generation as "all compatible."
**Why it happens:** Code treats falsy/empty arrays as equivalent to undefined or legacy state.
**How to avoid:** Preserve Phase 17 semantics: `undefined` was legacy/migration territory; `[]` is explicit none.
**Warning signs:** A curry marked "Not auto-selected" in the Library still appears in generated plans.

## Code Examples

Verified patterns from the current codebase:

### Existing explicit compatibility pattern on extras
```typescript
// Source: src/services/generator.ts
const eligibleExtras = extras.filter(
  (extra) => isOccasionAllowed(extra, day) && isExtraCompatibleWithBase(extra, selectedBase),
);
```

### Existing warning plumbing reused by this phase
```typescript
// Source: src/services/generator.ts
warnings.push({
  slot: { day, meal_slot },
  rule_id: null,
  message: `require_extra category_id '${categoryId}' has no eligible extras on ${day} ${meal_slot} — skipped`,
});
```

### Existing locked/manual boundary to preserve
```typescript
// Source: src/services/generator.ts
if (locked?.curry_id !== undefined) {
  const lockedCurry = curries.find(c => c.id === locked.curry_id);
  if (lockedCurry) {
    selectedCurry = lockedCurry;
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Auto curry selection ignores selected base and only checks occasion/rule effects | Auto curry selection should be compatibility-scoped by selected base category | Phase 18 | Generator stops producing silent incompatible pairings |
| Relax-and-warn helpers are acceptable for rule effects | Compatibility must be non-relaxing by default | v1.3 milestone / Phase 18 | Planner must separate compatibility enforcement from generic rule effects |
| Explicit empty compatibility arrays were not part of curry modeling | `compatible_base_category_ids: []` is valid persisted "compatible with none" state | Phase 17 | Zero-compatible curries must be excluded from automatic selection |

**Deprecated/outdated:**
- Treating curry/base compatibility as future-only metadata: outdated after Phase 17. The data now exists and Phase 18 must consume it.

## Open Questions

1. **Should the no-compatible warning mention the base name, base category label, or both?**
   - What we know: The warning must clearly say curry was omitted because no compatible curry existed for the chosen base.
   - What's unclear: Exact wording is discretionary.
   - Recommendation: Mention the selected base name in the message because it is already available in the generator and is the most user-readable slot context.

2. **Should compatibility filtering live in a dedicated helper or inline inside the curry branch?**
   - What we know: Either is allowed if the contract stays readable and testable.
   - What's unclear: Whether Phase 19 will reuse the same helper for override-aware behavior.
   - Recommendation: Use a small helper like `isCurryCompatibleWithBase()` plus inline branch handling; that keeps Phase 18 simple without over-abstracting.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Test runs, Next.js toolchain | ✓ | 25.8.1 | — |
| npm | Package scripts and registry verification | ✓ | 11.11.0 | — |
| npx | Focused Vitest commands | ✓ | 11.11.0 | — |

**Missing dependencies with no fallback:**
- None

**Missing dependencies with fallback:**
- None

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 (project-pinned) |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run src/services/generator.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CURRY-03 | Auto-generated curries only come from the selected base's compatible curry set | unit/integration | `npx vitest run src/services/generator.test.ts -t "curry compatibility"` | ✅ |
| CURRY-03 | Locked/manual curry paths remain unchanged while auto-generation tightens | unit/integration | `npx vitest run src/services/generator.test.ts src/components/plan/MealPickerSheet.test.tsx` | ✅ |
| CURRY-04 | No compatible curry leaves `curry_id` unset and emits an existing slot warning | unit/integration | `npx vitest run src/services/generator.test.ts src/components/plan/PlanBoard.test.tsx` | ✅ |
| CURRY-04 | `require_one` cannot backdoor an incompatible curry during Phase 18 | unit/integration | `npx vitest run src/services/generator.test.ts -t "require_one"` | ✅ |

### Sampling Rate
- **Per task commit:** `npx vitest run src/services/generator.test.ts`
- **Per wave merge:** `npx vitest run src/services/generator.test.ts src/components/plan/PlanBoard.test.tsx src/components/plan/MealPickerSheet.test.tsx`
- **Phase gate:** `npm test`

### Wave 0 Gaps
- None in framework/setup. Existing Vitest infrastructure is sufficient.
- Add focused generator cases for compatibility-scoped curry selection, explicit `[]` curries, no-compatible warning behavior, and `require_one` staying inside the compatibility-scoped curry library.
- Add one UI regression assertion that an omitted curry warning still surfaces through existing PlanBoard/MealCell warning plumbing.

## Sources

### Primary (HIGH confidence)
- Local phase context: `.planning/phases/18-generator-compatibility-contract/18-CONTEXT.md`
- Local requirements and milestone docs: `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/PROJECT.md`, `.planning/STATE.md`
- Current generator implementation: `src/services/generator.ts`
- Current data/service contracts: `src/types/component.ts`, `src/types/plan.ts`, `src/services/food-db.ts`, `src/stores/plan-store.ts`
- Current UI seams: `src/components/plan/PlanBoard.tsx`, `src/components/plan/MealCell.tsx`, `src/components/plan/MealPickerSheet.tsx`, `src/components/plan/WarningBanner.tsx`
- Current test surface: `src/services/generator.test.ts`, `src/components/plan/PlanBoard.test.tsx`, `src/components/plan/MealPickerSheet.test.tsx`, `vitest.config.ts`
- Phase 17 carried-forward evidence: `.planning/phases/17-curry-compatibility-data/17-CONTEXT.md`, `.planning/phases/17-curry-compatibility-data/17-VERIFICATION.md`
- Official npm registry version checks on 2026-03-29: `npm view next version time --json`, `npm view react version time --json`, `npm view dexie version time --json`, `npm view vitest version time --json`, `npm view zod version time --json`

### Secondary (MEDIUM confidence)
- None

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Based on repo inspection plus current npm registry verification
- Architecture: HIGH - Based on direct generator/store/UI code inspection and passing focused tests
- Pitfalls: HIGH - Derived from current helper semantics in `generator.ts` and validated against existing tests

**Research date:** 2026-03-29
**Valid until:** 2026-04-28
