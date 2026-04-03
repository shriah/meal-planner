---
phase: 20-compatibility-regression-coverage
status: approved
nyquist_compliant: true
wave_0_complete: true
last_updated: 2026-04-01
---

# Phase 20 Validation

## Scope

Phase 20 validates milestone-wide curry compatibility regression coverage:
- actual migration/backfill proof plus one dedicated backbone regression prove legacy upgrade behavior, default generation, explicit overrides, and locked/manual preservation follow one contract
- focused service and generator regressions prove rename/delete normalization stays correct through downstream runtime behavior
- focused library, picker, and store regressions prove the same contract remains visible in editing, picker grouping, and persisted explicit intent
- this phase adds proof only; it does not add new curry compatibility behavior, override vocabulary, or fallback rules

Out of scope for this phase:
- new compatibility features, override vocabulary, or fallback behavior
- curry-vs-subzi composition changes
- manual verification unless execution reveals a real UI-only gap

## Requirement Map

| Requirement | Proof Layer | Validation Target | Command |
|---|---|---|---|
| CURRY-08 | Backbone run | Actual migration/backfill proof plus the dedicated compatibility regression lock the milestone-wide contract | `npx vitest run src/db/migrations.test.ts src/services/curry-compatibility-regression.test.ts` |
| CURRY-08 | Supporting seam run | Rename/delete runtime proof and downstream library/picker/store seams stay aligned with the same contract | `npx vitest run src/services/food-db.test.ts src/services/generator.test.ts src/components/plan/MealPickerSheet.test.tsx src/stores/plan-store.test.ts src/components/library/ComponentForm.test.tsx src/components/library/ComponentRow.test.tsx` |
| CURRY-08 | Phase gate | The focused phase suite and full regression gate both stay green before approval | `npx vitest run src/db/migrations.test.ts src/services/curry-compatibility-regression.test.ts src/services/food-db.test.ts src/services/generator.test.ts src/components/plan/MealPickerSheet.test.tsx src/stores/plan-store.test.ts src/components/library/ComponentForm.test.tsx src/components/library/ComponentRow.test.tsx && npm test` |

## Validation Commands

### Focused commands

```bash
npx vitest run src/db/migrations.test.ts src/services/curry-compatibility-regression.test.ts
npx vitest run src/services/food-db.test.ts src/services/generator.test.ts src/components/plan/MealPickerSheet.test.tsx src/stores/plan-store.test.ts src/components/library/ComponentForm.test.tsx src/components/library/ComponentRow.test.tsx
rg -n "status: approved|CURRY-08|migrations.test.ts|curry-compatibility-regression.test.ts|food-db.test.ts|generator.test.ts|MealPickerSheet.test.tsx|plan-store.test.ts|ComponentForm.test.tsx|ComponentRow.test.tsx|npm test" .planning/phases/20-compatibility-regression-coverage/20-VALIDATION.md
```

### Phase gate

```bash
npx vitest run src/db/migrations.test.ts src/services/curry-compatibility-regression.test.ts src/services/food-db.test.ts src/services/generator.test.ts src/components/plan/MealPickerSheet.test.tsx src/stores/plan-store.test.ts src/components/library/ComponentForm.test.tsx src/components/library/ComponentRow.test.tsx
npm test
```

## Wave 0 Coverage

- [x] `src/db/migrations.test.ts` and `src/services/curry-compatibility-regression.test.ts` prove the upgrade path and milestone backbone contract across actual migration/backfill behavior, default generation, explicit overrides, and locked/manual preservation
- [x] `src/services/food-db.test.ts` and `src/services/generator.test.ts` prove rename/delete normalization survives into downstream runtime behavior
- [x] `src/components/plan/MealPickerSheet.test.tsx`, `src/stores/plan-store.test.ts`, `src/components/library/ComponentForm.test.tsx`, and `src/components/library/ComponentRow.test.tsx` prove downstream library and picker/store seams still align with the same contract

## Approval Standard

This phase is approved when:
- the backbone regression passes
- the focused supporting seam command passes
- the phase gate command passes
- this document is updated from pending to approved with current rerun evidence

## Rerun Evidence

- 2026-04-01: `npx vitest run src/db/migrations.test.ts src/services/curry-compatibility-regression.test.ts` passed with 2 files and 9 tests green.
- 2026-04-01: `npx vitest run src/services/food-db.test.ts src/services/generator.test.ts src/components/plan/MealPickerSheet.test.tsx src/stores/plan-store.test.ts src/components/library/ComponentForm.test.tsx src/components/library/ComponentRow.test.tsx` passed with 6 files and 111 tests green.
- 2026-04-01: combined focused phase gate passed with 8 files and 120 tests green.
- 2026-04-01: `npm test` passed with 23 files and 207 tests green.

---
*Validation contract created: 2026-04-01*
