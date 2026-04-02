---
phase: 1000
slug: remove-the-compatability-base-for-extras
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 1000 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- src/components/library/ComponentForm.test.tsx src/components/plan/MealPickerSheet.test.tsx src/services/food-db.test.ts src/services/generator.test.ts src/db/migrations.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- src/components/library/ComponentForm.test.tsx src/components/plan/MealPickerSheet.test.tsx src/services/food-db.test.ts src/services/generator.test.ts src/db/migrations.test.ts`
- **After every plan wave:** Run `npm test -- src/services/curry-compatibility-regression.test.ts src/components/plan/PlanBoard.test.tsx`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1000-01-01 | 01 | 1 | PH1000-01 | component | `npm test -- src/components/library/ComponentForm.test.tsx src/components/library/ComponentRow.test.tsx` | ✅ | ⬜ pending |
| 1000-01-02 | 01 | 1 | PH1000-05 | migration | `npm test -- src/db/migrations.test.ts src/services/food-db.test.ts` | ✅ | ⬜ pending |
| 1000-02-01 | 02 | 1 | PH1000-02 | component | `npm test -- src/components/plan/MealPickerSheet.test.tsx src/components/plan/PlanBoard.test.tsx` | ✅ | ⬜ pending |
| 1000-02-02 | 02 | 1 | PH1000-06 | regression | `npm test -- src/services/curry-compatibility-regression.test.ts src/components/plan/MealPickerSheet.test.tsx src/components/library/ComponentForm.test.tsx` | ✅ | ⬜ pending |
| 1000-03-01 | 03 | 2 | PH1000-03 | service | `npm test -- src/services/generator.test.ts` | ✅ | ⬜ pending |
| 1000-03-02 | 03 | 2 | PH1000-04 | service | `npm test -- src/services/generator.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/db/migrations.test.ts` — prove extra rows lose legacy compatibility fields while curry rows keep theirs
- [ ] `src/services/generator.test.ts` — rewrite extra assertions to no-base-gating and require-extra-only semantics
- [ ] `src/components/plan/MealPickerSheet.test.tsx` — cover flat extra loading instead of base-filtered loading
- [ ] `src/components/library/ComponentForm.test.tsx` and `src/components/library/ComponentRow.test.tsx` — replace extra compatibility UI assertions with extra-category-only expectations

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
