# Phase 17 Discussion Log

**Date:** 2026-03-29
**Phase:** 17 - Curry Compatibility Data

## Decisions

- Backfill uses a hybrid model:
  - curated compatibility for seeded/default curries
  - all-base fallback for existing non-curated curries
- Empty compatibility means compatible with none
- Library UX reuses the checklist pattern and shows selected base labels on collapsed curry rows
- Delete normalization removes deleted base IDs and leaves zero-compatible curries empty
- Zero-compatible curries are allowed, but the Library must show a clear warning/badge

## Deferred

- Curry-vs-subzi composition modes remain backlog work under Phase `999.1`
- Generator enforcement and override semantics are deferred to later v1.3 phases
