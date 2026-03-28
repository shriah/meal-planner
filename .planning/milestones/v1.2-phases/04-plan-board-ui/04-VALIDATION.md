---
phase: 4
slug: plan-board-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-21
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 0 | PLAN-02 | unit | `npx vitest run src/db/client.test.ts` | ❌ W0 | ⬜ pending |
| 4-01-02 | 01 | 1 | PLAN-02 | unit | `npx vitest run src/services/generator.test.ts` | ✅ | ⬜ pending |
| 4-02-01 | 02 | 1 | UI-01 | component | `npx vitest run src/components/PlanBoard.test.tsx` | ❌ W0 | ⬜ pending |
| 4-02-02 | 02 | 1 | UI-02 | component | `npx vitest run src/components/PlanBoard.test.tsx` | ❌ W0 | ⬜ pending |
| 4-03-01 | 03 | 2 | UI-03 | component | `npx vitest run src/components/MealPicker.test.tsx` | ❌ W0 | ⬜ pending |
| 4-04-01 | 04 | 2 | PLAN-03 | integration | `npx vitest run src/components/PlanBoard.test.tsx` | ❌ W0 | ⬜ pending |
| 4-04-02 | 04 | 2 | PLAN-05 | integration | `npx vitest run src/components/PlanBoard.test.tsx` | ❌ W0 | ⬜ pending |
| 4-05-01 | 05 | 3 | UI-04 | component | `npx vitest run src/components/MealPicker.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/db/client.test.ts` — add stubs for active_plan table (PLAN-02)
- [ ] `src/components/PlanBoard.test.tsx` — stubs for grid render, lock/unlock, day-lock (UI-01, UI-02, PLAN-03, PLAN-05)
- [ ] `src/components/MealPicker.test.tsx` — stubs for meal picker sheet and slot-type filtering (UI-03, UI-04)
- [ ] `npm install zustand` — Zustand not in package.json; required before store work
- [ ] `npx shadcn@latest add sheet` — Sheet component not installed; required for MealPicker drawer

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Lock icon visual distinction (color/opacity) | UI-02 | CSS visual state — not reliably testable via JSDOM | Load plan board in browser, lock a slot, verify slot appears visually distinct from unlocked slots |
| Regenerate Plan button triggers only unlocked slots to change | PLAN-03 | Randomness — deterministic only with seed | Lock 2 slots, click Regenerate Plan, verify locked slots unchanged and unlocked slots have new values |
| Warning banner appears when <3 components exist | UI-01 | Requires real DB state | Delete components until <3 remain, navigate to plan board, verify warning banner appears |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
