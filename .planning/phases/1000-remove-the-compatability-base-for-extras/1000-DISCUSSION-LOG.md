# Phase 1000 Discussion Log

**Date:** 2026-04-02
**Phase:** 1000 - remove the compatability base for Extras

## Decisions

- Remove extra/base compatibility completely from the data model, UI, queries, and generator behavior
- Extras should no longer use `compatible_base_category_ids` as live application data
- Rules are the only mechanism that can auto-add extras
- Without a matching rule, auto-generation should add no extras
- Manual extra picking should show all extras instead of filtering by base
- Legacy extra `compatible_base_category_ids` should be stripped or ignored during migration/normalization

## Deferred

- Curry compatibility is unchanged and remains outside this phase
- Meal composition modes remain backlog work under Phase `999.1`
