# Phase 6: Save, History, and Export - Research

**Researched:** 2026-03-22
**Domain:** Week-keyed Dexie persistence, week navigation, read-only mode, satori + @resvg/resvg-js PNG export, Web Share API
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Each week stored as its own Dexie record, keyed by ISO week start date (e.g., `"2026-03-17"`)
- **D-02:** Auto-save on every change — fire-and-forget, no explicit save button
- **D-03:** `saved_plans` table used for all weeks; `active_plan` singleton status is implementation decision (may keep as write-through cache or remove)
- **D-04:** `SavedPlanRecord.slots: unknown` must be typed as `WeeklyPlan`; `locks` and `week_start` fields must be added
- **D-05:** Week navigator lives above the plan grid inside PlanBoard (not in AppNav)
- **D-06:** Navigation is unlimited — any past or future week
- **D-07:** Past weeks are read-only — no Regenerate, no lock toggles, no swap
- **D-08:** Future weeks start blank — show empty state with "Generate plan for this week" prompt; do not auto-generate
- **D-09:** Navigating back to the current week loads the active plan's current state
- **D-10:** PNG layout is a vertical list — 7 rows, one per day, portrait orientation
- **D-11:** Each day shows all three slots: label + component names joined by `", "`
- **D-12:** PNG header shows week date range — e.g., `"Week of Mar 17–23, 2026"`
- **D-13:** Color-coded by meal slot; overall style simple and clean; not decorative
- **D-14:** Rendered via **satori + resvg-js** — JSX → SVG → PNG; no DOM capture
- **D-15:** Export button in PlanActionBar, available on all weeks (current and past read-only)
- **D-16:** Desktop — browser download (PNG saved to Downloads)
- **D-17:** Mobile — Web Share API with PNG as shared file; fall back to download

### Claude's Discretion
- Exact color palette for breakfast/lunch/dinner slots in PNG (should align with `globals.css` design tokens)
- Whether `active_plan` singleton is kept as write-through cache or removed in favor of week-keyed `saved_plans`
- Font and sizing in the satori template
- Whether the week navigator shows only date range or also allows typing/picking a date

### Deferred Ideas (OUT OF SCOPE)
- Refactor and move slot setting to Rules tab
- PDF export (`EXP-02`) — explicitly v2 scope
- Cross-week rotation rules (`RULE-07`) — v2 scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SAVE-01 | Current week auto-saves; each week has its own Dexie slot keyed by week start date | Dexie v4 migration pattern (version 4), `week_start` as primary key variant, fire-and-forget save |
| SAVE-02 | User navigates prev/next between weeks; past weeks are read-only | `startOfISOWeek` date math, `isReadOnly` derivation, Zustand `currentWeekStart` state, `useLiveQuery` for reactive loading |
| EXPORT-01 | Export current plan as PNG image suitable for sharing (WhatsApp, etc.) | satori 0.26.0 (verified) + @resvg/resvg-js 2.6.2 (verified), Next.js Route Handler (Node.js runtime default), Web Share API with `navigator.canShare` detection |
</phase_requirements>

---

## Summary

Phase 6 has three distinct technical domains that are largely independent and can be developed in parallel plans: (1) Dexie schema migration and week-keyed persistence, (2) week navigation + read-only mode in the UI, and (3) PNG export via a Next.js Route Handler.

The most technically constrained area is the PNG export pipeline. `satori` converts JSX objects to SVG strings; `@resvg/resvg-js` renders the SVG to a PNG `Uint8Array` using native Rust bindings via napi-rs. Because `@resvg/resvg-js` uses native Node.js bindings, the Route Handler **must** run on the Node.js runtime (which is the default — no explicit `export const runtime` needed unless deploying to Edge). Satori requires at least one font to be explicitly provided as a `Buffer` or `ArrayBuffer`; there is no automatic system font fallback. A free bundled font (e.g., Inter or Noto Sans from Google Fonts) must be shipped in `public/fonts/` and loaded via `fs.readFileSync` in the route handler.

