# Phase 5: Rules Manager UI - Research

**Researched:** 2026-03-21
**Domain:** Next.js 16 App Router UI, Dexie useLiveQuery, React form state management
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Structured form only — no LLM. `compileRule()` runs locally in milliseconds after form submission.
- **D-02:** User picks rule type first (day-filter | no-repeat | require-component) via a select or tab at the top of the form. Selecting a type reveals only the fields relevant to that type (type-specific form, not a single adaptive form).
- **D-03:** User provides the rule name manually — a required text field above the rule type selector. No auto-generated names.
- **D-04:** Rules Manager lives at a new `/rules` route, linked from AppNav alongside Library and Settings.
- **D-05:** Rule creation form is at `/rules/new` — a separate full-screen page. "Add Rule" button on the `/rules` list navigates there. Back button returns to list.
- **D-06:** Each rule row shows: rule name prominently, a plain-English human-readable summary of what the rule does (e.g., "Requires fish protein on Fridays"), then toggle switch and delete icon on the right.
- **D-07:** Empty state: show 2–3 greyed-out example rules (e.g., "Fish Fridays", "No repeat subzi") to illustrate what's possible. Clicking an example pre-fills the `/rules/new` form with those values.
- **D-08:** Inactive (disabled) rules: greyed-out / muted text throughout the row — toggle position alone is not enough visual signal.
- **D-09:** Live preview while filling the form — as user selects days/slots/tags, the impact count updates in real-time below the form: "This rule affects N of 34 components."
- **D-10:** Zero-match warning (RULE-05): inline amber warning below the impact count — "Warning: This rule matches 0 components. The generator will ignore it." Save is still allowed (does not block).

### Claude's Discretion

