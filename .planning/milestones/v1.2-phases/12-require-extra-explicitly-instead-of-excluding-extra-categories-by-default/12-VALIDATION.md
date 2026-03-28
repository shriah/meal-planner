---
phase: 12
slug: require-extra-explicitly-instead-of-excluding-extra-categories-by-default
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-28
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `^4.1.0` |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run src/services/rule-compiler.test.ts src/db/migrations.test.ts src/components/rules/form-state.test.ts src/components/rules/ruleDescriptions.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~25 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/services/rule-compiler.test.ts src/db/migrations.test.ts src/components/rules/form-state.test.ts src/components/rules/ruleDescriptions.test.ts`
- **After every plan wave:** Run `npx vitest run src/services/generator.test.ts src/components/rules/RuleForm.test.tsx src/components/rules/RuleRow.test.tsx`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 25 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | PH12-01 | unit | `npx vitest run src/components/rules/form-state.test.ts` | ✅ | ✅ green |
| 12-01-02 | 01 | 1 | PH12-01 | component | `npx vitest run src/components/rules/RuleForm.test.tsx src/components/rules/RuleRow.test.tsx` | ✅ | ✅ green |
| 12-02-01 | 02 | 2 | PH12-02, PH12-05 | unit | `npx vitest run src/services/rule-compiler.test.ts src/components/rules/ruleDescriptions.test.ts` | ✅ | ✅ green |
| 12-02-02 | 02 | 2 | PH12-03 | unit | `npx vitest run src/db/migrations.test.ts` | ✅ | ✅ green |
| 12-03-01 | 03 | 3 | PH12-04 | integration | `npx vitest run src/services/generator.test.ts src/components/rules/RuleForm.test.tsx src/components/rules/RuleRow.test.tsx` | ✅ | ✅ green |
| 12-03-02 | 03 | 3 | PH12-01, PH12-02, PH12-03, PH12-04, PH12-05 | full suite | `npm test` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Update `src/db/migrations.test.ts` to prove legacy meal-template data and already-compiled rules both lose old extra-exclusion semantics.
- [x] Update `src/services/rule-compiler.test.ts` and `src/components/rules/form-state.test.ts` to remove obsolete extra-exclusion expectations.
- [x] Replace old generator assertions with require-or-none coverage and explicit `require_extra` warning checks only.
- [x] Add UI assertions confirming no exclude-extra controls render in create or edit mode.
- [x] Update `src/components/rules/ruleDescriptions.test.ts` so meal-template descriptions mention only required extras.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Existing edited meal-template rules no longer show exclude-extra controls and saving them keeps extras unconstrained unless require-extra is selected | PH12-01, PH12-03 | Requires visual confirmation across create/edit flows after persisted data normalization | Open create and edit rule UI for meal-template rules, confirm exclude-extra controls are absent, leave require-extra empty, save, and verify regenerated plans do not emit extra warnings or imply hidden extra constraints |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 25s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-28
