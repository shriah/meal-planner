# Phase 20 Discussion Log

**Date:** 2026-04-01
**Phase:** 20 - Compatibility Regression Coverage

## Discussion Style Update

User preference recorded for future discuss sessions:
- prefer a tighter set of high-impact decisions instead of a static 5-option menu
- include the severity/impact of each decision to make prioritization clearer

## Decisions Locked

### Coverage strategy
- User selected `1B`
- Phase 20 should use one broader cross-flow regression harness as the backbone, with focused tests added only where necessary.

### Rename/delete proof depth
- User selected `2B`
- Phase 20 must prove rename/delete safety both at the data/service layer and through downstream runtime behavior after normalization.

## Deferred / Not Selected

- Manual verification remained unselected and is not a locked phase requirement.
- The matched todo about meal-template composition constraints stays out of scope for this regression phase.

## Outcome

These decisions are captured in `20-CONTEXT.md` and should drive research/planning for `CURRY-08`.
