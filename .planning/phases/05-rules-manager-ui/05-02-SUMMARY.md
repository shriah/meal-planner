---
phase: 05-rules-manager-ui
plan: 02
subsystem: rules-ui
tags: [form, useReducer, discriminated-union, impact-preview, presets]
dependency_graph:
  requires: [05-01, rule-compiler, food-db, plan-types]
  provides: [/rules/new, RuleForm, RuleImpactPreview, RuleFormFields]
  affects: [rules-workflow]
tech_stack:
  added: []
  patterns:
    - useReducer with discriminated union FormState for zero ghost-state type switching
    - useLiveQuery for real-time component pool in RequireComponentFields and RuleImpactPreview
    - useMemo for synchronous impact computation from live component array
    - useRef guard for one-shot preset loading from query params
key_files:
  created:
    - src/components/rules/types.ts
    - src/components/rules/RuleForm.tsx
    - src/components/rules/RuleFormFields/DayFilterFields.tsx
    - src/components/rules/RuleFormFields/NoRepeatFields.tsx
    - src/components/rules/RuleFormFields/RequireComponentFields.tsx
    - src/components/rules/RuleImpactPreview.tsx
    - src/app/rules/new/page.tsx
  modified: []
decisions:
  - Shared types.ts extracted so field components import FormState/FormAction without circular dependency on RuleForm
  - RuleImpactPreview built alongside Task 1 since RuleForm imports it — both committed in single atomic commit
  - TriangleAlert imported as TriangleAlertIcon alias to match plan spec variable name
metrics:
  duration: ~3min
  completed: 2026-03-21
  tasks_completed: 2
  files_created: 7
  files_modified: 0
---

# Phase 05 Plan 02: Rule Creation Form Summary

**One-liner:** /rules/new creation form with useReducer discriminated union state, three variant field sets, live impact preview, amber zero-match warning, and preset loading from query params.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | RuleForm with useReducer, variant fields, preset loading | a8dee73 | 7 files |
| 2 | RuleImpactPreview (built concurrently with Task 1) | a8dee73 | included above |

## What Was Built

### RuleForm (`src/components/rules/RuleForm.tsx`)
- `'use client'` component with `useReducer` using `FormState` discriminated union
- `SET_RULE_TYPE` action atomically resets all type-specific fields — no ghost state possible
- `EXAMPLE_PRESETS` with keys `fish-fridays`, `no-repeat-subzi`, `weekend-special`
- Preset loading from `?preset=` query param via `useEffect` + `useRef` one-shot guard
- Validation: name required + ruleType required + type-specific required fields
- Save handler: builds `RuleDefinition`, calls `compileRule`, calls `addRule`, `router.push('/rules')`
- `saving` boolean state disables Save button during async operation

### Field Components
- **DayFilterFields**: Day checkboxes (ALL_DAYS), slot checkboxes (optional), 4 tag filter selects (dietary/protein/regional/occasion) with "Any" empty option
- **NoRepeatFields**: Single select for base/curry/subzi
- **RequireComponentFields**: Combobox (non-extra components via `useLiveQuery`), day checkboxes, slot checkboxes

### RuleImpactPreview (`src/components/rules/RuleImpactPreview.tsx`)
- `useLiveQuery(getAllComponents)` for real-time component pool
- `useMemo` computes impact synchronously from live data + form state
- day-filter: "This rule affects N of {total} components." with zero-match amber warning
- no-repeat: "Ensures no {component_type} repeats within the week."
- require-component: "This rule will require {name} on {N} day(s)."
- Zero-match amber Alert with `border-amber-500 bg-amber-50 text-amber-900` (no shadcn warning variant)

### Shared Types (`src/components/rules/types.ts`)
- `FormState` discriminated union: `DayFilterFormState | NoRepeatFormState | RequireComponentFormState | EmptyFormState`
- `FormAction` union for all reducer actions
- Exported for use by field components and RuleImpactPreview without circular imports

### Route Shell (`src/app/rules/new/page.tsx`)
- Thin server component that renders `<RuleForm />`

## Deviations from Plan

### Auto-created shared types file

**Rule 2 - Missing critical functionality:** The plan mentioned either re-exporting from RuleForm or creating a shared types file. A dedicated `src/components/rules/types.ts` was created to avoid circular imports — field components importing from RuleForm would create a circular dependency since RuleForm imports the field components.

### Tasks 1 and 2 committed together

RuleForm.tsx imports RuleImpactPreview, so both had to exist before TypeScript would pass. Both were built and committed in a single atomic commit (`a8dee73`).

## Self-Check: PASSED

Files exist:
- src/components/rules/types.ts: FOUND
- src/components/rules/RuleForm.tsx: FOUND
- src/components/rules/RuleFormFields/DayFilterFields.tsx: FOUND
- src/components/rules/RuleFormFields/NoRepeatFields.tsx: FOUND
- src/components/rules/RuleFormFields/RequireComponentFields.tsx: FOUND
- src/components/rules/RuleImpactPreview.tsx: FOUND
- src/app/rules/new/page.tsx: FOUND

Commits exist:
- a8dee73: FOUND (feat(05-02): build RuleForm with useReducer...)

TypeScript: EXIT 0
Tests: 7/7 passed
