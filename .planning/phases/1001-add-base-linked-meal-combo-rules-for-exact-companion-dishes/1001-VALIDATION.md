---
phase: 1001
slug: add-base-linked-meal-combo-rules-for-exact-companion-dishes
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-04
---

# Phase 1001 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- src/services/rule-compiler.test.ts src/components/rules/form-state.test.ts src/components/rules/RuleFormFields/RuleFields.test.tsx src/components/plan/MealPickerSheet.test.tsx src/stores/plan-store.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- src/services/rule-compiler.test.ts src/components/rules/form-state.test.ts src/components/rules/RuleFormFields/RuleFields.test.tsx src/components/plan/MealPickerSheet.test.tsx src/stores/plan-store.test.ts`
- **After every plan wave:** Run `npm test -- src/services/generator.test.ts src/components/rules/RuleForm.test.tsx src/components/rules/ruleDescriptions.test.ts src/components/rules/RuleRow.test.tsx src/stores/plan-store.test.ts`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1001-01-01 | 01 | 1 | PH1001-COMPILER | unit | `npm test -- src/services/rule-compiler.test.ts src/components/rules/form-state.test.ts` | ✅ | ⬜ pending |
| 1001-01-02 | 01 | 1 | PH1001-FORM | component | `npm test -- src/components/rules/RuleForm.test.tsx src/components/rules/RuleFormFields/RuleFields.test.tsx` | ✅ | ⬜ pending |
| 1001-02-01 | 02 | 2 | PH1001-GENERATOR | unit | `npm test -- src/services/generator.test.ts` | ✅ | ⬜ pending |
| 1001-02-02 | 02 | 2 | PH1001-MANUAL | unit | `npm test -- src/stores/plan-store.test.ts` | ✅ | ⬜ pending |
| 1001-03-01 | 03 | 3 | PH1001-RULE-LIST | component | `npm test -- src/components/rules/ruleDescriptions.test.ts src/components/rules/RuleRow.test.tsx` | ✅ | ⬜ pending |
| 1001-03-02 | 03 | 3 | PH1001-GATE | integration | `npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/services/rule-compiler.test.ts` — existing file will be extended for combo compile/decompile and broken-reference cases
- [x] `src/services/generator.test.ts` — existing file will be extended for base-category vs base-component precedence, partial broken-reference warnings, and combo-owned-slot protection
- [x] `src/components/rules/RuleForm.test.tsx` — existing file will be extended for combo create/edit flow coverage
- [x] `src/components/rules/RuleFormFields/RuleFields.test.tsx` — existing file will be extended to cover exact companion pickers and category/component targeting
- [x] `src/components/rules/ruleDescriptions.test.ts` — existing file will be extended for combo rule summaries
- [x] `src/stores/plan-store.test.ts` — existing file will be extended to prove locked/manual companion slots survive combo regeneration

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-04
