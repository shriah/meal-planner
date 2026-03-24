---
phase: 8
slug: scheduling-rule-ui-migration
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-24
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run src/services/rule-compiler.test.ts src/components/rules/ruleDescriptions.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/services/rule-compiler.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 08-01-T0 | 01 | 1 | SCHED-05 | unit | `npx vitest run src/db/client.test.ts` | Created by T0 | pending |
| 08-01-T1 | 01 | 1 | SCHED-05 | typecheck | `npx tsc --noEmit --pretty` | N/A | pending |
| 08-01-T2 | 01 | 1 | SCHED-05 | unit | `npx vitest run` | Existing | pending |
| 08-02-T1 | 02 | 2 | SCHED-05 | typecheck | `npx tsc --noEmit --pretty` | N/A | pending |
| 08-02-T2 | 02 | 2 | SCHED-05 | unit+typecheck | `npx tsc --noEmit && npx vitest run` | Existing | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [x] `src/db/client.test.ts` — created by 08-01 Task 0: unit tests for `migrateCompiledFilter` covering day-filter to scheduling-rule, require-component to scheduling-rule, and unknown type passthrough
- [ ] `npx shadcn add radio-group` — RadioGroup component required by SchedulingRuleFields UI (08-02 Task 1 Step 0)

*Existing infrastructure covers all other phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| RuleForm scheduling-rule tab saves a valid scheduling-rule record | SCHED-05 | Component integration test not yet set up | Open Rules UI -> Add Rule -> Scheduling Rule tab -> fill fields -> Save -> confirm record appears in rule list |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved (revised 2026-03-24)
