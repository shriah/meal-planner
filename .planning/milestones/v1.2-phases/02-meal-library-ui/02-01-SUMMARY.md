---
phase: 02-meal-library-ui
plan: 01
subsystem: ui
tags: [shadcn, dexie, lucide-react, seed-data, indexeddb, tailwindcss]

requires:
  - phase: 01-data-foundation
    provides: ComponentRecord/UserPreferencesRecord types, db client, food-db service functions, Vitest + fake-indexeddb test infrastructure

provides:
  - shadcn/ui initialized with preset bgAUzxKUy — 10 components available (tabs, input, badge, button, checkbox, label, select, separator, alert, tooltip)
  - dexie-react-hooks and lucide-react installed as runtime dependencies
  - 87 typed ComponentRecord seed entries covering all four component types
  - SeedBootstrap client component that auto-seeds IndexedDB on first launch
  - UserPreferences seeded with slot restrictions and Poori component_slot_overrides
  - 7 automated seed correctness tests (all passing)

affects: [02-meal-library-ui/02-02, 02-meal-library-ui/02-03, all downstream phases needing seed data]

tech-stack:
  added:
    - dexie-react-hooks (live queries in React components)
    - lucide-react (icon library)
    - shadcn/ui 4.1.0 (component library, Tailwind v4 compatible)
    - tw-animate-css (shadcn animation utilities)
  patterns:
    - SeedBootstrap 'use client' component as server/client boundary in layout.tsx
    - Dynamic import() for seed data to keep bundle lean
    - Factory helpers (makeBase/makeCurry/makeSubzi/makeExtra) for type-safe seed authoring
    - Named POORI_SEED export for ID capture pattern in slot overrides

key-files:
  created:
    - src/db/seed-data.ts (87 typed ComponentRecord entries + factory helpers)
    - src/db/seed.tsx (SeedBootstrap component + runSeed function)
    - src/db/seed.test.ts (7 seed correctness tests)
    - components.json (shadcn configuration with preset bgAUzxKUy)
    - src/lib/utils.ts (shadcn cn() utility)
    - src/components/ui/tabs.tsx
    - src/components/ui/input.tsx
    - src/components/ui/badge.tsx
    - src/components/ui/button.tsx
    - src/components/ui/checkbox.tsx
    - src/components/ui/label.tsx
    - src/components/ui/select.tsx
    - src/components/ui/separator.tsx
    - src/components/ui/alert.tsx
    - src/components/ui/tooltip.tsx
  modified:
    - src/app/layout.tsx (added SeedBootstrap wrapper + shadcn fonts)
    - src/app/globals.css (shadcn theme variables using oklch color system)
    - package.json (dexie-react-hooks, lucide-react added)

key-decisions:
  - "seed.tsx extension required (not .ts) — file contains JSX fragment syntax; OXC/Vite transform fails on .ts with JSX"
  - "Poori seeded individually via db.components.add() before bulkAdd to capture auto-assigned numeric ID for slot override"
  - "Dynamic import() in runSeed keeps seed-data.ts out of the main bundle — loaded only on first launch"
  - "87 entries chosen — 25 bases, 25 curries, 20 subzis, 17 extras — comfortably within 80-100 target"

patterns-established:
  - "Client component seeding: SeedBootstrap renders null until seed completes, then renders children — prevents UI flash before DB ready"
  - "Named export pattern for special seed items: export const POORI_SEED so seed.tsx can reference by name, not index"
  - "Factory function pattern for seed data: each component type has a typed factory enforcing required fields"

requirements-completed: [DATA-06]

duration: 4min
completed: 2026-03-20
---

# Phase 2 Plan 1: Dependencies and Seed Data Summary

**shadcn/ui initialized with 10 components, 87 typed Indian meal ComponentRecords seeded into IndexedDB via idempotent SeedBootstrap with Poori slot override**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-20T02:03:31Z
- **Completed:** 2026-03-20T02:07:00Z
- **Tasks:** 2
- **Files modified:** 19

