---
phase: 12-require-extra-explicitly-instead-of-excluding-extra-categories-by-default
plan: 02
subsystem: rules-engine
tags: [compiler, descriptions, dexie, migration, vitest]
requires:
  - phase: 12-require-extra-explicitly-instead-of-excluding-extra-categories-by-default
    provides: require-extra-only UI state
provides:
  - compiler/decompiler normalization that drops legacy exclude-extra effects
  - user-facing rule descriptions that mention only required extras
  - Dexie v10 cleanup for persisted compiled rule rows
affects: [rule-persistence, migrations, descriptions, tests]
requirements-completed: [PH12-02, PH12-03, PH12-05]
completed: 2026-03-28
---

# Phase 12 Plan 02 Summary

Normalized persistence and copy so legacy extra exclusions cannot survive round-trips. `compileRule()` no longer emits `exclude_extra`, `decompileRule()` ignores legacy exclude data, descriptions no longer mention excluded extras, and Dexie v10 strips compiled `exclude_extra` effects from stored rules.

Focused verification passed:
- `npx vitest run src/services/rule-compiler.test.ts src/components/rules/ruleDescriptions.test.ts`
- `npx vitest run src/db/migrations.test.ts`

Key files:
- `src/services/rule-compiler.ts`
- `src/components/rules/ruleDescriptions.ts`
- `src/db/client.ts`
- `src/db/migrations.test.ts`

