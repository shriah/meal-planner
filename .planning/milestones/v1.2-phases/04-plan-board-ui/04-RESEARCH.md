# Phase 4: Plan Board UI - Research

**Researched:** 2026-03-21
**Domain:** React interactive grid UI, Zustand state management, Dexie persistence, shadcn Sheet component
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Slot cell content:** Show full composition in each cell — base name prominently, then curry, subzi, and extras listed below. Cells are tall enough to show all components — no truncation.
- **Lock granularity — component level:** Locking is at the individual component level. Each cell has 4 independent lock controls: base, curry, subzi, and extras (as a group). Lock icon per component row — unlocked = open padlock outline; locked = filled padlock.
- **Lock Day:** When user locks a day (PLAN-03), it locks all 4 components across all 3 slots for that day (12 locks total). "Lock Day" button lives in the column header.
- **Slot interaction:** Clicking an unlocked component row opens the meal picker pre-filtered to that component type. Locked component rows are not clickable.
- **Meal picker:** Opens as a bottom sheet/drawer (shadcn Sheet — NOT yet installed, needs `npx shadcn@latest add sheet`). Displays component name + dietary/regional tag badges + slot compatibility info. Search + tag filter chips at the top. Selecting a candidate replaces the component and auto-saves.
- **Plan state persistence:** Auto-saved to Dexie (IndexedDB). Zustand store holds current plan and all lock states in memory; syncs to Dexie on every change. On first visit (no plan in DB): show empty 7×3 grid with all slots blank and a prominent "Generate Plan" button. On subsequent visits: load plan + lock states from Dexie immediately.
- **Regenerate behavior:** Regenerate button re-runs the generator for all unlocked components only. Locked components are passed as constraints (pre-filled). Generator still enforces all active rules against unlocked portion.
- **Warning display:** (1) Dismissable banner at the top summarizing all warnings. (2) Per-slot highlight on affected cells (amber border + warning icon) with a tooltip showing the specific warning message. Warnings clear on next successful regeneration with no violations.
- **Route:** Plan board replaces `src/app/page.tsx` — becomes home page `/`.
- **Navigation:** AppNav header added in Phase 4 with links to `/library` and `/settings/slots`.
- **Dexie schema:** New `active_plan` singleton (key `'current'`) added for WeeklyPlan + lock states. Requires Dexie schema version bump (v3).
- **Zustand:** First Zustand store in the project — `usePlanStore` — holding plan + locks + warnings.
- **Grid orientation:** Days as columns (Mon–Sun), meal slots as rows (breakfast/lunch/dinner). 7 day columns + 1 row-label column, 3 slot rows + 1 header row.
- **Lock key scheme:** `{ day: DayOfWeek, meal_slot: MealSlot, component: 'base' | 'curry' | 'subzi' | 'extras' }` → boolean. Stored as flat Record for O(1) lookup.

### Claude's Discretion
- Exact visual design of the 7×3 grid (column/row headers, cell borders, spacing)
- Lock icon choice (lucide-react Lock/Unlock icons are available)
- Zustand store structure (how lock state is keyed — e.g., `locks: Record<"day-slot-componentType", boolean>`)
- Loading/generating state UI while generator runs
- Exact toast or spinner during swap operations

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within Phase 4 scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PLAN-02 | User can lock individual meal slots; locked slots persist across regeneration | Zustand lock state store + Dexie active_plan persistence; `generate()` must be extended to accept locked slots as constraints |
| PLAN-03 | User can lock all meals for an entire day at once | "Lock Day" button in DayColumnHeader; sets 12 locks (4 components × 3 slots) simultaneously via Zustand store action |
| PLAN-05 | User can manually swap any individual slot by selecting a replacement from the meal library | MealPickerSheet (shadcn Sheet) opens on unlocked component click; replaces component in Zustand store and persists to Dexie |
| UI-01 | Weekly plan displayed as a 7×3 grid (days × meal slots: breakfast / lunch / dinner) | CSS Grid 8-column layout; days as columns, slots as rows; MealCell per intersection |
| UI-02 | Each slot shows lock/unlock control; locked slots are visually distinguished | ComponentRow with Lock/Unlock lucide icon; muted background + primary icon color when locked |
| UI-03 | Regenerate button re-randomizes all unlocked slots respecting active rules | `generate()` extended to accept `lockedSlots` param; PlanActionBar with Regenerate button + spinner state |
| UI-04 | Tapping/clicking a slot opens a meal picker filtered to that slot type | MealPickerSheet pre-filtered to clicked ComponentType; uses `getComponentsByType()` from food-db.ts |
</phase_requirements>

