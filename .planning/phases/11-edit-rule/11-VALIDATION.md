---
phase: 11
slug: edit-rule
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-27
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `4.1.0` + Testing Library + happy-dom |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run src/components/rules/form-state.test.ts src/services/rule-compiler.test.ts src/services/food-db.test.ts src/components/rules/RuleRow.test.tsx` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~25 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task-local `<automated>` command, then rerun the focused Phase 11 suite: `npx vitest run src/components/rules/form-state.test.ts src/services/rule-compiler.test.ts src/services/food-db.test.ts src/components/rules/RuleRow.test.tsx`
- **After every plan wave:** Run `npm test`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 25 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | EDIT-02 | unit | `npx vitest run src/components/rules/form-state.test.ts` | ✅ | ✅ green |
| 11-01-02 | 01 | 1 | EDIT-02 | unit | `npx vitest run src/services/rule-compiler.test.ts` | ✅ | ✅ green |
| 11-02-01 | 02 | 2 | EDIT-01 | component | `npx vitest run src/components/rules/RuleRow.test.tsx` | ✅ | ✅ green |
| 11-02-02 | 02 | 2 | EDIT-03, EDIT-04 | service + component | `npx vitest run src/services/food-db.test.ts src/components/rules/RuleRow.test.tsx` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Coverage

- `src/components/rules/form-state.test.ts` covers the shared reducer, preset loading, and validation behavior reused by create and edit flows.
- `src/services/rule-compiler.test.ts` covers `decompileRule` plus compile/decompile round-trips for persisted scheduling and meal-template rule shapes.
- `src/services/food-db.test.ts` proves `updateRule` overwrites the existing Dexie row in place without changing row count, primary key, or `created_at`.
- `src/components/rules/RuleRow.test.tsx` covers opening the edit sheet, pre-population from persisted data, save-overwrite behavior, discard on close/Escape/button, and save-failure feedback.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Inline edit sheet still feels correct in-browser on `/rules` after automated regressions pass | EDIT-01, EDIT-04 | Helpful UI sanity check for sheet presentation and focus handling, but not required for correctness because the core open/save/discard/failure flows are covered by automated tests | Open `/rules`, launch Edit on an existing rule, confirm the sheet opens on the same page, then cancel and reopen to verify the persisted values return |

---

## Rerun Evidence

| Date | Command | Result |
|------|---------|--------|
| 2026-03-29 | `npx vitest run src/components/rules/form-state.test.ts src/services/rule-compiler.test.ts` | 2 files passed, 11 tests passed |
| 2026-03-29 | `npx vitest run src/services/food-db.test.ts src/components/rules/RuleRow.test.tsx` | 2 files passed, 7 tests passed |
| 2026-03-29 | `npx vitest run src/components/rules/form-state.test.ts src/services/rule-compiler.test.ts src/services/food-db.test.ts src/components/rules/RuleRow.test.tsx` | 4 files passed, 18 tests passed |
| 2026-03-29 | `npm test` | 21 files passed, 168 tests passed |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all shipped Phase 11 evidence with no missing-file placeholders
- [x] No watch-mode flags
- [x] Feedback latency < 25s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-29 after rerunning the focused Phase 11 suites and full `npm test`
