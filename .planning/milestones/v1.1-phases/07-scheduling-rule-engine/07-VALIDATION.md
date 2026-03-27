---
phase: 7
slug: scheduling-rule-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run src/services/generator.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/services/generator.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 7-01-01 | 01 | 1 | SCHED-01 | type-check | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 7-01-02 | 01 | 1 | SCHED-01 | type-check | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 7-02-01 | 02 | 1 | SCHED-02 | unit | `npx vitest run src/services/generator.test.ts` | ✅ | ⬜ pending |
| 7-02-02 | 02 | 1 | SCHED-02 | unit | `npx vitest run src/services/generator.test.ts` | ✅ | ⬜ pending |
| 7-03-01 | 03 | 2 | SCHED-03 | unit | `npx vitest run src/services/generator.test.ts` | ✅ | ⬜ pending |
| 7-03-02 | 03 | 2 | SCHED-03 | unit | `npx vitest run src/services/generator.test.ts` | ✅ | ⬜ pending |
| 7-04-01 | 04 | 2 | SCHED-04 | unit | `npx vitest run` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.* Vitest is already installed and generator.test.ts exists with 33 test cases. No additional setup needed.

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
