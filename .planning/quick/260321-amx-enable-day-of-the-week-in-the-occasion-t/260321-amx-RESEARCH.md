# Quick Task: Enable Day-of-Week in Occasion Tags — Research

**Researched:** 2026-03-21
**Domain:** OccasionTag type system, generator enforcement, UI (ComponentForm + MealPickerSheet)
**Confidence:** HIGH — all findings sourced directly from codebase

---

## Summary

The current `OccasionTag` union has five values: `everyday | weekday | weekend | fasting | festive`. The generator's `isOccasionAllowed` already knows about `weekday` and `weekend` as calendar-mapped tags. Adding seven day-of-week literals extends this same pattern.

The cleanest model is to extend `OccasionTag` directly with the seven day literals. There is no architectural reason for a separate type or field — the existing `occasion_tags: OccasionTag[]` array on every `ComponentRecord` is the right carrier, and the existing `isOccasionAllowed` function is the right enforcement point.

**Primary recommendation:** Extend `OccasionTag` with the seven day literals, update `isOccasionAllowed` to enforce them, update `TagFilterSchema` to accept them, and split the occasion checkbox group in `ComponentForm` into two rows (general occasion / specific days).

---

## Architecture Patterns

### 1. Type Modelling — Extend the Union

**What:** Add `'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'` directly to `OccasionTag`.

**Why not a separate field:** `ComponentRecord` already carries `occasion_tags: OccasionTag[]`. A second `day_tags` field would duplicate the array-contains query pattern and fork all enforcement logic. The system already treats occasion tags as a multi-value set — day literals fit cleanly.

**Why not a separate union type:** A separate `DayTag` type would require every consumer (`isOccasionAllowed`, `TagFilterSchema`, `ComponentForm`, `MealPickerSheet` filter) to be touched twice — once for `OccasionTag` and again for `DayTag`. One union is simpler.

```typescript
// src/types/component.ts
export type OccasionTag =
  | 'everyday'
  | 'weekday'
  | 'weekend'
  | 'fasting'
  | 'festive'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';
```

### 2. Generator Enforcement — isOccasionAllowed

**Current logic (generator.ts lines 39–50):**
- Empty tags → allow
- Has `everyday` → allow
- Has `weekday` but not `everyday` → allow only Mon–Fri
- Has `weekend` but not `everyday` → allow only Sat–Sun
- Otherwise → allow (fasting/festive pass through — they have no calendar meaning)

**New logic needed:** Before the fallthrough `return true`, check if any day-literal tag is present. If so, the component is restricted to exactly those days.

```typescript
// Proposed addition to isOccasionAllowed
const DAY_LITERALS: DayOfWeek[] = [
  'monday', 'tuesday', 'wednesday', 'thursday',
  'friday', 'saturday', 'sunday',
];

function isOccasionAllowed(component: ComponentRecord, day: DayOfWeek): boolean {
  const tags = component.occasion_tags ?? [];
  if (tags.length === 0) return true;
  if (tags.includes('everyday')) return true;
  if (tags.includes('weekday') && !tags.includes('everyday')) {
    return WEEKDAY_DAYS.includes(day);
  }
  if (tags.includes('weekend') && !tags.includes('everyday')) {
    return WEEKEND_DAYS.includes(day);
  }
  // Day-literal enforcement: if ANY day literal is present, restrict to those days
  const dayLiteralsInTags = tags.filter(t => DAY_LITERALS.includes(t as DayOfWeek));
  if (dayLiteralsInTags.length > 0) {
    return dayLiteralsInTags.includes(day);
  }
  return true; // fasting, festive — no calendar mapping
}
```

**Interaction with weekday/weekend:** The ordering above means `weekday`/`weekend` take precedence over day literals if both are present. This is correct — if a user tags something `weekday` + `tuesday`, the `weekday` check fires first and still allows Mon–Fri. A component tagged only `tuesday` gets caught by the new day-literal block and is correctly restricted to Tuesdays only.

### 3. TagFilterSchema — plan.ts

`TagFilterSchema.occasion_tag` is used by the rule compiler for `day-filter` rules (e.g., "On Fridays, only show fish curries"). It must accept the new literals so LLM-compiled rules can reference them.

```typescript
// src/types/plan.ts — TagFilterSchema occasion_tag field
occasion_tag: z
  .enum([
    'everyday', 'weekday', 'weekend', 'fasting', 'festive',
    'monday', 'tuesday', 'wednesday', 'thursday',
    'friday', 'saturday', 'sunday',
  ])
  .optional(),
```

No logic change needed in `matchesTagFilter` (generator.ts line 121–124) — it already does `component.occasion_tags.includes(filter.occasion_tag)`, which works for day literals unchanged.

