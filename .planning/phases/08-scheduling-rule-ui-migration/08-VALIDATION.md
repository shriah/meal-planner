---
phase: 8
slug: scheduling-rule-ui-migration
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| 08-W0-01 | W0 | 0 | SCHED-05 | unit | `npx vitest run src/db/client.test.ts` | ❌ W0 | ⬜ pending |
| 08-W0-02 | W0 | 0 | SCHED-05 | install | `npx shadcn add radio-group` | ❌ W0 | ⬜ pending |
| 08-??-01 | TBD | 1 | SCHED-05 | unit | `npx vitest run src/services/rule-compiler.test.ts` | ✅ | ⬜ pending |
| 08-??-02 | TBD | 1 | SCHED-05 | unit | `npx vitest run src/services/generator.test.ts` | ✅ | ⬜ pending |
| 08-??-03 | TBD | 2 | SCHED-05 | unit | `npx vitest run src/db/client.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/db/client.test.ts` — stubs for SCHED-05 migration logic (day-filter → scheduling-rule, require-component → scheduling-rule, unknown types left unchanged)
- [ ] `npx shadcn add radio-group` — RadioGroup component required by SchedulingRuleFields UI

*Existing infrastructure covers all other phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| RuleForm scheduling-rule tab saves a valid scheduling-rule record | SCHED-05 | Component integration test not yet set up | Open Rules UI → Add Rule → Scheduling Rule tab → fill fields → Save → confirm record appears in rule list |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
