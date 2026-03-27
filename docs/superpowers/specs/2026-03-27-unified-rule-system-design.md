# Unified Rule System Design

**Date:** 2026-03-27
**Status:** Approved
**Milestone:** v1.2

---

## Overview

Collapse the three existing rule types (`no-repeat`, `scheduling-rule`, `meal-template`) into a single unified `rule` type. Users pick a **target** first, then configure a **scope** and one or more **effects**. Internally, the generator shifts from type-partitioned rule buckets to two matching contexts. All existing rules migrate automatically via Dexie v9.

---

## Goals

- Remove the upfront rule-type choice — users should not need to understand three separate concepts before creating a rule
- Unify the three separate form components into one adaptive form
- Reduce generator helper count from ~12 to ~7
- Make the effect system extensible: adding a new effect = one interface + one union member

---

## Data Model

### Target

What the rule is constraining:

```typescript
type Target =
  | { mode: 'component_type'; component_type: 'base' | 'curry' | 'subzi' }
  | { mode: 'tag';            filter: TagFilter }
  | { mode: 'component';      component_id: number }
  | { mode: 'base_type';      base_type: 'rice' | 'roti' | 'poori' }
```

### Scope

When the rule is active (both default to null = all):

```typescript
type Scope = {
  days:  DayOfWeek[] | null
  slots: MealSlot[]  | null
}
```

### Effects

Every effect implements a base interface. Effects split into two semantic groups:

**Selection effects** — mutually exclusive, at most one per rule, no payload:

```typescript
interface Effect { readonly kind: string }

interface FilterPoolEffect extends Effect { readonly kind: 'filter_pool' }
interface RequireOneEffect  extends Effect { readonly kind: 'require_one' }
interface ExcludeEffect     extends Effect { readonly kind: 'exclude'     }
interface NoRepeatEffect    extends Effect { readonly kind: 'no_repeat'   }

type SelectionEffect =
  | FilterPoolEffect | RequireOneEffect
  | ExcludeEffect    | NoRepeatEffect
```

**Composition effects** — additive, any combination, each carries a plural array payload:

```typescript
interface AllowedSlotsEffect extends Effect {
  readonly kind:  'allowed_slots'
  readonly slots: MealSlot[]
}

interface SkipComponentEffect extends Effect {
  readonly kind:            'skip_component'
  readonly component_types: ('curry' | 'subzi')[]
}

interface ExcludeExtraEffect extends Effect {
  readonly kind:       'exclude_extra'
  readonly categories: ExtraCategory[]
}

interface RequireExtraEffect extends Effect {
  readonly kind:       'require_extra'
  readonly categories: ExtraCategory[]
}

type CompositionEffect =
  | AllowedSlotsEffect | SkipComponentEffect
  | ExcludeExtraEffect | RequireExtraEffect
```

**Uniform rule:**

```typescript
type AnyEffect = SelectionEffect | CompositionEffect

interface CompiledRule {
  readonly type:    'rule'
  readonly target:  Target
  readonly scope:   Scope
  readonly effects: AnyEffect[]
}
```

**Constraint (runtime-validated at save):** at most one `SelectionEffect` per rule.

**New capability unlocked by arrays:** `RequireExtraEffect.categories` supports multiple required extra categories per rule (e.g., always include both pickle and papad). The generator fills one component per required category.

### Example Rules

```typescript
// Don't repeat bases across the week
{
  target:  { mode: 'component_type', component_type: 'base' },
  scope:   { days: null, slots: null },
  effects: [{ kind: 'no_repeat' }]
}

// Rice: lunch/dinner only, skip curry, require pickle and papad
{
  target:  { mode: 'base_type', base_type: 'rice' },
  scope:   { days: null, slots: null },
  effects: [
    { kind: 'allowed_slots',  slots:           ['lunch', 'dinner'] },
    { kind: 'skip_component', component_types: ['curry']           },
    { kind: 'require_extra',  categories:      ['pickle', 'papad'] },
  ]
}

// No non-veg Mon–Fri
{
  target:  { mode: 'tag', filter: { dietary_tag: 'non-veg' } },
  scope:   { days: ['mon','tue','wed','thu','fri'], slots: null },
  effects: [{ kind: 'exclude' }]
}

// Always require a south-indian dish at weekend lunch
{
  target:  { mode: 'tag', filter: { regional_tag: 'south-indian' } },
  scope:   { days: ['sat','sun'], slots: ['lunch'] },
  effects: [{ kind: 'require_one' }]
}
```

---

## Form UX

One form, three sections. The rest of the form is hidden until a target is chosen.

### Step 1: Target *(required)*

```
○ All bases / All curries / All subzis   → component_type sub-picker
○ By tag                                 → tag filter grid (dietary/protein/regional/occasion)
○ Specific component                     → component search picker
○ Base type                              → rice / roti / poori radio
```

### Step 2: Scope *(optional, defaults shown inline)*

Collapsed by default with label "Applies to: all days, all slots". Expanding shows:

