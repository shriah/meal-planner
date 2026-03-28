# Phase 10: Meal Template UI, Settings Removal, and Migration - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the `MealTemplateFields` form component so users can create meal-template rules through the existing `/rules/new` form. Simultaneously: remove `/settings/slots` route and `SlotSettings`/`SlotGrid`/`ComponentExceptions` components; remove the "Slot Settings" AppNav link; migrate existing prefs data (`base_type_slots`, `base_type_rules`, `component_slot_overrides`) to rule records via a Dexie v7 upgrade callback.

Requirements: **TMPL-06** (settings removal) and **TMPL-07** (migration).

This phase does NOT include: changes to the generator (fully complete from Phase 9), changes to the rule compiler (already handles meal-template), or new rule types beyond what Phase 9 established.

</domain>

<decisions>
## Implementation Decisions

### Form layout (MealTemplateFields)

- **D-01:** All fields are shown **at once** — no tabs, no collapsibles, no effect-first flow. The meal-template form is a flat, single-pass form with all constraint sections visible simultaneously.
- **D-02:** Field order (top to bottom):
  1. **Base type** — required; radio or select: `rice-based` / `bread-based` / `other`
  2. **Allowed slots** — chip/badge multi-select: `breakfast` / `lunch` / `dinner` (null if none selected = unrestricted)
  3. **Exclude component types** — checkboxes: `curry` / `subzi`
  4. **Exclude extra categories** — checkboxes: `liquid` / `crunchy` / `condiment` / `dairy` / `sweet`
  5. **Require extra category** — single select (or "none"): one of ExtraCategory values
  6. **Context scope — Days** — same day checkbox pattern as SchedulingRuleFields (null = all days)
  7. **Context scope — Slots** — same slot checkbox pattern as SchedulingRuleFields (null = all slots); clarifying label: "Composition constraints apply when meal is in…" to distinguish from Allowed slots above

- **D-03:** Context scope (Days + Slots, fields 6–7) gates ONLY the composition constraints (exclude_component_types, exclude_extra_categories, require_extra_category) — NOT allowed_slots. A short inline hint below the context scope section explains this: *"Days and slots above scope when exclusions and requirements apply. Slot assignment always applies."*

### Form tab

- **D-04:** A third tab is added to `RuleForm.tsx` tab set: `no-repeat` | `scheduling-rule` | `meal-template`. Tab label: **"Meal Template"**.

### Form validation

- **D-05:** A meal-template rule is valid (Save enabled) when:
  - `base_type` is selected (required), AND
  - At least one constraint is set: `allowed_slots` non-empty OR `exclude_component_types` non-empty OR `exclude_extra_categories` non-empty OR `require_extra_category` not null
  - A rule with only `base_type` and no constraints is a no-op and therefore not saveable.

### Settings removal

- **D-06:** The following files are **deleted entirely**:
  - `src/app/settings/slots/page.tsx`
  - `src/components/settings/SlotSettings.tsx`
  - `src/components/settings/SlotGrid.tsx`
  - `src/components/settings/ComponentExceptions.tsx`
  - The `src/app/settings/slots/` directory itself

- **D-07:** The `Slot Settings` `<Link>` in `src/components/plan/AppNav.tsx` is **removed**. If `/settings/slots` is visited after removal, Next.js will return 404 naturally (no redirect needed — personal app, no external links).

- **D-08:** If `/settings/` itself (the parent route) is now empty (no remaining child pages), the settings directory can also be removed. Researcher to confirm whether other settings pages exist.

### component_slot_overrides migration

- **D-09:** `prefs.slot_restrictions.component_slot_overrides` is migrated to **scheduling-rule** records (not meal-template, since meal-template has no per-component field):
  - For each entry `(component_id, allowed_slots[])`:
    - Compute `excluded_slots = ['breakfast', 'lunch', 'dinner'].filter(s => !allowed_slots.includes(s))`
    - If `excluded_slots` is non-empty, insert a RuleRecord:
      ```typescript
      {
        name: `Component ${component_id} slot restriction (migrated)`,
        enabled: true,
        compiled_filter: {
          type: 'scheduling-rule',
          effect: 'exclude',
          days: null,
          slots: excluded_slots,
          match: { mode: 'component', component_id },
        },
        created_at: new Date().toISOString(),
      }
      ```
    - If `allowed_slots` covers all three slots (empty excluded_slots), no rule needed — the component is unrestricted.
  - Note: Component names are not available in the Dexie upgrade callback without an extra table query; using `component_id` in the name is acceptable. The rules list will show a generated description via `describeRule()`.

### base_type_slots migration

