# Phase 13: Only include extras when explicitly required - Research

**Researched:** 2026-03-28
**Domain:** Generator extra-selection semantics, regression coverage, and requirement traceability
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Locked slot `extra_ids` remain authoritative and must continue to bypass normal generation choices.

### Default Extra Policy
- For unlocked generation, a slot with no matching `require_extra` effects should end with zero generated extras.
- Compatible extras should no longer be randomly filled just because they are available.

### Explicit Requirement Semantics
- Existing `require_extra` rules remain the only rule path that can cause generated extras to appear.
- Existing warning behavior for unsatisfied explicit `require_extra` categories should remain intact.

### Scope of Change
- No new rule-form controls are needed.
- Rule descriptions do not need new copy unless the planner finds a user-visible surface that promises optional extras today.
- Preference fields such as `extra_quantity_limits` may still matter as a ceiling or compatibility input, but they must not cause optional extras to appear by themselves.

### the agent's Discretion
- Whether `extra_quantity_limits` should stay untouched, be partially repurposed, or merely limit explicit requirements if multiple categories are required.
- Whether plan-board tests, export tests, or docs outside generator-focused coverage need updates to reflect the new “no extras by default” output shape.

### Deferred Ideas (OUT OF SCOPE)
- Any future product choice to reintroduce optional extras as an explicit rule or preference.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PH13-01 | Unlocked generation adds no extras when the slot has no matching `require_extra` effect. | `src/services/generator.ts` currently violates this via the post-requirement random-fill branch; remove that branch and keep `selectedExtraIds` empty unless requirements add entries. |
| PH13-02 | Matching `require_extra` effects remain the only runtime path that can add generated extras to an unlocked slot. | `compositionEffectsSecondPass()` already isolates `require_extra`; keep that seam and preserve category de-duplication plus compatibility filtering. |
| PH13-03 | Locked slot `extra_ids` remain unchanged and bypass the new no-random-fill default. | Existing locked-slot branch in `generate()` already short-circuits extras; preserve current contract and regression coverage. |
| PH13-04 | Extra-related warnings occur only for unsatisfied explicit `require_extra` categories, not for the absence of optional extras. | Current warning seam already does this for `require_extra`; rewrite the Phase 12 regression test that still expects unconstrained extras and verify warning behavior stays unchanged. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Follow the `AGENTS.md` rule: this project is on a breaking-change-heavy Next.js version.
- Read relevant local Next.js docs under `node_modules/next/dist/docs/` before writing code.
- Prefer local Next.js docs and deprecation notices over framework assumptions from training data.

## Summary

Phase 13 is not a schema or UI phase. Phase 12 already removed legacy `exclude_extra` behavior from the form model, compiled rule schema, and Dexie migration path. The only remaining mismatch is in [`generator.ts`](/Users/harish/workspace/food-planner/src/services/generator.ts): after satisfying explicit `require_extra` categories, the generator still uses leftover `extra_quantity_limits` capacity to randomly add compatible extras to unlocked slots.

The safest implementation is to leave the compiled rule model, persistence layer, and locked-slot contract unchanged, and narrow the edit to the extras-selection branch in `generate()`. Keep the existing second-pass `require_extra` gathering, keep the existing compatibility and occasion filtering, keep the existing warning text for unsatisfied required categories, and delete the fallback random-fill loop. That makes the runtime match the Phase 13 product rule without broadening scope.