## Accomplishments

- Installed shadcn/ui (preset bgAUzxKUy), dexie-react-hooks, and lucide-react; all 10 required UI components available
- Authored 87 typed ComponentRecord seed entries (25 bases, 25 curries, 20 subzis, 17 extras) covering all regional, dietary, protein, and occasion tags
- Created idempotent SeedBootstrap component wired into layout.tsx — database auto-seeds on first launch, subsequent loads are no-ops
- Poori correctly seeded first to capture its auto-assigned ID for `component_slot_overrides`; slot restrictions (other: breakfast+dinner, rice-based: lunch, bread-based: dinner) persisted in UserPreferences
- All 7 seed tests pass; full test suite (14 tests) green; TypeScript compiles without errors

## Task Commits

1. **Task 1: Install dependencies and initialize shadcn/ui** - `686e2da` (feat)
2. **Task 2: Author seed dataset and SeedBootstrap component with tests** - `6545ebd` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/db/seed-data.ts` — 87 typed ComponentRecord entries with makeBase/makeCurry/makeSubzi/makeExtra factories, SEED_COMPONENTS array, POORI_SEED named export
- `src/db/seed.tsx` — runSeed function with idempotency guard and Poori ID capture; SeedBootstrap 'use client' component
- `src/db/seed.test.ts` — 7 tests: record counts, type coverage, slot defaults, Poori override, idempotency, extras have compatible_base_types, bases have base_type
- `components.json` — shadcn configuration (preset bgAUzxKUy, Tailwind v4, path alias @/components/ui)
- `src/lib/utils.ts` — shadcn cn() utility (clsx + tailwind-merge)
- `src/components/ui/*.tsx` — 10 shadcn components
- `src/app/layout.tsx` — SeedBootstrap import and body wrapper; shadcn fonts (Outfit, Noto Sans)
- `src/app/globals.css` — shadcn theme variables using oklch color system, tw-animate-css import
- `package.json` — dexie-react-hooks, lucide-react added to dependencies

## Decisions Made

- Used `seed.tsx` extension instead of `seed.ts` — file contains JSX fragment `<>{children}</>` which requires `.tsx` for the OXC/Vite transformer used by Vitest
- Poori inserted individually first via `db.components.add()` to capture its auto-assigned numeric ID; remaining 86 entries bulk-added
- Dynamic `import('@/db/seed-data')` inside runSeed keeps the 87-record dataset out of the initial JS bundle
- 87 total records: 25 bases, 25 curries, 20 subzis, 17 extras — intentionally at the lower-mid range to leave room for users to add custom items

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Renamed seed.ts to seed.tsx**
- **Found during:** Task 2 (vitest run)
- **Issue:** `seed.ts` contained JSX (`<>{children}</>`) but OXC (used by Vite/Vitest) cannot parse JSX in `.ts` files — transform error "Unexpected token" at fragment syntax
- **Fix:** Renamed to `seed.tsx`; Next.js and TypeScript module resolution both resolve `@/db/seed` to the `.tsx` file transparently
- **Files modified:** `src/db/seed.tsx` (was `seed.ts`)
- **Verification:** `npx vitest run src/db/seed.test.ts` exits 0 with all 7 tests passing
- **Committed in:** `6545ebd` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — file extension bug)
**Impact on plan:** Necessary for vitest to parse JSX. No scope change or behavior change.

## Issues Encountered

None beyond the auto-fixed .tsx extension issue.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- shadcn/ui components available for import from `@/components/ui/*`
- Database will be populated with 87 meal components on first browser launch
- UserPreferences with slot restrictions ready for the meal library UI to read
- Poori override correctly stored — slot assignment logic in Phase 3 can rely on it
- All Phase 1 tests still passing — no regressions introduced

---
*Phase: 02-meal-library-ui*
*Completed: 2026-03-20*

## Self-Check: PASSED

All created files verified present on disk. All task commits verified in git log.