- **D-10:** `prefs.slot_restrictions.base_type_slots` is migrated to **meal-template** RuleRecords:
  - For each entry `(base_type, allowed_slots[])`:
    - Insert a RuleRecord:
      ```typescript
      {
        name: `${base_type} slot assignment (migrated)`,
        enabled: true,
        compiled_filter: {
          type: 'meal-template',
          base_type,
          days: null,
          slots: null,
          allowed_slots,
          exclude_component_types: [],
          exclude_extra_categories: [],
          require_extra_category: null,
        },
        created_at: new Date().toISOString(),
      }
      ```

### base_type_rules migration

- **D-11:** `prefs.base_type_rules` is migrated to **meal-template** RuleRecords:
  - For each entry `{base_type, required_extra_category}`:
    - Insert a RuleRecord:
      ```typescript
      {
        name: `${base_type} required ${required_extra_category} (migrated)`,
        enabled: true,
        compiled_filter: {
          type: 'meal-template',
          base_type,
          days: null,
          slots: null,
          allowed_slots: null,
          exclude_component_types: [],
          exclude_extra_categories: [],
          require_extra_category: required_extra_category,
        },
        created_at: new Date().toISOString(),
      }
      ```
  - Note: one meal-template record per `base_type_rules` entry (separate from the slot assignment record). Multiple records for the same base_type compose correctly per Phase 9 D-08.

### Post-migration prefs cleanup

- **D-12:** After migrating all three prefs fields to rule records, the Dexie v7 upgrade callback clears the migrated prefs data:
  - `slot_restrictions.base_type_slots` → `{}`
  - `slot_restrictions.component_slot_overrides` → `{}`
  - `base_type_rules` → `[]`
  - Clearing is safe because D-05/D-06 in the generator already treats templates as the override — but clearing prevents any residual fallback reads from stale data.

### Dexie version

- **D-13:** Phase 10 adds `db.version(7)` with an `upgrade()` callback that performs D-09, D-10, D-11, D-12 in sequence. The existing `rules` table schema does not change (CompiledFilter already supports meal-template). No new tables.

### Claude's Discretion

- Exact component type for base_type selector (radio group vs. select dropdown — both valid)
- Whether allowed_slots uses shadcn Badge/Toggle or checkbox pattern (chip group preferred per Phase 8 note)
- Rule name casing and formatting for migrated records
- Whether to look up component names during migration via a `db.components.get(id)` call inside the upgrade callback (would improve rule names but adds async complexity)
- Form state shape for `MealTemplateFormState` (follow the flat pattern established in `SchedulingRuleFormState`)
- Impact preview for meal-template in `RuleImpactPreview.tsx` — follow day-filter/scheduling-rule pattern (count base components of the given type)
- Whether to add a meal-template example preset to `EXAMPLE_PRESETS` in RuleForm.tsx (recommended: yes, one preset showing rice-based lunch+dinner)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Form (primary new work)
- `src/components/rules/RuleForm.tsx` — add meal-template tab; add `handleSave()` branch; add meal-template to `isFormValid()`; optionally add example preset
- `src/components/rules/types.ts` — add `MealTemplateFormState` variant to FormState union; add meal-template case to `SET_RULE_TYPE`
- `src/components/rules/RuleFormFields/SchedulingRuleFields.tsx` — **primary reference pattern** for new `MealTemplateFields.tsx`; reuse day/slot checkbox sub-sections

### New file to create
- `src/components/rules/RuleFormFields/MealTemplateFields.tsx` — flat form with all fields (D-01 / D-02)

### Settings files to delete
- `src/app/settings/slots/page.tsx`
- `src/components/settings/SlotSettings.tsx`
- `src/components/settings/SlotGrid.tsx`
- `src/components/settings/ComponentExceptions.tsx`

### AppNav (remove link)
- `src/components/plan/AppNav.tsx` — remove `<Link href="/settings/slots">Slot Settings</Link>` (lines 18–20)

### Dexie migration
- `src/db/client.ts` — add `db.version(7)` upgrade; reference existing `db.version(5)` upgrade for the migration-in-callback pattern; migrations: D-09 (component_slot_overrides → scheduling-rule), D-10 (base_type_slots → meal-template), D-11 (base_type_rules → meal-template), D-12 (clear migrated prefs)

### Type system
- `src/types/plan.ts` — `MealTemplateRule`, `CompiledFilterSchema` (already complete from Phase 9); `RuleDefinition` meal-template variant (already complete); `DayOfWeek`, `MealSlot` enums
- `src/types/preferences.ts` — `SlotRestrictions`, `BaseTypeRule`, `UserPreferencesRecord` — read during migration; `slot_restrictions` and `base_type_rules` fields cleared after migration
- `src/types/component.ts` — `BaseType`, `ExtraCategory`, `ComponentType`

