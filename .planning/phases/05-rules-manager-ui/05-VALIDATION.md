---
phase: 5
slug: rules-manager-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-21
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~15 seconds |

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
| 5-01-01 | 01 | 1 | RULE-01 | unit | `npx vitest run --reporter=verbose` | ❌ W0 | ⬜ pending |
| 5-01-02 | 01 | 1 | RULE-01 | unit | `npx vitest run --reporter=verbose` | ❌ W0 | ⬜ pending |
| 5-01-03 | 01 | 1 | RULE-01 | manual | — | — | ⬜ pending |
| 5-02-01 | 02 | 2 | RULE-05 | unit | `npx vitest run --reporter=verbose` | ❌ W0 | ⬜ pending |
| 5-02-02 | 02 | 2 | RULE-05 | manual | — | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/components/rules/__tests__/RuleForm.test.tsx` — stubs for RULE-01 form submission, compile preview, zero-match warning
- [ ] `src/components/rules/__tests__/RuleList.test.tsx` — stubs for RULE-05 toggle, delete

*Wave 0 creates test stubs; implementation fills them in.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| "Compiling..." state during LLM processing | RULE-01 | Async UI state transition hard to unit-test | Submit rule, observe spinner/loading indicator appears |
| Human-readable impact summary display | RULE-01 | Depends on live component data | After compile, verify impact count is shown (e.g. "affects 6 of 34 meals") |
| Zero-match amber warning on save | RULE-05 | Requires specific data state | Create rule that matches no components, verify amber alert appears |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