The week-keyed storage model is a straightforward extension of the existing `db.version(3)` → `db.version(4)` migration. The `saved_plans` table gains `week_start` (indexed, string) and `locks` (unindexed JSON) fields. The `SavedPlanRecord` interface is retyped from `slots: unknown` to `slots: WeeklyPlan`. The `active_plan` table is recommended to be kept as a write-through cache for the current week — it is the fastest hydration path on app load and keeps backward compatibility.

**Primary recommendation:** Implement in three plans: (1) Dexie migration + week-keyed service functions, (2) Zustand week navigation + PlanBoard read-only mode, (3) Export Route Handler + Export button + Web Share.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| dexie | 4.3.0 (installed) | Week-keyed IndexedDB persistence | Already in project; `db.version(4)` migration follows established pattern |
| satori | 0.26.0 (verified npm) | JSX object → SVG string | Vercel-maintained; pairs with resvg-js; used for OG images across Next.js ecosystem |
| @resvg/resvg-js | 2.6.2 (verified npm) | SVG string → PNG Uint8Array | Native Rust bindings, fast, pairs directly with satori |
| zustand | 5.0.12 (installed) | Week navigation state, export state | Already in project |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| dexie-react-hooks | 4.2.0 (installed) | `useLiveQuery` for reactive week plan loading | Navigation triggers new DB reads |
| lucide-react | 0.577.0 (installed) | ChevronLeft, ChevronRight, Download icons | Week navigator + Export button |
| Node.js `fs` (built-in) | N/A | Load font file for satori in route handler | Font must be `Buffer`, not `fetch` in Node.js runtime |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @resvg/resvg-js | @vercel/og (ImageResponse) | `@vercel/og` wraps satori but is designed for OG images at build/edge time; harder to return as download blob from a POST handler; overkill here |
| @resvg/resvg-js | @cf-wasm/resvg | WASM version works in Edge runtime; unnecessary since this app uses Node.js runtime default |
| satori + resvg | html2canvas | Explicitly excluded by D-14; requires DOM, can't run server-side |
| Custom date math | date-fns | date-fns is not installed; ISO week math is simple enough with native `Date` arithmetic; no new dependency needed |

**Installation:**
```bash
npm install satori @resvg/resvg-js
```

**Version verification (confirmed 2026-03-22):**
- `npm view satori version` → `0.26.0`
- `npm view @resvg/resvg-js version` → `2.6.2`

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── app/
│   └── api/
│       └── export-plan/
│           └── route.ts          # POST handler: satori → resvg → PNG response
├── services/
│   ├── plan-db.ts                # Add: saveWeekPlan, getWeekPlan, listWeekKeys
│   └── week-utils.ts             # Pure: getISOWeekStart(date), formatWeekLabel, isPastWeek
├── stores/
│   └── plan-store.ts             # Add: currentWeekStart, isReadOnly, isExporting, exportError, navigateToWeek, exportPlan
├── components/
│   └── plan/
│       ├── WeekNavigator.tsx     # New: prev/next chevrons + week label
│       ├── PlanBoard.tsx         # Modified: accepts isReadOnly, renders WeekNavigator
│       └── PlanActionBar.tsx     # Modified: add Export button, hide Regenerate when isReadOnly
└── db/
    └── client.ts                 # db.version(4): SavedPlanRecord typed, week_start indexed
public/
└── fonts/
    └── inter-regular.ttf         # Bundled for satori — must exist before route handler runs
```

### Pattern 1: Dexie v4 Migration

**What:** Add `week_start` (indexed) and `locks` fields to `saved_plans`. Retype `slots` as `WeeklyPlan`. No data migration needed — existing `saved_plans` rows (if any) keep their shape; new records fill both fields.

**When to use:** Required whenever IndexedDB schema changes.

```typescript
// Source: src/db/client.ts — follows existing db.version(N) pattern

export interface SavedPlanRecord {
  id?: number;
  week_start: string;        // ISO date, e.g. "2026-03-17" — new, indexed
  slots: WeeklyPlan;         // was: unknown — retyped
  locks: Record<string, boolean>; // new, unindexed
  created_at: string;
}