**Primary recommendation:** Treat Phase 13 as a generator-regression phase: remove unlocked random extra fill, preserve explicit `require_extra` behavior and locked `extra_ids`, and rewrite the generator tests so empty `extra_ids` is the default unlocked outcome.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | `16.2.0` | App/runtime host | Existing app framework; this phase stays inside service/test files and does not introduce new framework surface |
| React | `19.2.4` | UI/runtime host for the app | Present but not directly changed by this phase |
| Dexie | `^4.3.0` | IndexedDB persistence | Existing rule/prefs storage; no new migration recommended for this phase |
| Vitest | `^4.1.0` | Regression testing | Current generator and migration suites already run here |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| fake-indexeddb | `^6.2.5` | Dexie test environment | Already used indirectly by persistence tests; not expected to need new migration coverage here |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Delete the random-fill branch only | Reinterpret `extra_quantity_limits` to force at least N optional extras | Conflicts with locked Phase 13 behavior and creates a new product decision |
| Keep persistence untouched | Add another Dexie migration | Unnecessary unless implementation changes stored data, which the current scope does not require |
| Focus on generator tests | Broaden into plan-board/export changes immediately | No evidence from current code that those surfaces promise optional extras; expand only if planner finds a concrete contract |

**Installation:**
```bash
npm install
```

No new packages are required.

## Architecture Patterns

### Recommended Project Structure
```text
src/
├── services/
│   ├── generator.ts
│   └── generator.test.ts
├── types/
│   └── plan.ts
└── db/
    └── client.ts
```

### Pattern 1: Keep extras generation single-sourced in `generate()`
**What:** Make the policy change only inside the extras-selection block in [`generator.ts`](/Users/harish/workspace/food-planner/src/services/generator.ts).

**When to use:** First implementation step.

**Example:**
```ts
const requiredExtraCategories = [
  ...new Set(
    secondPassEffects
      .filter((e): e is RequireExtraEffect => e.kind === 'require_extra')
      .flatMap(e => e.categories),
  ),
];

if (locked?.extra_ids !== undefined) {
  selectedExtraIds.push(...locked.extra_ids);
} else {
  for (const category of requiredExtraCategories) {
    // keep current required-extra pick/warn behavior
  }
  // remove the post-requirement random-fill loop
}
```

### Pattern 2: Preserve Phase 12 boundaries
**What:** Do not change [`plan.ts`](/Users/harish/workspace/food-planner/src/types/plan.ts), [`food-db.ts`](/Users/harish/workspace/food-planner/src/services/food-db.ts), or Dexie migrations unless implementation uncovers a real contract mismatch.

**When to use:** Throughout planning and implementation.

**Why:** The persisted rule model already says `require_extra` is the only extra-specific effect. Phase 13 is correcting runtime behavior, not stored semantics.

### Pattern 3: Treat `extra_quantity_limits` as non-triggering
**What:** Leave `extra_quantity_limits` in place, but ensure it never causes extras to appear by itself.

**When to use:** In the generator edit and requirement wording.

**Why:** This is the narrowest reading of the locked context and avoids accidental regressions in explicit-requirement behavior.

### Anti-Patterns to Avoid
- **Rewriting compiled rule types:** There is no evidence that [`plan.ts`](/Users/harish/workspace/food-planner/src/types/plan.ts) needs a new schema change.
- **Changing locked extras behavior:** The Phase 13 context explicitly preserves `locked.extra_ids`.
- **Capping explicit requirements to zero when `extra_quantity_limits` is low:** That would create a new product rule and can silently break existing `require_extra` coverage.
- **Leaving the Phase 12 regression test untouched:** It currently encodes the opposite product behavior.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Extra-policy toggle system | New flags or config layer for optional extras | Direct branch removal in `generate()` | The product rule is explicit and current code already has a single fallback branch to delete |
| Persistence cleanup | New migration or normalization pass | Existing Phase 12 persisted rule model | No stored-data change is required if only runtime selection changes |
| Verification | Manual ad hoc browser checking only | Focused `generator.test.ts` regression cases plus `npm test` | Existing suite already covers this runtime seam well |

**Key insight:** Phase 13 is safest when handled as subtraction. The current bug is a leftover fallback path, not a missing subsystem.

## Key Files

