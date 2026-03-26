---
status: awaiting_human_verify
trigger: "meal-template-fields-bugs: Two browser errors when rendering MealTemplateFields in the new rule form."
created: 2026-03-26T00:00:00Z
updated: 2026-03-26T00:00:00Z
---

## Current Focus

hypothesis: Two independent bugs confirmed from direct code reading.
  1. Tabs controlled/uncontrolled: `state.ruleType || undefined` passes `undefined` on initial render (empty string falsy), then a real string after selection — switching from uncontrolled to controlled.
  2. SelectItem empty string value: `<SelectItem value="">None (optional)</SelectItem>` at MealTemplateFields.tsx:147 passes an empty string, which Radix UI Select explicitly forbids.
test: Code inspection confirmed — no runtime test needed.
expecting: Fixes are straightforward.
next_action: Apply fixes.

## Symptoms

expected: The /rules/new page renders cleanly with the meal-template tab working.
actual: Two browser errors:
  1. "Tabs is changing from uncontrolled to controlled."
  2. "Uncaught Error: A <Select.Item /> must have a value prop that is not an empty string."
errors: |
  [browser] Tabs is changing from uncontrolled to controlled. Components should not switch from controlled to uncontrolled (or vice versa).
  [browser] Uncaught Error: A <Select.Item /> must have a value prop that is not an empty string.
      at SelectItem (src/components/ui/select.tsx:112:5)
      at MealTemplateFields (src/components/rules/RuleFormFields/MealTemplateFields.tsx:147:13)
reproduction: Navigate to /rules/new
started: Phase 10 (just implemented)

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-03-26T00:00:00Z
  checked: RuleForm.tsx line 316
  found: `value={state.ruleType || undefined}` — when `state.ruleType` is `''` (initial state), this evaluates to `undefined`, making Tabs uncontrolled. Once user picks a tab type, it becomes a real string → controlled. This is the classic controlled/uncontrolled switch.
  implication: Fix: always pass a string, never undefined. Use `value={state.ruleType}` — Tabs handles empty string as "no tab selected" without going uncontrolled.

- timestamp: 2026-03-26T00:00:00Z
  checked: MealTemplateFields.tsx line 147
  found: `<SelectItem value="">None (optional)</SelectItem>` — Radix UI Select.Item explicitly throws if value is empty string, because empty string is the sentinel value used to represent "cleared / show placeholder".
  implication: Fix: use a non-empty sentinel like `"none"` for the "no selection" option, and update the onValueChange handler to map `"none"` back to `null`.

## Resolution

root_cause:
  Bug 1: RuleForm.tsx passes `state.ruleType || undefined` to Tabs `value` prop. Initial state has `ruleType: ''`, which is falsy, so `undefined` is passed — making Tabs uncontrolled on first render. When user selects a tab, a real string is passed — switching to controlled. Radix UI warns about this transition.
  Bug 2: MealTemplateFields.tsx renders `<SelectItem value="">None (optional)</SelectItem>`. Radix UI Select reserves empty string as the "clear selection" sentinel and explicitly throws when a SelectItem uses it as its value.

fix:
  Bug 1: Change `value={state.ruleType || undefined}` to `value={state.ruleType}` in RuleForm.tsx line 316.
  Bug 2: Change `<SelectItem value="">` to `<SelectItem value="none">` in MealTemplateFields.tsx line 147, and update the onValueChange handler to treat `"none"` as the null/clear case (it already handles `v === ''` → change to `v === 'none'`).

verification: Both fixes applied. Awaiting user confirmation that /rules/new loads without console errors and the meal-template tab + require-extra select work correctly.
files_changed:
  - src/components/rules/RuleForm.tsx
  - src/components/rules/RuleFormFields/MealTemplateFields.tsx
