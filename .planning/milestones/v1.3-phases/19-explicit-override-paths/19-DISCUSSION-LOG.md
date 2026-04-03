# Phase 19 Discussion Log

**Date:** 2026-03-30
**Phase:** 19 - Explicit Override Paths

## Decisions

- Curry picker should normally split into compatible and incompatible sections.
- If there are no compatible curries for the current base, do not segregate the picker; show one list.
- Manual incompatible picks persist exactly, and locking/regeneration preserves them until the user changes them.
- Both specific-component and tag-based `require_one` can act as explicit compatibility overrides.
- Tag-based `require_one` prefers compatible matches first and only uses incompatible matches when no compatible match satisfies the explicit rule.
- Explicit overrides should look normal on the board with no extra badge or warning styling.
- Precedence is manual/locked selection first, explicit override rule second, default compatibility otherwise.

## Deferred

- Dedicated override badge or warning styling on the board
- New dedicated “ignore compatibility” rule control
- Curry-vs-subzi composition modes under backlog item `999.1`
