# Phase 8: Scheduling Rule UI + Migration - Research

**Researched:** 2026-03-24
**Domain:** React form UI (shadcn/Radix), Dexie.js v4 upgrade/migration, TypeScript discriminated unions
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Effect selector uses a tab/segmented control with plain English labels: "Only allow" / "Always include" / "Never include" (mapping to filter-pool / require-one / exclude respectively).
- **D-02:** Match mode is presented as a radio toggle immediately below the effect tabs: `● By tag   ○ Specific component`. Two options, no dropdown needed.
- **D-03:** Component picker uses a two-step flow: type selector first (base / curry / subzi), then a filtered combobox showing only components of that type. No extras in the component picker.
- **D-04:** Day and slot scope fields appear below the match configuration. Both are optional — omitting means "all days" / "all slots" (null in CompiledFilter).
- **D-05:** `day-filter` and `require-component` tabs are removed from `RuleForm.tsx`. The form tab set becomes: `no-repeat` | `scheduling-rule`. `DayFilterFormState`, `RequireComponentFormState`, and their form field components (`DayFilterFields`, `RequireComponentFields`) are deleted.
- **D-06:** Migration is silent — no UI notification, no banner.
- **D-07:** `day-filter` → `scheduling-rule`: effect: 'filter-pool', days: filter.days, slots: filter.slots ?? null, match: { mode: 'tag', filter: filter.filter }.
- **D-08:** `require-component` → `scheduling-rule`: effect: 'require-one', days: filter.days, slots: filter.slots ?? null, match: { mode: 'component', component_id: filter.component_id }.
- **D-09:** Migration runs in a Dexie upgrade function. After migration, `day-filter` and `require-component` variants are removed from `CompiledFilterSchema`. The generator's handling of those variants is also removed.
- **D-10:** Example presets in `RuleEmptyState` updated to scheduling-rule format (3 new scheduling-rule presets, 1 no-repeat preset unchanged).

### Claude's Discretion

- Exact form validation logic for scheduling-rule
- Impact preview — `RuleImpactPreview` needs a scheduling-rule case; follow the existing day-filter pattern
- Whether to preserve `DayFilterFormState` and `RequireComponentFormState` type aliases (prefer delete)
- Exact error/fallback if a stored rule has an unknown type after migration (log and skip)

### Deferred Ideas (OUT OF SCOPE)

- Meal-template engine and UI (Phases 9–10)
- Rule editing (click existing rule to edit)
- LLM natural language rule input
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCHED-05 | Existing `day-filter` and `require-component` rules in IndexedDB are automatically migrated to `scheduling-rule` format at app startup; old CompiledFilter variants removed from the type system | Dexie v4 `db.version(5).upgrade()` pattern (see Architecture Patterns); type removal from `CompiledFilterSchema` discriminated union; generator dead-code removal |
</phase_requirements>

---

## Summary

Phase 8 has two clearly separated work tracks: (1) UI — build `SchedulingRuleFields.tsx` and rewire `RuleForm.tsx` to use it in place of the deleted `DayFilterFields` and `RequireComponentFields`; (2) Migration — add a Dexie v5 upgrade function that converts existing `day-filter` and `require-component` records to `scheduling-rule` format, then remove the now-dead type variants from `CompiledFilterSchema`, `RuleDefinition`, `rule-compiler.ts`, and `generator.ts`.

One critical discovery: CONTEXT.md states "Currently at v2" for the Dexie schema, but the actual `src/db/client.ts` is already at `db.version(4)`. The migration must be added as `db.version(5)`, not version 3. This is confirmed by reading the source file directly.

The UI-SPEC.md (already approved) provides the full visual contract. RadioGroup is not yet installed as a shadcn component — the UI-SPEC calls it out as the only missing component, with a fallback to styled `<button role="radio">` pair if not installed. The planner must include a Wave 0 task to install `radio-group`.

**Primary recommendation:** Add `db.version(5).upgrade()` for migration; create `SchedulingRuleFields.tsx` by composing the day/slot checkbox pattern from `DayFilterFields` and the component combobox pattern from `RequireComponentFields`; delete both old field components and their form state types once the new component is wired.

---

## Standard Stack