### 4. ComponentForm UI — Two-Row Split

Current: single flat row of 5 checkboxes under "Occasion Tags".

With 12 tags total (5 + 7), a flat row becomes cluttered. Split into two labelled sub-groups:

```
Occasion Tags
  General:   [ ] everyday  [ ] weekday  [ ] weekend  [ ] fasting  [ ] festive
  Specific days:  [ ] Mon  [ ] Tue  [ ] Wed  [ ] Thu  [ ] Fri  [ ] Sat  [ ] Sun
```

Implementation: add a `DAY_TAGS: OccasionTag[]` constant alongside the existing `OCCASION_TAGS` constant. Render them in two `<div className="flex flex-wrap gap-3">` rows under the same `occasion_tags` form field. Both write to the same `form.occasion_tags` array via the existing `toggleArrayValue` helper — no state shape change needed.

### 5. MealPickerSheet — No Occasion Filter Needed

`MealPickerSheet` currently filters by dietary and regional tags only. Occasion tags are NOT used as filter chips in the picker — the picker shows all components of the chosen type and lets the user search/filter by dietary and regional. Day-of-week tags are a generator constraint, not a manual-picker filter. No changes required to `MealPickerSheet` or `filterComponents`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Day-literal enforcement | Custom day-parsing middleware | Extend `isOccasionAllowed` — already the single enforcement gate |
| Type-safety for new literals | Runtime checks | TypeScript union + Zod `.enum()` — already the project pattern |

---

## Common Pitfalls

### Pitfall 1: Pool Starvation
**What goes wrong:** A component tagged `tuesday` only appears in 1 of 21 weekly slots. If the dataset has many day-specific components and few `everyday` ones, the generator pool for other days shrinks dramatically.

**How to avoid:** Day-literal tags should be used sparingly — only for genuinely day-specific dishes (e.g., a traditional Sunday special). The generator already has a fallback (relaxes day-filter rules with a warning) for over-constrained pools, so catastrophic failure won't occur, but warnings will fire.

**Warning signs:** Generator warnings like "No eligible bases for wednesday lunch after slot restrictions" in the console.

### Pitfall 2: Overlap with weekday/weekend Tags
**What goes wrong:** A component tagged both `weekday` and `monday` gets evaluated as `weekday` (Mon–Fri allowed) — the `monday`-only restriction is silently ignored because `weekday` fires first in `isOccasionAllowed`.

**How to avoid:** Document in the UI that `weekday`/`weekend` are broader groupings and take precedence. The ordering in `isOccasionAllowed` is intentional — don't reorder the checks.

### Pitfall 3: TagFilterSchema Drift
**What goes wrong:** `OccasionTag` union in `component.ts` is updated but the Zod `.enum()` in `TagFilterSchema` (plan.ts) is not — valid tags fail Zod validation at rule-compile time.

**How to avoid:** Both must be updated in the same commit. The two lists are currently duplicated (an existing pre-condition of the codebase, not introduced by this change).

### Pitfall 4: Seeded Data Tags Become Stale
**What goes wrong:** Existing seeded components have `occasion_tags: ['everyday']` or `[]` — they are unaffected. But if the seed is re-run (dev reset), new seed data must not accidentally use day literals unless intentional.

**How to avoid:** Review seed data if re-seeding is done — existing records are fine as-is.

---

## Touched Files Summary

| File | Change |
|------|--------|
| `src/types/component.ts` | Extend `OccasionTag` union with 7 day literals |
| `src/types/plan.ts` | Add 7 day literals to `TagFilterSchema.occasion_tag` Zod enum |
| `src/services/generator.ts` | Add day-literal block to `isOccasionAllowed` |
| `src/components/library/ComponentForm.tsx` | Split occasion checkboxes into General / Specific days sub-groups |

**Not touched:** `MealPickerSheet.tsx`, `filter-components.ts`, `food-db.ts`, Dexie schema (no index change needed — occasion_tags is not indexed, filtered in-memory).

---

## Sources

- `src/types/component.ts` — OccasionTag definition (lines 14, 24)
- `src/services/generator.ts` — isOccasionAllowed (lines 29–50), matchesTagFilter (lines 111–125)
- `src/types/plan.ts` — TagFilterSchema (lines 54–67)
- `src/components/library/ComponentForm.tsx` — OCCASION_TAGS constant (line 29), checkbox render (lines 257–273)
- `src/components/plan/MealPickerSheet.tsx` — tag chip sections (lines 103–129)
- `src/lib/filter-components.ts` — filterComponents signature (no occasion filtering present)
