---
phase: 14
slug: add-option-to-create-more-base-category-and-extra-category
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-28
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `4.1.0` |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run src/db/migrations.test.ts src/services/food-db.test.ts src/services/rule-compiler.test.ts src/services/generator.test.ts src/components/plan/MealPickerSheet.test.tsx src/db/seed.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~25 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task-specific Vitest command from the map below
- **After every plan wave:** Run `npm test`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 25 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | CAT-01, CAT-02, CAT-07 | unit/db + service | `npx vitest run src/db/migrations.test.ts src/services/food-db.test.ts` | ✅ | ✅ green |
| 14-01-02 | 01 | 1 | CAT-01, CAT-02, CAT-06, CAT-07 | unit/db + service | `npx vitest run src/db/migrations.test.ts src/services/food-db.test.ts` | ✅ | ✅ green |
| 14-02-01 | 02 | 2 | CAT-05 | component | `npx vitest run src/components/library/CategoryManager.test.tsx` | ✅ | ✅ green |
| 14-02-02 | 02 | 2 | CAT-02, CAT-05, CAT-06 | component + service | `npx vitest run src/components/library/CategoryManager.test.tsx src/components/library/ComponentForm.test.tsx src/services/food-db.test.ts` | ✅ | ✅ green |
| 14-03-01 | 03 | 2 | CAT-03, CAT-06, CAT-07 | unit/service | `npx vitest run src/services/rule-compiler.test.ts src/components/rules/form-state.test.ts` | ✅ | ✅ green |
| 14-03-02 | 03 | 2 | CAT-03, CAT-06, CAT-07 | component + description | `npx vitest run src/services/rule-compiler.test.ts src/components/rules/form-state.test.ts src/components/rules/ruleDescriptions.test.ts` | ✅ | ✅ green |
| 14-04-01 | 04 | 3 | CAT-04 | unit/service + component | `npx vitest run src/services/generator.test.ts src/components/plan/MealPickerSheet.test.tsx` | ✅ | ✅ green |
| 14-04-02 | 04 | 3 | CAT-04, CAT-08 | unit/db + full suite | `npx vitest run src/services/generator.test.ts src/components/plan/MealPickerSheet.test.tsx src/db/seed.test.ts` then `npm test` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Coverage

- `src/db/migrations.test.ts` verifies literal-to-ID migration fixtures and delete normalization.
- `src/services/food-db.test.ts` verifies category CRUD, label resolution, and transactional delete cleanup.
- `src/components/library/CategoryManager.test.tsx` and `src/components/library/ComponentForm.test.tsx` verify the category-management UI plus category-backed component authoring.
- `src/services/rule-compiler.test.ts`, `src/components/rules/form-state.test.ts`, and `src/components/rules/ruleDescriptions.test.ts` verify category-ID rule compile/decompile, UI normalization, and rename/delete-safe descriptions.
- `src/services/generator.test.ts` and `src/components/plan/MealPickerSheet.test.tsx` verify generator compatibility, explicit `require_extra`, and picker filtering on category IDs.
- `src/db/seed.test.ts` verifies seeded category rows, category-backed component refs, and ID-based default rules.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Category manager sheet reads as an extension of the Library page and keeps add/rename/delete flows understandable on desktop and mobile | CAT-05 | The visual contract and hierarchy are defined in `14-UI-SPEC.md`, but final layout quality is still best checked in-browser | Open the Library page, launch `Manage Categories`, verify the focal order is section title -> `Add Category` -> rows, then perform add, rename, and delete flows in both category sections |
| Delete cleanup leaves no stale labels or broken rule rows in visible UI | CAT-07 | Automated tests can cover normalization logic, but a quick visual sweep is still useful for regression confidence | Delete an in-use base category and an in-use extra category, then verify component forms, rule descriptions, and category rows refresh to the normalized post-delete state without raw IDs or stale names |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 25s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** approved after `npx vitest run src/services/generator.test.ts src/components/plan/MealPickerSheet.test.tsx src/db/seed.test.ts` and `npm test` passed on 2026-03-28