### Core (already installed — no new installs except radio-group)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| dexie | 4.3.0 | IndexedDB ORM + versioned migrations | Already in use; v4 upgrade API confirmed |
| dexie-react-hooks | 4.2.0 | `useLiveQuery` for reactive reads | Already in use for all rule reads |
| react | 19.2.4 | Component model | Project stack |
| next | 16.2.0 | App framework | Project stack |
| zod | (see package.json) | CompiledFilter schema validation | Already in use |
| @radix-ui/react-radio-group | to install | Match mode radio inputs | shadcn registry; needed by SchedulingRuleFields |

### Supporting shadcn Components (already installed)

| Component | File | Used For |
|-----------|------|---------|
| Tabs / TabsList / TabsTrigger | `tabs.tsx` | Effect selector, rule type selector |
| Select / SelectContent / SelectItem | `select.tsx` | Component type picker (step 1), tag filter selects |
| Combobox | `combobox.tsx` | Component picker (step 2, filtered) |
| Checkbox | `checkbox.tsx` | Day/slot toggles |
| Label | `label.tsx` | All field labels |
| RadioGroup / RadioGroupItem | NOT YET INSTALLED | Match mode toggle |

**Installation required (Wave 0):**
```bash
npx shadcn add radio-group
```
If RadioGroup cannot be installed: fallback to two `<button role="radio" aria-checked>` elements styled with `border` + `bg-primary/10` for selected state.

**Version verification:** Confirmed by reading `package.json` directly (no npm view needed — package is local).

---

## Architecture Patterns

### Recommended Project Structure

No new directories. New and deleted files:

```
src/components/rules/
├── RuleForm.tsx              — MODIFY (tabs, handleSave, presets, isFormValid)
├── RuleEmptyState.tsx        — MODIFY (preset descriptions + FormState objects)
├── RuleImpactPreview.tsx     — MODIFY (add scheduling-rule case)
├── RuleRow.tsx               — MODIFY (add scheduling-rule to ruleTypeLabel)
├── types.ts                  — MODIFY (remove DayFilterFormState, RequireComponentFormState)
├── RuleFormFields/
│   ├── SchedulingRuleFields.tsx  — CREATE (new)
│   ├── DayFilterFields.tsx       — DELETE
│   ├── RequireComponentFields.tsx — DELETE
│   └── NoRepeatFields.tsx        — KEEP (unchanged)

src/db/client.ts              — MODIFY (add db.version(5).upgrade())
src/types/plan.ts             — MODIFY (remove day-filter + require-component from CompiledFilterSchema + RuleDefinition)
src/services/rule-compiler.ts — MODIFY (remove day-filter + require-component cases)
src/services/generator.ts     — MODIFY (remove dead code branches for old types)
src/services/rule-compiler.test.ts — MODIFY (remove old variant tests, add migration tests)
src/services/generator.test.ts     — MODIFY (update fixtures using old rule variants)
```

### Pattern 1: Dexie v4 upgrade function (CRITICAL — db is at v4, next is v5)

**What:** Add `db.version(5).stores({...same schema...}).upgrade(tx => ...)` to migrate all `day-filter` and `require-component` records.

**When to use:** Any time IndexedDB schema or stored data format changes.

**Exact pattern (from existing v2 upgrade in client.ts):**
```typescript
// Source: src/db/client.ts — db.version(2) upgrade pattern
db.version(5).stores({
  components: '++id, componentType, base_type, extra_category, *dietary_tags, *regional_tags, *occasion_tags',
  meals: '++id, base_id, curry_id, subzi_id',
  meal_extras: '[meal_id+component_id], meal_id, component_id',
  rules: '++id',
  saved_plans: '++id, week_start',
  preferences: 'id',
  active_plan: 'id',
}).upgrade(tx => {
  return tx.table('rules').toCollection().modify(rule => {
    const cf = rule.compiled_filter;
    if (!cf) return;

    if (cf.type === 'day-filter') {
      rule.compiled_filter = {
        type: 'scheduling-rule',
        effect: 'filter-pool',
        days: cf.days,
        slots: cf.slots ?? null,
        match: { mode: 'tag', filter: cf.filter },
      };
    } else if (cf.type === 'require-component') {
      rule.compiled_filter = {
        type: 'scheduling-rule',
        effect: 'require-one',
        days: cf.days,
        slots: cf.slots ?? null,
        match: { mode: 'component', component_id: cf.component_id },
      };
    }
    // Unknown types: log and leave unchanged (error fallback per Claude's Discretion)
  });
});
```

