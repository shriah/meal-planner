# Phase 18 Discussion Log

**Date:** 2026-03-29
**Phase:** 18 - Generator Compatibility Contract

## Decisions

- If the selected base has no compatible curry candidates, auto-generation skips the whole curry component for that slot instead of falling back to an incompatible curry.
- Phase 18 stays narrow: default automatic-generation enforcement only.
- Rule-based incompatible overrides remain in Phase 19 and are not folded into this phase.
- Skipped-curry feedback should reuse the existing per-slot warning path.
- Curries with zero compatible bases never auto-pick.
- Manual picker swaps and locked/manual incompatible selections stay unchanged in this phase.

## Deferred

- Rule-based incompatible curry overrides remain Phase `19`.
- Manual-picker restriction or explicit incompatible-picker affordances remain Phase `19`.
- Curry-vs-subzi composition modes remain backlog work under Phase `999.1`.