| File | Why It Matters | Expected Change |
|------|----------------|-----------------|
| [`generator.ts`](/Users/harish/workspace/food-planner/src/services/generator.ts) | Contains the current required-extra pass plus the unwanted random-fill fallback | Remove fallback fill for unlocked slots; preserve locked extras and explicit requirement warnings |
| [`generator.test.ts`](/Users/harish/workspace/food-planner/src/services/generator.test.ts) | Contains both the contradictory Phase 12 regression and the locked/required-extra coverage that must stay green | Rewrite no-rule expectation to empty `extra_ids`; add/adjust focused regressions around require-only behavior |
| [`13-CONTEXT.md`](/Users/harish/workspace/food-planner/.planning/phases/13-only-include-extras-when-explicitly-required/13-CONTEXT.md) | Locks runtime scope and planner discretion | Copy directly into plan assumptions; do not widen scope |
| [`REQUIREMENTS.md`](/Users/harish/workspace/food-planner/.planning/REQUIREMENTS.md) | Needs new Phase 13 IDs for traceability if planner updates central requirements | Add PH13 requirement entries during planning/execution if that is part of the repo’s normal workflow |
| [`ROADMAP.md`](/Users/harish/workspace/food-planner/.planning/ROADMAP.md) | Phase 13 currently has TBD requirements | Planner should replace TBD with the chosen PH13 IDs |

## Plan Split Recommendation

Recommend **2 plans**.

1. `13-01-PLAN.md` — Runtime behavior change
   Focus on [`generator.ts`](/Users/harish/workspace/food-planner/src/services/generator.ts), remove unlocked random extra fill, preserve `require_extra` and locked extras, and decide the minimal retained role of `extra_quantity_limits`.

2. `13-02-PLAN.md` — Regression and traceability update
   Rewrite contradictory generator tests, add explicit no-extra-by-default coverage, keep locked/required-extra regressions, and update planning/requirements artifacts for Phase 13 IDs and success criteria.

Reason for split: the code change is small, but the current test suite contains opposite expectations from Phase 12. Separating runtime edit from regression/traceability work gives the planner a clean checkpoint.

## Common Pitfalls