db.version(4).stores({
  components: '++id, componentType, base_type, extra_category, *dietary_tags, *regional_tags, *occasion_tags',
  meals: '++id, base_id, curry_id, subzi_id',
  meal_extras: '[meal_id+component_id], meal_id, component_id',
  rules: '++id',
  saved_plans: '++id, week_start',   // week_start added as index
  preferences: 'id',
  active_plan: 'id',
});
// No .upgrade() needed — existing saved_plans rows don't have week_start
// but that's fine; they're unreachable by the new week-keyed queries.
```

**Key detail:** Dexie only requires `.upgrade()` when you need to transform existing data. Adding a new index without needing to backfill existing rows is schema-only — no `upgrade()` callback is needed.

### Pattern 2: Week-Keyed Service Functions

**What:** Mirror of existing `saveActivePlan` / `getActivePlan` but keyed by ISO week start date.

```typescript
// Source: src/services/plan-db.ts — follows fire-and-forget pattern

export async function saveWeekPlan(
  weekStart: string,
  plan: WeeklyPlan,
  locks: Record<string, boolean>
): Promise<void> {
  await db.saved_plans.put({
    week_start: weekStart,
    slots: plan,
    locks,
    created_at: new Date().toISOString(),
  });
}

export async function getWeekPlan(weekStart: string): Promise<SavedPlanRecord | undefined> {
  return db.saved_plans.where('week_start').equals(weekStart).first();
}
```

### Pattern 3: Week Navigation in Zustand

**What:** `currentWeekStart` drives which Dexie record is loaded. `navigateToWeek` updates the key, triggering `useLiveQuery` to re-fire.

```typescript
// New Zustand state additions in plan-store.ts

interface PlanStore {
  // ... existing fields
  currentWeekStart: string    // "YYYY-MM-DD" ISO — Monday of the viewed week
  isReadOnly: boolean
  isExporting: boolean
  exportError: string | null

  navigateToWeek: (weekStart: string) => Promise<void>
  exportPlan: () => Promise<void>
}
```

**isReadOnly derivation** (pure, no server call):
```typescript
// In store or component
const isReadOnly = currentWeekStart < getISOWeekStart(new Date())
```

**Week-start ISO date utility** (no date-fns needed):
```typescript
// src/services/week-utils.ts
export function getISOWeekStart(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()          // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = (day === 0 ? -6 : 1 - day)  // distance to Monday
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)  // "YYYY-MM-DD"
}

export function addWeeks(weekStart: string, n: number): string {
  const d = new Date(weekStart)
  d.setDate(d.getDate() + n * 7)
  return d.toISOString().slice(0, 10)
}

export function formatWeekLabel(weekStart: string): string {
  // Returns "Mar 17 – Mar 23, 2026"
  const start = new Date(weekStart)
  const end = new Date(weekStart)
  end.setDate(end.getDate() + 6)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}, ${end.getFullYear()}`
}
```

### Pattern 4: satori + @resvg/resvg-js Route Handler

**What:** POST `/api/export-plan` receives serialized plan data; returns PNG binary.

**Critical:** `@resvg/resvg-js` uses native napi-rs bindings. It **cannot** run in Edge Runtime. The Node.js runtime is the Next.js default for Route Handlers — no `export const runtime` declaration needed for local dev. For Vercel deployment, confirming the function is not accidentally forced to Edge is important.

**Font requirement:** Satori requires at least one font object with binary data. No system fonts are available. A TTF must be shipped in `public/fonts/` (or bundled elsewhere) and read via `fs.readFileSync`.

