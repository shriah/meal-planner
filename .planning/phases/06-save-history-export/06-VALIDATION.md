---
phase: 6
slug: save-history-export
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | SAVE-01 | unit | `npx vitest run src/services/plan-db.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | SAVE-01, SAVE-02 | unit | `npx vitest run src/services/plan-db.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 1 | SAVE-02 | unit | `npx vitest run src/stores/plan-store.test.ts` | ✅ | ⬜ pending |
| 06-02-02 | 02 | 1 | SAVE-02 | manual | — | — | ⬜ pending |
| 06-03-01 | 03 | 1 | EXPORT-01 | manual | — | — | ⬜ pending |
| 06-03-02 | 03 | 1 | EXPORT-01 | manual | — | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/services/plan-db.test.ts` — extend with stubs for week-keyed CRUD (saveWeekPlan, getWeekPlan, listWeekPlans)

*Existing infrastructure (vitest, happy-dom, plan-store.test.ts) covers most phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Week navigator renders correct date range labels | SAVE-02 | DOM/visual | Navigate to plan board; verify header shows "Mar 17–23, 2026" format for current week |
| Past week is read-only | SAVE-02 | DOM/visual | Navigate to a past week; verify no Regenerate button, no lock toggles, amber banner visible |
| Future week shows empty state | SAVE-02 | DOM/visual | Navigate to next week; verify empty state with "Generate Plan for This Week" CTA |
| PNG export downloads a file | EXPORT-01 | Browser download | Click Export PNG; verify PNG file downloads with correct dimensions |
| Mobile Web Share API triggers | EXPORT-01 | Mobile device | On mobile browser, tap Export PNG; verify native share sheet opens with PNG attached |
| Exported PNG has correct layout | EXPORT-01 | Visual inspection | Open downloaded PNG; verify 7 day rows, slot labels, component names, week header present |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
