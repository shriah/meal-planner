---
phase: 21-wire-planboard-curry-override-flow
status: pending
nyquist_compliant: true
wave_0_complete: false
last_updated: 2026-04-02
---

# Phase 21 Validation

## Scope

Phase 21 validates the missed PlanBoard-to-picker seam from the v1.3 audit:
- opening the curry picker from the real weekly board forwards the selected slot's base-category context
- extras continue to reuse the same slot-derived base context after the board seam is corrected
- existing explicit override grouping and persisted manual override behavior remain proven by the picker and store regression suites already added in earlier phases

Out of scope for this phase:
- new picker props, override metadata, or store semantics
- broad compatibility cleanup outside the PlanBoard handoff
- Phase 20 metadata cleanup or milestone-wide test reshaping

## Requirement Map

| Requirement | Proof Layer | Validation Target | Command |
|---|---|---|---|
| CURRY-05 | Board seam regression | PlanBoard forwards slot base context into curry and extras pickers while base/subzi stay unchanged | `npx vitest run src/components/plan/PlanBoard.test.tsx` |
| CURRY-05 | Supporting override proof | Picker grouping and persisted manual override behavior still hold after the board handoff fix | `npx vitest run src/components/plan/MealPickerSheet.test.tsx src/stores/plan-store.test.ts` |
| CURRY-08 | Phase gate | The corrected board seam plus supporting picker/store proofs stay green in focused runs and the normal suite gate | `npx vitest run src/components/plan/PlanBoard.test.tsx src/components/plan/MealPickerSheet.test.tsx src/stores/plan-store.test.ts && npm test` |

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

- [ ] `src/components/plan/PlanBoard.test.tsx` proves the real board entrypoint forwards the selected slot base category into curry and extras picker flows while leaving base and subzi untouched
- [ ] `src/components/plan/MealPickerSheet.test.tsx` proves explicit override grouping still classifies compatible and incompatible curries correctly
- [ ] `src/stores/plan-store.test.ts` proves manual incompatible curry selections still persist through the existing swap and regenerate seams

## Approval Standard

This phase is approved when:
- the focused board seam command passes
- the supporting picker/store command passes
- the phase gate command passes
- this document is updated from pending to approved with current rerun evidence

## Rerun Evidence

- Pending - rerun the focused commands above and replace this section with dated evidence before approval.

---
*Validation contract created: 2026-04-02*