### Rule infrastructure (already done — reference only)
- `src/services/rule-compiler.ts` — `compileRule()` already has `'meal-template'` case
- `src/components/rules/ruleDescriptions.ts` — `describeRule()` already has `meal-template` case
- `src/components/rules/RuleRow.tsx` — badge label map already has `'meal-template': 'Meal Template'`
- `src/services/generator.ts` — fully integrated in Phase 9; no changes needed

### Tests
- `src/services/rule-compiler.test.ts` — migration helper tests (if extracted as a pure function like Phase 8's `migrateCompiledFilter`)
- `src/components/rules/` — component tests for `MealTemplateFields` following patterns in `SchedulingRuleFields` tests (if any exist)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SchedulingRuleFields.tsx` (276 lines) — day/slot checkbox sections are directly reusable in `MealTemplateFields`; extract or copy the day-scope and slot-scope sub-patterns
- `db.version(5)` upgrade callback in `src/db/client.ts` — established pattern for Dexie migration with `table.toCollection().modify()` and `tx.table()` calls; follow this for v7
- `FormState` union in `types.ts` — add `MealTemplateFormState` as a new union member; follow `SchedulingRuleFormState` shape (flat fields, no nested discriminated union needed)
- `RuleForm.tsx` `SET_RULE_TYPE` reducer case — already has a `'meal-template'` branch stub from Phase 9 (returns initial empty state); needs flesh-out once `MealTemplateFormState` is defined

### Established Patterns
- `'use client'` required for any component touching Dexie or useLiveQuery
- `useLiveQuery` for reactive rule reads — rules list stays reactive after migration
- Tabs component from shadcn/ui already used for rule type selector
- Checkboxes from shadcn/ui for days/slots — same as in SchedulingRuleFields
- Badge/Toggle components available in shadcn/ui for chip-style multi-select (allowed_slots)

### Integration Points
- `RuleForm.tsx`: add tab trigger + tab content for `'meal-template'`; add `handleSave()` branch to build `RuleDefinition` from `MealTemplateFormState` and call `compileRule()`; add `isFormValid()` branch per D-05
- `types.ts`: add `MealTemplateFormState`; add `'meal-template'` to `FormState` union and to `SET_RULE_TYPE` reducer
- `src/db/client.ts`: add `db.version(7)` with upgrade callback

</code_context>

<specifics>
## Specific Implementation Notes

### Allowed slots chip group
The Phase 8 CONTEXT.md recorded the user preference: "per-base multi-select chip group for meal-template slot assignment (one rule per base type, 'Allowed in: [lunch] [dinner]' as chip group)." Use Toggle or ToggleGroup from shadcn/ui, or Badge-style buttons that toggle active state. This is distinct from the scheduling-rule slot checkboxes.

### Context scope label distinction
Meal-template has two slot-related fields that could confuse users:
- `allowed_slots` — "This base type is allowed in these slots" (always applies)
- `slots` (context scope) — "Composition constraints (exclusions, requirements) only apply when meal is in these slots"

Use clear section labels: **"Slot assignment"** for `allowed_slots` and **"Composition scope (optional)"** for the context days + slots section.

### Migration: component_slot_overrides name improvement (optional)
If the researcher confirms that Dexie v7 upgrade callbacks can issue async table queries (they can — upgrade transaction allows reads), the migration can look up component names: `const comp = await tx.table('components').get(component_id); name = comp?.name ?? String(component_id)`. This gives friendlier rule names like "Poori slot restriction (migrated)".

### Seed data compatibility
After migration, `db/seed.tsx` still seeds `slot_restrictions` with the default `rice-based`, `bread-based`, `other` entries for first-time users (no existing prefs to migrate). The seed runs before v7 migration would be triggered (first launch creates prefs, v7 runs on the same version bump). Researcher should verify whether seed and migration ordering creates any conflict.

### No scheduling-rule form changes
Adding meal-template as a third tab does not touch the existing SchedulingRuleFields or NoRepeatFields components.

</specifics>

<deferred>
## Deferred Ideas

- **Rule editing** — Click existing rule to edit (not just toggle/delete). Deferred from Phase 5 and Phase 8, still deferred.
- **Multiple require_extra_category values in one rule** — current design supports one per rule; compose multiple rules. Deferred.
- **LLM natural language rule input** — Deferred from Phase 3, Phase 5, Phase 8, still deferred.
- **`extra_quantity_limits` in prefs** — explicitly out of scope for Phase 10; stays as a simple preference, no rule migration.
- **component_slot_overrides UI in Rules Manager** — after migration, these become standard scheduling-rule records and appear in the rules list like any other rule. No special UI needed.

</deferred>

---

*Phase: 10-meal-template-ui-settings-removal-migration*
*Context gathered: 2026-03-26*
