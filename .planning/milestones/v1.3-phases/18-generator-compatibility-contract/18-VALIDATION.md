---
phase: 18-generator-compatibility-contract
status: pending
nyquist_compliant: false
wave_0_complete: false
last_updated: 2026-03-29
---

# Phase 18 Validation

## Scope

Phase 18 validates the default generator contract for curry/base compatibility:
- automatic curry selection is constrained by the selected base category
- explicit zero-compatible curries never auto-generate
- no-compatible outcomes omit `curry_id` instead of silently relaxing to an incompatible curry
- omitted-curry warnings continue to flow through the existing warning banner and slot warning UI

Explicit incompatible overrides remain out of scope for this phase:
- manual picker restrictions or incompatible picker affordances belong to Phase 19
- locked/manual incompatible selections remain unchanged in Phase 18
- rule-based incompatible curry overrides belong to Phase 19

## Requirement Map

| Requirement | Validation Target | Command |
|---|---|---|
| CURRY-03 | Generator only auto-selects curries compatible with the chosen base, including `require_one` staying inside the compatible curry pool | `npx vitest run src/services/generator.test.ts` |
| CURRY-04 | No-compatible outcomes leave `curry_id` unset and surface the existing warning UI without changing manual/locked behavior | `npx vitest run src/services/generator.test.ts src/components/plan/PlanBoard.test.tsx src/components/plan/MealPickerSheet.test.tsx` |

## Validation Commands

### Focused commands

```bash
npx vitest run src/services/generator.test.ts
npx vitest run src/components/plan/PlanBoard.test.tsx src/components/plan/MealPickerSheet.test.tsx
rg -n "status: pending|CURRY-03|CURRY-04|npm test" .planning/phases/18-generator-compatibility-contract/18-VALIDATION.md
```

### Phase gate

```bash
npm test
```

## Wave 0 Coverage

- [ ] `src/services/generator.test.ts` proves compatibility-scoped curry auto-selection, explicit `[]` handling, skip-and-warn behavior, and `require_one` scoping
- [ ] `src/components/plan/PlanBoard.test.tsx` proves omitted-curry warnings still surface through the existing warning UI
- [ ] `src/components/plan/MealPickerSheet.test.tsx` reruns as a regression guard proving manual picker behavior remains untouched in Phase 18

## Approval Standard

This phase is approved when:
- the focused generator and plan warning tests above pass
- the phase gate command passes
- this document is updated from pending to approved with current rerun evidence

## Rerun Evidence

- 2026-03-29: `npx vitest run src/services/generator.test.ts`
- 2026-03-29: `npx vitest run src/components/plan/PlanBoard.test.tsx src/components/plan/MealPickerSheet.test.tsx`
- 2026-03-29: `npm test`
- Status remains `pending` during plan execution; Phase 19 override behavior and final approval promotion stay for dedicated phase verification.

---
*Validation contract created: 2026-03-29*
