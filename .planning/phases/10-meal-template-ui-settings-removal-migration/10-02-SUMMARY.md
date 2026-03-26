---
phase: 10-meal-template-ui-settings-removal-migration
plan: "02"
subsystem: database-migration
tags: [dexie, migration, seed, meal-template, scheduling-rule, preferences]
dependency_graph:
  requires: []
  provides: [db-v7-migration, updated-seed-rules]
  affects: [src/db/client.ts, src/db/seed.tsx]
tech_stack:
  added: []
  patterns: [dexie-upgrade-callback, async-upgrade-transaction, bulkAdd-seeding]
key_files:
  created: []
  modified:
    - src/db/client.ts
    - src/db/seed.tsx
decisions:
  - "Dexie v7 upgrade uses async callback to allow component name lookup for friendlier rule names"
  - "Seed uses db.rules.bulkAdd directly to avoid circular import from service layer"
  - "component_slot_overrides migrated to scheduling-rule exclude records (not meal-template — no per-component field in meal-template)"
metrics:
  duration: "79s"
  completed_date: "2026-03-26"
  tasks_completed: 2
  files_modified: 2
---

# Phase 10 Plan 02: Dexie v7 Migration and Seed Update Summary

Dexie v7 upgrade callback converts existing slot_restrictions and base_type_rules prefs to rule records; seed updated to create rules instead of prefs for new users.

## Tasks Completed

### Task 1: Add Dexie v7 migration for slot prefs to rule records
**Commit:** 457facd

Added `db.version(7)` with async upgrade callback to `src/db/client.ts`. The callback:

- **D-09:** Iterates `prefs.slot_restrictions.component_slot_overrides`, computes excluded slots for each component, creates `scheduling-rule` exclude records. Uses async `componentsTable.get(componentId)` to build friendly names (e.g., "Poori slot restriction (migrated)").
- **D-10:** Iterates `prefs.slot_restrictions.base_type_slots`, creates `meal-template` records with `allowed_slots` for each base type.
- **D-11:** Iterates `prefs.base_type_rules`, creates `meal-template` records with `require_extra_category` for entries that have a requirement set.
- **D-12:** Clears `slot_restrictions.base_type_slots`, `slot_restrictions.component_slot_overrides`, and `base_type_rules` in prefs after migration.

All reads use null-safe `?.` and `?? {}` / `?? []` fallbacks. Schema is identical to v6 (no structural changes needed).

### Task 2: Update seed to create rules instead of slot_restrictions prefs for new users
**Commit:** cf2a37e

Updated `src/db/seed.tsx` `runSeed()`:

- Prefs seed now has empty `base_type_slots: {}` and `component_slot_overrides: {}`. `extra_quantity_limits` preserved unchanged.
- Added `db.rules.bulkAdd([...])` with 4 rule records:
  - "Other: breakfast and dinner" — meal-template, `allowed_slots: ['breakfast', 'dinner']`
  - "Rice-based: lunch only" — meal-template, `allowed_slots: ['lunch']`
  - "Bread-based: dinner only" — meal-template, `allowed_slots: ['dinner']`
  - "Poori: breakfast only" — scheduling-rule exclude, `slots: ['lunch', 'dinner']`, matches `component_id: pooriId`

## Verification Results

- `db.version(7)` appears exactly once in `src/db/client.ts`
- `component_slot_overrides`, `base_type_slots`, `base_type_rules` all referenced in upgrade callback
- "slot restriction (migrated)" and "slot assignment (migrated)" patterns present in client.ts
- `db.rules.bulkAdd` present in seed.tsx
- `base_type_slots: {}` present in seed prefs
- All 4 named seed rules present: "Other: breakfast and dinner", "Rice-based: lunch only", "Bread-based: dinner only", "Poori: breakfast only"
- `npx tsc --noEmit` produces no new errors (pre-existing errors in unrelated export-plan/route.ts)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all data paths are fully wired. Migration logic reads real prefs and inserts real rule records. Seed creates real rule records from first launch.

## Self-Check: PASSED

- `src/db/client.ts` — FOUND, contains `db.version(7)` upgrade
- `src/db/seed.tsx` — FOUND, contains `db.rules.bulkAdd`
- Commit 457facd — FOUND
- Commit cf2a37e — FOUND