### Pitfall 1: Breaking locked extras while removing random extras
**What goes wrong:** `locked.extra_ids` gets cleared or merged with generated extras differently.
**Why it happens:** The unlocked and locked branches are adjacent in the same extras-selection block.
**How to avoid:** Keep the `if (locked?.extra_ids !== undefined)` branch intact and assert exact equality in tests.
**Warning signs:** Existing locked-extra regression at [`generator.test.ts`](/Users/harish/workspace/food-planner/src/services/generator.test.ts#L788) starts failing.

### Pitfall 2: Accidentally changing explicit `require_extra` semantics
**What goes wrong:** Required extras stop appearing, stop deduplicating, or start respecting a new cap that was not previously enforced.
**Why it happens:** The current required and optional branches are interleaved.
**How to avoid:** Remove only the fallback loop after required categories are processed.
**Warning signs:** Existing `TMPL-05-*` tests begin failing, especially multiple-category required-extra coverage.

### Pitfall 3: Treating `extra_quantity_limits` as a trigger
**What goes wrong:** Slots still receive extras because a numeric limit exists even without `require_extra`.
**Why it happens:** The old implementation uses remaining limit capacity as permission to fill.
**How to avoid:** Keep limits non-triggering; they may remain as metadata or future ceiling logic, but not as a default fill signal.
**Warning signs:** A no-rule/no-require test still returns non-empty `extra_ids`.

## Code Examples

Verified patterns from current repo:

### Locked extras bypass generation
```ts
// Source: src/services/generator.ts
if (locked?.extra_ids !== undefined) {
  selectedExtraIds.push(...locked.extra_ids);
}
```

### Current branch to delete
```ts
// Source: src/services/generator.ts
const remaining = maxExtras - selectedExtraIds.length;
if (remaining > 0 && eligibleExtras.length > 0) {
  const pool = eligibleExtras.filter(e => !selectedExtraIds.includes(e.id!));
  // random optional extras are currently filled here
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `exclude_extra` plus optional/random extras | `require_extra` is the only extra-specific rule effect, but runtime still fills optional extras | Phase 12 on 2026-03-28 | Stored semantics are stricter than runtime output |
| Empty extra rule state meant “unconstrained extras” in tests | Phase 13 target is “no generated extras by default” | Planned for Phase 13 | Generator output becomes more predictable and rule-driven |

**Deprecated/outdated:**
- The regression `"without require_extra, compatible extras stay unconstrained"` in [`generator.test.ts`](/Users/harish/workspace/food-planner/src/services/generator.test.ts) is outdated for Phase 13 and must be replaced.

## Open Questions

1. **Should `extra_quantity_limits` constrain explicit requirements at all?**
   - What we know: current code ignores the limit for required extras and uses it only for fallback random fill.
   - What's unclear: whether future planners want the limit to remain purely vestigial after fallback removal.
   - Recommendation: do not change explicit-requirement semantics in Phase 13; leave `extra_quantity_limits` untouched and non-triggering.

2. **Do any non-generator surfaces promise optional extras today?**
   - What we know: current provided context points only to generator/runtime and tests.
   - What's unclear: whether any UI copy, export snapshot, or board rendering assumes extras appear by default.
   - Recommendation: planner should run a targeted repo grep and only widen scope if a concrete user-visible contract is found.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `^4.1.0` |
| Config file | `package.json` scripts; no separate config file detected in loaded context |
| Quick run command | `npx vitest run src/services/generator.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PH13-01 | No matching `require_extra` means unlocked slot ends with `extra_ids: []` | unit/service | `npx vitest run src/services/generator.test.ts -t "without require_extra"` | ✅ |
| PH13-02 | Explicit `require_extra` still injects matching compatible extras | unit/service | `npx vitest run src/services/generator.test.ts -t "TMPL-05"` | ✅ |
| PH13-03 | Locked `extra_ids` survive unchanged | unit/service | `npx vitest run src/services/generator.test.ts -t "locked extra_ids"` | ✅ |
| PH13-04 | Only unsatisfied explicit `require_extra` emits extra-related warnings | unit/service | `npx vitest run src/services/generator.test.ts -t "require_extra_category with no eligible extras"` | ✅ |

### Sampling Rate
- **Per task commit:** `npx vitest run src/services/generator.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- None for framework setup. Existing generator test infrastructure already covers this phase.
- Replace the outdated Phase 12 regression with the new empty-by-default assertion before implementation is considered complete.

## Sources

### Primary (HIGH confidence)
- [`13-CONTEXT.md`](/Users/harish/workspace/food-planner/.planning/phases/13-only-include-extras-when-explicitly-required/13-CONTEXT.md) - locked phase scope, default-extra policy, and preserved locked-slot behavior
- [`generator.ts`](/Users/harish/workspace/food-planner/src/services/generator.ts) - current extra-selection control flow and warning behavior
- [`generator.test.ts`](/Users/harish/workspace/food-planner/src/services/generator.test.ts) - contradictory regression, locked-slot coverage, and existing required-extra tests
- [`plan.ts`](/Users/harish/workspace/food-planner/src/types/plan.ts) - compiled effect schema showing `require_extra` as the only extra-specific effect
- [`db/client.ts`](/Users/harish/workspace/food-planner/src/db/client.ts) - confirms Phase 12 migration already normalized legacy extra semantics
- [`12-RESEARCH.md`](/Users/harish/workspace/food-planner/.planning/phases/12-require-extra-explicitly-instead-of-excluding-extra-categories-by-default/12-RESEARCH.md) - prior rationale for require-or-none semantics and migration boundary
- [`12-VERIFICATION.md`](/Users/harish/workspace/food-planner/.planning/phases/12-require-extra-explicitly-instead-of-excluding-extra-categories-by-default/12-VERIFICATION.md) - confirms persistence/runtime cleanup already passed in Phase 12

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - derived from local project files and existing test/runtime setup
- Architecture: HIGH - directly verified from current generator and migration code
- Pitfalls: HIGH - based on explicit contradictions between Phase 13 context and current tests/runtime branch

**Research date:** 2026-03-28
**Valid until:** 2026-04-27