**IMPORTANT:** The `stores()` call in v5 must repeat the complete schema from v4 (`saved_plans: '++id, week_start'`, `active_plan: 'id'`). If `.stores()` is omitted on an existing table, its indexes are dropped.

**IMPORTANT:** The upgrade function runs on `compiled_filter` which is stored as raw JSON in IndexedDB — not yet Zod-validated. Access `rule.compiled_filter.type` directly (not via discriminated union narrowing).

### Pattern 2: SchedulingRuleFields composition

**What:** New field component composing effect tabs, match mode radio, tag selects, and day/slot checkboxes.

**Structure:**
```typescript
// Source: DayFilterFields.tsx + RequireComponentFields.tsx + NoRepeatFields.tsx patterns
'use client';

export function SchedulingRuleFields({ state, dispatch }: SchedulingRuleFieldsProps) {
  // 1. Effect tabs (Tabs component — value maps to filter-pool|require-one|exclude)
  // 2. Match mode radio (RadioGroup — visible only when effect !== '')
  // 3a. Tag filter selects (visible when match.mode === 'tag')
  // 3b. Two-step component picker (visible when match.mode === 'component')
  //     - Local state: pickedType: '' | 'base' | 'curry' | 'subzi'
  //     - useLiveQuery to get allComponents; filter by pickedType
  // 4. Day checkboxes (reuse DayFilterFields checkbox pattern, dispatch SET_DAYS)
  // 5. Slot checkboxes (reuse DayFilterFields checkbox pattern, dispatch SET_SLOTS)
}
```

**Key implementation detail for two-step component picker:** The `pickedType` local state (step 1) is owned by `SchedulingRuleFields`, not the reducer. When type changes, dispatch `SET_MATCH_MODE` with mode `'component'` to reset `component_id` to null, then update local `pickedType`. Combobox is disabled when `pickedType === ''`.

### Pattern 3: RuleForm wiring changes

**What:** Remove `day-filter` and `require-component` branches throughout `RuleForm.tsx`.

**Changes:**
```typescript
// REMOVE from formReducer SET_RULE_TYPE:
case 'day-filter': ...
case 'require-component': ...

// UPDATE type cast in onValueChange:
ruleType: v as 'no-repeat' | 'scheduling-rule'

// REMOVE from handleSave:
if (state.ruleType === 'day-filter') { ... }
if (state.ruleType === 'require-component') { ... }

// ADD to handleSave (scheduling-rule branch):
} else if (state.ruleType === 'scheduling-rule') {
  const match = state.match;
  if (match.mode !== 'tag' && match.mode !== 'component') return;
  def = {
    ruleType: 'scheduling-rule' as const,
    effect: state.effect as 'filter-pool' | 'require-one' | 'exclude',
    days: state.days.length > 0 ? state.days : undefined,
    slots: state.slots.length > 0 ? state.slots : undefined,
    match: match.mode === 'tag'
      ? { mode: 'tag' as const, filter: match.filter }
      : { mode: 'component' as const, component_id: match.component_id! },
  };
}

// UPDATE isFormValid:
if (state.ruleType === 'scheduling-rule') {
  if (state.effect === '') return false;
  if (state.match.mode === '') return false;
  if (state.match.mode === 'tag') {
    return Object.values(state.match.filter).some(v => v !== undefined);
  }
  if (state.match.mode === 'component') {
    return state.match.component_id !== null;
  }
  return false;
}
```

### Pattern 4: formReducer SET_DAYS/SET_SLOTS cleanup

**What:** After removing `day-filter` and `require-component` from the union, the guard in SET_DAYS and SET_SLOTS must also be updated:

```typescript
// BEFORE:
if (state.ruleType === 'day-filter' || state.ruleType === 'require-component' || state.ruleType === 'scheduling-rule')

// AFTER:
if (state.ruleType === 'scheduling-rule')
```

Also remove the SET_FILTER action handler body (or the whole action if day-filter is deleted — SET_FILTER is only used by day-filter).

### Pattern 5: EXAMPLE_PRESETS update

