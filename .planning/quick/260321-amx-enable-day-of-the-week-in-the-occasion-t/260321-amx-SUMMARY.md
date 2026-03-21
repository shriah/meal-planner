---
phase: quick
plan: 260321-amx
subsystem: types, generator, ui
tags: [occasion-tags, day-of-week, generator, component-form, tdd]
dependency_graph:
  requires: []
  provides: [day-literal OccasionTag enforcement, ComponentForm two-row occasion UI]
  affects: [src/types/component.ts, src/types/plan.ts, src/services/generator.ts, src/components/library/ComponentForm.tsx]
tech_stack:
  added: []
  patterns: [TDD red-green, day-literal guard in isOccasionAllowed]
key_files:
  created: []
  modified:
    - src/types/component.ts
    - src/types/plan.ts
    - src/services/generator.ts
    - src/components/library/ComponentForm.tsx
    - src/services/generator.test.ts
decisions:
  - "DAY_LITERALS constant defined in generator.ts alongside WEEKEND_DAYS/WEEKDAY_DAYS for consistency"
  - "day-literal check placed after weekday/weekend blocks so named-group tags always take priority"
  - "filter uses tags.filter(t => DAY_LITERALS.includes(t as DayOfWeek)) to safely cast OccasionTag to DayOfWeek"
metrics:
  duration: "~2 min"
  completed: "2026-03-21"
  tasks: 2
  files: 5
---

# Quick Task 260321-amx: Enable Day-of-Week in the Occasion Tag Summary

**One-liner:** OccasionTag union extended with 7 day literals (monday-sunday), generator enforces day-literal restriction via DAY_LITERALS filter block, ComponentForm shows two-row checkbox UI (General / Specific days).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (TDD RED) | Failing tests for day-literal enforcement | b06e06c | src/services/generator.test.ts |
| 1 (TDD GREEN) | Extend OccasionTag, TagFilterSchema, and generator | 87b6e48 | src/types/component.ts, src/types/plan.ts, src/services/generator.ts |
| 2 | Split ComponentForm occasion checkboxes | 671913f | src/components/library/ComponentForm.tsx |

## Changes Made

### src/types/component.ts
OccasionTag union extended from 5 to 12 members: `everyday | weekday | weekend | fasting | festive | monday | tuesday | wednesday | thursday | friday | saturday | sunday`.

### src/types/plan.ts
`TagFilterSchema.occasion_tag` Zod enum updated to list all 12 values matching the TypeScript union.

### src/services/generator.ts
Added `DAY_LITERALS` constant alongside `WEEKEND_DAYS`/`WEEKDAY_DAYS`. Updated `isOccasionAllowed` with a day-literal enforcement block inserted after the weekend check and before the final `return true`. Ordering is preserved: everyday → weekday → weekend → day-literals → fallthrough.

### src/components/library/ComponentForm.tsx
Replaced single `OCCASION_TAGS` constant and flat checkbox row with two constants (`GENERAL_OCCASION_TAGS` / `DAY_TAGS`) and two labelled sub-rows under "Occasion Tags": "General" (5 checkboxes) and "Specific days" (7 checkboxes). Both rows write to the same `form.occasion_tags` array.

### src/services/generator.test.ts
Added 6 new TDD tests in `DAY-LITERAL: isOccasionAllowed day-literal enforcement` describe block covering all specified behaviors.

## Verification

- `npx tsc --noEmit` exits 0
- `npx vitest run` passes all 88 tests (27 existing + 6 new DL tests + others)
- OccasionTag in component.ts has 12 members
- TagFilterSchema occasion_tag enum in plan.ts has the same 12 members (no drift)
- isOccasionAllowed in generator.ts has the day-literal block before the final return true
- ComponentForm has GENERAL_OCCASION_TAGS and DAY_TAGS constants, two labelled checkbox rows

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- src/types/component.ts - FOUND (12-member OccasionTag union)
- src/types/plan.ts - FOUND (12-value Zod enum)
- src/services/generator.ts - FOUND (DAY_LITERALS constant, day-literal block)
- src/components/library/ComponentForm.tsx - FOUND (GENERAL_OCCASION_TAGS, DAY_TAGS, two rows)
- Commits b06e06c, 87b6e48, 671913f - all in git log