---

## Summary

Phase 4 builds an interactive 7×3 weekly plan grid on top of the Phase 3 generator. The primary technical challenge is threefold: (1) extending `generate()` to accept locked slot constraints — the current signature takes no parameters and generates fully fresh; (2) introducing the first Zustand store into the project for plan + lock state management with Dexie sync; and (3) adding a Dexie v3 schema upgrade for the new `active_plan` table.

The UI layer follows established project patterns closely. shadcn Sheet is the only new component that needs installation. The meal picker reuses the filter pattern from `ComponentTab.tsx` and `filterComponents.ts`. The grid layout is standard CSS Grid. All components require `'use client'` because they touch either Zustand state, Dexie (IndexedDB is browser-only), or React event handlers.

A critical discovery: **Zustand is not currently installed** (not in package.json, not in node_modules). It must be added before any Zustand store work begins. The project decided on Zustand in STATE.md but it was never actually installed — this is the top Wave 0 blocker for Phase 4.

**Primary recommendation:** Start Phase 4 with a Wave 0 setup plan that installs Zustand, installs shadcn Sheet, bumps the Dexie schema to v3, and extends `generate()` to accept locked slot constraints — before any UI component work.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zustand | 5.0.12 (latest) | Client-side state store for plan + lock states | Project decision from STATE.md; minimal boilerplate, works natively with React 19 |
| dexie | 4.3.0 (installed) | IndexedDB persistence of active_plan + lock states | Already in use for all Dexie tables; singleton pattern established |
| dexie-react-hooks | 4.2.0 (installed) | `useLiveQuery` for reactive plan DB reads | Already used throughout Phase 2/3 components |
| shadcn Sheet | latest (not installed) | Bottom drawer for meal picker | Project decision; already installed shadcn, Sheet is official registry component |
| lucide-react | 0.577.0 (installed) | Lock, Unlock, RefreshCw, AlertTriangle, X icons | Already installed; Lock/Unlock confirmed available |
| tailwindcss | 4 (installed) | Grid layout, spacing, color tokens | All existing components use Tailwind 4 exclusively |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn Tooltip | installed | Warning message on hover for affected cells | Already installed; wrap AlertTriangle icon in Tooltip |
| shadcn Badge | installed | Tag chips in meal picker, slot eligibility labels | Already used in ComponentTab — reuse same pattern |
| shadcn Button | installed | Regenerate Plan, Generate Plan, Lock Day CTAs | Already used throughout |
| shadcn Alert | installed | Warning banner (or can use custom div with amber styles) | Installed; check if it fits the dismissable pattern |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Zustand | React Context + useReducer | Context causes full subtree re-renders on any lock toggle; Zustand uses selector subscriptions — only components that read a changed slice re-render. Zustand is the project decision. |
| Dexie for plan persistence | localStorage | localStorage has 5MB limit and synchronous API; Dexie is already in use and handles large plan objects naturally |
| shadcn Sheet | React Portal + custom drawer | Sheet is official shadcn component; saves animation, focus trap, and keyboard handling |

### Installation

```bash
npm install zustand
npx shadcn@latest add sheet
```

**Version verification (run before installing):**
```bash
npm view zustand version
# Expected: 5.0.12 as of 2026-03-21
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── app/
│   └── page.tsx                    # Replace with PlanBoard (client component wrapper)
├── stores/
│   └── plan-store.ts               # usePlanStore (Zustand) — plan + locks + warnings
├── services/
│   └── plan-db.ts                  # New: getActivePlan, saveActivePlan (wraps Dexie)
├── components/
│   └── plan/
│       ├── PlanBoard.tsx           # Root grid container ('use client')
│       ├── AppNav.tsx              # Navigation header
│       ├── DayColumnHeader.tsx     # Day name + Lock Day button
│       ├── SlotRowLabel.tsx        # Breakfast/Lunch/Dinner row label
│       ├── MealCell.tsx            # Single day×slot cell with 4 ComponentRows
│       ├── ComponentRow.tsx        # Individual base/curry/subzi/extras row with lock icon
│       ├── MealPickerSheet.tsx     # shadcn Sheet meal picker
│       ├── PlanActionBar.tsx       # Regenerate Plan button + spinner
│       └── WarningBanner.tsx       # Dismissable amber warning summary
```

