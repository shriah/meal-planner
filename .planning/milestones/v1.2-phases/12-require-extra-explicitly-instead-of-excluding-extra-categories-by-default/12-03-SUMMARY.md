---
phase: 12-require-extra-explicitly-instead-of-excluding-extra-categories-by-default
plan: 03
subsystem: generator
tags: [schema, generator, validation, vitest]
requires:
  - phase: 12-require-extra-explicitly-instead-of-excluding-extra-categories-by-default
    provides: normalized compiler and stored rule data
provides:
  - runtime schema without exclude-extra support
  - require-or-none generator behavior for extras
  - finalized Nyquist validation contract for the phase
affects: [generator, rule-schema, validation, tests]
requirements-completed: [PH12-04]
completed: 2026-03-28
---

# Phase 12 Plan 03 Summary

Removed the runtime `exclude_extra` path from the compiled rule schema and generator. Extras are now unconstrained unless a rule explicitly requires a category, and the only extra-specific warning path is the existing unsatisfied `require_extra` warning.

Focused verification passed:
- `npx vitest run src/services/generator.test.ts src/components/rules/RuleForm.test.tsx src/components/rules/RuleRow.test.tsx`
- `npm test`

Key files:
- `src/types/plan.ts`
- `src/services/generator.ts`
- `src/services/generator.test.ts`
- `.planning/phases/12-require-extra-explicitly-instead-of-excluding-extra-categories-by-default/12-VALIDATION.md`

