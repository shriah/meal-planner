---
phase: 3
slug: plan-generator-rule-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-20
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 |
| **Config file** | `vitest.config.ts` (root) |
| **Quick run command** | `npx vitest run src/services/generator.test.ts src/services/rule-compiler.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/services/generator.test.ts src/services/rule-compiler.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 1 | PLAN-01, PLAN-04, RULE-02, RULE-03, RULE-04 | unit (Wave 0 stubs) | `npx vitest run src/services/generator.test.ts src/services/rule-compiler.test.ts` | ❌ Wave 0 | ⬜ pending |
| 3-01-02 | 01 | 1 | RULE-02 | unit | `npx vitest run src/services/rule-compiler.test.ts` | ❌ Wave 0 | ⬜ pending |
| 3-01-03 | 01 | 1 | PLAN-01, PLAN-04, RULE-03, RULE-04 | unit | `npx vitest run src/services/generator.test.ts` | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/types/plan.ts` — shared type definitions (`DayOfWeek`, `MealSlot`, `CompiledFilter` discriminated union, `WeeklyPlan`, `PlanSlot`, `Warning`, `GeneratorResult`, Zod schemas) — prerequisite for both services
- [ ] `src/services/generator.test.ts` — 20+ test stubs covering PLAN-01, PLAN-04, RULE-03, RULE-04 (full week generation, extra compatibility, day-filter, no-repeat, over-constrained, frequency weighting, recency halving, 500ms performance gate)
- [ ] `src/services/rule-compiler.test.ts` — stubs for RULE-02 covering all 3 rule type compilations (`DayFilterRule`, `NoRepeatRule`, `RequireComponentRule`)

*Existing infrastructure covers Vitest + fake-indexeddb — no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dexie schema migration v1→v2 doesn't corrupt existing data | RULE-02 | Requires a browser with existing IndexedDB data | Open app in Chrome with existing data, verify rules table migrates cleanly and components still load |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