```typescript
// Source: based on verified satori + resvg-js API (confirmed 2026-03-22)
// app/api/export-plan/route.ts

import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { WeeklyPlan } from '@/types/plan'

// Load font once at module scope (cached across requests in Node.js runtime)
const fontData = readFileSync(join(process.cwd(), 'public/fonts/inter-regular.ttf'))

export async function POST(request: Request) {
  const { plan, componentNames, weekLabel } = await request.json() as {
    plan: WeeklyPlan
    componentNames: Record<number, string>
    weekLabel: string
  }

  const element = buildPlanElement(plan, componentNames, weekLabel)

  const svg = await satori(element, {
    width: 390,
    height: 900,       // approximate — adjust based on content
    fonts: [{ name: 'Inter', data: fontData, weight: 400, style: 'normal' }],
  })

  const resvg = new Resvg(svg)
  const pngData = resvg.render()
  const pngBuffer = pngData.asPng()

  const weekSlug = weekLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return new Response(pngBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="meal-plan-${weekSlug}.png"`,
    },
  })
}
```

**Satori JSX element format** — satori accepts plain objects (no React runtime needed in route handler):
```typescript
// Plain object style — no JSX transform needed in route handler
function buildPlanElement(plan: WeeklyPlan, names: Record<number, string>, weekLabel: string) {
  return {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column', width: 390, backgroundColor: '#ffffff', padding: 24, fontFamily: 'Inter' },
      children: [
        // header + 7 day rows
      ]
    }
  }
}
```

**Satori CSS subset limitations:**
- Every container needs `display: 'flex'` (block layout is not supported)
- No `CSS grid` support in satori — use nested flex for the day/slot layout
- All style values must be camelCase inline style objects, not CSS classes
- Tailwind classes do NOT work in satori — all styles must be inline

### Pattern 5: Web Share API with Download Fallback

**What:** Client-side export trigger in `exportPlan` Zustand action.

```typescript
// In plan-store.ts exportPlan action (client-side)
exportPlan: async () => {
  set({ isExporting: true, exportError: null })
  try {
    const response = await fetch('/api/export-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, componentNames, weekLabel }),
    })
    if (!response.ok) throw new Error('Export failed')
    const blob = await response.blob()

    // Mobile: Web Share API
    if (navigator.canShare && navigator.canShare({ files: [new File([blob], 'meal-plan.png', { type: 'image/png' })] })) {
      await navigator.share({
        files: [new File([blob], 'meal-plan.png', { type: 'image/png' })],
        title: 'Meal Plan',
      })
    } else {
      // Desktop / fallback: trigger download
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `meal-plan-${weekSlug}.png`
      a.click()
      URL.revokeObjectURL(url)
    }
    set({ isExporting: false })
  } catch {
    set({ isExporting: false, exportError: 'Export failed. Try again.' })
  }
}
```

**Web Share API scope:** `navigator.share` requires user gesture (button click). `navigator.canShare` must be checked before calling `navigator.share`. File sharing is supported on iOS Safari 15.1+, Chrome for Android 128+, Samsung Internet 8.2+. Firefox desktop does not support it — download fallback fires automatically.

### Anti-Patterns to Avoid

- **Calling @resvg/resvg-js in Edge Runtime:** Native napi-rs bindings will throw at module load time. The route handler must not have `export const runtime = 'edge'`.
- **Using React components with hooks in satori:** Satori accepts pure stateless JSX or plain JS objects. `useState`, `useEffect`, and context will not work.
- **Using CSS classes (Tailwind) in satori:** Satori only reads inline `style` objects. Any `className` props are silently ignored.
- **Using `display: 'block'` in satori layout:** All containers must use `display: 'flex'`. Block layout is unsupported.
- **Fetching fonts inside the satori call per request:** Font loading should happen once at module scope (outside the handler function) and be reused. Loading per request adds significant latency.
- **Assuming `navigator.share` is available:** Always guard with `navigator.canShare`. Desktop Chrome on Linux/Mac may not support it even though Chrome is listed as "supported" for some platforms.
- **Forgetting `week_start` index in Dexie schema:** Without the index, `db.saved_plans.where('week_start').equals(key)` will not work — Dexie requires explicit index declaration for `where()` queries.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SVG rendering from JSX | Custom SVG string builder | satori 0.26.0 | Handles text layout, line wrapping, flex positioning |
| SVG → PNG rasterization | Canvas API or server-side puppeteer | @resvg/resvg-js 2.6.2 | Pure Rust, zero browser dependency, fast |
| PNG file sharing on mobile | Custom share UI | `navigator.share` Web Share API | Native OS share sheet, works on iOS and Android |
| CSS-in-satori layout | CSS grid / flexbox tricks | Always use nested flex divs | Satori CSS subset: only flex layout is fully supported |

---

## Common Pitfalls

### Pitfall 1: @resvg/resvg-js Native Binding Failure at Deploy

**What goes wrong:** Vercel deployment fails or route handler 500s because `@resvg/resvg-js` tries to load `.node` native bindings not available in Edge or WASM environments.
**Why it happens:** If the project-level or per-route runtime is set to `'edge'` (e.g., in `next.config.js`), the route handler will not have access to native modules.
**How to avoid:** Do not set `export const runtime = 'edge'` in the export route handler. The Node.js runtime is the default. Verify `next.config.js` does not force a global edge runtime.
**Warning signs:** Build-time error "The module '@resvg/resvg-js' is using native node APIs"; 500 errors only on Vercel but not locally.

### Pitfall 2: Satori Silently Ignores Unsupported CSS

**What goes wrong:** The exported PNG looks wrong — elements overlap, text overflows, colors missing.
**Why it happens:** Satori supports only a subset of CSS. `display: block`, `position: absolute`, `CSS grid`, and any CSS class names are ignored without errors.
**How to avoid:** Only use `display: 'flex'` with `flexDirection` for all containers. All styles as inline objects. Test the satori output locally before committing.
**Warning signs:** PNG layout looks completely different from what the JSX tree describes.

### Pitfall 3: Missing Font Causes Satori to Throw

**What goes wrong:** Route handler throws `"No font is specified. At least one font is required."` and returns 500.
**Why it happens:** Satori has no system font fallback — every text node requires an explicit font.
**How to avoid:** Always pass at least one font in the `fonts` array. Font file must exist at `public/fonts/inter-regular.ttf` (or wherever `readFileSync` points) before the server starts. Add the font file to the repo.
**Warning signs:** Satori throws synchronously during the `await satori(...)` call.

### Pitfall 4: Dexie `where()` Without an Index

**What goes wrong:** `db.saved_plans.where('week_start').equals(weekStart)` returns nothing even though records exist.
**Why it happens:** Dexie `where().equals()` requires the field to be declared as an index in `stores()`.
**How to avoid:** The `db.version(4)` schema must declare `saved_plans: '++id, week_start'`. Verify the index is present before writing `getWeekPlan`.
**Warning signs:** `getWeekPlan` returns `undefined` even after `saveWeekPlan` completes.

### Pitfall 5: `active_plan` Diverges from Week Plan During Navigation

**What goes wrong:** Navigating away from the current week then back shows stale data (old active_plan) instead of the week plan that was modified while viewing another week.
**Why it happens:** If `active_plan` is updated only when viewing the current week but `saved_plans` is updated on every change, they diverge.
**How to avoid:** Use `active_plan` as a write-through cache — every save to `saved_plans` for the current week also writes to `active_plan`. Or remove `active_plan` and always load from `saved_plans` (slower initial hydration but simpler). Recommended: keep `active_plan` as the primary hydration source for the current week; sync both on every mutation.
**Warning signs:** Refresh while on current week shows old data.

### Pitfall 6: Web Share API Called Without User Gesture

**What goes wrong:** `navigator.share()` throws `NotAllowedError: Must be handling a user gesture`.
**Why it happens:** The Web Share API requires transient activation — it must be triggered synchronously from a button click or similar user interaction. If the PNG fetch takes too long and the activation expires, the call fails.
**How to avoid:** Start `navigator.share()` only from within the click handler call stack. The `fetch('/api/export-plan')` will suspend the gesture window. Solution: fetch the blob first, then call `navigator.share` in a `.then()` chained directly from the click handler (which may still work depending on browser). Alternatively, on mobile, trigger the download anchor directly if share is not reliable with async.
**Warning signs:** Share works in local dev but fails on slow connections or older iOS versions.

### Pitfall 7: Component Names Not Available in Route Handler

**What goes wrong:** The PNG shows IDs (numbers) instead of meal names like "Idli, Sambar".
**Why it happens:** The Route Handler has no access to IndexedDB (it's a server-side Node.js process). Component names must be resolved client-side and sent in the POST body.
**How to avoid:** The `exportPlan` action in Zustand must resolve all component IDs to names using the `componentsMap` (already available in PlanBoard via `useLiveQuery`) before making the fetch call. Send `componentNames: Record<number, string>` in the POST body.
**Warning signs:** PNG shows numbers like "1, 2" instead of meal component names.

---

## Code Examples

### Dexie Version 4 Migration (schema-only, no data transform needed)

```typescript
// Source: existing db.version(3) pattern in src/db/client.ts
db.version(4).stores({
  components: '++id, componentType, base_type, extra_category, *dietary_tags, *regional_tags, *occasion_tags',
  meals: '++id, base_id, curry_id, subzi_id',
  meal_extras: '[meal_id+component_id], meal_id, component_id',
  rules: '++id',
  saved_plans: '++id, week_start',  // week_start index added
  preferences: 'id',
  active_plan: 'id',
});
// No .upgrade() needed — no existing data to transform
```

### Week Start Computation (no date-fns)

```typescript
// Returns "YYYY-MM-DD" for the Monday of the week containing `date`
export function getISOWeekStart(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}
```

### satori Full Call Pattern

```typescript
// Source: satori 0.26.0 verified API — github.com/vercel/satori
import satori from 'satori'
import { readFileSync } from 'fs'
import { join } from 'path'