Replace in `RuleForm.tsx`:
```typescript
const EXAMPLE_PRESETS: Record<string, FormState> = {
  'fish-fridays': {
    name: 'Fish Fridays',
    ruleType: 'scheduling-rule',
    effect: 'require-one',
    days: ['friday'],
    slots: [],
    match: { mode: 'tag', filter: { protein_tag: 'fish' } },
  },
  'no-repeat-subzi': {
    name: 'No repeat subzi',
    ruleType: 'no-repeat',
    component_type: 'subzi',
  },
  'weekend-special': {
    name: 'Weekend special',
    ruleType: 'scheduling-rule',
    effect: 'filter-pool',
    days: ['saturday', 'sunday'],
    slots: [],
    match: { mode: 'tag', filter: { occasion_tag: 'weekend' } },
  },
  'no-paneer-weekdays': {
    name: 'No paneer weekdays',
    ruleType: 'scheduling-rule',
    effect: 'exclude',
    days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    slots: [],
    match: { mode: 'tag', filter: { protein_tag: 'paneer' } },
  },
};
```

### Anti-Patterns to Avoid

- **Adding v5 with `.stores()` that omits a table:** Omitting a table from `.stores()` drops its indexes. Always copy the full schema from the previous version.
- **Using Zod discriminated union narrowing inside upgrade():** The data is raw JSON off disk. TypeScript types don't apply inside the Dexie upgrade callback. Access `compiled_filter.type` as a raw string check.
- **Deleting DayFilterFields/RequireComponentFields before SchedulingRuleFields is complete:** TypeScript will error at the import sites in RuleForm.tsx. Delete only after the new component is imported.
- **Forgetting to update formReducer SET_DAYS/SET_SLOTS guard:** Leaving `state.ruleType === 'day-filter'` in the guard after removing the type will cause a TypeScript narrowing error.
- **Forgetting RuleRow.ruleTypeLabel for 'scheduling-rule':** The current fallback is `'Require'` (the final else). After migration, all old rules become scheduling-rule. Without adding a case, they will show the wrong badge label.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Reactive IndexedDB reads | Custom subscription | `useLiveQuery` (dexie-react-hooks) | Already in use; handles re-render on DB change |
| Radio input pair | Custom toggle | shadcn RadioGroup + RadioGroupItem | Accessibility, keyboard nav built in |
| Filtered component list | Custom filter hook | `useLiveQuery` + `.filter()` inline | Already established pattern in RequireComponentFields |
| Migration logic test | Browser-only test | Vitest + dexie fake IndexedDB | Existing test infrastructure already uses fake IndexedDB |

---

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | IndexedDB `rules` table: may contain `compiled_filter.type === 'day-filter'` or `'require-component'` records | Data migration in `db.version(5).upgrade()` |
| Live service config | None — no external services | None |
| OS-registered state | None | None |
| Secrets/env vars | None — no env vars involved | None |
| Build artifacts | None — no compiled binaries or installed CLIs | None |

**Migration data note:** The Dexie v5 upgrade runs once at app startup when `indexedDB.open('FoodPlannerDB', 5)` is triggered. The upgrade is atomic per Dexie's IDBTransaction semantics — if it throws, IndexedDB rolls back the version bump and the browser retries on next open.

---

## Common Pitfalls

### Pitfall 1: Dexie version number mismatch (CRITICAL)

**What goes wrong:** CONTEXT.md says "Currently at v2" but `src/db/client.ts` shows versions 1 through 4 already defined. Adding a `db.version(3)` upgrade (as CONTEXT suggests) would overwrite the existing v3 definition that adds `active_plan`.

**Why it happens:** CONTEXT.md was written at an earlier point in development before Phases 6+ were complete; the DB schema advanced to v4.

**How to avoid:** Always read `src/db/client.ts` to find the current highest version before writing the upgrade. The next version must be 5.

**Warning signs:** TypeScript or runtime error "Version X already defined."

### Pitfall 2: SET_FILTER action left dangling

**What goes wrong:** After `day-filter` is removed from the form, the `SET_FILTER` FormAction and its reducer case are dead code. If left in `types.ts`, they are harmless but messy. If `DayFilterFormState` is deleted from the union, the `SET_FILTER` case guard `if (state.ruleType === 'day-filter')` becomes an unreachable condition that TypeScript may flag.

