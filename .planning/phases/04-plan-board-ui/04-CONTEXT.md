# Phase 4: Plan Board UI - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the interactive 7×3 weekly plan grid on top of the Phase 3 generator. Users can view the generated plan, lock/unlock individual components within slots (base, curry, subzi, extras independently), lock entire days, manually swap any unlocked component via a meal picker, and regenerate unlocked slots. Plan state persists across page refreshes via Dexie.

This phase does NOT include: saving named plans (Phase 6), rules management UI (Phase 5), or export (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### Slot cell content
- Show **full composition** in each cell: base name prominently, then curry, subzi, and extras listed below
- Cells are tall enough to show all components — no truncation or "show more" needed

### Lock granularity — component level
- Locking is at the **individual component level**, not the whole slot
- Each cell has **4 independent lock controls**: base, curry, subzi, and extras (as a group)
- Lock icon per component row — unlocked = open padlock outline; locked = filled padlock
- When user **locks a day** (PLAN-03), it locks all 4 components across all 3 slots for that day (breakfast, lunch, dinner) — the entire day is frozen

### Slot interaction
- **Clicking an unlocked component row opens the meal picker**, pre-filtered to that component type
  - Clicking the curry row → picker shows only curries
  - Clicking the base row → picker shows only bases (filtered by slot restrictions)
  - Clicking the subzi row → picker shows only subzis
  - Clicking the extras row → picker shows compatible extras for the current base type
- Locked component rows are not clickable for swapping

### Meal picker
- Opens as a **bottom sheet/drawer** (shadcn Sheet component — already installed)
- Pre-filtered to the component type of the clicked row
- **Displays per candidate:** component name + dietary & regional tag badges + slot compatibility info (which meal slots this component is eligible for)
- **Search + tag filter chips** at the top of the sheet — same pattern as the component library (text search box + dietary/regional filter chips)
- Selecting a candidate replaces that component in the slot and auto-saves

### Plan state persistence
- Active plan is **auto-saved to Dexie (IndexedDB)** — survives page refresh
- **Zustand store** holds the current plan and all lock states in memory; syncs to Dexie on every change (lock toggle, swap, regeneration)
- On first visit (no plan in DB): show the empty 7×3 grid with all slots blank and a prominent **"Generate Plan" button** — user explicitly initiates first generation
- On subsequent visits: load plan + lock states from Dexie and render immediately

### Regenerate behavior
- Regenerate button re-runs the generator for all **unlocked components** only
- Locked components are passed as constraints to the generator (they are treated as pre-filled slots that the generator must respect)
- Generator still enforces all active rules against the unlocked portion

### Warning display
- Generator warnings (`Warning[]`) surface via two mechanisms:
  1. **Dismissable banner at the top** of the plan board summarizing all warnings (e.g., "2 rule violations — Friday lunch had no fish options")
  2. **Per-slot highlight** on affected cells (e.g., amber border or warning icon) with a tooltip showing the specific warning message on hover/tap
- Warnings clear automatically on the next successful regeneration with no violations

### Claude's Discretion
- Exact visual design of the 7×3 grid (column/row headers, cell borders, spacing)
- Lock icon choice (lucide-react Lock/Unlock icons are available)
- Zustand store structure (how lock state is keyed — e.g., `locks: Record<"day-slot-componentType", boolean>`)
- Loading/generating state UI while generator runs
- Exact toast or spinner during swap operations

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Generator interface (Phase 3 contracts)
- `src/services/generator.ts` — `generate()` function signature, how locked slots are passed in, return type `GeneratorResult`
- `src/types/plan.ts` — `PlanSlot`, `WeeklyPlan`, `Warning`, `GeneratorResult`, `DayOfWeek`, `CompiledFilter`. All plan board types build on these.

### Component data (Phase 1 + 2 contracts)
- `src/types/component.ts` — `ComponentRecord`, `ComponentType`, `BaseType`, `ExtraCategory`, tag literal unions. Meal picker filters components using these.
- `src/types/preferences.ts` — `UserPreferencesRecord`, `SlotRestrictions`, `MealSlot`, `BaseTypeRule`. Plan board must read slot restrictions to know which bases are eligible per slot.
- `src/services/food-db.ts` — `getAllComponents`, `getComponentsByType`, `getExtrasByBaseType`, `getPreferences`. Plan board and meal picker must use these — no direct Dexie calls from components.
- `src/db/client.ts` — Dexie schema. Phase 4 may need a new `active_plan` table or use an existing table for auto-saving the current plan + lock states.

### Requirements
- `.planning/REQUIREMENTS.md` — PLAN-02, PLAN-03, PLAN-05, UI-01, UI-02, UI-03, UI-04
- `.planning/ROADMAP.md` — Phase 4 success criteria

### Prior phase context
- `.planning/phases/02-meal-library-ui/02-CONTEXT.md` — Slot assignment defaults (base_type_slots + component_slot_overrides). Generator and plan board read these to determine slot eligibility per base type.
- `.planning/phases/03-plan-generator-rule-engine/03-CONTEXT.md` — Generator architecture, rule types, over-constrained handling (soft constraints), warning format.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/ui/` — button, badge, checkbox, input, label, select, separator, tabs, tooltip already installed. **Sheet is NOT yet installed** — needs `npx shadcn@latest add sheet` for the meal picker drawer.
- `src/services/food-db.ts` — `getAllComponents()`, `getComponentsByType(type)`, `getExtrasByBaseType(baseType)`, `getPreferences()` — use these in the meal picker.
- `src/services/generator.ts` — `generate(options)` — Phase 4 calls this on first generation and on regenerate.
- `src/lib/filter-components.ts` — Existing tag filter logic (`.every()` AND predicate). Meal picker can reuse this for its search + tag filter chip behavior.

### Established Patterns
- `'use client'` required for all components that touch Dexie (IndexedDB is browser-only)
- `useLiveQuery` (dexie-react-hooks) for reactive DB reads
- String literal unions for all tags — matches filter-components.ts and Dexie index format
- No React in service layer — all data access is async TypeScript functions
- Tailwind CSS 4 for styling; no additional CSS framework

### Integration Points
- **Route:** Plan board replaces the default `src/app/page.tsx` (current default Next.js page). Plan board becomes the home page `/`.
- **Navigation:** The library is at `/library` and settings at `/settings/slots`. A nav bar or header with links to these routes should be added in Phase 4 (or at minimum a link to `/library` from the plan board).
- **Dexie schema:** A new `active_plan` singleton (similar to `preferences` — fixed string key `'current'`) should be added to store the current `WeeklyPlan` + lock states. Requires a Dexie schema version bump.
- **Zustand:** Stack already includes Zustand (confirmed in STATE.md decisions). Phase 4 introduces the first Zustand store — `usePlanStore` — holding plan + locks + warnings.

</code_context>

<specifics>
## Specific Ideas

- Lock state key scheme: `{ day: DayOfWeek, meal_slot: MealSlot, component: 'base' | 'curry' | 'subzi' | 'extras' }` → boolean. Zustand store maps this to a flat Record for O(1) lookup.
- "Lock day" button lives in the column header for each day (Mon, Tue, ...). Clicking it locks all 12 components in that day's 3 slots.
- The 7×3 grid is **days as columns, meal slots as rows** (breakfast row on top, dinner row at bottom) — matches the roadmap spec (UI-01: "7×3 grid: days × meal slots").
- Bottom sheet meal picker is the same pattern as Phase 2's component tab but without the inline edit/delete controls — read-only list with selection.

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within Phase 4 scope.

</deferred>

---

*Phase: 04-plan-board-ui*
*Context gathered: 2026-03-20*
