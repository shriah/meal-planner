---
phase: 12-require-extra-explicitly-instead-of-excluding-extra-categories-by-default
plan: 01
subsystem: ui
tags: [rules, form-state, edit-flow, vitest]
requires:
  - phase: 11-edit-rule
    provides: shared create/edit rule flows and reversible rule prefill
provides:
  - require-extra-only form contract for meal-template rules
  - removal of exclude-extra controls from create and edit surfaces
  - regression coverage locking the UI to the new extra model
affects: [rules-ui, tests]
requirements-completed: [PH12-01]
completed: 2026-03-28
---

# Phase 12 Plan 01 Summary

Removed `exclude_extra_categories` from the active `RuleFormState`, reducer, and rule field UI. The create form and edit sheet now expose only `Require extra categories`, and the empty require array remains the explicit no-extras-logic state.

Focused verification passed:
- `npx vitest run src/components/rules/form-state.test.ts`
- `npx vitest run src/components/rules/RuleForm.test.tsx src/components/rules/RuleRow.test.tsx`

Key files:
- `src/components/rules/types.ts`
- `src/components/rules/form-state.ts`
- `src/components/rules/RuleFormFields/RuleFields.tsx`
- `src/components/rules/RuleForm.test.tsx`
- `src/components/rules/RuleRow.test.tsx`