**How to avoid:** Delete `SET_FILTER` from `FormAction` and its reducer case when deleting `DayFilterFormState`.

### Pitfall 3: RuleRow badge shows wrong label for migrated rules

**What goes wrong:** After migration, all formerly `day-filter` and `require-component` rules become `scheduling-rule`. `RuleRow.ruleTypeLabel` does not have a `scheduling-rule` case — the fallback is `'Require'`.

**How to avoid:** Add `scheduling-rule` case to `ruleTypeLabel` in `RuleRow.tsx`: `'Scheduling'`.

### Pitfall 4: generator.ts isRuleApplicable retains dead branches

**What goes wrong:** After removing `day-filter` and `require-component` from `CompiledFilterSchema`, the `isRuleApplicable` function's `if (rule.type === 'day-filter')` and `if (rule.type === 'require-component')` branches will cause TypeScript errors (type `'day-filter'` no longer exists). Also `requireRules` extraction will fail.

**How to avoid:** Remove those branches from `isRuleApplicable`, `applyDayFilterToPool`, the `requireRules` extraction, and the `applicableRequireRules` processing block in `generate()`.

### Pitfall 5: Test fixtures referencing deleted rule types

**What goes wrong:** `generator.test.ts` (144 tests currently passing) may include fixtures with `type: 'day-filter'` or `type: 'require-component'`. After removing those variants from `CompiledFilterSchema`, Zod will reject them as invalid rules at test time.

**How to avoid:** Before running tests after type deletion, grep the test files for `'day-filter'` and `'require-component'` and replace with equivalent `scheduling-rule` fixtures.

### Pitfall 6: RadioGroup not available in `src/components/ui/`

**What goes wrong:** `SchedulingRuleFields.tsx` imports `RadioGroup` from `@/components/ui/radio-group`, but `radio-group.tsx` does not exist (confirmed: not in `src/components/ui/`).

**How to avoid:** Wave 0 must install RadioGroup before `SchedulingRuleFields.tsx` is written. If the install fails, use the fallback pattern from UI-SPEC.

---

## Code Examples

### Dexie v5 upgrade structure

```typescript
// Source: src/db/client.ts — existing v4 stores() as reference
db.version(5).stores({
  components: '++id, componentType, base_type, extra_category, *dietary_tags, *regional_tags, *occasion_tags',
  meals: '++id, base_id, curry_id, subzi_id',
  meal_extras: '[meal_id+component_id], meal_id, component_id',
  rules: '++id',
  saved_plans: '++id, week_start',
  preferences: 'id',
  active_plan: 'id',
}).upgrade(tx => {
  return tx.table('rules').toCollection().modify(rule => {
    const cf = rule.compiled_filter;
    if (!cf || typeof cf !== 'object') return;
    if (cf.type === 'day-filter') {
      rule.compiled_filter = {
        type: 'scheduling-rule',
        effect: 'filter-pool',
        days: cf.days,
        slots: cf.slots ?? null,
        match: { mode: 'tag', filter: cf.filter },
      };
    } else if (cf.type === 'require-component') {
      rule.compiled_filter = {
        type: 'scheduling-rule',
        effect: 'require-one',
        days: cf.days,
        slots: cf.slots ?? null,
        match: { mode: 'component', component_id: cf.component_id },
      };
    }
    // Unknown types: leave unchanged (log and skip per Claude's Discretion)
  });
});
```

### SchedulingRuleFields prop interface

```typescript
// Modeled on DayFilterFields + RequireComponentFields existing patterns
import type { SchedulingRuleFormState, FormAction } from '../types';

interface SchedulingRuleFieldsProps {
  state: SchedulingRuleFormState;
  dispatch: React.Dispatch<FormAction>;
}
```

### RuleImpactPreview scheduling-rule case

