---
phase: quick
plan: 260321-amx
type: execute
wave: 1
depends_on: []
files_modified:
  - src/types/component.ts
  - src/types/plan.ts
  - src/services/generator.ts
  - src/components/library/ComponentForm.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "A component can be tagged with one or more day-of-week literals (monday–sunday)"
    - "The generator excludes a day-literal-tagged component on days not in its tag set"
    - "ComponentForm shows day checkboxes in a separate 'Specific days' row"
    - "TagFilterSchema accepts day literals so LLM-compiled rules can reference them"
  artifacts:
    - path: "src/types/component.ts"
      provides: "OccasionTag union extended with 7 day literals"
      contains: "monday"
    - path: "src/types/plan.ts"
      provides: "TagFilterSchema occasion_tag Zod enum updated to match"
      contains: "monday"
    - path: "src/services/generator.ts"
      provides: "isOccasionAllowed enforces day-literal restriction"
      contains: "DAY_LITERALS"
    - path: "src/components/library/ComponentForm.tsx"
      provides: "Two-row occasion tag UI (General / Specific days)"
      contains: "DAY_TAGS"
  key_links:
    - from: "src/types/component.ts"
      to: "src/types/plan.ts"
      via: "OccasionTag union and TagFilterSchema must list the same 12 values"
    - from: "src/services/generator.ts"
      to: "src/types/component.ts"
      via: "isOccasionAllowed reads occasion_tags as OccasionTag[] — day literals must be valid members"
---

<objective>
Extend OccasionTag with seven day-of-week literals, enforce them in the generator, and expose them in the ComponentForm UI as a second "Specific days" checkbox row.

Purpose: Users can mark a component as only appropriate on certain days of the week (e.g., a traditional Sunday dish), and the weekly plan generator will respect that constraint.
Output: Four modified files — types, Zod schema, generator logic, and form UI.
</objective>

<execution_context>
@/Users/harish/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@src/types/component.ts
@src/types/plan.ts
@src/services/generator.ts
@src/components/library/ComponentForm.tsx

<interfaces>
<!-- Current state — executor should extend these exactly as described below. -->

From src/types/component.ts (line 14):
```typescript
export type OccasionTag = 'everyday' | 'weekday' | 'weekend' | 'fasting' | 'festive';
```

From src/types/plan.ts (lines 64–66):
```typescript
occasion_tag: z
  .enum(['everyday', 'weekday', 'weekend', 'fasting', 'festive'])
  .optional(),
```

From src/services/generator.ts (lines 29–50):
```typescript
const WEEKEND_DAYS: DayOfWeek[] = ['saturday', 'sunday'];
const WEEKDAY_DAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

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
  return true;
}
```

From src/components/library/ComponentForm.tsx (line 29, lines 257–273):
```typescript
const OCCASION_TAGS: OccasionTag[] = ['everyday', 'weekday', 'weekend', 'fasting', 'festive']

{/* Occasion tags */}
<div className="space-y-1">
  <Label className="text-xs font-semibold">Occasion Tags</Label>
  <div className="flex flex-wrap gap-3">
    {OCCASION_TAGS.map(tag => (
      <label key={tag} className="flex items-center gap-1.5 text-xs cursor-pointer">
        <Checkbox
          checked={form.occasion_tags.includes(tag)}
          onCheckedChange={() =>
            setForm(s => ({ ...s, occasion_tags: toggleArrayValue(s.occasion_tags, tag) }))
          }
        />
        {tag}
      </label>
    ))}
  </div>
</div>
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend OccasionTag type, TagFilterSchema, and generator enforcement</name>
  <files>src/types/component.ts, src/types/plan.ts, src/services/generator.ts</files>
  <behavior>
    - isOccasionAllowed('tuesday') returns false for a component with occasion_tags: ['monday']
    - isOccasionAllowed('monday') returns true for a component with occasion_tags: ['monday']
    - isOccasionAllowed('monday') returns true for a component with occasion_tags: ['weekday'] (weekday check fires first, not day-literal block)
    - isOccasionAllowed('wednesday') returns true for a component with occasion_tags: ['monday', 'wednesday']
    - isOccasionAllowed('saturday') returns true for a component with occasion_tags: ['festive'] (no calendar meaning, falls through)
    - TagFilterSchema parses { occasion_tag: 'tuesday' } without error
  </behavior>
  <action>
    1. In `src/types/component.ts` extend OccasionTag:
    ```typescript
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

    2. In `src/types/plan.ts` update TagFilterSchema.occasion_tag Zod enum to match:
    ```typescript
    occasion_tag: z
      .enum([
        'everyday', 'weekday', 'weekend', 'fasting', 'festive',
        'monday', 'tuesday', 'wednesday', 'thursday',
        'friday', 'saturday', 'sunday',
      ])
      .optional(),
    ```

    3. In `src/services/generator.ts` add a DAY_LITERALS constant and a day-literal enforcement block to isOccasionAllowed. Insert BEFORE the final `return true` (after the weekend check):
    ```typescript
    const DAY_LITERALS: DayOfWeek[] = [
      'monday', 'tuesday', 'wednesday', 'thursday',
      'friday', 'saturday', 'sunday',
    ];

    // inside isOccasionAllowed, after the weekend block:
    const dayLiteralsInTags = tags.filter(t => DAY_LITERALS.includes(t as DayOfWeek));
    if (dayLiteralsInTags.length > 0) {
      return dayLiteralsInTags.includes(day);
    }
    return true;
    ```

    The ordering must remain: everyday → weekday → weekend → day-literals → fallthrough. Do not reorder.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|isOccasionAllowed|occasion)"</automated>
  </verify>
  <done>TypeScript compiles clean. Any existing isOccasionAllowed tests pass. TagFilterSchema accepts all 12 occasion tag values.</done>