const fontData = readFileSync(join(process.cwd(), 'public/fonts/inter-regular.ttf'))

const svg = await satori(
  {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column', width: 390, padding: 24, backgroundColor: '#ffffff', fontFamily: 'Inter' },
      children: [ /* ... */ ],
    },
  },
  {
    width: 390,
    height: 900,
    fonts: [{ name: 'Inter', data: fontData, weight: 400, style: 'normal' }],
  }
)
```

### @resvg/resvg-js Full Call Pattern

```typescript
// Source: @resvg/resvg-js 2.6.2 verified API — github.com/thx/resvg-js
import { Resvg } from '@resvg/resvg-js'

const resvg = new Resvg(svg)
const pngData = resvg.render()
const pngBuffer: Uint8Array = pngData.asPng()

return new Response(pngBuffer, {
  headers: {
    'Content-Type': 'image/png',
    'Content-Disposition': 'attachment; filename="meal-plan.png"',
  },
})
```

### Web Share API with Fallback

```typescript
// Source: MDN Web Share API — developer.mozilla.org
const file = new File([blob], 'meal-plan.png', { type: 'image/png' })
if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
  await navigator.share({ files: [file], title: 'Meal Plan' })
} else {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| html2canvas for PNG export | satori + resvg-js | 2022-2023 | Server-side rendering, no DOM dependency, predictable output |
| `@vercel/og` wrapping satori | Direct satori usage | ongoing | Direct usage gives full control over output format and route structure |
| date-fns for ISO week math | Native `Date` + manual arithmetic | always valid | No new dependency; ISO week start is a simple Monday-alignment calculation |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 |
| Config file | `vitest.config.ts` (exists) |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SAVE-01 | `saveWeekPlan` + `getWeekPlan` round-trip in Dexie | unit | `npm test -- src/services/plan-db.test.ts` | ❌ Wave 0 |
| SAVE-01 | `getISOWeekStart` returns correct Monday ISO date | unit | `npm test -- src/services/week-utils.test.ts` | ❌ Wave 0 |
| SAVE-02 | `navigateToWeek` loads past week as read-only | unit (store) | `npm test -- src/stores/plan-store.test.ts` | ❌ Wave 0 |
| SAVE-02 | WeekNavigator renders correct labels and buttons | component | `npm test -- src/components/plan/WeekNavigator.test.tsx` | ❌ Wave 0 |
| EXPORT-01 | Route handler returns 200 + image/png for valid input | integration (manual-only) | N/A — requires Node.js process with native bindings; mock in unit test | manual |
| EXPORT-01 | `exportPlan` triggers download anchor when share unavailable | unit (mock fetch) | `npm test -- src/stores/plan-store.test.ts` | ❌ Wave 0 |

**Note on Route Handler testing:** `@resvg/resvg-js` native bindings cannot be loaded in happy-dom or node environments without the actual compiled `.node` file. Route handler logic (satori template, PNG pipeline) should be verified manually at `/api/export-plan` in dev. Unit tests can mock the fetch call in the client-side `exportPlan` action.

### Sampling Rate

- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/services/plan-db.test.ts` — extends existing fake-indexeddb setup; covers `saveWeekPlan`, `getWeekPlan`, version-4 migration
- [ ] `src/services/week-utils.test.ts` — pure functions; covers `getISOWeekStart`, `addWeeks`, `formatWeekLabel`
- [ ] `src/stores/plan-store.test.ts` — covers `navigateToWeek`, `isReadOnly` derivation, `exportPlan` with mocked fetch
- [ ] `src/components/plan/WeekNavigator.test.tsx` — happy-dom; covers label rendering, chevron click handlers

---

## Open Questions

1. **active_plan singleton: keep or remove?**
   - What we know: `active_plan` is the current fast-path for hydration; `saved_plans` will be the source of truth for all weeks
   - What's unclear: whether keeping both adds too much complexity vs. removing `active_plan` and always loading from `saved_plans`
   - Recommendation: **Keep active_plan as a write-through cache** — hydration cost stays the same, and backward compatibility is maintained. On every `saveWeekPlan` for the current week, also call `saveActivePlan`. On `navigateToWeek` to current week, load from `active_plan` first for speed. This is the D-03 implementation decision.

2. **Satori image height: fixed or dynamic?**
   - What we know: 7 days × 3 slots per day with text of variable length; satori requires explicit `height` in options
   - What's unclear: whether to use a fixed large height (e.g., 1200px) and risk whitespace, or calculate dynamically
   - Recommendation: Use a fixed height of 1100px (estimated from 24px header + 7 × ~140px per day row + 24px padding). Satori clips at the declared height. Test with long component name strings.

3. **Font choice for satori template?**
   - What we know: satori requires a bundled font; the app uses Google Fonts (Outfit + Noto Sans) loaded via next/font — these are not available as TTF files in `public/`
   - What's unclear: whether to download Inter (neutral, legible) or attempt to use the app's Noto Sans (requires finding the TTF in node_modules)
   - Recommendation (Claude's Discretion): Use **Inter Regular** from Google Fonts CDN — download `inter-regular.ttf` once, commit to `public/fonts/`. Noto Sans TTF can also be extracted from `node_modules/next/dist/server/og/noto-sans-v27-latin-regular.woff` but requires woff-to-ttf conversion (satori supports WOFF, not WOFF2). Simpler: download Inter TTF directly.

---

## Sources

### Primary (HIGH confidence)

- satori 0.26.0 npm registry (verified 2026-03-22) + github.com/vercel/satori README — function signature, font requirements, CSS subset limitations
- @resvg/resvg-js 2.6.2 npm registry (verified 2026-03-22) + github.com/thx/resvg-js README — `Resvg` constructor, `render()`, `.asPng()` API
- `/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` — Route Handler POST pattern, Response construction
- `/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/runtime.md` — runtime options, Node.js is default
- `src/db/client.ts` (existing) — db.version(N) migration pattern
- `src/services/plan-db.ts` (existing) — fire-and-forget saveActivePlan pattern
- `src/stores/plan-store.ts` (existing) — Zustand store structure

### Secondary (MEDIUM confidence)

- MDN Web Share API — navigator.share(), navigator.canShare() patterns; caniuse.com 94.2% global support
- WebSearch cross-verified: @resvg/resvg-js requires Node.js runtime, not compatible with Edge runtime (napi-rs native bindings)
- WebSearch cross-verified: satori requires explicit font, no system font fallback

### Tertiary (LOW confidence)

- Satori height estimation (1100px for 7-day portrait layout) — calculated, not verified against real output; must be confirmed during implementation

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — both packages verified on npm registry; already used in Next.js ecosystem widely
- Architecture: HIGH — patterns derived directly from existing codebase conventions + verified library APIs
- Pitfalls: HIGH for satori/resvg runtime issues (confirmed by community + official docs); MEDIUM for Web Share API edge cases (platform-dependent behavior)
- Week date math: HIGH — pure arithmetic, no library dependency
- Dexie migration: HIGH — follows existing db.version(3) pattern in codebase

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (satori and resvg-js are relatively stable; Next.js Route Handler API is stable)
