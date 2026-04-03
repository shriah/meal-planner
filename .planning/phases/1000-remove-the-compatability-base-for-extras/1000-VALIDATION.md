---
phase: 1000
slug: remove-the-compatability-base-for-extras
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-02
last_updated: 2026-04-03
---

# Phase 1000 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- src/db/seed.test.ts src/db/migrations.test.ts src/services/food-db.test.ts src/components/library/ComponentForm.test.tsx src/components/library/ComponentRow.test.tsx src/components/plan/MealPickerSheet.test.tsx src/services/generator.test.ts src/services/curry-compatibility-regression.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- src/db/seed.test.ts src/db/migrations.test.ts src/services/food-db.test.ts src/components/library/ComponentForm.test.tsx src/components/library/ComponentRow.test.tsx src/components/plan/MealPickerSheet.test.tsx src/services/generator.test.ts src/services/curry-compatibility-regression.test.ts`
- **After every plan wave:** Run `npm test -- src/db/seed.test.ts src/db/migrations.test.ts src/services/food-db.test.ts src/components/library/ComponentForm.test.tsx src/components/library/ComponentRow.test.tsx src/components/plan/MealPickerSheet.test.tsx src/components/plan/PlanBoard.test.tsx src/services/generator.test.ts src/services/curry-compatibility-regression.test.ts`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1000-01-01 | 01 | 1 | PH1000-05 | seed/type | `npm test -- src/db/seed.test.ts` | ✅ | ✅ green |
| 1000-01-02 | 01 | 1 | PH1000-05 | migration | `npm test -- src/db/migrations.test.ts src/services/food-db.test.ts` | ✅ | ✅ green |
| 1000-02-01 | 02 | 2 | PH1000-01 | component | `npm test -- src/components/library/ComponentForm.test.tsx src/components/library/ComponentRow.test.tsx` | ✅ | ✅ green |
| 1000-02-02 | 02 | 2 | PH1000-02 | component | `npm test -- src/components/plan/MealPickerSheet.test.tsx src/components/plan/PlanBoard.test.tsx` | ✅ | ✅ green |
| 1000-03-01 | 03 | 3 | PH1000-03 / PH1000-04 | service | `npm test -- src/services/generator.test.ts` | ✅ | ✅ green |
| 1000-03-02 | 03 | 3 | PH1000-06 | regression | `npm test -- src/services/curry-compatibility-regression.test.ts && npm test -- src/components/library/ComponentForm.test.tsx src/components/plan/MealPickerSheet.test.tsx src/services/food-db.test.ts src/services/generator.test.ts src/db/migrations.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-03
