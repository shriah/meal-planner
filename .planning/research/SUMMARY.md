# Project Research Summary

**Project:** Indian Food Planner v1.3 Curry Base Compatibility
**Domain:** Local-first Indian weekly meal planner
**Researched:** 2026-03-29
**Confidence:** HIGH

## Executive Summary

`v1.3` is a narrow compatibility milestone, not a planner redesign. The right implementation is to extend the existing local-first stack and data model so curry records store compatible base category IDs, backfill legacy curry rows in-app, and enforce that compatibility inside the existing synchronous generator after base selection. No new packages, backend, or composition engine changes are needed.

The milestone should behave as a default-safe system with explicit exceptions. Auto-generation should only pick curries compatible with the chosen base. The library form and manual picker should expose the same compatibility model so users can edit it and understand it. Existing curry data should be backfilled conservatively, with unmatched legacy rows defaulting to all current base categories so upgrades do not break existing libraries.

The main risk is semantic drift: if compatibility becomes half generator logic, half accidental rule behavior, users will not understand when incompatible pairings are allowed. The clean boundary is to keep compatibility as a hard default constraint and allow bypass only through explicit mechanisms already consistent with current product behavior: `require_one`, manual swap with an intentional “show incompatible” action, and preserved locked/manual state. Do not expand scope into subzi composition or a new generic compatibility rule language.

## Key Findings

### Recommended Stack

This milestone stays on the current stack from [PROJECT.md](/Users/harish/workspace/food-planner/.planning/PROJECT.md): Next.js 16.2.0, React 19.2.4, TypeScript 5.x, Dexie 4.3.0, Zustand 5.0.12, Zod 4.3.6, and shadcn/ui. The change is primarily schema, migration, generator, and UI wiring.

**Core technologies:**
- `Dexie` — add a `v12` upgrade/backfill path for curry compatibility on existing component rows.
- `TypeScript` — keep `ComponentRecord`, generator helpers, and rule/manual override semantics type-safe.
- `Zustand` — preserve current plan-board/manual swap flow; only make curry selection base-aware.

**Stack/schema additions:**
- Add `compatible_base_category_ids: number[]` to curry `ComponentRecord`s.
- Keep category IDs canonical; do not add new string alias fields or a join table.
- Reuse existing category normalization so deleted base IDs are stripped from curry compatibility arrays.
- Add an idempotent in-app backfill path for legacy curries; no dependency additions.

### Expected Features

The table-stakes behavior is consistent across library authoring, generation, and manual editing. Users should be able to define curry compatibility in the library, upgrade without rebuilding their curry library, and trust that auto-generation and picker behavior agree.

**Must have (table stakes):**
- Curry create/edit shows compatible base categories and saves them on the curry row.
- Existing curries are backfilled in-app so upgrade does not break the seeded or user library.
- Auto-generation filters curry candidates by selected base as a hard default.
- Manual curry selection defaults to compatible options for the current base.
- Explicit exceptional pairings remain possible, but only through obvious user intent.
- Empty or missing compatible-curry states produce clear warnings and repair paths.

**Should have (if cheap):**
- Compatibility labels in library rows or picker UI.
- Review affordance for backfilled/inferred curry compatibility.

**Defer:**
- Subzi compatibility or curry-vs-subzi composition modes.
- Compatibility scoring, AI inference, or broader recommendation logic.
- A new generic compatibility override rule system.

### Architecture Approach

Compatibility belongs on the curry record and should be enforced inside the generator’s curry-pool construction immediately after base selection. The override boundary should stay explicit and narrow: normal generator flow, `filter_pool`, and `exclude` stay compatibility-respecting; only `require_one`, manual picker override, and preserved locked/manual state may bypass the default. This keeps precedence understandable and avoids inventing a second rule system.

**Major components:**
1. `ComponentRecord` + Dexie migration/backfill — persist canonical curry compatibility arrays.
2. Generator + helper seam — build the compatible curry pool, warn on empty pools, never silently relax.
3. Library form + picker UI — edit compatibility and make manual incompatible choices deliberate.

### Critical Pitfalls

