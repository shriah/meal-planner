# Phase 2: Meal Library UI — Research

**Researched:** 2026-03-20
**Domain:** React/Next.js 16 App Router UI, Dexie 4 liveQuery, shadcn/ui, seed data patterns
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Phase boundary reframe:** Phase 2 builds a *Component Library*, not a Meal Library. "Meals" are ephemeral plan-time compositions (Phase 4). Phase 2 manages `ComponentRecord` objects only.

**No meal creation form.** Users never compose meals here. Meal composition lives in the weekly plan grid (Phase 4).

**Library display:**
- Four tabs: Bases | Curries | Subzis | Extras
- Per row: Component name + dietary tag + regional tag + compatible base types (Extras only; column blank/omitted for others)
- Editing: inline row expansion — no modal, no navigation
- Search/filter: text search box + tag filter chips (dietary, regional) per tab
- Add button: `[ + Add {ComponentType} ]` pinned at bottom of each tab's list

**Slot assignment settings screen:**
- Dedicated full-width settings page (not a modal/drawer)
- Checkbox grid — rows = base types, columns = Breakfast/Lunch/Dinner
- Expandable "Component exceptions (optional)" section below the grid
- Seed defaults: `other` → Breakfast + Dinner; `rice-based` → Lunch; `bread-based` → Dinner
- Poori component override: Breakfast only (overrides `other` base type's Breakfast + Dinner)

**Seed dataset:**
- ~80–100 `ComponentRecord` objects covering all four component types
- TypeScript file: `src/db/seed.ts` exporting `ComponentRecord[]`, no external JSON
- Trigger: auto-seeds on first launch when `db.components.count() === 0`
- No reset mechanism needed

### Claude's Discretion
- Exact empty state design per tab (illustration vs. simple text prompt)
- Delete confirmation UX — resolved in UI-SPEC as inline confirmation strip
- Exact spacing, typography, and color system for component list rows
- How to handle a component used in existing plan slots when deleted (warn or cascade)

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within Phase 2 scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DATA-06 | App ships with ~80–100 pre-loaded Indian components covering all types (reframed: individual ComponentRecords, not pre-built meal combinations) | Seed pattern: `src/db/seed.ts` exports typed array; auto-trigger via `db.components.count()` in a `'use client'` wrapper in layout |
| MEAL-01 | User can add a new component (Base/Curry/Subzi/Extra) with correct type-specific fields and compatibility metadata | Inline add form at tab bottom; calls `addComponent()` from food-db.ts |
| MEAL-02 | User can edit an existing component (change fields, tags, name) | Inline row expansion editor; calls `updateComponent(id, changes)` |
| MEAL-03 | User can delete a component from the library | Inline confirmation strip; calls `deleteComponent(id)` |
| MEAL-04 | Tag components with dietary, protein, regional, and occasion tags | Checkbox groups in expanded row form; all tags are string literal unions already in types |
| MEAL-05 | Browse and search components by type and tags | Tab-per-type navigation + text search + chip filters; client-side filter over `useLiveQuery` result |
</phase_requirements>

---

## Summary

Phase 2 is entirely a browser-side React UI phase. There is no server-side data fetching — all data lives in IndexedDB via Dexie. The architecture is straightforward: `'use client'` components subscribe to Dexie via `useLiveQuery` (from `dexie-react-hooks`), apply client-side search/filter, and call the existing `food-db.ts` service functions for mutations. No new service functions need to be written; they all exist from Phase 1.

The two structural deliverables are: (1) the Component Library page at `/library` with four tabs and an inline CRUD pattern, and (2) a Slot Settings page at `/settings/slots`. A seed bootstrap module (`src/db/seed.ts`) is a prerequisite — it must run before the UI renders usable data.

The primary technical risk is the shadcn/ui initialization gate: `components.json` does not yet exist. The entire component inventory (tabs, input, badge, button, checkbox, label, select, separator, alert) depends on running `npx shadcn@latest init --preset bgAUzxKUy` first. This is Wave 0 work that must happen before any UI component is built. The secondary risk is that `dexie-react-hooks` is not yet installed and must be added before using `useLiveQuery`.

**Primary recommendation:** Wave 0 = install `dexie-react-hooks` + run `npx shadcn@latest init --preset bgAUzxKUy` + add all required shadcn components + author `src/db/seed.ts`. All subsequent waves build on this foundation.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js (App Router) | 16.2.0 (installed) | Routing, page structure | Already in project; `src/app/library/page.tsx` pattern for new route |
| Dexie | 4.3.0 (installed) | IndexedDB ORM | Already in project; all CRUD through `food-db.ts` |
| dexie-react-hooks | 4.2.0 (latest) | `useLiveQuery` React hook for reactive Dexie queries | NOT installed — must add; required for reactive list subscriptions |
| shadcn/ui | 4.1.0 (latest `shadcn` CLI) | Component library (tabs, input, badge, button, etc.) | Specified in UI-SPEC; preset `bgAUzxKUy` locks design tokens |
| Radix UI | (via shadcn) | Accessible primitives under shadcn components | Auto-installed by shadcn |
| lucide-react | 0.577.0 (latest) | Icon library (`Trash2` for delete button) | Specified in UI-SPEC; NOT installed yet |
| Tailwind CSS 4 | ^4 (installed) | Utility styling | Already configured via `postcss.config.mjs` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| React 19 | 19.2.4 (installed) | UI runtime | Already present; `useState` for local UI state (search text, expanded row ID, pending deletes) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `dexie-react-hooks` `useLiveQuery` | `useEffect` + manual subscription | `useLiveQuery` is simpler and reactive; `useEffect` requires manual teardown and is error-prone |
| Inline row expansion | Modal dialog | Locked decision in CONTEXT.md — inline only |
| shadcn `alert` for delete confirmation | Custom inline strip | shadcn `alert` provides accessible markup; use it styled as the inline confirmation strip |

**Installation (Wave 0):**
```bash
npm install dexie-react-hooks lucide-react
npx shadcn@latest init --preset bgAUzxKUy
npx shadcn add tabs input badge button checkbox label select separator alert tooltip
```

**Version verification (confirmed 2026-03-20):**
- `dexie-react-hooks`: 4.2.0 (npm registry)
- `lucide-react`: 0.577.0 (npm registry)
- `shadcn` CLI: 4.1.0 (npm registry)

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── app/
│   ├── layout.tsx              # Add <SeedBootstrap /> client wrapper here
│   ├── page.tsx                # Existing home page
│   ├── library/
│   │   └── page.tsx            # Component Library page — Server Component wrapper
│   └── settings/
│       └── slots/
│           └── page.tsx        # Slot Settings page — Server Component wrapper
├── components/
│   ├── library/
│   │   ├── ComponentLibrary.tsx    # 'use client' — tab state, search, filter
│   │   ├── ComponentTab.tsx        # Per-tab list with search/filter/add button
│   │   ├── ComponentRow.tsx        # Collapsed row with inline expansion
│   │   ├── ComponentForm.tsx       # Inline edit/add form (shared for edit + add)
│   │   └── DeleteConfirmStrip.tsx  # Inline delete confirmation strip
│   └── settings/
│       ├── SlotSettings.tsx        # 'use client' — reads/writes UserPreferences
│       └── SlotGrid.tsx            # Checkbox grid for base-type × meal-slot matrix
├── db/
│   ├── client.ts               # Existing Dexie schema (Phase 1)
│   └── seed.ts                 # NEW: ComponentRecord[] seed data + SeedBootstrap
└── services/
    └── food-db.ts              # Existing CRUD functions (Phase 1, no changes needed)
```

### Pattern 1: Reactive Dexie Query with useLiveQuery

**What:** Subscribe to a Dexie table query; component re-renders whenever the underlying data changes.
**When to use:** Any component that displays a list of components from IndexedDB.

```typescript
// Source: dexie-react-hooks package, confirmed compatible with dexie 4.3.0
'use client'
import { useLiveQuery } from 'dexie-react-hooks'
import { getComponentsByType } from '@/services/food-db'

export function ComponentTab({ type }: { type: ComponentType }) {
  const components = useLiveQuery(
    () => getComponentsByType(type),
    [type]   // dependency array — re-subscribes when type changes
  )
  // components is undefined on initial render (loading), then ComponentRecord[]
  if (!components) return <LoadingSkeleton />
  return <ComponentList items={components} />
}
```

**Key:** `useLiveQuery` returns `undefined` on first render (before the async query resolves). Always handle the undefined case.

### Pattern 2: Client-Side Search and Filter

**What:** Apply text search and tag filter chips on top of the live query result in memory.
**When to use:** All four tabs.

```typescript
// Client-side filter applied to useLiveQuery result
const filtered = useMemo(() => {
  if (!components) return []
  return components.filter(c => {
    const nameMatch = c.name.toLowerCase().includes(searchText.toLowerCase())
    const tagMatch = activeTagFilters.every(tag =>
      c.dietary_tags.includes(tag as DietaryTag) ||
      c.regional_tags.includes(tag as RegionalTag)
    )
    return nameMatch && tagMatch
  })
}, [components, searchText, activeTagFilters])
```

**Note:** Dexie's multi-entry indexes (`*dietary_tags`, `*regional_tags`) support server-side filtering too, but client-side filtering on the full list is simpler here — the dataset will never exceed a few hundred records.

### Pattern 3: Inline Row Expansion (Single Open at a Time)

**What:** Track which row is expanded in parent state; pass open/close handlers down.
**When to use:** ComponentTab manages `expandedId: number | null`.

```typescript
'use client'
const [expandedId, setExpandedId] = useState<number | null>(null)

// Opening a row closes the previous one automatically
const handleExpand = (id: number) => setExpandedId(prev => prev === id ? null : id)
const handleClose = () => setExpandedId(null)
```

### Pattern 4: Seed Bootstrap (One-Time, App Startup)

**What:** A `'use client'` component that runs once on app mount to check if the DB is empty and seeds it.
**When to use:** Mount it in `src/app/layout.tsx` so it runs on every page load (but the count check prevents repeat seeds).
**Why in layout.tsx:** Ensures data exists before any page renders; avoids duplicating the check in each route.

```typescript
// src/db/seed.ts
'use client'
import { useEffect } from 'react'
import { db } from '@/db/client'
import { SEED_COMPONENTS, SEED_PREFERENCES } from './seed-data'

export function SeedBootstrap() {
  useEffect(() => {
    async function seed() {
      const count = await db.components.count()
      if (count === 0) {
        await db.components.bulkAdd(SEED_COMPONENTS)
        await db.preferences.put(SEED_PREFERENCES)
      }
    }
    seed()
  }, [])
  return null  // Renders nothing
}
```

**Pitfall:** `useEffect` runs only in the browser — safe for IndexedDB. Do NOT call `db` at module scope (it would fail during SSR/static analysis).

### Pattern 5: Next.js 16 App Router — 'use client' Boundary

The project is effectively a SPA (all data in IndexedDB, no server data fetching). Key rules from the Next.js 16 docs:

- Pages (`app/library/page.tsx`) can be Server Components — they just render the `'use client'` interactive component.
- `'use client'` must be at the top of any file that uses `useState`, `useEffect`, `useLiveQuery`, or browser APIs.
- You do NOT need `'use client'` on every file — only on the boundary component. Child components imported by a `'use client'` component inherit the client context.
- Props crossing the server-to-client boundary must be serializable (no functions, no class instances).

```typescript
// src/app/library/page.tsx — Server Component (no 'use client' needed)
import { ComponentLibrary } from '@/components/library/ComponentLibrary'

export default function LibraryPage() {
  return <ComponentLibrary />
}
```

### Anti-Patterns to Avoid

- **Direct Dexie calls from components:** Always go through `food-db.ts` service functions — established pattern from Phase 1.
- **Accessing `db` at module scope in a Server Component file:** IndexedDB is browser-only; accessing it during SSR will throw. Keep all Dexie access inside `'use client'` files.
- **Using `useEffect` for subscriptions instead of `useLiveQuery`:** `useLiveQuery` handles subscription lifecycle correctly. Manual `useEffect` subscriptions are brittle and easy to leak.
- **Seeding in a page component:** Seed in `layout.tsx` so it runs regardless of which page loads first.
- **Multiple tabs sharing a single `expandedId`:** Each tab has its own `expandedId` state — tabs are independent.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Accessible tabs | Custom tab state machine | `shadcn tabs` (Radix UI) | Keyboard navigation, ARIA roles, focus management |
| Accessible checkboxes | `<input type="checkbox">` directly | `shadcn checkbox` | Consistent styling, accessible label association |
| Delete confirmation UI | Custom modal | Inline `shadcn alert` styled as confirmation strip | Already in UI-SPEC; accessible landmark semantics |
| Tooltip on delete button (desktop) | CSS `title` attribute | `shadcn tooltip` | Radix Tooltip handles positioning, z-index, delay |
| Reactive DB subscriptions | `useEffect` + `EventEmitter` | `dexie-react-hooks` `useLiveQuery` | Built for Dexie; handles async, cleanup, deps correctly |
| Icon set | SVG sprites | `lucide-react` | Tree-shaken, consistent stroke width, already in UI-SPEC |

**Key insight:** The shadcn + Radix stack handles all accessibility and interaction complexity. The application code should focus only on data flow and domain logic.

---

## Common Pitfalls

### Pitfall 1: useLiveQuery Undefined on First Render

**What goes wrong:** Component tries to call `.map()` on `undefined` and throws.
**Why it happens:** `useLiveQuery` returns `undefined` synchronously on mount before the async query resolves.
**How to avoid:** Always guard: `if (!components) return <Skeleton />` or use `components ?? []`.
**Warning signs:** "Cannot read properties of undefined (reading 'map')" in console.

### Pitfall 2: Dexie Called During SSR

**What goes wrong:** Build fails or runtime error: "indexedDB is not defined".
**Why it happens:** Next.js App Router Server Components execute on the server where IndexedDB does not exist.
**How to avoid:** Ensure every file that imports from `@/db/client` has `'use client'` at the top. Never import `db` from a Server Component.
**Warning signs:** Error during `next build` or during first SSR render.

### Pitfall 3: shadcn Init Not Run

**What goes wrong:** `npx shadcn add <component>` fails or generates broken output; `components.json` missing.
**Why it happens:** shadcn requires initialization to configure the project's path aliases, CSS variable names, and component directory.
**How to avoid:** Wave 0 task must run `npx shadcn@latest init --preset bgAUzxKUy` and verify `components.json` exists before any `shadcn add` call.
**Warning signs:** shadcn CLI error "No components.json found".

### Pitfall 4: Seed Runs on Every Mount

**What goes wrong:** Every page navigation re-seeds the database, duplicating all records.
**Why it happens:** `useEffect` in a layout-level component runs on each client-side navigation if not guarded.
**How to avoid:** The seed guard `if (count === 0)` prevents re-seeding. Do not use a `ref` as a substitute — the `count()` check is the correct gate.

### Pitfall 5: Tag Filter AND Logic

**What goes wrong:** Users expect "Veg + South Indian" to return south-indian-veg items, but the UI returns everything matching either tag.
**Why it happens:** OR logic is easier to implement but wrong for this UX.
**How to avoid:** Active tag filters are AND-ed: `activeFilters.every(tag => component.tags.includes(tag))`. The UI-SPEC explicitly specifies AND logic.

### Pitfall 6: Tab State Not Isolated

**What goes wrong:** Clearing the search in the Bases tab also clears the Curries tab search.
**Why it happens:** Search/filter state shared across tabs instead of per-tab.
**How to avoid:** Each tab component owns its own `searchText` and `activeTagFilters` state. The UI-SPEC explicitly states: "switching tabs does not reset another tab's filters."

### Pitfall 7: 'use client' on Every File

**What goes wrong:** Unnecessary `'use client'` boundaries prevent code-splitting benefits; or confusion about which files need it.
**Why it happens:** Developers add it defensively to every file.
**How to avoid:** Only the outermost interactive component in each tree needs `'use client'`. Files it imports automatically inherit the client context. From Next.js 16 docs: "You only need to add it to the files whose components you want to render directly within Server Components."

### Pitfall 8: Seed Data Type Mismatches

**What goes wrong:** Seed records fail Dexie validation or Phase 3 generator produces wrong output.
**Why it happens:** `ComponentRecord` is a flat merged type — type-specific fields are optional. A `base` component must have `base_type`; an `extra` must have `extra_category` and `compatible_base_types`. Forgetting these for 80-100 records is easy.
**How to avoid:** Use typed helper factories in `seed.ts`: `makeBase(...)`, `makeCurry(...)`, `makeSubzi(...)`, `makeExtra(...)` that enforce required fields at compile time.

---

## Code Examples

Verified patterns from project source and official docs:

### useLiveQuery (dexie-react-hooks)

```typescript
// Source: dexie-react-hooks 4.2.0 — compatible with dexie 4.3.0
import { useLiveQuery } from 'dexie-react-hooks'
import { getComponentsByType } from '@/services/food-db'
import type { ComponentType } from '@/types/component'

const components = useLiveQuery(
  () => getComponentsByType(type),
  [type],          // re-subscribe when type changes
  []               // default value while loading (avoids undefined guard)
)
```

### addComponent Call Pattern

```typescript
// Source: src/services/food-db.ts (Phase 1)
import { addComponent } from '@/services/food-db'
import type { ComponentRecord } from '@/types/component'

const newComponent: Omit<ComponentRecord, 'id'> = {
  name: 'Plain Rice',
  componentType: 'base',
  base_type: 'rice-based',
  dietary_tags: ['veg'],
  protein_tag: 'none',
  regional_tags: ['pan-indian'],
  occasion_tags: ['everyday'],
  created_at: new Date().toISOString(),
}
const id = await addComponent(newComponent)
```

### updateComponent Call Pattern

```typescript
// Source: src/services/food-db.ts (Phase 1)
import { updateComponent } from '@/services/food-db'

// Only send changed fields — Dexie.update merges
await updateComponent(componentId, {
  name: 'Updated Name',
  dietary_tags: ['veg', 'vegan'],
})
```

### putPreferences for Slot Settings

```typescript
// Source: src/services/food-db.ts (Phase 1) + src/types/preferences.ts
import { getPreferences, putPreferences } from '@/services/food-db'
import type { UserPreferencesRecord } from '@/types/preferences'

const existing = await getPreferences()
const updated: UserPreferencesRecord = {
  id: 'prefs',
  slot_restrictions: {
    base_type_slots: {
      'rice-based': ['lunch'],
      'bread-based': ['dinner'],
      'other': ['breakfast', 'dinner'],
    },
    component_slot_overrides: {
      // Poori's ID populated after seed; stored as number key
    },
  },
  extra_quantity_limits: existing?.extra_quantity_limits ?? { breakfast: 2, lunch: 3, dinner: 3 },
  base_type_rules: existing?.base_type_rules ?? [],
}
await putPreferences(updated)
```

### Seed Bootstrap Component

```typescript
// Placement: src/app/layout.tsx renders <SeedBootstrap /> (no-op after first run)
'use client'
import { useEffect } from 'react'
import { db } from '@/db/client'

export function SeedBootstrap({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    async function run() {
      const count = await db.components.count()
      if (count === 0) {
        const { seedComponents, seedPreferences } = await import('@/db/seed')
        await db.components.bulkAdd(seedComponents)
        await db.preferences.put(seedPreferences)
      }
    }
    run()
  }, [])
  return <>{children}</>
}
```

**Note on dynamic import:** `import('@/db/seed')` keeps the large seed array out of the main bundle. It only loads once, on first launch.

### Seed Data Helper Factories

```typescript
// src/db/seed.ts pattern — enforces type-specific required fields
import type { ComponentRecord } from '@/types/component'

