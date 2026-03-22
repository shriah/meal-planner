---
created: 2026-03-22T02:50:34.966Z
title: Meal Template rule type — unify slot settings and composition constraints
area: ui
milestone: v1.1
files:
  - src/types/plan.ts
  - src/types/preferences.ts
  - src/services/generator.ts
  - src/services/rule-compiler.ts
  - src/components/rules/RuleForm.tsx
  - src/components/rules/types.ts
  - src/app/settings/slots/page.tsx
  - src/components/settings/SlotSettings.tsx
  - src/components/settings/SlotGrid.tsx
  - src/components/settings/ComponentExceptions.tsx
  - src/components/plan/AppNav.tsx
---

## Problem

Scheduling constraints are split across three parallel systems:

1. `UserPreferences.slot_restrictions.base_type_slots` — which base types go in which slots (e.g., rice-based → lunch, dinner)
2. `UserPreferences.slot_restrictions.component_slot_overrides` — per-component slot restrictions (e.g., Poori → breakfast)
3. `UserPreferences.base_type_rules[].required_extra_category` — what extra category a base type requires (e.g., bread-based → liquid)
4. `ComponentRecord.compatible_base_types` — component-level base compatibility (subzi says which bases it works with)

Family-preference composition constraints ("bread-based meals never have subzi or sweets") have no home — they'd require editing every subzi component's `compatible_base_types`, which is a data hack for a preference.

The `/settings/slots` page is a parallel UI outside the rules system, creating navigation friction.

## Solution

Add a new `meal-template` CompiledFilter variant that captures all base-type-scoped constraints in one rule type, surfaced in the existing Rules UI.

### New rule type: `meal-template`

```ts
{
  type: 'meal-template',
  base_type: 'rice-based' | 'bread-based' | 'other',

  // Optional context scope
  slots?: MealSlot[],           // only apply for these slots (null = all)
  days?: DayOfWeek[],           // only apply on these days

  // Slot assignment (replaces base_type_slots)
  allowed_slots?: MealSlot[],

  // Composition (new capability)
  exclude_component_types?: ('curry' | 'subzi')[],
  exclude_extra_categories?: ExtraCategory[],
  require_extra_category?: ExtraCategory,
}
```

### Example rules replacing current prefs

| Intent | meal-template config |
|---|---|
| Rice-based at lunch and dinner only | base_type=rice, allowed_slots=[lunch, dinner] |
| Bread-based: no subzi, no sweets | base_type=bread, exclude_component_types=[subzi], exclude_extra_categories=[sweet] |
| Bread-based on weekdays: no subzi | base_type=bread, days=[mon-fri], exclude_component_types=[subzi] |
| Bread-based always needs sambar | base_type=bread, require_extra_category=liquid |

### Deletions

- `UserPreferences.slot_restrictions.base_type_slots` → removed (replaced by `allowed_slots` in meal-template rules)
- `UserPreferences.base_type_rules` → removed (replaced by `require_extra_category` in meal-template rules)
- `slot_restrictions.component_slot_overrides` (Poori → breakfast) → migrate to `require-component` rule
- `/settings/slots` page and all 4 components → deleted
- AppNav "Slot Settings" link → removed

`extra_quantity_limits` stays as a simple global preference (not base-type-specific).

### Files to change

- `src/types/plan.ts` — add `meal-template` to CompiledFilterSchema discriminated union
- `src/types/preferences.ts` — remove `slot_restrictions.base_type_slots` and `base_type_rules`
- `src/services/generator.ts` — replace `getEligibleBases()` prefs reads with meal-template rule reads; add `applyMealTemplate()` helper for composition filtering
- `src/services/rule-compiler.ts` — add `meal-template` compilation branch
- `src/components/rules/RuleForm.tsx` + `types.ts` — add Meal Template form tab
- `src/app/settings/slots/page.tsx` + settings components → delete
- `src/components/plan/AppNav.tsx` — remove "Slot Settings" link

### Migration

One-time Dexie upgrade: convert existing `base_type_slots` and `base_type_rules` prefs values into `meal-template` rule records at startup. Clear prefs fields after migration.