```
Days   [Mon][Tue][Wed][Thu][Fri][Sat][Sun]   (toggle chips, all active by default)
Slots  [Breakfast][Lunch][Dinner]             (toggle chips, all active by default)
```

### Step 3: Effects *(at least one required)*

Two clearly separated groups:

```
SELECTION  (pick one)
  ○ None
  ○ Filter pool   — only allow matching components in this scope
  ○ Require one   — always include a matching component
  ○ Exclude       — never include matching components
  ○ No-repeat     — don't reuse the same component across the week

WHEN THIS TARGET APPEARS
  Restrict to slots    [toggle chips]
  Skip component types [Curry] [Subzi]
  Exclude extras       [category multiselect]
  Require extras       [category multiselect]
```

### Components removed

| Before | After |
|--------|-------|
| `NoRepeatFields.tsx` | Removed — covered by target: component_type + effect: no_repeat |
| `SchedulingRuleFields.tsx` | Removed — merged into unified `RuleFields.tsx` |
| `MealTemplateFields.tsx` | Removed — merged into unified `RuleFields.tsx` |
| Rule type radio (3 options) | Removed — target picker replaces it |

---

## Generator Changes

### Two matching contexts

Effects apply in one of two contexts:

**Selection context** — target matches the component being considered for selection:
- Used for: `filter_pool`, `exclude`, `no_repeat`, `require_one`, `allowed_slots`

**Composition context** — target matches the base already selected for this meal:
- Used for: `skip_component`, `exclude_extra`, `require_extra`

### Effect application order

Fixed order regardless of array position in the rule:

```
1. allowed_slots    — pre-filter base pool to components allowed in this slot
2. filter_pool      — narrow pool to components matching target
3. exclude          — remove matching components from pool
4. no_repeat        — remove components already used this week
5. require_one      — override selection from full library if needed
── base selected ──
6. skip_component   — skip curry/subzi types for this meal
7. exclude_extra    — remove extra categories from extras pool
8. require_extra    — guarantee one component per required category
```

### Helper reduction

| Before | After |
|--------|-------|
| 3 partitioned rule arrays | 2 context functions: `selectionEffects()`, `compositionEffects()` |
| `isRuleApplicable()` + `selectorMatches()` + `selectorMatchesForSlotAssignment()` | 1 function: `targetMatches(target, component)` |
| `applySchedulingFilterPool()`, `applySchedulingExclude()`, `applyRequireOneByTag()`, `applyRequireOneByComponent()`, `getApplicableMealTemplates()` | Switch on `effect.kind` in two loops |
| ~12 helpers | ~7 helpers |

---

## Migration

### Dexie v9

All existing `CompiledFilter` records convert to `CompiledRule` in-place. Pure data transformation — synchronous, no component lookups required.

| Existing type | Target | Effects |
|---------------|--------|---------|
| `no-repeat` | `{ mode: 'component_type', component_type }` | `[{ kind: 'no_repeat' }]` |
| `scheduling-rule` filter-pool, tag match | `{ mode: 'tag', filter }` | `[{ kind: 'filter_pool' }]` |
| `scheduling-rule` filter-pool, component match | `{ mode: 'component', component_id }` | `[{ kind: 'filter_pool' }]` |
| `scheduling-rule` require-one, tag match | `{ mode: 'tag', filter }` | `[{ kind: 'require_one' }]` |
| `scheduling-rule` require-one, component match | `{ mode: 'component', component_id }` | `[{ kind: 'require_one' }]` |
| `scheduling-rule` exclude, tag match | `{ mode: 'tag', filter }` | `[{ kind: 'exclude' }]` |
| `scheduling-rule` exclude, component match | `{ mode: 'component', component_id }` | `[{ kind: 'exclude' }]` |
| `meal-template` base_type selector | `{ mode: 'base_type', base_type }` | allowed_slots + skip_component × N + exclude_extra × N + require_extra (if set) |
| `meal-template` tag selector | `{ mode: 'tag', filter }` | same effect mapping |
| `meal-template` component selector | `{ mode: 'component', component_id }` | same effect mapping |

### Test impact

Existing ~160 tests pass after migration fixtures are updated. New tests required:
- `targetMatches()` — all four target modes
- `selectionEffects()` / `compositionEffects()` — context separation
- Dexie v9 migration — all existing rule type conversions
- `RequireExtraEffect` with multiple categories

---

## What Does Not Change

- `TagFilter` schema (dietary / protein / regional / occasion dimensions) — unchanged
- Generator algorithm (pool narrowing, weighted random, no-repeat week tracking, require-one two-pass) — unchanged
- `ruleDescriptions.ts` — needs updating for new type, but the description logic is equivalent
- Dexie `RuleRecord` shape — `compiled_filter` field name kept as-is; value type changes from `CompiledFilter` to `CompiledRule`
- All other rule UI (RuleList, RuleRow, RuleImpactPreview, toggle/delete) — minor updates only

---

## Open Questions

None — all design decisions resolved during brainstorming.
