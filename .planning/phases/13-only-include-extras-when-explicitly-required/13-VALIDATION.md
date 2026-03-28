---
phase: 13
slug: only-include-extras-when-explicitly-required
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-28
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `^4.1.0` |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run src/services/generator.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~25 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task-local `<automated>` command, then `npx vitest run src/services/generator.test.ts`
- **After every plan wave:** Run `npm test`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 25 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | PH13-01, PH13-02, PH13-03, PH13-04 | integration | `npx vitest run src/services/generator.test.ts` | ✅ | ✅ green |
| 13-01-02 | 01 | 1 | PH13-01, PH13-02, PH13-03, PH13-04 | full suite | `npm test` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Replace the outdated generator regression that still expects unlocked slots to receive unconstrained extras without `require_extra`.
- [x] Add or tighten generator assertions proving unlocked slots default to `extra_ids: []`, explicit `require_extra` still injects matching extras, and locked `extra_ids` remain exact.
- [x] Confirm the extra-warning assertions cover only unsatisfied explicit `require_extra` categories.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Regenerated plans display empty extras rows for unlocked slots unless a rule explicitly requires extras | PH13-01, PH13-02 | Helpful end-to-end sanity check after generator semantics narrow, but not required for correctness because generator coverage is the primary contract | Generate a new weekly plan with no `require_extra` rules and confirm unlocked slots show no extras; add a matching `require_extra` rule and confirm only those slots gain extras |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 25s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-28
