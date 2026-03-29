# Requirements: Indian Food Planner

**Defined:** 2026-03-29
**Milestone:** v1.3 — Curry Base Compatibility
**Core Value:** Generate a complete, realistic Indian weekly meal plan in one click — with smart randomization that respects personal rules and locked meals.

## v1.3 Requirements

### Curry Compatibility

- [x] **CURRY-01**: User can assign one or more compatible base categories to each curry in the Library
- [x] **CURRY-02**: Existing curry records are backfilled in-app with editable compatibility data so the current library remains usable after upgrade
- [x] **CURRY-03**: Automatic generation only selects curries compatible with the chosen base by default
- [x] **CURRY-04**: If no compatible curry exists for a slot, the generator does not silently pick an incompatible curry
- [x] **CURRY-05**: Manual picker and locked/manual selections can still use an incompatible curry as an explicit user override
- [x] **CURRY-06**: Rule behavior can explicitly override curry/base compatibility for scoped exceptions without changing the default compatibility contract
- [x] **CURRY-07**: Curry compatibility remains category-ID based and stays safe across category rename/delete normalization
- [ ] **CURRY-08**: Library, generator, picker, migration, and regression tests all use the new curry compatibility model consistently

## Future Requirements

- **COMP-01**: User can define meal composition modes such as curry-only, subzi-only, both, or one-of for a base context
- **COMP-02**: Chapati-like bases can default to subzi instead of curry without encoding that behavior as curry compatibility
- **EXP-02**: PDF export of the weekly plan
- **EXP-03**: Export meal library to JSON for backup
- **MEAL-06**: Import meals from a JSON file
- **NRPT-01**: Cross-week rotation rules to avoid repeating meals across adjacent weeks

## Out of Scope

| Feature | Reason |
|---------|--------|
| Subzi compatibility modeling | Keep this milestone focused on curry/base compatibility only |
| Curry-vs-subzi composition modes | Captured as backlog/future work rather than folded into curry compatibility |
| New compatibility tables or package dependencies | Existing component metadata, Dexie migrations, and generator/rule seams are sufficient |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CURRY-01 | Phase 17 | Complete |
| CURRY-02 | Phase 17 | Complete |
| CURRY-03 | Phase 18 | Complete |
| CURRY-04 | Phase 18 | Complete |
| CURRY-05 | Phase 19 | Complete |
| CURRY-06 | Phase 19 | Complete |
| CURRY-07 | Phase 17 | Complete |
| CURRY-08 | Phase 20 | Planned |

**Coverage:**
- v1.3 requirements: 8 total
- Mapped to phases: 8/8
- Unmapped: 0

---
*Requirements defined: 2026-03-29*
