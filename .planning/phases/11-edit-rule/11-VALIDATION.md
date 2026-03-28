---
phase: 11
slug: edit-rule
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 + Testing Library + happy-dom |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- src/components/rules/form-state.test.ts src/services/rule-compiler.test.ts src/services/food-db.test.ts src/components/rules/RuleRow.test.tsx` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~25 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task-local `<verify>` command first; use `npm test -- src/components/rules/form-state.test.ts src/services/rule-compiler.test.ts src/services/food-db.test.ts src/components/rules/RuleRow.test.tsx` as the cross-task smoke run before handoff
- **After every plan wave:** Run `npm test`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 25 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | EDIT-02 | unit | `npm test -- src/components/rules/form-state.test.ts` | ❌ W0 | ⬜ pending |
| 11-01-02 | 01 | 1 | EDIT-02 | unit | `npm test -- src/services/rule-compiler.test.ts` | `src/services/rule-compiler.test.ts` exists | ⬜ pending |
| 11-02-01 | 02 | 2 | EDIT-01 | component | `npm test -- src/services/food-db.test.ts src/components/rules/RuleRow.test.tsx` | `src/services/food-db.test.ts` exists; `src/components/rules/RuleRow.test.tsx` missing | ⬜ pending |
| 11-02-02 | 02 | 2 | EDIT-03, EDIT-04 | service + component | `npm test -- src/services/food-db.test.ts src/components/rules/RuleRow.test.tsx` | `src/services/food-db.test.ts` exists; `src/components/rules/RuleRow.test.tsx` missing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/components/rules/RuleRow.test.tsx` — open/save/discard interactions for edit sheet
- [ ] `src/services/rule-compiler.test.ts` — add `decompileRule` and round-trip cases for scheduling and meal-template-derived rules
- [ ] `src/services/food-db.test.ts` — assert updating name/compiled filter preserves row count and primary key

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Save failure shows a user-facing error surface if toast infrastructure is added in execution | EDIT-03 | Current repo has no existing toast system and implementation choice is still open | Trigger `updateRule` failure in the UI, verify the chosen error surface appears exactly once and the sheet remains open with draft values intact |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 25s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