**Note:** Do not name the new `ComponentRow` in the plan folder the same as the existing `src/components/library/ComponentRow.tsx`. Use a separate file under `src/components/plan/`.

### Pattern 1: Zustand Store with Dexie Sync

**What:** Zustand store holds all plan state in memory. Every mutating action (lock toggle, swap, regenerate) calls a Dexie save after updating store state.

**When to use:** Whenever plan state is read or written. No direct Dexie calls from UI components — all Dexie access goes through the store actions or the `plan-db.ts` service.

**Lock key format (flat Record for O(1) lookup):**
```typescript
// src/stores/plan-store.ts
type LockKey = `${DayOfWeek}-${MealSlot}-${'base' | 'curry' | 'subzi' | 'extras'}`

interface PlanStore {
  plan: WeeklyPlan | null
  locks: Record<LockKey, boolean>
  warnings: Warning[]
  isGenerating: boolean
  warningBannerDismissed: boolean

  // Actions
  initFromDB: () => Promise<void>
  setLock: (key: LockKey, locked: boolean) => void
  lockDay: (day: DayOfWeek) => void
  unlockDay: (day: DayOfWeek) => void
  swapComponent: (day: DayOfWeek, slot: MealSlot, componentType: ComponentType, componentId: number) => Promise<void>
  regenerate: () => Promise<void>
  dismissWarningBanner: () => void
}
```

**On every mutation, call:**
```typescript
// After updating state, sync to Dexie
await saveActivePlan({ plan: get().plan, locks: get().locks })
```

### Pattern 2: Generate with Locked Constraints

**What:** The existing `generate()` function accepts no parameters. Phase 4 needs partial regeneration — only unlocked components are regenerated; locked ones are preserved as-is.

**The generator extension approach:** Add an optional `lockedSlots` parameter to `generate()`. For each slot where components are locked, inject the locked component IDs directly into the result rather than running the randomization algorithm for those components.

**Proposed signature extension for `src/services/generator.ts`:**
```typescript
export interface GenerateOptions {
  lockedSlots?: Partial<Record<`${DayOfWeek}-${MealSlot}`, {
    base_id?: number       // defined = locked
    curry_id?: number      // defined = locked
    subzi_id?: number      // defined = locked
    extra_ids?: number[]   // defined = locked (whole extras group)
  }>>
}

export async function generate(options?: GenerateOptions): Promise<GeneratorResult>
```

When `options.lockedSlots` is provided, the generator:
1. Pre-fills locked component IDs for each slot
2. Skips randomization for those components (treats as pre-selected)
3. Still runs rules + warnings on the unlocked portion
4. Returns the merged plan (locked + newly generated)

**Important:** The existing `generate()` call with no arguments must still work unchanged. The options parameter is optional.

### Pattern 3: Dexie Schema Version Bump

**What:** Add `active_plan` table to Dexie. Use singleton key pattern (string key `'current'`) matching the `preferences` table pattern.

```typescript
// src/db/client.ts — new table record
export interface ActivePlanRecord {
  id: 'current'
  plan: WeeklyPlan
  locks: Record<string, boolean>  // LockKey → boolean
  updated_at: string
}

// db.version(3) — only adds active_plan table, no data migration
db.version(3).stores({
  // ...all existing tables unchanged...
  active_plan: 'id',
})
```

**Critical:** Dexie version bumps must include all existing table definitions or those tables may lose their indexes. Always copy all existing table store strings when adding a new version.

### Pattern 4: CSS Grid for the Plan Board

**What:** 8-column CSS grid (1 sticky row-label col + 7 day cols), 4 rows (1 header row + 3 slot rows). Day column width fixed at 120px minimum, row-label column fixed at 80px.