```typescript
// Follows existing day-filter pattern in RuleImpactPreview.tsx
if (formState.ruleType === 'scheduling-rule') {
  const { match, effect } = formState;
  if (effect === '' || match.mode === '') return null;

  if (match.mode === 'tag') {
    const matchCount = allComponents.filter(c => {
      const { filter } = match;
      const dietaryOk = !filter.dietary_tag || c.dietary_tags.includes(filter.dietary_tag);
      const proteinOk = !filter.protein_tag || c.protein_tag === filter.protein_tag;
      const regionalOk = !filter.regional_tag || c.regional_tags.includes(filter.regional_tag);
      const occasionOk = !filter.occasion_tag || c.occasion_tags.includes(filter.occasion_tag);
      return dietaryOk && proteinOk && regionalOk && occasionOk;
    }).length;
    return { type: 'scheduling-rule-tag' as const, matchCount, total: allComponents.length };
  }

  if (match.mode === 'component') {
    if (match.component_id === null) return null;
    const componentName = allComponents.find(c => c.id === match.component_id)?.name ?? 'Unknown';
    return { type: 'scheduling-rule-component' as const, componentName };
  }
}
```

### RuleRow ruleTypeLabel update

```typescript
// Source: src/components/rules/RuleRow.tsx — existing switch pattern
const ruleTypeLabel =
  rule.compiled_filter.type === 'no-repeat'
    ? 'No Repeat'
    : 'Scheduling'
// (After phase 8: only 'no-repeat' and 'scheduling-rule' remain in the union)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `day-filter` CompiledFilter | `scheduling-rule` with `effect: 'filter-pool'` | Phase 7 (engine), Phase 8 (UI + migration) | Old variant removed from type system |
| `require-component` CompiledFilter | `scheduling-rule` with `effect: 'require-one'` | Phase 7 (engine), Phase 8 (UI + migration) | Old variant removed from type system |
| Separate form tabs for Day Filter / Require Component | Single "Scheduling Rule" tab | Phase 8 | Reduces tab count from 4 to 2 |

**Deprecated/outdated after this phase:**
- `DayFilterFormState`, `RequireComponentFormState` types — deleted
- `DayFilterFields.tsx`, `RequireComponentFields.tsx` — deleted
- `SET_FILTER` FormAction — deleted (only used by day-filter)
- `SET_COMPONENT_ID` FormAction — deleted (only used by require-component)
- `case 'day-filter':` and `case 'require-component':` in rule-compiler.ts — deleted
- `applyDayFilterToPool`, `requireRules` extraction, `applicableRequireRules` block in generator.ts — deleted

---

## Open Questions

1. **Dexie v5 upgrade: should `SET_COMPONENT_ID` action be kept for SchedulingRuleFields component picker?**
   - What we know: `SET_COMPONENT_ID` currently only updates `RequireComponentFormState.component_id`. The `SchedulingRuleFormState.match` is a discriminated union — updating `component_id` inside it requires the full `SET_MATCH_MODE` flow or a new action.
   - What's unclear: Whether to reuse SET_COMPONENT_ID (with updated reducer guard) or dispatch the full match object inline in SchedulingRuleFields.
   - Recommendation: Dispatch the full match inline in `SchedulingRuleFields` (e.g., `dispatch({ type: 'SET_MATCH_MODE', mode: 'component' })` sets up the shape, then a new `SET_SCHEDULING_COMPONENT_ID` action OR dispatching an updated match via the existing pattern). The simplest approach: add a new `SET_SCHEDULING_MATCH` action that replaces the entire match object. This avoids mutating nested state through partial updates.

2. **Are there existing IndexedDB fixtures in test files using `day-filter` or `require-component`?**
   - What we know: `generator.test.ts` has 144 tests passing; rule-compiler.test.ts has tests for all four variants.
   - What's unclear: How many generator tests create rules with the old types that will need updating.
   - Recommendation: When implementing, grep for `day-filter` and `require-component` in all test files before deleting the types. Update fixtures before running the full test suite.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build / test runner | ✓ | v25.8.1 | — |
| Vitest | Test suite | ✓ | ^4.1.0 (package.json) | — |
| Dexie | DB migration | ✓ | 4.3.0 | — |
| shadcn radio-group | SchedulingRuleFields | ✗ | — | Styled button pair with role="radio"/aria-checked |
| npx shadcn CLI | Component install | ✓ | (via npx) | — |

**Missing dependencies with no fallback:** None that block execution.

**Missing dependencies with fallback:**
- `radio-group` shadcn component: UI-SPEC documents the fallback pattern (two styled buttons with ARIA attributes). Prefer installing; fallback is acceptable.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `vitest.config.ts` (inferred — present via project patterns) |
| Quick run command | `npx vitest run src/services/rule-compiler.test.ts src/components/rules/ruleDescriptions.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCHED-05 | Dexie v5 upgrade migrates day-filter → scheduling-rule (filter-pool + tag match) | unit | `npx vitest run src/db/client.test.ts` | ❌ Wave 0 |
| SCHED-05 | Dexie v5 upgrade migrates require-component → scheduling-rule (require-one + component match) | unit | `npx vitest run src/db/client.test.ts` | ❌ Wave 0 |
| SCHED-05 | compileRule no longer accepts day-filter or require-component (type system) | unit | `npx vitest run src/services/rule-compiler.test.ts` | ✅ (update existing) |
| SCHED-05 | generator produces correct plans using only scheduling-rule; 144 existing tests pass | unit | `npx vitest run src/services/generator.test.ts` | ✅ (update fixtures) |
| SCHED-05 | RuleForm scheduling-rule tab saves a valid scheduling-rule record | smoke | manual or component test | — |

