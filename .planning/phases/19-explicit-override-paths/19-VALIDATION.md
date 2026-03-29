---
phase: 19-explicit-override-paths
status: pending
nyquist_compliant: false
wave_0_complete: false
last_updated: 2026-03-30
---

# Phase 19 Validation

## Scope

Phase 19 validates the explicit override paths layered on top of the Phase 18 compatible-by-default contract:
- the curry picker exposes incompatible curries as explicit manual override choices
- manual incompatible curry selections persist exactly and survive lock/regenerate flows
- scoped `require_one` rules can intentionally produce incompatible curry/base pairings through exact-component and compatibility-first tag overrides
- outside manual/locked and scoped `require_one` overrides, default compatibility remains strict, including broad curry rules that still stay inside compatible pools

Out of scope for this phase:
- special board badges or warning styling for explicit overrides
- new dedicated override rule vocabulary beyond the existing `require_one` path
- milestone-wide regression sweep beyond the focused override commands and phase gate

## Requirement Map

| Requirement | Validation Target | Command |
|---|---|---|
| CURRY-05 | Curry picker groups compatible/incompatible choices appropriately and manual/locked incompatible selections persist through regenerate | `npx vitest run src/components/plan/MealPickerSheet.test.tsx src/stores/plan-store.test.ts src/services/generator.test.ts` |
| CURRY-06 | Scoped `require_one` can force an exact incompatible curry, tag rules stay compatibility-first before incompatible fallback, and broad curry rules remain compatibility-scoped | `npx vitest run src/services/generator.test.ts` |

## Validation Commands

### Focused commands

```bash
npx vitest run src/components/plan/MealPickerSheet.test.tsx
npx vitest run src/stores/plan-store.test.ts
npx vitest run src/services/generator.test.ts
npx vitest run src/components/plan/MealPickerSheet.test.tsx src/stores/plan-store.test.ts src/services/generator.test.ts
rg -n "status: pending|CURRY-05|CURRY-06|MealPickerSheet.test.tsx|plan-store.test.ts|generator.test.ts|npm test" .planning/phases/19-explicit-override-paths/19-VALIDATION.md
```

### Phase gate

```bash
npx vitest run src/components/plan/MealPickerSheet.test.tsx src/stores/plan-store.test.ts src/services/generator.test.ts
npm test
```

## Wave 0 Coverage

- [ ] `src/components/plan/MealPickerSheet.test.tsx` proves grouped compatible/incompatible curry sections and flat-list fallback when no compatible curries exist
- [ ] `src/stores/plan-store.test.ts` proves manual incompatible curry persistence and regenerate lock wiring
- [ ] `src/services/generator.test.ts` proves specific-component and tag-based `require_one` override semantics while default compatibility remains strict

## Approval Standard

This phase is approved when:
- the focused picker, store, and generator commands above pass
- the phase gate command passes
- this document is updated from pending to approved with current rerun evidence

## Rerun Evidence

- 2026-03-30: `npx vitest run src/services/generator.test.ts` passed during `19-02-PLAN.md` execution, covering exact-component override, compatibility-first tag fallback, and broad-rule guardrails for CURRY-06.
- Pending phase verification reruns: `npx vitest run src/components/plan/MealPickerSheet.test.tsx src/stores/plan-store.test.ts src/services/generator.test.ts` and `npm test`.

---
*Validation contract created: 2026-03-30*
