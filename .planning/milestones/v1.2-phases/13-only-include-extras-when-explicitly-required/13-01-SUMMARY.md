---
phase: 13
plan: 01
title: Remove unlocked default extra fill
completed: 2026-03-28
requirements:
  - PH13-01
  - PH13-02
  - PH13-03
  - PH13-04
files:
  - src/services/generator.ts
  - src/services/generator.test.ts
  - .planning/phases/13-only-include-extras-when-explicitly-required/13-VALIDATION.md
---

# Plan 13-01 Summary

Removed the generator's unlocked random extra-fill path. Unlocked slots now keep `extra_ids: []` unless a matching `require_extra` rule adds extras; locked `extra_ids` still pass through unchanged, and unsatisfied explicit requirements keep the existing warning path.

## Verification

- `npx vitest run src/services/generator.test.ts`
- `npm test`