```tsx
// PlanBoard layout
<div className="grid overflow-x-auto">
  <div
    style={{ gridTemplateColumns: '80px repeat(7, minmax(120px, 1fr))' }}
    className="grid"
  >
    {/* Row 1: empty corner + 7 DayColumnHeaders */}
    {/* Row 2: Breakfast label + 7 MealCells */}
    {/* Row 3: Lunch label + 7 MealCells */}
    {/* Row 4: Dinner label + 7 MealCells */}
  </div>
</div>
```

**Sticky row label column:** Apply `sticky left-0 z-10 bg-background` to `SlotRowLabel` and the empty corner cell so they stay visible on horizontal scroll.

### Pattern 5: useLiveQuery for Hydration (Initial Load)

**What:** On app mount, `initFromDB()` in the Zustand store reads the `active_plan` table via Dexie. Do NOT use `useLiveQuery` for the plan board live updates — the Zustand store is the single source of truth after hydration, and manual syncs to Dexie keep persistence up to date.

**Why not useLiveQuery for the plan board:** The plan board has high-frequency mutations (lock toggles on every click). Re-running full Dexie queries on every lock toggle would cause unnecessary re-renders. The pattern is: hydrate once from Dexie on mount → all subsequent reads/writes through Zustand.

### Anti-Patterns to Avoid

- **Direct Dexie calls from UI components:** All Dexie access must go through service functions in `plan-db.ts`, following the established pattern in `food-db.ts`.
- **Using `useLiveQuery` for the plan board grid:** Use Zustand store selectors instead; `useLiveQuery` is appropriate for the meal picker's component list (which needs live library updates).
- **Passing the full plan object as a prop through the grid:** Use Zustand store selectors in each `MealCell` to subscribe only to the slice they need.
- **Zustand store without selector optimization:** Always use `useStore(state => state.specificField)` pattern, not `useStore()` — React 19 with Zustand 5 still benefits from selector subscriptions.
- **Naming plan-folder ComponentRow the same as library ComponentRow:** Different concerns; the plan version shows lock icons and does not handle edit/delete.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bottom drawer/sheet UI | Custom drawer with CSS transitions | `shadcn Sheet` (`side="bottom"`) | Focus trap, keyboard escape, animation, accessibility — all handled |
| Lock icon toggle | SVG icons from scratch | `lucide-react` `Lock` + `Unlock` | Already installed; consistent with rest of app |
| Tag filter chips in meal picker | New filter logic | Reuse `filterComponents()` from `src/lib/filter-components.ts` | Already has AND logic, name search, dietary + regional filters |
| Warning tooltip on cells | Custom tooltip implementation | `shadcn Tooltip` (already installed) | Already used in Phase 2; consistent UX |
| Component-level state for lock | `useState` per cell | Zustand store | 84 potential lock states (7 days × 3 slots × 4 components); component-local state would not survive navigation |
| Plan persistence | `localStorage` | Dexie `active_plan` table | `localStorage` is sync and 5MB limited; Dexie handles async large JSON naturally |

**Key insight:** The meal picker is structurally identical to `ComponentTab.tsx` minus the inline edit/delete controls. Reuse the same filter pattern (`filterComponents` + badge chips + text search) rather than building new filter logic.

---

## Common Pitfalls

### Pitfall 1: Dexie Version Bump Missing Existing Tables

**What goes wrong:** When adding v3 with only `active_plan: 'id'`, all other tables get dropped from the schema because Dexie requires ALL table definitions in every version upgrade.

**Why it happens:** Dexie uses the store schema to rebuild IndexedDB object stores. Omitting a table removes it.

**How to avoid:** In `db.version(3).stores({...})`, copy ALL existing table entries from v2 unchanged, then add the new `active_plan` entry.

**Warning signs:** App loses all components/meals after first refresh. Dexie throws "Table 'components' not part of database" errors.

### Pitfall 2: `'use client'` Missing on Plan Components

**What goes wrong:** PlanBoard, MealCell, MealPickerSheet, and all plan components touch Zustand (client state), Dexie (IndexedDB = browser-only API), and event handlers. Without `'use client'`, Next.js 16 App Router tries to render them as Server Components and throws hydration or import errors.

**Why it happens:** Next.js App Router defaults to Server Components. IndexedDB and Zustand stores are not available server-side.

