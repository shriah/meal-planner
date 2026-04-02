---
phase: 21-wire-planboard-curry-override-flow
status: pending
nyquist_compliant: true
wave_0_complete: false
last_updated: 2026-04-02
---

# Phase 21 Validation

## Scope

Phase 21 validates the narrow audit gap in the real PlanBoard curry override entrypoint:
- the weekly board passes the selected slot's base-category context into the curry picker
- the picker continues to classify compatible vs explicit override curries using that board-provided context
- the existing manual/locked store path continues to preserve explicit incompatible curry intent after the board handoff is corrected

Out of scope for this phase:
- new compatibility features or broader picker redesign
- Phase 18 validation debt cleanup
- Phase 20 malformed metadata cleanup

## Requirement Map

| Requirement | Validation Target | Command |
|---|---|---|
| CURRY-05 | Real board -> picker curry flow passes `currentBaseCategoryId`, while the existing picker/store seams still allow explicit incompatible overrides to be chosen and preserved | `npx vitest run src/components/plan/PlanBoard.test.tsx` plus `npx vitest run src/components/plan/MealPickerSheet.test.tsx src/stores/plan-store.test.ts` |
| CURRY-08 | Regression coverage explicitly includes the board-to-picker seam that the v1.3 audit found missing | `npx vitest run src/components/plan/PlanBoard.test.tsx` |

## Validation Commands

### Focused commands

```bash
npx vitest run src/components/plan/PlanBoard.test.tsx
npx vitest run src/components/plan/MealPickerSheet.test.tsx src/stores/plan-store.test.ts
rg -n "status: pending|CURRY-05|CURRY-08|PlanBoard.test.tsx|MealPickerSheet.test.tsx|plan-store.test.ts|npm test" .planning/phases/21-wire-planboard-curry-override-flow/21-VALIDATION.md
```

### Phase gate

```bash
npx vitest run src/components/plan/PlanBoard.test.tsx src/components/plan/MealPickerSheet.test.tsx src/stores/plan-store.test.ts
npm test
```

## Wave 0 Coverage

- [ ] `src/components/plan/PlanBoard.test.tsx` proves the board forwards slot base-category context into the curry picker instead of only wiring extras
- [ ] `src/components/plan/MealPickerSheet.test.tsx` proves the picker still renders compatible vs override sections when it receives base context
- [ ] `src/stores/plan-store.test.ts` proves explicit incompatible curry selections still persist and flow through locked regenerate unchanged

## Approval Standard

This phase is approved when:
- the focused board seam command passes
- the supporting picker/store command passes
- the phase gate command passes
- this document is updated from pending to approved with current rerun evidence

## Rerun Evidence

- 2026-04-02: Pending execution

---
*Validation contract created: 2026-04-02*
