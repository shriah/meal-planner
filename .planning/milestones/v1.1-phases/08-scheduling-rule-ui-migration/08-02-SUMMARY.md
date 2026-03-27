---
phase: 08-scheduling-rule-ui-migration
plan: 02
subsystem: rules-ui
tags: [scheduling-rule, form, ui, migration, cleanup]
dependency_graph:
  requires: [08-01]
  provides: [scheduling-rule-form-ui, rule-list-scheduling-badge, preset-cards-updated]
  affects: [src/components/rules/]
tech_stack:
  added: [shadcn/radio-group]
  patterns: [discriminated-union-form-state, two-step-component-picker, effect-tabs]
key_files:
  created:
    - src/components/rules/RuleFormFields/SchedulingRuleFields.tsx
    - src/components/ui/radio-group.tsx
  modified:
    - src/components/rules/types.ts
    - src/components/rules/RuleForm.tsx
    - src/components/rules/RuleImpactPreview.tsx
    - src/components/rules/RuleRow.tsx
    - src/components/rules/RuleEmptyState.tsx
  deleted:
    - src/components/rules/RuleFormFields/DayFilterFields.tsx
    - src/components/rules/RuleFormFields/RequireComponentFields.tsx
decisions:
  - "FormState union trimmed to 3 variants: EmptyFormState, NoRepeatFormState, SchedulingRuleFormState — day-filter and require-component removed"
  - "SET_SCHEDULING_TAG_FILTER and SET_SCHEDULING_COMPONENT_ID added to FormAction for scheduling-rule-specific sub-state updates"
  - "Combobox disabled state handled via empty options list when no type selected (Combobox lacks disabled prop)"
  - "Pre-existing test failures in agent-a75efd6d worktree are out-of-scope; all 426 tests in src/ pass"
metrics:
  duration: "~4 minutes"
  completed: "2026-03-25"
  tasks_completed: 2
  files_changed: 8
---

# Phase 08 Plan 02: SchedulingRuleFields Form UI Summary

## One-liner

Scheduling-rule creation UI with effect tabs (Only allow / Always include / Never include), match mode radio (By tag / Specific component), tag filter grid, and two-step component picker — replacing deleted day-filter/require-component form tabs.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Install RadioGroup + create SchedulingRuleFields | 9c51cbe | radio-group.tsx, SchedulingRuleFields.tsx, types.ts |
| 2 | Rewire RuleForm + update other components + delete old fields | b11063f | RuleForm.tsx, RuleImpactPreview.tsx, RuleRow.tsx, RuleEmptyState.tsx |

## What Was Built

### SchedulingRuleFields.tsx
New form component per UI-SPEC D-01 through D-04:
- Effect selector as Tabs: "Only allow" (filter-pool) / "Always include" (require-one) / "Never include" (exclude)
- Match mode RadioGroup: "By tag" / "Specific component" — appears after effect is selected
- Tag filter 2×2 grid: Dietary / Protein / Regional / Occasion selects (dispatches SET_SCHEDULING_TAG_FILTER)
- Two-step component picker: Type Select (Base/Curry/Subzi) then Combobox filtered to that type (dispatches SET_SCHEDULING_COMPONENT_ID)
- Optional Days checkbox group (7 days, dispatches SET_DAYS)
- Optional Slots checkbox group (breakfast/lunch/dinner, dispatches SET_SLOTS)

### types.ts changes
- Removed DayFilterFormState, RequireComponentFormState from FormState union
- FormState is now: EmptyFormState | NoRepeatFormState | SchedulingRuleFormState
- Removed SET_RULE_TYPE variants: day-filter and require-component
- Removed SET_FILTER and SET_COMPONENT_ID actions
- Added SET_SCHEDULING_TAG_FILTER and SET_SCHEDULING_COMPONENT_ID actions

### RuleForm.tsx changes
- Tab set: "No Repeat" | "Scheduling Rule" only (per D-05)
- Removed DayFilterFields and RequireComponentFields imports
- Added SchedulingRuleFields import
- isFormValid validates scheduling-rule: effect + match mode + (tag filter non-empty OR component_id set)
- handleSave builds scheduling-rule RuleDefinition and compiles it
- EXAMPLE_PRESETS updated: fish-fridays (scheduling-rule require-one), no-repeat-subzi (unchanged), weekend-special (scheduling-rule filter-pool), no-paneer-weekdays (scheduling-rule exclude — new per D-10)
- formReducer: removed day-filter/require-component branches, added SET_SCHEDULING_TAG_FILTER and SET_SCHEDULING_COMPONENT_ID handlers

### RuleImpactPreview.tsx
- Removed day-filter and require-component impact cases
- Added scheduling-rule-tag case: shows "This rule affects N of total components." with amber 0-match warning
- Added scheduling-rule-component case: shows "This rule applies to {componentName}."

### RuleRow.tsx
- ruleTypeLabel: "No Repeat" for no-repeat, "Scheduling" for everything else
- Delete cancel button label changed from "Cancel" to "Keep rule" (per UI-SPEC Copywriting Contract)

### RuleEmptyState.tsx
- 4 presets: Fish Fridays, No repeat subzi, Weekend special, No paneer weekdays
- Updated descriptions per UI-SPEC Copywriting Contract
- Added no-paneer-weekdays preset (new in D-10)

## Verification

- `npx tsc --noEmit` — 0 errors
- `npx vitest run src/` — 426 tests pass (36 test files)
- DayFilterFields.tsx and RequireComponentFields.tsx deleted
- RuleFormFields/ directory: NoRepeatFields.tsx + SchedulingRuleFields.tsx only

## Deviations from Plan

### Auto-fixed Issues

None significant.

**1. [Rule 3 - Minor] Combobox lacks `disabled` prop**

- **Found during:** Task 1, when implementing the two-step component picker
- **Issue:** The Combobox component interface does not expose a `disabled` prop
- **Fix:** When pickedType is '' (no type selected), pass an empty options array to the Combobox instead of using `disabled`. The placeholder "Select type first" still communicates the state correctly.
- **Files modified:** SchedulingRuleFields.tsx
- **Commit:** 9c51cbe

## Known Stubs

None — all form fields wire to real dispatch actions and real data sources (useLiveQuery for component list).

## Self-Check

Verified files exist:
- [x] src/components/rules/RuleFormFields/SchedulingRuleFields.tsx
- [x] src/components/ui/radio-group.tsx
- [x] src/components/rules/RuleForm.tsx (updated)
- [x] src/components/rules/RuleImpactPreview.tsx (updated)
- [x] src/components/rules/RuleRow.tsx (updated)
- [x] src/components/rules/RuleEmptyState.tsx (updated)
- [x] DayFilterFields.tsx deleted
- [x] RequireComponentFields.tsx deleted

Verified commits exist:
- [x] 9c51cbe — feat(08-02): install RadioGroup + create SchedulingRuleFields component
- [x] b11063f — feat(08-02): rewire RuleForm + update RuleRow/RuleImpactPreview/RuleEmptyState + delete old fields

## Self-Check: PASSED