function makeBase(fields: Omit<ComponentRecord, 'id' | 'componentType' | 'created_at'> & { base_type: NonNullable<ComponentRecord['base_type']> }): Omit<ComponentRecord, 'id'> {
  return { ...fields, componentType: 'base', created_at: '2026-03-20T00:00:00.000Z' }
}

function makeExtra(fields: Omit<ComponentRecord, 'id' | 'componentType' | 'created_at'> & {
  extra_category: NonNullable<ComponentRecord['extra_category']>
  compatible_base_types: NonNullable<ComponentRecord['compatible_base_types']>
}): Omit<ComponentRecord, 'id'> {
  return { ...fields, componentType: 'extra', created_at: '2026-03-20T00:00:00.000Z' }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `useEffect` + Dexie subscription manual setup | `useLiveQuery` from `dexie-react-hooks` | Dexie 3+ | Reactive, auto-cleanup, no boilerplate |
| Separate `dexie-react-hooks` package with `useLiveQuery` | Still `dexie-react-hooks` (separate package) | Dexie 4.x | `useLiveQuery` is NOT bundled in core `dexie` 4.x; separate install required |
| Next.js 14: `params` was synchronous | Next.js 15+: `params` is a Promise | v15.0.0-RC | Must `await params` or use `use(params)` in client components |
| Tailwind CSS 3 config via `tailwind.config.js` | Tailwind CSS 4 config via `postcss.config.mjs` and CSS `@import` | Tailwind v4 | No `tailwind.config.js` file; configuration is CSS-first |

**Deprecated/outdated:**
- `dexie-react-hooks` v1/v2: Had separate import path. v4.2.0 peer-requires `dexie >=4.2.0` — fully compatible with this project's dexie 4.3.0.
- `next/router` (Pages Router): Not applicable — this project uses App Router exclusively.

---

## Seed Dataset Scope (DATA-06)

This is the most content-intensive deliverable. The planner must allocate a dedicated task for it.

**Coverage requirements (from CONTEXT.md):**
- **Bases (target: ~25):** Rice varieties (plain rice, brown rice, basmati), roti/chapati/paratha/naan/puri (`bread-based`), idli/dosa/appam/uttapam/poori/upma/pongal (`other`). Must include Poori specifically (needs slot override in UserPreferences).
- **Curries (target: ~25):** Mix of South Indian (sambar, rasam, fish curry, chicken curry), North Indian (dal makhani, palak paneer, rajma, butter chicken, chole), coastal (prawn curry, coconut fish curry), pan-Indian (dal tadka, mixed veg).
- **Subzis (target: ~20):** Dry vegetable preparations — aloo gobi, bhindi masala, beans thoran, cabbage thoran, aloo jeera, baingan bharta, palak, mixed veg.
- **Extras (target: ~15–20):** Liquid (sambar, rasam), crunchy (papad, fryums), condiment (pickle, chutney, raita), dairy (curd, buttermilk, ghee), sweet (kheer, payasam, halwa). Each Extra MUST have `compatible_base_types` set correctly.

**UserPreferences seed (required for slot settings screen to show correct defaults):**
```
slot_restrictions.base_type_slots = {
  'other': ['breakfast', 'dinner'],
  'rice-based': ['lunch'],
  'bread-based': ['dinner'],
}
component_slot_overrides = { [pooriId]: ['breakfast'] }
```

**Critical:** Poori's ID is auto-assigned by Dexie. To handle the override, the seed function must insert Poori, get its ID, then build the `component_slot_overrides`. This means the seed is async and stateful — it cannot just `bulkAdd` everything blindly.

---

## Open Questions

1. **Poori override ID resolution**
   - What we know: `component_slot_overrides` uses `Record<number, MealSlot[]>` with the component's Dexie-assigned integer ID as key.
   - What's unclear: Dexie auto-assigns IDs starting from 1 for a fresh database, but this is not guaranteed if the database had prior entries.
   - Recommendation: Seed Poori explicitly as the first `base` record added, capture the returned ID from `db.components.add(pooriBRecord)`, then build the preferences object using that captured ID. Do not hardcode `id: 1`.

2. **shadcn preset `bgAUzxKUy` contents**
   - What we know: The preset is specified in the UI-SPEC and must be passed to `npx shadcn@latest init --preset bgAUzxKUy`.
   - What's unclear: The exact color tokens the preset produces are not known without running the init command.
   - Recommendation: Wave 0 task runs init and then documents the generated `globals.css` CSS variables for reference.

3. **`lucide-react` not yet installed**
   - What we know: It's needed for the `Trash2` icon in delete buttons.
   - What's unclear: None — just needs to be installed.
   - Recommendation: Include in Wave 0 install alongside `dexie-react-hooks`.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `vitest.config.ts` (exists at project root) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

Test environment is `node` with `fake-indexeddb/auto` in `src/test/setup.ts` — Dexie tests run without a browser.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-06 | Seed inserts ~80-100 components when DB is empty; does not re-seed if count > 0 | unit | `npx vitest run src/db/seed.test.ts -t "seed"` | Wave 0 |
| DATA-06 | Seed inserts UserPreferences with correct default slot restrictions | unit | `npx vitest run src/db/seed.test.ts -t "preferences"` | Wave 0 |
| DATA-06 | Poori override is stored with the correct component ID (not hardcoded) | unit | `npx vitest run src/db/seed.test.ts -t "poori"` | Wave 0 |
| MEAL-01 | addComponent stores a new component of each type with required fields | unit | `npx vitest run src/services/food-db.test.ts` | ✅ (existing) |
| MEAL-02 | updateComponent updates name and tags and is retrievable after update | unit | `npx vitest run src/services/food-db.test.ts` | ✅ (existing) |
| MEAL-03 | deleteComponent removes the record; it no longer appears in getAllComponents | unit | `npx vitest run src/services/food-db.test.ts` | ✅ (existing) |
| MEAL-04 | ComponentRecord stores all four tag arrays; filter by dietary_tag returns correct results | unit | `npx vitest run src/services/food-db.test.ts` | ✅ (existing) |
| MEAL-05 | Client-side filter returns only items matching search text (case-insensitive) | unit | `npx vitest run src/components/library/ComponentTab.test.ts` | Wave 0 |
| MEAL-05 | Client-side filter ANDs multiple active tag chips | unit | `npx vitest run src/components/library/ComponentTab.test.ts` | Wave 0 |

**Note:** UI component tests (`ComponentTab.test.ts`) require adding a browser-compatible test environment (jsdom or happy-dom) via a Vitest workspace or env comment. The current `vitest.config.ts` uses `environment: 'node'` which cannot mount React components. For filter logic tests, extract the filter function to a pure utility and test it in node mode.

### Sampling Rate

- **Per task commit:** `npx vitest run src/db/seed.test.ts src/services/food-db.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/db/seed.test.ts` — covers DATA-06 seed correctness and Poori override
- [ ] `src/components/library/` — filter logic utility test (extract pure function from ComponentTab)
- [ ] Install: `npm install dexie-react-hooks lucide-react`
- [ ] shadcn init: `npx shadcn@latest init --preset bgAUzxKUy`
- [ ] shadcn components: `npx shadcn add tabs input badge button checkbox label select separator alert tooltip`

---

## Sources

### Primary (HIGH confidence)

- `/Users/harish/workspace/food-planner/node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md` — `'use client'` boundary rules; Next.js 16 confirmed
- `/Users/harish/workspace/food-planner/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` — params/searchParams as Promises in Next.js 15+
- `/Users/harish/workspace/food-planner/node_modules/next/dist/docs/01-app/02-guides/single-page-applications.md` — SPA pattern with App Router
- `/Users/harish/workspace/food-planner/node_modules/dexie/dist/dexie.d.ts` — confirms `liveQuery` Observable export; no `useLiveQuery` in core dexie 4.3.0
- `npm view dexie-react-hooks` — version 4.2.0, peer requires `dexie >=4.2.0-alpha.1 <5.0.0` (compatible with installed 4.3.0)
- `npm view lucide-react` — version 0.577.0
- `npm view shadcn` — version 4.1.0
- `/Users/harish/workspace/food-planner/src/types/component.ts` — authoritative `ComponentRecord`, `MealComponent`, all tag types
- `/Users/harish/workspace/food-planner/src/types/preferences.ts` — authoritative `UserPreferencesRecord`, `SlotRestrictions`
- `/Users/harish/workspace/food-planner/src/services/food-db.ts` — all 12 CRUD functions; no new service functions needed for Phase 2
- `/Users/harish/workspace/food-planner/src/db/client.ts` — Dexie schema v1; `components` table with multi-entry indexes
- `/Users/harish/workspace/food-planner/vitest.config.ts` — `environment: 'node'`, `setupFiles: ['./src/test/setup.ts']`
- `/Users/harish/workspace/food-planner/.planning/phases/02-meal-library-ui/02-UI-SPEC.md` — complete interaction contracts, component inventory, copywriting

### Secondary (MEDIUM confidence)

- `.planning/phases/02-meal-library-ui/02-CONTEXT.md` — locked decisions and architectural reframe (verified against existing code)
- `fake-indexeddb/auto` in `src/test/setup.ts` — confirms Dexie tests run in node environment without browser

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified against npm registry and installed versions
- Architecture: HIGH — all patterns derived from existing Phase 1 code + Next.js 16 official docs
- Pitfalls: HIGH — derived from Next.js official docs, Dexie typings, and project code inspection
- Seed dataset scope: HIGH (structure) / MEDIUM (exact content) — structure is fully typed; 80-100 specific Indian meals authored by Claude at implementation time

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (stable stack; Tailwind 4 + Next.js 16 + Dexie 4 are all current releases)
