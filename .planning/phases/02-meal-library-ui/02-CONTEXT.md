# Phase 2: Component Library UI - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the CRUD interface for managing individual meal **components** (Bases, Curries, Subzis, Extras) with compatibility metadata, a slot assignment settings screen, and a seed dataset of ~80–100 components that auto-loads on first launch.

**Architectural reframe from original scope:** The "Meal Library" is actually a Component Library. Meals are ephemeral compositions assembled at plan time (Phase 4) — not pre-created entities. The generator picks components and assembles them per slot, filtered by compatibility metadata on each component. This decision requires the following requirement adjustments (flag for planner):

- **MEAL-01** → "User can add a new component (Base/Curry/Subzi/Extra) with correct type-specific fields and compatibility metadata"
- **MEAL-02** → "User can edit an existing component"
- **MEAL-03** → "User can delete a component"
- **MEAL-04** → Tag components with dietary, protein, regional, and occasion tags (unchanged, but applies to components not meals)
- **MEAL-05** → Browse and search components by type and tags (unchanged framing)
- **DATA-06** → Seed ~80–100 individual components covering all types and cuisines (not pre-built meal combinations)

`MealRecord` (base_id + curry_id + subzi_id + extra_ids) remains in the schema as a plan-time composition artifact created by the generator in Phase 3, not by users through a form.

</domain>

<decisions>
## Implementation Decisions

### No meal creation form
There is no standalone "create a meal" UI. Meal composition (picking Base + Curry + Subzi + Extras for a plan slot) happens inside the weekly plan grid in Phase 4. Phase 2 only manages components.

### Library display
- **Layout:** Tabbed by component type — four tabs: Bases, Curries, Subzis, Extras
- **Per-row info:** Component name + dietary tag + regional tag + compatible base types (the compatibility column is shown for all types; for Bases and Curries which have no `compatible_base_types` field, that column is blank or omitted)
- **Editing:** Clicking a row expands it inline — no modal, no navigation away from the list
- **Search/filter:** Text search box + tag filter chips (dietary, regional) per tab
- **Add button:** `[ + Add {ComponentType} ]` at the bottom of each tab's list

### Slot assignment settings screen
- **Location:** A dedicated settings screen accessible from the app (not buried in a component's edit form)
- **Primary control:** Checkbox grid — rows are base types (`rice-based`, `bread-based`, `other`), columns are slots (Breakfast, Lunch, Dinner). Multiple slots can be checked per base type.
- **Per-component overrides:** An optional expandable section below the grid ("Component exceptions") — initially empty. User can add a specific component (e.g., Poori) and assign it to different slots than its base_type default.
- **Default slot mappings (seed into UserPreferences on first launch):**
  - `other` (idli, dosa, poori, etc.) → Breakfast + Dinner
  - `rice-based` → Lunch only
  - `bread-based` → Dinner only
  - Component override: Poori → Breakfast (overrides the `other` base type's dinner slot)

### Seed dataset
- **What:** ~80–100 `ComponentRecord` objects covering all four component types with correct compatibility metadata, dietary tags, regional tags, and occasion tags
- **Coverage:** Broad — all base types (rice varieties, roti/chapati/paratha, idli/dosa/poori), mix of South Indian + North Indian + coastal cuisines, veg + non-veg, all Extra categories (liquid, crunchy, condiment, dairy, sweet)
- **Authored by:** Claude generates the dataset as part of the implementation plan
- **Format:** `src/db/seed.ts` — a TypeScript file exporting `ComponentRecord[]`, typed, no external JSON file
- **Trigger:** Auto-seeds on first app launch if the `components` table is empty. Detection via `db.components.count()`. One-time operation — no reset mechanism needed.

### Claude's Discretion
- Exact empty state design per tab (illustration vs. simple text prompt)
- Delete confirmation UX (inline warning vs. toast with undo)
- Exact spacing, typography, and color system for the component list rows
- How to handle a component that is used in existing plan slots when deleted (warn or cascade)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Data model (Phase 1 contracts)
- `src/types/component.ts` — `ComponentRecord`, `MealComponent` discriminated union, `BaseType`, `ExtraCategory`, `ComponentType`, all tag literal unions. The component form fields and seed data shape must match these types exactly.
- `src/types/preferences.ts` — `UserPreferencesRecord`, `SlotRestrictions`, `MealSlot`, `BaseTypeRule`. The slot assignment settings screen reads and writes this structure.
- `src/db/client.ts` — Dexie schema. All component CRUD goes through `db.components`. Preferences singleton at `db.preferences.get('prefs')`.
- `src/services/food-db.ts` — All 12 CRUD functions. UI must use these exclusively — no direct Dexie calls from components.

### Requirements
- `.planning/REQUIREMENTS.md` — MEAL-01 through MEAL-05 and DATA-06 (note: requirements are being reframed per decisions above; planner should update traceability)
- `.planning/ROADMAP.md` — Phase 2 success criteria (note: success criteria reference "meals" but mean "components" after the reframe)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/services/food-db.ts` — `getAllComponents`, `getComponentsByType`, `addComponent`, `updateComponent`, `deleteComponent`, `getPreferences`, `putPreferences`. The UI layer must call these — they are the sole data access point.
- Tailwind CSS 4 — configured via `postcss.config.mjs`. No component library installed yet; all UI is custom.
- Next.js App Router — `src/app/` with `layout.tsx`. No routes beyond the default page. Phase 2 adds the component library route.

### Established Patterns
- Client components required for any Dexie access (IndexedDB is browser-only). Mark with `'use client'` directive.
- No React hooks in service layer — all Dexie calls are async functions. UI components use `useEffect` or `useLiveQuery` (Dexie's reactive hook) to subscribe to data.
- String literal unions for all tags (not TypeScript enums) — matches Dexie's multi-entry index format.

### Integration Points
- The seed function runs once on app startup — likely in `src/app/layout.tsx` or a client wrapper that checks `db.components.count()`.
- The slot assignment settings screen reads/writes `UserPreferencesRecord` via `getPreferences` / `putPreferences`.
- Phase 3 (generator) will import `getComponentsByType` and `getExtrasByBaseType` from `food-db.ts` — the component data seeded here is what Phase 3 works with. Seed quality directly affects generator output quality.

</code_context>

<specifics>
## Specific Ideas

- Poori is `componentType: 'base'`, `base_type: 'other'` in the seed, but gets a `component_slot_overrides` entry in UserPreferences pointing it to Breakfast only (not Breakfast + Dinner like other `other`-type bases).
- The slot settings grid should visually look like: rows = base types, columns = Breakfast / Lunch / Dinner, cells = checkboxes. Multi-select per row is the expected behavior.

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within Phase 2 scope.

</deferred>

---

*Phase: 02-meal-library-ui*
*Context gathered: 2026-03-20*