**How to avoid:** Add `'use client'` as the first line of every component file under `src/components/plan/` and `src/stores/plan-store.ts`. The `src/app/page.tsx` root page can remain a Server Component if it just renders `<PlanBoard />` — the client boundary propagates down from PlanBoard.

**Warning signs:** "window is not defined", "Cannot read properties of undefined (reading 'getState')", or hydration mismatch errors.

### Pitfall 3: Generator Called Without Locked Slot Support

**What goes wrong:** Calling `generate()` on "Regenerate Plan" with no changes replaces ALL 21 slots, ignoring user locks.

**Why it happens:** The current `generate()` takes no parameters and generates a fully fresh plan.

**How to avoid:** The `generate()` extension (adding optional `GenerateOptions` parameter) must be implemented before the Regenerate button is wired up.

**Warning signs:** All meals change on every regenerate, even locked ones.

### Pitfall 4: Zustand Hydration Race — Plan Rendered Before DB Load

**What goes wrong:** Component renders with `plan: null` before `initFromDB()` completes, causing a flash of the empty "No plan yet" state even when a plan exists in Dexie.

**Why it happens:** `initFromDB()` is async; if the grid renders before it resolves, the null check shows the empty state.

**How to avoid:** Add a `hydrated: boolean` field to the Zustand store, set to `false` initially, `true` after `initFromDB()` resolves. Render a loading skeleton (or nothing) while `!hydrated`.

**Warning signs:** "No plan yet" flash visible for ~100ms on every page load even after plan is saved.

### Pitfall 5: Extras Lock Group Handling

**What goes wrong:** The `PlanSlot` type stores `extra_ids: number[]` (an array), but the lock granularity contract locks extras "as a group". Locking extras does not mean locking individual extra IDs — it means the whole `extra_ids` array is preserved on regeneration.

**Why it happens:** Extras are a set, not individual lockable items; the lock key is `...-extras` (singular group lock), not per-extra-id.

**How to avoid:** When building the locked slot constraint object passed to `generate()`, treat the extras lock as "keep this entire `extra_ids` array unchanged." Pass the full array as the locked value.

---

## Code Examples

Verified patterns from existing project code:

### Dexie Singleton Pattern (from food-db.ts / preferences table)
```typescript
// Same pattern as preferences ('prefs' key) — use 'current' for active_plan
await db.active_plan.put({
  id: 'current',
  plan: weeklyPlan,
  locks: locksRecord,
  updated_at: new Date().toISOString(),
})
const record = await db.active_plan.get('current')
```

### useLiveQuery Pattern for Meal Picker (from ComponentTab.tsx)
```typescript
// In MealPickerSheet — get live component list for the picker
const components = useLiveQuery(
  () => getComponentsByType(componentType),
  [componentType],
  [],
)
```

### filterComponents Reuse (from filter-components.ts)
```typescript
// Reuse directly in MealPickerSheet — same AND logic, same params
import { filterComponents } from '@/lib/filter-components'

const filtered = useMemo(
  () => filterComponents(allComponents ?? [], searchText, activeDietaryTags, activeRegionalTags),
  [allComponents, searchText, activeDietaryTags, activeRegionalTags],
)
```

### Zustand Store Boilerplate (Zustand 5 pattern)
```typescript
'use client'
import { create } from 'zustand'

interface PlanStore { /* ... */ }

export const usePlanStore = create<PlanStore>((set, get) => ({
  plan: null,
  locks: {},
  warnings: [],
  isGenerating: false,
  hydrated: false,
  warningBannerDismissed: false,

  initFromDB: async () => {
    const record = await getActivePlan()
    set({
      plan: record?.plan ?? null,
      locks: record?.locks ?? {},
      hydrated: true,
    })
  },

  setLock: (key, locked) => {
    set(state => ({ locks: { ...state.locks, [key]: locked } }))
    // Sync to Dexie
    const { plan, locks } = get()
    if (plan) saveActivePlan({ plan, locks: { ...locks, [key]: locked } })
  },

  lockDay: (day) => {
    const ALL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner']
    const ALL_COMPONENTS = ['base', 'curry', 'subzi', 'extras'] as const
    const newLocks: Record<string, boolean> = { ...get().locks }
    for (const slot of ALL_SLOTS) {
      for (const comp of ALL_COMPONENTS) {
        newLocks[`${day}-${slot}-${comp}`] = true
      }
    }
    set({ locks: newLocks })
    const { plan } = get()
    if (plan) saveActivePlan({ plan, locks: newLocks })
  },
}))
```