1. **Compatibility turns into a second rule system** — keep one precedence contract: compatible-by-default, explicit override only.
2. **Override semantics leak into normal rules** — do not broaden `filter_pool`/`exclude`; only explicit override paths may bypass compatibility.
3. **Dual ID/string storage drifts** — treat `compatible_base_category_ids` as canonical and avoid new legacy mirrors.
4. **Backfill guesses silently become truth** — use conservative defaults, preferably curated seed mappings plus all-base fallback for unknown legacy curries.
5. **Generator and picker diverge** — manual selection must be compatible-first with a visible incompatible override path.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Schema And Backfill
**Rationale:** Everything else depends on stable migrated data and a canonical field.
**Delivers:** `compatible_base_category_ids` on curry rows, Dexie `v12`, delete normalization, idempotent legacy backfill.
**Addresses:** Library compatibility storage, existing-data upgrade behavior.
**Avoids:** Mixed ID/string storage, permanent tri-state data, silent upgrade breakage.

### Phase 2: Generator Compatibility Contract
**Rationale:** The milestone’s core value is generation correctness, so semantics should settle before UI polish.
**Delivers:** Base-aware curry pool filtering, empty-pool warnings, no silent fallback to incompatible curries.
**Addresses:** Hard-default auto-generation behavior.
**Avoids:** Compatibility becoming a soft suggestion or scattered generator special cases.

### Phase 3: Explicit Override Boundary
**Rationale:** Exceptional pairings need a clear contract before UI work exposes them.
**Delivers:** Roadmap should treat `require_one`, manual incompatible picker reveal, and preserved locked/manual state as the only override paths.
**Addresses:** Rule/manual override requirement without expanding the rule model.
**Avoids:** Accidental override semantics and scope creep into a new compatibility rule language.

### Phase 4: Library And Picker UX Alignment
**Rationale:** Once semantics are stable, expose them consistently in authoring and editing flows.
**Delivers:** Curry compatibility checklist in the library, compatibility display, compatible-first picker, explicit “show incompatible” action.
**Addresses:** Table-stakes editability and picker/generator consistency.
**Avoids:** User confusion when manual edits can create states generation would never choose.

### Phase 5: Regression Coverage
**Rationale:** This milestone crosses migration, generator, picker, and lock flows; clean-install testing is not enough.
**Delivers:** Upgrade fixtures, generator override tests, delete-category cleanup tests, locked/manual exception tests.
**Addresses:** Upgrade safety and behavior consistency.
**Avoids:** Shipping a feature that passes only on fresh databases.

### Phase Ordering Rationale

- Data first, because generator correctness is meaningless if upgraded curry rows are ambiguous.
- Generator semantics second, because UI should reflect settled behavior rather than define it.
- Override boundary before UX details, so manual and rule flows expose the same contract.
- UI after semantics, then regression across upgraded and locked-state paths.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** Backfill policy for seeded vs user-authored curries needs a concrete curated mapping decision.
- **Phase 4:** Picker copy/badging for incompatible selections may need small UX iteration.

Phases with standard patterns (skip research-phase):
- **Phase 2:** Generator filtering and warning flow follow established repo patterns.
- **Phase 5:** Regression scope is clear from existing migration and generator test seams.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Mostly repo-grounded; no new infrastructure or libraries required. |
| Features | MEDIUM | User expectations are clear, but some UX polish patterns are inferred from adjacent planner products. |
| Architecture | HIGH | Strongly grounded in existing repo seams and current extras/category patterns. |
| Pitfalls | HIGH | Risks are concrete and come directly from migration, generator, picker, and rules interactions already present in the codebase. |

**Overall confidence:** HIGH

### Gaps to Address

- Seed backfill specificity: decide which shipped curries get curated category mappings versus all-base fallback.
- Inferred-data visibility: decide whether backfilled rows need a visible “review needed” state in `v1.3` or only clean warnings.
- Override messaging: confirm exact copy for “required incompatible curry”, “manual incompatible selection”, and “no compatible curry”.

## Sources

### Primary
- [PROJECT.md](/Users/harish/workspace/food-planner/.planning/PROJECT.md) — milestone goal, scope, current architecture, constraints
- [STACK.md](/Users/harish/workspace/food-planner/.planning/research/STACK.md) — schema and migration recommendations
- [FEATURES.md](/Users/harish/workspace/food-planner/.planning/research/FEATURES.md) — table-stakes behavior and milestone boundary
- [ARCHITECTURE.md](/Users/harish/workspace/food-planner/.planning/research/ARCHITECTURE.md) — integration seams and override boundary
- [PITFALLS.md](/Users/harish/workspace/food-planner/.planning/research/PITFALLS.md) — failure modes and sequencing risks

### Supporting
- Dexie `Version.upgrade()` docs — in-place schema/data migration pattern
- Dexie `MultiEntry Index` docs — array-index query support for compatibility fields

---
*Research completed: 2026-03-29*
*Ready for roadmap: yes*
