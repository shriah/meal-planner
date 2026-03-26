---
phase: 10-meal-template-ui-settings-removal-migration
plan: 01
subsystem: rules-ui
tags: [meal-template, form, ui, settings-removal]
dependency_graph:
  requires: [phase-09-meal-template-engine]
  provides: [meal-template-rule-creation-ui, settings-removal]
  affects: [RuleForm, RuleImpactPreview, AppNav, types]
tech_stack:
  added: [shadcn/toggle]
  patterns: [discriminated-union-form-state, flat-single-pass-form, tab-per-rule-type]
key_files:
  created:
    - src/components/rules/RuleFormFields/MealTemplateFields.tsx
    - src/components/ui/toggle.tsx
  modified:
    - src/components/rules/types.ts
    - src/components/rules/RuleForm.tsx
    - src/components/rules/RuleImpactPreview.tsx
    - src/components/plan/AppNav.tsx
  deleted:
    - src/app/settings/slots/page.tsx
    - src/components/settings/SlotSettings.tsx
    - src/components/settings/SlotGrid.tsx
    - src/components/settings/ComponentExceptions.tsx
decisions:
  - "MealTemplateFormState follows flat pattern of SchedulingRuleFormState — no nested discriminated union"
  - "Toggle (shadcn) used for allowed_slots chip group per UI-SPEC preference over checkboxes"
  - "Pre-existing TS errors in export-plan/route.ts are out of scope — confirmed pre-existing before this plan"
metrics:
  completed_date: "2026-03-26"
  tasks: 2
  files_created: 2
  files_modified: 4
  files_deleted: 4
---

# Phase 10 Plan 01: Meal Template UI and Settings Removal Summary

**One-liner:** Meal Template form tab with RadioGroup base-type selector, Toggle chip slot assignment, checkbox exclusions, and Select required extra wired into RuleForm; /settings/slots route and AppNav link removed.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Add MealTemplateFormState to types.ts and build MealTemplateFields component | 059991c | types.ts, MealTemplateFields.tsx, toggle.tsx |
| 2 | Wire MealTemplateFields into RuleForm, update impact preview, remove settings | f27648b, 514e968 | RuleForm.tsx, RuleImpactPreview.tsx, AppNav.tsx, deleted 4 settings files |

## What Was Built

### MealTemplateFields component (new)

Flat single-pass form with 7 sections per UI-SPEC:
1. Base type RadioGroup (required) — rice-based / bread-based / other
2. Slot assignment Toggle chip group — breakfast / lunch / dinner (active = bg-primary)
3. Exclude component types checkboxes — curry / subzi
4. Exclude extra categories checkboxes — liquid / crunchy / condiment / dairy / sweet
5. Require extra Select — None (optional) / Liquid / Crunchy / Condiment / Dairy / Sweet
6. Composition scope days fieldset — checkbox per day (Mon–Sun)
7. Composition scope slots fieldset — checkbox per slot
8. Inline hint explaining scope vs slot assignment distinction

### types.ts extensions

- `MealTemplateFormState` type added to `FormState` union
- `SET_RULE_TYPE` action union extended to include `'meal-template'`
- 7 new form actions: `SET_BASE_TYPE`, `SET_ALLOWED_SLOTS`, `SET_EXCLUDE_COMPONENT_TYPES`, `SET_EXCLUDE_EXTRA_CATEGORIES`, `SET_REQUIRE_EXTRA_CATEGORY`, `SET_TEMPLATE_DAYS`, `SET_TEMPLATE_SLOTS`

### RuleForm.tsx changes

- Third tab trigger added: "Meal Template"
- `rice-lunch-dinner` example preset added to `EXAMPLE_PRESETS`
- `formReducer`: `SET_RULE_TYPE` now handles `'meal-template'` returning fresh initial state; all 7 new action cases handled with `state.ruleType === 'meal-template'` guards
- `isFormValid`: meal-template branch — false when `base_type === ''`; false when base_type set but zero constraints; true when base_type + at least one constraint
- `handleSave`: meal-template branch builds `RuleDefinition` from form state and calls `compileRule`

### RuleImpactPreview.tsx changes

- `meal-template` case added: counts all base components and displays "This template applies to {N} base components."
- Returns null when `base_type === ''`

### Settings removal

- `src/app/settings/slots/page.tsx` deleted — `/settings/slots` now returns 404
- `src/components/settings/SlotSettings.tsx` deleted
- `src/components/settings/SlotGrid.tsx` deleted
- `src/components/settings/ComponentExceptions.tsx` deleted
- "Slot Settings" link removed from AppNav — nav now has: Food Planner | Meal Library | Rules

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as written.

### Notes

- shadcn `toggle` component installed (`src/components/ui/toggle.tsx`) as it was not present — per UI-SPEC instructions
- Pre-existing TypeScript errors in `src/app/api/export-plan/route.ts` (estimateHeight export, ReactNode type mismatch) confirmed pre-existing before this plan; out of scope per deviation scope boundary rules; logged to deferred items

## Known Stubs

None — all form fields dispatch real actions, all state is wired to real reducer branches, save path calls `compileRule` and `addRule` with the compiled filter.

## Self-Check

Files created/modified:
- src/components/rules/RuleFormFields/MealTemplateFields.tsx — exists
- src/components/ui/toggle.tsx — exists
- src/components/rules/types.ts — modified
- src/components/rules/RuleForm.tsx — modified
- src/components/rules/RuleImpactPreview.tsx — modified
- src/components/plan/AppNav.tsx — modified

Files deleted:
- src/app/settings/slots/page.tsx — deleted
- src/components/settings/SlotSettings.tsx — deleted
- src/components/settings/SlotGrid.tsx — deleted
- src/components/settings/ComponentExceptions.tsx — deleted

Commits:
- 059991c — feat(10-01): add MealTemplateFormState to types.ts and build MealTemplateFields component
- f27648b — feat(10-01): wire MealTemplateFields into RuleForm, update impact preview, remove settings
- 514e968 — feat(10-01): delete slot settings route and components

## Self-Check: PASSED