### Locked Cell Visual Pattern (from UI-SPEC.md)
```tsx
// ComponentRow locked vs unlocked
<div className={cn(
  'flex items-center gap-2 rounded px-2 py-1 min-h-[44px]',
  isLocked ? 'bg-muted' : 'bg-card hover:bg-accent/10 cursor-pointer'
)}>
  <button
    onClick={() => toggleLock(lockKey)}
    className="min-w-[44px] min-h-[44px] flex items-center justify-center"
    aria-label={isLocked ? `Unlock ${componentLabel}` : `Lock ${componentLabel}`}
  >
    {isLocked
      ? <Lock className="h-4 w-4 text-primary" />
      : <Unlock className="h-4 w-4 text-muted-foreground" />}
  </button>
  <span
    className={cn('text-sm', isLocked ? 'text-muted-foreground' : 'text-foreground')}
    onClick={isLocked ? undefined : () => openPicker(lockKey)}
  >
    {componentName}
  </span>
</div>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `generate()` takes no params | `generate(options?: GenerateOptions)` | Phase 4 (new) | Enables partial regeneration preserving locks |
| No plan state management | Zustand `usePlanStore` | Phase 4 (new, first store) | Centralized reactive plan state across all grid cells |
| No `active_plan` in Dexie | `active_plan` table added in v3 | Phase 4 (new schema version) | Plan + locks survive page refresh |
| Default Next.js home page | PlanBoard as `/` route | Phase 4 (new) | App entrypoint becomes functional |
| No app navigation | AppNav header with `/library` + `/settings/slots` links | Phase 4 (new) | All routes accessible from home |

**Deprecated/outdated:**
- The default `src/app/page.tsx` (Next.js boilerplate content): replaced entirely by Phase 4 PlanBoard.

---

## Open Questions

1. **Generator extension interface for locked extras**
   - What we know: `extra_ids` is stored as `number[]`; the lock is a group lock on the whole array
   - What's unclear: Should locked extras be passed as a full `extra_ids: number[]` in the constraint, or as a flag meaning "preserve current extras"?
   - Recommendation: Pass as `extra_ids: number[]` in the locked slot constraint — the generator checks if `extra_ids` is defined in the locked constraint and skips extra selection for that slot entirely.

2. **Zustand 5 vs Zustand 4 API differences**
   - What we know: Latest Zustand is 5.0.12; latest stable is 5.x. The `create` import changes between versions.
   - What's unclear: Training data may have Zustand 4 patterns (`.getState()` subscription API differs slightly).
   - Recommendation: Use `import { create } from 'zustand'` (unchanged in v5). The main v5 change is React 18+ requirement (satisfied — project uses React 19.2.4). No breaking changes affect this use case.

3. **`generate()` called synchronously in the browser (no server round-trip)**
   - What we know: Generator is already synchronous LLM-free TypeScript.
   - What's unclear: Does calling `generate()` inside a Zustand store action (client-side) cause any issue with Next.js 16's server/client boundary?
   - Recommendation: Generator only calls `getAllComponents()`, `getPreferences()`, `getEnabledRules()` — all Dexie reads. These are browser-only APIs; generator must only be called from client components or Zustand actions. Add `'use client'` at generator call sites. No server-side calls are involved.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `vitest.config.ts` (exists) |
| Quick run command | `npm test -- --reporter=verbose` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLAN-02 | Lock state persists across regeneration — locked components not overwritten | unit | `npm test -- src/stores/plan-store.test.ts -t "lock"` | ❌ Wave 0 |
| PLAN-03 | Lock Day sets 12 locks (4 components × 3 slots) for one day | unit | `npm test -- src/stores/plan-store.test.ts -t "lockDay"` | ❌ Wave 0 |
| PLAN-05 | swapComponent replaces single component in slot and saves | unit | `npm test -- src/stores/plan-store.test.ts -t "swap"` | ❌ Wave 0 |
| UI-01 | Grid renders 21 cells (7 days × 3 slots) | unit | `npm test -- src/components/plan/PlanBoard.test.tsx` | ❌ Wave 0 |
| UI-02 | Locked row shows filled Lock icon, unlocked shows Unlock icon | unit | `npm test -- src/components/plan/ComponentRow.test.tsx` | ❌ Wave 0 |
| UI-03 | Regenerate calls generate() with locked slots; locked IDs unchanged in result | unit | `npm test -- src/services/generator.test.ts -t "lockedSlots"` | ❌ Wave 0 — extend existing |
| UI-04 | MealPickerSheet filters by ComponentType; selecting replaces component | unit | `npm test -- src/components/plan/MealPickerSheet.test.tsx` | ❌ Wave 0 |

**Note on generator.test.ts:** File already exists (`src/services/generator.test.ts`). Phase 4 adds test cases for the new `lockedSlots` parameter — does not replace the file.

### Sampling Rate
- **Per task commit:** `npm test -- src/stores/plan-store.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/stores/plan-store.test.ts` — covers PLAN-02, PLAN-03, PLAN-05 (Zustand store actions). Uses `fake-indexeddb` (already in devDependencies) for Dexie mocking.
- [ ] `src/components/plan/PlanBoard.test.tsx` — covers UI-01 (grid structure). Requires DOM testing; may need `@testing-library/react` — check if installed.
- [ ] `src/components/plan/ComponentRow.test.tsx` — covers UI-02 (lock visual states).
- [ ] `src/components/plan/MealPickerSheet.test.tsx` — covers UI-04 (picker filter + selection).
- [ ] New test cases in existing `src/services/generator.test.ts` — covers UI-03 (locked slot constraints). No new file needed.

**Install check before Wave 0:**
```bash
npm list @testing-library/react 2>/dev/null || echo "need: npm install -D @testing-library/react @testing-library/user-event jsdom"
```

If `@testing-library/react` is not installed, vitest environment must also switch from `'node'` to `'jsdom'` for component tests (update `vitest.config.ts`).

---

## Sources

### Primary (HIGH confidence)
- `src/services/generator.ts` — verified `generate()` signature, no parameters, full generation
- `src/db/client.ts` — verified Dexie v1/v2 schema, confirmed no `active_plan` table exists yet, confirmed schema version is at 2
- `src/types/plan.ts` — verified `PlanSlot`, `WeeklyPlan`, `Warning`, `GeneratorResult`, `DayOfWeek`, `ALL_DAYS`
- `src/types/component.ts` — verified `ComponentType`, `BaseType`, `ComponentRecord`, tag unions
- `src/types/preferences.ts` — verified `MealSlot`, `UserPreferencesRecord`
- `src/services/food-db.ts` — verified `getComponentsByType`, `getPreferences`, `getAllComponents` signatures
- `src/lib/filter-components.ts` — verified `filterComponents()` AND logic signature
- `src/components/library/ComponentTab.tsx` — verified tag filter chip pattern to reuse
- `package.json` — confirmed Zustand NOT installed; confirmed React 19.2.4, Next.js 16.2.0, Dexie 4.3.0
- `vitest.config.ts` — confirmed test runner, `fake-indexeddb` available in devDependencies
- `node_modules/next/dist/docs/` (local, version-matched) — App Router client/server component rules, page.tsx API, instant navigation guide

### Secondary (MEDIUM confidence)
- npm registry: `zustand` latest = 5.0.12 (verified via `npm view zustand version` during research session)
- shadcn official registry: Sheet component installation via `npx shadcn@latest add sheet` — confirmed in CONTEXT.md and UI-SPEC.md

### Tertiary (LOW confidence)
- None — all critical findings verified against project source files.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified against package.json and node_modules; Zustand missing status confirmed
- Architecture: HIGH — all patterns derived from reading actual existing project code
- Pitfalls: HIGH — Dexie schema pitfall verified against client.ts code; hydration race is a known Zustand pattern; generator extension gap verified from generator.ts source
- Validation: MEDIUM — test framework confirmed; specific test file contents are Wave 0 design, not verified against existing tests

**Research date:** 2026-03-21
**Valid until:** 2026-04-21 (30 days — stable libraries; Next.js 16 canary may evolve faster)
