---
phase: 2
slug: meal-library-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-20
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 0 | DATA-06 | setup | `npx vitest run --reporter=verbose` | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 1 | MEAL-01 | unit | `npx vitest run --reporter=verbose` | ❌ W0 | ⬜ pending |
| 2-01-03 | 01 | 1 | MEAL-02 | unit | `npx vitest run --reporter=verbose` | ❌ W0 | ⬜ pending |
| 2-01-04 | 01 | 2 | MEAL-03 | unit | `npx vitest run --reporter=verbose` | ❌ W0 | ⬜ pending |
| 2-01-05 | 01 | 2 | MEAL-04 | unit | `npx vitest run --reporter=verbose` | ❌ W0 | ⬜ pending |
| 2-02-01 | 02 | 1 | DATA-06 | unit | `npx vitest run --reporter=verbose` | ❌ W0 | ⬜ pending |
| 2-02-02 | 02 | 2 | MEAL-05 | manual | n/a — seed data visual inspection | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/components/__tests__/component-library.test.ts` — stubs for MEAL-01 through MEAL-05 filter/search logic
- [ ] Install `dexie-react-hooks` and `lucide-react` — `npm install dexie-react-hooks lucide-react`
- [ ] Run `npx shadcn@latest init --preset bgAUzxKUy` — initialize design system
- [ ] Add shadcn components: tabs, input, badge, button, checkbox, label, tooltip, separator, scroll-area, alert-dialog

*Existing vitest infrastructure covers test running; Wave 0 adds missing dependencies and component stubs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Seed data renders correctly on first launch | MEAL-05 | Requires browser + IndexedDB; no headless DB test for seed count | Open app in browser, navigate to each tab (Bases, Curries, Subzis, Extras), confirm 50–100 components visible across tabs |
| Inline row expansion opens and collapses | MEAL-02 | DOM interaction testing requires browser environment | Click a component row, confirm expansion; edit a field, click "Save [ComponentType]", confirm collapse and update |
| Slot assignment checkbox grid saves | DATA-06 | Requires browser + IndexedDB write | Navigate to slot settings, toggle checkboxes, click "Save slot settings", reload page, confirm persistence |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