</task>

<task type="auto">
  <name>Task 2: Split occasion checkboxes into General / Specific days in ComponentForm</name>
  <files>src/components/library/ComponentForm.tsx</files>
  <action>
    Replace the single `OCCASION_TAGS` constant and flat checkbox row with two constants and two labelled sub-rows.

    1. Replace the `OCCASION_TAGS` constant (line 29) with two constants:
    ```typescript
    const GENERAL_OCCASION_TAGS: OccasionTag[] = ['everyday', 'weekday', 'weekend', 'fasting', 'festive']
    const DAY_TAGS: OccasionTag[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    ```

    2. Replace the "Occasion tags" JSX block (lines 257–273) with:
    ```tsx
    {/* Occasion tags */}
    <div className="space-y-2">
      <Label className="text-xs font-semibold">Occasion Tags</Label>
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">General</span>
        <div className="flex flex-wrap gap-3">
          {GENERAL_OCCASION_TAGS.map(tag => (
            <label key={tag} className="flex items-center gap-1.5 text-xs cursor-pointer">
              <Checkbox
                checked={form.occasion_tags.includes(tag)}
                onCheckedChange={() =>
                  setForm(s => ({ ...s, occasion_tags: toggleArrayValue(s.occasion_tags, tag) }))
                }
              />
              {tag}
            </label>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">Specific days</span>
        <div className="flex flex-wrap gap-3">
          {DAY_TAGS.map(tag => (
            <label key={tag} className="flex items-center gap-1.5 text-xs cursor-pointer">
              <Checkbox
                checked={form.occasion_tags.includes(tag)}
                onCheckedChange={() =>
                  setForm(s => ({ ...s, occasion_tags: toggleArrayValue(s.occasion_tags, tag) }))
                }
              />
              {tag}
            </label>
          ))}
        </div>
      </div>
    </div>
    ```

    Both rows write to the same `form.occasion_tags` array via the existing `toggleArrayValue` helper — no state shape change. No import changes needed; `OccasionTag` is already imported.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>TypeScript compiles clean. ComponentForm renders two rows under Occasion Tags: "General" (5 checkboxes) and "Specific days" (7 checkboxes). Toggling any checkbox still writes to form.occasion_tags.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` exits 0
- `npx vitest run` passes all tests
- OccasionTag in component.ts has 12 members
- TagFilterSchema occasion_tag enum in plan.ts has the same 12 members (no drift)
- isOccasionAllowed in generator.ts has the day-literal block before the final return true
- ComponentForm has GENERAL_OCCASION_TAGS and DAY_TAGS constants, and two labelled checkbox rows
</verification>

<success_criteria>
- A component can be saved with occasion_tags: ['tuesday'] and the type system accepts it
- The generator skips that component on all days except Tuesday
- ComponentForm UI shows General and Specific days rows, each with the correct checkboxes
- No TypeScript errors, no test regressions
</success_criteria>

<output>
After completion, create `.planning/quick/260321-amx-enable-day-of-the-week-in-the-occasion-t/260321-amx-SUMMARY.md`
</output>
