---
phase: 05-rules-manager-ui
plan: "01"
subsystem: rules-ui
tags: [rules, ui, list, toggle, delete, empty-state, apnav]
dependency_graph:
  requires: [src/services/food-db.ts, src/db/client.ts, src/types/plan.ts]
  provides: [src/components/rules/ruleDescriptions.ts, src/components/rules/RuleList.tsx, src/components/rules/RuleRow.tsx, src/components/rules/RuleEmptyState.tsx, src/app/rules/page.tsx]
  affects: [src/components/plan/AppNav.tsx]
tech_stack:
  added: []
  patterns: [useLiveQuery for reactive Dexie queries, role=switch aria pattern for custom toggle, inline delete confirm strip]
key_files:
  created:
    - src/components/rules/ruleDescriptions.ts
    - src/components/rules/ruleDescriptions.test.ts
    - src/components/rules/RuleList.tsx
    - src/components/rules/RuleRow.tsx
    - src/components/rules/RuleEmptyState.tsx
    - src/app/rules/page.tsx
  modified:
    - src/components/plan/AppNav.tsx
decisions:
  - "describeRule is a pure function - no state, no hooks, safe to call in render"
  - "RuleRow wraps row+confirm in single div so confirm strip appears inline below row"
  - "RuleList returns null (not spinner) while useLiveQuery loads - per UI-SPEC"
metrics:
  duration: "91 seconds"
  completed: "2026-03-21"
  tasks_completed: 2
  files_created: 6
  files_modified: 1
---

# Phase 05 Plan 01: Rules List Page Summary

**One-liner:** /rules list page with reactive toggle/delete management, inline delete confirmation, empty state with 3 preset example links, and describeRule utility tested against all 3 CompiledFilter variants.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create describeRule utility with tests (TDD) | 9033a39 | ruleDescriptions.ts, ruleDescriptions.test.ts |
| 2 | Build rule list page with RuleList, RuleRow, RuleEmptyState, AppNav update | 7fcc50c | RuleList.tsx, RuleRow.tsx, RuleEmptyState.tsx, app/rules/page.tsx, AppNav.tsx |

## What Was Built

### describeRule utility (Task 1 - TDD)

Pure function `describeRule(filter: CompiledFilter): string` converting all 3 CompiledFilter discriminated union variants to human-readable strings:
- `day-filter` -> "On {Days}{slots}: {tags_or_any_meal}"
- `no-repeat` -> "No repeated {component_type} within the week"
- `require-component` -> "Require specific component on {Days}{slots}"

7 unit tests covering all behaviors, no DOM environment needed.

### /rules list page (Task 2)

- **RuleList**: `useLiveQuery(getRules)` reactive list, returns null while loading, shows "{N} rules · {active} active" count
- **RuleRow**: toggle switch with `role="switch"` aria pattern, `text-muted-foreground` on entire row when disabled, inline delete confirm strip, describeRule summary display
- **RuleEmptyState**: 3 greyed-out example cards (opacity-50, hover:opacity-80) linking to `/rules/new?preset={id}` for fish-fridays, no-repeat-subzi, weekend-special
- **AppNav**: Rules link added between Meal Library and Slot Settings
- **/rules/page.tsx**: Thin route shell importing RuleList

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npx vitest run src/components/rules/` - 7/7 tests pass
- `npx tsc --noEmit` - 0 type errors

## Self-Check: PASSED

All files verified present. Both task commits verified in git log (9033a39, 7fcc50c).