### Sampling Rate

- **Per task commit:** `npx vitest run src/services/rule-compiler.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green (144+ tests) before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/db/client.test.ts` — covers SCHED-05 migration logic (day-filter → scheduling-rule, require-component → scheduling-rule, unknown types left unchanged)
- [ ] Install `radio-group`: `npx shadcn add radio-group` — required by SchedulingRuleFields

*(Existing test infrastructure covers all other phase requirements — only migration logic test file is new.)*

---

## Project Constraints (from CLAUDE.md)

The project CLAUDE.md delegates to AGENTS.md, which contains one directive:

> **This is NOT the Next.js you know.** This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

**Implications for this phase:** Phase 8 does not introduce any new Next.js routing, server components, or API routes. All new code is client components (`'use client'` required for any component touching Dexie or using hooks). No Next.js-specific APIs are exercised — this constraint is LOW risk for this phase but must be noted for any plan tasks that touch routing (none expected).

---

## Sources

### Primary (HIGH confidence)

- `src/db/client.ts` — verified Dexie is at v4 (not v2 as CONTEXT.md states); upgrade pattern confirmed from v2 example
- `src/components/rules/RuleForm.tsx` — exact current state of formReducer, isFormValid, EXAMPLE_PRESETS, tab wiring
- `src/components/rules/types.ts` — confirmed FormState union includes SchedulingRuleFormState; DayFilterFormState and RequireComponentFormState still present (to be deleted)
- `src/components/rules/RuleFormFields/DayFilterFields.tsx` — day/slot checkbox pattern for reuse in SchedulingRuleFields
- `src/components/rules/RuleFormFields/RequireComponentFields.tsx` — Combobox + useLiveQuery pattern for component picker
- `src/components/rules/RuleImpactPreview.tsx` — impact computation pattern for scheduling-rule case
- `src/components/rules/RuleRow.tsx` — confirmed ruleTypeLabel missing scheduling-rule case
- `src/types/plan.ts` — CompiledFilterSchema discriminated union; all four variants present (two to be deleted)
- `src/services/rule-compiler.ts` — all four cases present; two to be deleted
- `src/services/generator.ts` — full generator; dead code branches identified
- `src/services/rule-compiler.test.ts` — tests for all four compile variants present
- `src/services/generator.test.ts` — 144 tests passing (confirmed via `npx vitest run`)
- `.planning/phases/08-scheduling-rule-ui-migration/08-UI-SPEC.md` — approved visual contract
- `package.json` — confirmed dexie 4.3.0, dexie-react-hooks 4.2.0, vitest ^4.1.0
- `src/components/ui/` directory listing — confirmed radio-group.tsx not installed

### Secondary (MEDIUM confidence)

- Dexie v4 upgrade API: pattern confirmed by reading existing v2/v3 upgrade code in client.ts; consistent with known Dexie upgrade semantics (`.modify()` on collection)

### Tertiary (LOW confidence)

- None — all findings verified from source code.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified from package.json and node_modules
- Architecture: HIGH — patterns read directly from existing source files
- Migration version number: HIGH — db.version(4) confirmed by reading client.ts (CONTEXT.md was stale)
- Pitfalls: HIGH — all identified from direct code inspection

**Research date:** 2026-03-24
**Valid until:** Phase 8 implementation complete (code changes during implementation may supersede)