- Exact human-readable summary generation logic (how to convert a CompiledFilter into a readable sentence)
- The exact components counted in the impact preview (how to query the pool for the preview)
- Form validation UX (what's required before Save is enabled — at minimum: name + rule type selected + required type-specific fields filled)
- Styling of the type selector (tabs vs select dropdown vs radio group)
- Delete confirmation (inline confirm vs immediate delete)

### Deferred Ideas (OUT OF SCOPE)

- **LLM natural language rule input** — User types "Fridays are fish days" and Claude Haiku parses it into a RuleDefinition that pre-fills the structured form. Explicitly deferred.
- **Rule editing** — Clicking an existing rule to edit it (not just toggle/delete). Deferred from Phase 5 scope — add/toggle/delete covers v1.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RULE-01 | User can write scheduling rules (structured form entry) | D-01 through D-05 lock the form/navigation design; compileRule() contract is verified from source |
| RULE-05 | When a compiled rule matches zero available meals, the app surfaces a warning and does not block plan generation | D-10 specifies the amber warning; impact preview logic uses getAllComponents() + TagFilter matching |
</phase_requirements>

---

## Summary

Phase 5 is a pure UI layer over already-implemented backend services. All rule CRUD (`addRule`, `getRules`, `updateRule`, `deleteRule`), rule compilation (`compileRule`), and component querying (`getAllComponents`, `getComponentsByType`) are fully implemented in Phase 3. The phase adds two new routes (`/rules` list, `/rules/new` creation form) and wires up `useLiveQuery` for reactive rule display.

The primary technical challenge is managing the three-variant discriminated-union form state (`day-filter | no-repeat | require-component`), where each variant exposes different required fields. The live impact preview requires synchronously counting `ComponentRecord`s against the current `TagFilter` state on every field change — this is a pure in-memory operation using the same `.every()` AND-predicate pattern already established in `filter-components.ts`.

The `Alert` component in `src/components/ui/alert.tsx` only has `default` and `destructive` variants — there is no built-in `warning` variant. The zero-match amber warning (D-10) must be implemented using `className` overrides (e.g., `border-amber-500 bg-amber-50 text-amber-900`) on the `Alert` component directly.

**Primary recommendation:** Keep all form state in a single `useReducer` in the `/rules/new` page component, with the rule type as the discriminant that determines which fields are rendered and which are required for Save enablement. Impact preview is computed synchronously inside a `useMemo` that depends on the form state and the component pool loaded once via `useLiveQuery`.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js App Router | 16.2.0 | Route creation (`/rules`, `/rules/new`) | Already in use; `src/app/` directory conventions apply |
| Dexie + dexie-react-hooks | ^4.3.0 | `useLiveQuery(getRules)` for reactive rule list | Established in all prior phases |
| React 19 | 19.2.4 | Component and hook authoring | Project standard |
| Tailwind CSS 4 | (project) | All styling | Project standard |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | (project) | Trash2, Plus, ArrowLeft, ToggleLeft/ToggleRight icons | Rule row actions, nav back |
| `next/navigation` `useRouter` | 16.2.0 | `router.push('/rules')` after save, `router.back()` for Back button | Required for programmatic navigation from 'use client' components |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `useReducer` for form state | Individual `useState` per field | `useReducer` cleaner for discriminated union — switching rule type resets all type-specific fields atomically |
| Inline toggle (`<button>` styled as switch) | A separate switch/toggle shadcn component | No switch component is installed; Tailwind CSS class-based toggle button avoids adding a new dependency |

**Installation:** No new packages needed. All required libraries are already installed.

## Architecture Patterns

### Recommended Project Structure

```
src/
├── app/
│   └── rules/
│       ├── page.tsx              # /rules — rule list (thin shell, imports RuleList)
│       └── new/
│           └── page.tsx          # /rules/new — creation form (thin shell, imports RuleForm)
├── components/
│   └── rules/
│       ├── RuleList.tsx          # 'use client' — useLiveQuery(getRules), renders rows + empty state
│       ├── RuleRow.tsx           # single rule row: name, summary, toggle, delete
│       ├── RuleForm.tsx          # 'use client' — full creation form with live preview
│       ├── RuleFormFields/
│       │   ├── DayFilterFields.tsx     # fields for day-filter variant
│       │   ├── NoRepeatFields.tsx      # fields for no-repeat variant
│       │   └── RequireComponentFields.tsx  # fields for require-component variant
│       ├── RuleImpactPreview.tsx  # "This rule affects N of 34 components" + zero-match warning
│       └── ruleDescriptions.ts   # pure function: CompiledFilter → human-readable string
```

Page files stay thin (import and render one component), matching the library page pattern (`src/app/library/page.tsx` → `<ComponentLibrary />`).

### Pattern 1: Reactive Rule List with useLiveQuery

**What:** `useLiveQuery` wraps `getRules()` so the list re-renders automatically on any Dexie write (toggle, delete, add).
**When to use:** Any component that reads from Dexie and must stay in sync with writes from other components.

```typescript
// Source: Established pattern from Phase 2/3 (src/components/library/ComponentTab.tsx)
'use client'
import { useLiveQuery } from 'dexie-react-hooks'
import { getRules } from '@/services/food-db'

export function RuleList() {
  const rules = useLiveQuery(getRules) // undefined while loading, RuleRecord[] once ready
  if (!rules) return null // or skeleton

  if (rules.length === 0) return <RuleEmptyState />

  return (
    <div>
      {/* header: "3 rules · 2 active" */}
      <p>{rules.length} rules · {rules.filter(r => r.enabled).length} active</p>
      {rules.map(rule => (
        <RuleRow key={rule.id} rule={rule} />
      ))}
    </div>
  )
}
```

### Pattern 2: Discriminated Union Form State with useReducer

**What:** A single `useReducer` holds the complete form state. Switching `ruleType` resets all type-specific fields, preventing stale values from leaking across variants.
**When to use:** Forms where field set changes based on a type discriminant.

```typescript
// Source: Architecture decision based on RuleDefinition discriminated union in src/types/plan.ts
type FormState =
  | { name: string; ruleType: 'day-filter'; days: DayOfWeek[]; slots: MealSlot[]; filter: TagFilter }
  | { name: string; ruleType: 'no-repeat'; component_type: 'base' | 'curry' | 'subzi' | '' }
  | { name: string; ruleType: 'require-component'; component_id: number | null; days: DayOfWeek[]; slots: MealSlot[] }
  | { name: string; ruleType: '' }  // initial unselected state

type FormAction =
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_RULE_TYPE'; ruleType: RuleDefinition['ruleType'] }
  | { type: 'UPDATE_FIELDS'; fields: Partial<...> }
  | { type: 'RESET' }

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET_RULE_TYPE':
      // Reset all type-specific fields when type changes
      return { name: state.name, ruleType: action.ruleType, ...defaultsForType(action.ruleType) }
    // ...
  }
}
```

### Pattern 3: Synchronous Impact Preview with useMemo

**What:** Component count computed from in-memory filter on every state change. No async, no debounce needed — Dexie data loaded once into a ref/state, filter runs synchronously.
**When to use:** Live preview where data pool is small (<200 components) and filter is O(n).

```typescript
// Source: Adapted from src/lib/filter-components.ts (.every() AND predicate)
// Load pool once
const allComponents = useLiveQuery(() => getAllComponents()) ?? []

// Recompute on every form field change
const impactCount = useMemo(() => {
  if (formState.ruleType !== 'day-filter') return null
  const { filter } = formState
  // Count components where ALL specified tags match
  return allComponents.filter(c => {
    const dietaryOk = !filter.dietary_tag || c.dietary_tags.includes(filter.dietary_tag)
    const proteinOk  = !filter.protein_tag  || c.protein_tag === filter.protein_tag
    const regionalOk = !filter.regional_tag || c.regional_tags.includes(filter.regional_tag)
    const occasionOk = !filter.occasion_tag || c.occasion_tags.includes(filter.occasion_tag)
    return dietaryOk && proteinOk && regionalOk && occasionOk
  }).length
}, [allComponents, formState])
```

**Note:** `no-repeat` and `require-component` rules affect scheduling behavior, not a filterable component set. Impact preview is only meaningful (and should only be shown) for `day-filter` rules. For `no-repeat`, display "Ensures no {component_type} repeats within a week." For `require-component`, display the count of days targeted.

### Pattern 4: Human-Readable Rule Summary

**What:** A pure function `describeRule(filter: CompiledFilter): string` converts a stored `CompiledFilter` into the row summary text.
**When to use:** Rule list rows (D-06) and as a confirmation in the preview area of the form.

```typescript
// Source: Derived from CompiledFilter schema in src/types/plan.ts
export function describeRule(filter: CompiledFilter): string {
  switch (filter.type) {
    case 'day-filter': {
      const days = filter.days.map(d => capitalize(d)).join(', ')
      const tags = Object.entries(filter.filter)
        .filter(([, v]) => v)
        .map(([k, v]) => `${friendlyKey(k)}: ${v}`)
        .join(', ')
      const slotStr = filter.slots ? ` (${filter.slots.join(', ')})` : ''
      return `On ${days}${slotStr}: ${tags || 'any meal'}`
    }
    case 'no-repeat':
      return `No repeated ${filter.component_type} within the week`
    case 'require-component':
      const days = filter.days.map(d => capitalize(d)).join(', ')
      const slotStr = filter.slots ? ` (${filter.slots.join(', ')})` : ''
      return `Require specific component on ${days}${slotStr}`
  }
}
```

### Pattern 5: Toggle and Delete in RuleRow

**What:** Toggle calls `updateRule(id, { enabled: !rule.enabled })`. Delete calls `deleteRule(id)`. Both are fire-and-forget async calls; `useLiveQuery` automatically re-renders the list.
**When to use:** All rule CRUD — no optimistic updates needed because Dexie writes are synchronous from the UI's perspective (IndexedDB is fast enough for <50 rows).

```typescript
// Source: Established pattern from food-db.ts CRUD functions
async function handleToggle() {
  await updateRule(rule.id!, { enabled: !rule.enabled })
  // No setState needed — useLiveQuery fires automatically
}
```

### Pattern 6: Empty State with Example Rules (D-07)

**What:** When `rules.length === 0`, render greyed-out cards for 3 hardcoded examples. Each card has an `onClick` that navigates to `/rules/new?preset=fish-fridays` (or uses a shared state mechanism). The new form reads the preset on mount.

**Recommended implementation:** Use `useRouter().push('/rules/new')` with `router.push('/rules/new?preset=fish-fridays')` query param. The `/rules/new` page reads `useSearchParams()` to detect the preset and initializes the reducer with preset values.

```typescript
// Source: useRouter from next/navigation (verified from node_modules/next/dist/docs/)
// Import: import { useRouter } from 'next/navigation'  (NOT next/router)
const EXAMPLE_PRESETS = {
  'fish-fridays': { ruleType: 'day-filter', days: ['friday'], filter: { protein_tag: 'fish' }, name: 'Fish Fridays' },
  'no-repeat-subzi': { ruleType: 'no-repeat', component_type: 'subzi', name: 'No repeat subzi' },
  'weekend-special': { ruleType: 'day-filter', days: ['saturday', 'sunday'], filter: { occasion_tag: 'weekend' }, name: 'Weekend special' },
} as const
```

### Anti-Patterns to Avoid

- **Importing `useRouter` from `next/router`:** In Next.js App Router, always import from `next/navigation`. The Pages Router import (`next/router`) is a different hook.
- **Putting Dexie calls directly in server components:** All rule CRUD touches IndexedDB (browser-only). Any component calling `useLiveQuery`, `addRule`, `updateRule`, or `deleteRule` must have `'use client'` at the top.
- **Adding React in the service layer:** `food-db.ts` has no React imports by design. Keep all `useLiveQuery` usage in components, call the raw async functions for writes.
- **Using `router.events`:** Removed in App Router. Use `usePathname`/`useSearchParams` effects instead.
- **Assuming Alert has a warning variant:** The installed `alert.tsx` only has `default` and `destructive`. Amber warning styling requires className overrides.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Reactive rule list that updates after toggle/delete | Manual `useState` + reload | `useLiveQuery(getRules)` | Dexie fires change events; useLiveQuery re-renders automatically |
| Rule compilation | Form → custom filter logic | `compileRule(def: RuleDefinition)` in `rule-compiler.ts` | Already implemented; pure synchronous function |
| Tag-based component counting | Custom filter logic | Adapt `.every()` pattern from `filter-components.ts` | Same AND-predicate semantics; reuse directly |
| Component search for require-component | Custom search input | Existing `Combobox` component | Already installed with search; just pass component options |
| Day/slot multi-select | Custom chip UI | `Checkbox` components in a grid | Already installed; matches established patterns |

**Key insight:** This phase is entirely glue code. The hard parts (rule storage, compilation, component filtering) are all done. The value is in the form UX and the live preview feedback loop.

## Common Pitfalls

### Pitfall 1: Form Variant State Leakage

**What goes wrong:** User selects `day-filter`, picks `friday` and `fish`, then switches to `no-repeat`. On switching back, the old `days` and `filter` state persists as ghost state.
**Why it happens:** Using individual `useState` per field with no reset-on-type-change logic.
**How to avoid:** Switch rule type via the reducer's `SET_RULE_TYPE` action, which resets ALL type-specific fields to their defaults atomically.
**Warning signs:** Impact preview showing stale counts after type switch; `compileRule` receiving fields from a different variant.

### Pitfall 2: compileRule Called with Incomplete State

**What goes wrong:** `compileRule` receives a `RuleDefinition` with empty arrays or null values for required fields, producing a `CompiledFilter` that the generator silently mishandles.
**Why it happens:** Save button enabled before required fields are filled.
**How to avoid:** Compute `isFormValid` before enabling Save:
- All variants: `name.trim() !== ''` and `ruleType` is set
- `day-filter`: `days.length > 0` (filter may be empty — all-tag match is valid)
- `no-repeat`: `component_type !== ''`
- `require-component`: `component_id !== null` and `days.length > 0`

### Pitfall 3: useLiveQuery Returns undefined on First Render

**What goes wrong:** `useLiveQuery(getRules)` returns `undefined` before the IndexedDB query resolves. Rendering `rules.map(...)` crashes.
**Why it happens:** Treating the live query result as always-defined.
**How to avoid:** `const rules = useLiveQuery(getRules) ?? []` or guard with `if (!rules) return <Skeleton />`.

### Pitfall 4: Impact Preview for Non-Day-Filter Rules

**What goes wrong:** Showing "This rule affects N components" for a `no-repeat` rule, which doesn't filter by tags — it affects ALL components of a given type across a week.
**Why it happens:** Applying the TagFilter impact logic to all rule types.
**How to avoid:** Only show the component-count impact preview for `day-filter` rules. For `no-repeat`, show a descriptive message. For `require-component`, show which days/slots the component will be required on.

### Pitfall 5: alert.tsx Has No warning Variant

**What goes wrong:** `<Alert variant="warning">` silently uses the `default` variant (CVA ignores unknown variants), producing a non-amber alert.
**Why it happens:** Assuming shadcn Alert has a warning variant.
**How to avoid:** Use `className` override: `<Alert className="border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200">`.

### Pitfall 6: Tabs Component Uses data-active not aria-selected

**What goes wrong:** Trying to style the selected tab trigger with CSS targeting `aria-selected` fails.
**Why it happens:** The installed `tabs.tsx` uses `data-active` attribute for selected state (not the standard `aria-selected`).
**How to avoid:** Use `data-active:` Tailwind variants as already present in the `TabsTrigger` className strings.

## Code Examples

Verified patterns from codebase inspection:

### Rule Type Selector using Tabs (matches D-02 option)

```typescript
// Source: src/components/ui/tabs.tsx — uses data-active, not aria-selected
// Source: src/components/library/ComponentLibrary.tsx — established tab pattern
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

const RULE_TYPES = [
  { value: 'day-filter', label: 'Day Filter' },
  { value: 'no-repeat', label: 'No Repeat' },
  { value: 'require-component', label: 'Require Component' },
] as const

// In RuleForm:
<Tabs
  value={formState.ruleType || ''}
  onValueChange={(v) => dispatch({ type: 'SET_RULE_TYPE', ruleType: v as RuleDefinition['ruleType'] })}
>
  <TabsList>
    {RULE_TYPES.map(t => (
      <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
    ))}
  </TabsList>
  <TabsContent value="day-filter"><DayFilterFields ... /></TabsContent>
  <TabsContent value="no-repeat"><NoRepeatFields ... /></TabsContent>
  <TabsContent value="require-component"><RequireComponentFields ... /></TabsContent>
</Tabs>
```

### Day Multi-Select using Checkboxes

```typescript
// Source: src/components/ui/checkbox.tsx, src/types/plan.ts ALL_DAYS
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { ALL_DAYS, type DayOfWeek } from '@/types/plan'

function DayCheckboxGroup({ selectedDays, onChange }: {
  selectedDays: DayOfWeek[]
  onChange: (days: DayOfWeek[]) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {ALL_DAYS.map(day => (
        <Label key={day} className="flex items-center gap-1.5 cursor-pointer">
          <Checkbox
            checked={selectedDays.includes(day)}
            onCheckedChange={(checked) => {
              onChange(checked
                ? [...selectedDays, day]
                : selectedDays.filter(d => d !== day))
            }}
          />
          {capitalize(day)}
        </Label>
      ))}
    </div>
  )
}
```

### Toggle Switch for Rule Row (no installed Switch component)

```typescript
// Source: Tailwind CSS class pattern — no Switch component installed
// RuleRecord.enabled is the source of truth; updateRule fires on click
function RuleToggle({ rule }: { rule: RuleRecord }) {
  async function handleToggle() {
    await updateRule(rule.id!, { enabled: !rule.enabled })
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={rule.enabled}
      onClick={handleToggle}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
        rule.enabled ? "bg-primary" : "bg-input"
      )}
    >
      <span className={cn(
        "pointer-events-none inline-block size-4 rounded-full bg-background shadow transition-transform",
        rule.enabled ? "translate-x-4" : "translate-x-0"
      )} />
    </button>
  )
}
```

### Programmatic Navigation after Save

```typescript
// Source: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md
// CRITICAL: import from 'next/navigation', NOT 'next/router'
'use client'
import { useRouter } from 'next/navigation'

async function handleSave() {
  const def: RuleDefinition = buildRuleDefinition(formState)
  const compiled = compileRule(def)
  await addRule({ name: formState.name, enabled: true, compiled_filter: compiled, created_at: new Date().toISOString() })
  router.push('/rules')  // navigate back to list
}
```

### Zero-Match Warning (RULE-05)

```typescript
// Source: src/components/ui/alert.tsx — no warning variant exists; use className override
import { Alert, AlertDescription } from '@/components/ui/alert'
import { TriangleAlertIcon } from 'lucide-react'

{impactCount === 0 && formState.ruleType === 'day-filter' && (
  <Alert className="border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-700">
    <TriangleAlertIcon />
    <AlertDescription>
      Warning: This rule matches 0 components. The generator will ignore it.
    </AlertDescription>
  </Alert>
)}
```

### RuleRecord Type (from db/client.ts)

```typescript
// Source: src/db/client.ts — verified
export interface RuleRecord {
  id?: number          // auto-assigned by Dexie ++id
  name: string
  enabled: boolean
  compiled_filter: CompiledFilter
  created_at: string   // ISO string
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `import { useRouter } from 'next/router'` | `import { useRouter } from 'next/navigation'` | Next.js 13 (App Router) | Wrong import causes a runtime error in App Router |
| Separate `is_active` field in rules table | `enabled` field (migrated in db.version(2)) | Phase 3 | Form must write `enabled: true` on addRule |
| LLM compiles rules at save time | `compileRule()` is a pure structural mapping, LLM-free | Phase 3 decision | No async/await needed for compilation |

**Deprecated/outdated:**
- `is_active` field on RuleRecord: replaced by `enabled` in db version 2 migration. Never write `is_active`.
- `text` field on RuleRecord: replaced by `name` in db version 2 migration. Always use `name`.

## Open Questions

1. **Delete confirmation UX** (Claude's discretion)
   - What we know: ComponentRow uses `DeleteConfirmStrip` (an inline expanding strip that reveals "Confirm Delete" before executing)
   - What's unclear: Whether the same pattern fits a narrower rule row layout
   - Recommendation: Use the same inline confirm pattern as `DeleteConfirmStrip` for consistency. Show a "Delete?" confirmation inline in the row before executing `deleteRule`. This is lower friction than a modal and matches the established library pattern.

2. **require-component form: component picker**
   - What we know: `component_id` is a numeric foreign key to `db.components`. The `Combobox` component is installed and supports search.
   - What's unclear: Whether to show all components or filter by type first
   - Recommendation: Filter the Combobox to non-extra components (base, curry, subzi). Extras are not meaningful candidates for a require-component rule.

3. **impact preview for require-component**
   - What we know: require-component targets a specific `component_id`, not a tag filter
   - What's unclear: What "impact" means for this rule type
   - Recommendation: Show "This rule will require [component name] on [N] days." No count of matching components — the component is pinned.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `vitest.config.ts` (project root) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RULE-01 | Rule form renders correct fields for each rule type | unit (component) | `npx vitest run src/components/rules/RuleForm.test.tsx` | ❌ Wave 0 |
| RULE-01 | Save button disabled when required fields empty | unit (component) | `npx vitest run src/components/rules/RuleForm.test.tsx` | ❌ Wave 0 |
| RULE-01 | compileRule called with correct RuleDefinition on submit | unit (component) | `npx vitest run src/components/rules/RuleForm.test.tsx` | ❌ Wave 0 |
| RULE-01 | describeRule returns correct string for each CompiledFilter variant | unit (pure fn) | `npx vitest run src/components/rules/ruleDescriptions.test.ts` | ❌ Wave 0 |
| RULE-05 | Zero-match warning shown when impactCount === 0 | unit (component) | `npx vitest run src/components/rules/RuleImpactPreview.test.tsx` | ❌ Wave 0 |
| RULE-05 | Save is not blocked when zero-match warning is shown | unit (component) | `npx vitest run src/components/rules/RuleForm.test.tsx` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run src/components/rules/`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/components/rules/RuleForm.test.tsx` — covers RULE-01 form behavior (use `// @vitest-environment happy-dom` docblock)
- [ ] `src/components/rules/RuleImpactPreview.test.tsx` — covers RULE-05 zero-match warning
- [ ] `src/components/rules/ruleDescriptions.test.ts` — covers describeRule pure function (no DOM needed, node environment)

**Pattern to follow:** `// @vitest-environment happy-dom` docblock (per-file, as established in Phase 4) with `afterEach(cleanup)` explicit. Mock `dexie-react-hooks` `useLiveQuery` in component tests. Mock `@/services/food-db` for addRule/getRules calls.

## Sources

### Primary (HIGH confidence)

- `src/services/rule-compiler.ts` — compileRule function signature and behavior verified from source
- `src/services/food-db.ts` — addRule, getRules, updateRule, deleteRule signatures verified from source
- `src/db/client.ts` — RuleRecord interface verified from source; confirmed `enabled` field (not `is_active`)
- `src/types/plan.ts` — RuleDefinition, CompiledFilter, TagFilter, DayOfWeek, ALL_DAYS verified from source
- `src/types/component.ts` — ComponentRecord, tag types verified from source
- `src/components/ui/alert.tsx` — confirmed no `warning` variant; only `default` and `destructive`
- `src/components/ui/tabs.tsx` — confirmed `data-active` attribute pattern (not `aria-selected`)
- `src/components/ui/combobox.tsx` — confirmed ComboboxOption interface and single-value API
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md` — useRouter from `next/navigation` confirmed

### Secondary (MEDIUM confidence)

- `src/components/library/ComponentLibrary.tsx` — Tab pattern reference (matches what we recommend for rule type selector)
- `src/components/plan/PlanBoard.test.tsx`, `PlanComponentRow.test.tsx` — confirmed `// @vitest-environment happy-dom` docblock + `afterEach(cleanup)` pattern for component tests

### Tertiary (LOW confidence)

- None — all critical claims are verified from source files.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all packages verified from package.json and source files
- Architecture: HIGH — all service contracts verified from source; patterns established by prior phases
- Pitfalls: HIGH — all pitfalls derived from verified source (alert variants, tabs data-active, is_active vs enabled, next/navigation import)

**Research date:** 2026-03-21
**Valid until:** 2026-06-21 (stable — all sources are local project files, no external dependency changes expected)
