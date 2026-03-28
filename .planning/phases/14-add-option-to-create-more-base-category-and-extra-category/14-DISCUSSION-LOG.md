# Phase 14: Add option to create more base category and extra category - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 14-add-option-to-create-more-base-category-and-extra-category
**Areas discussed:** Category creation surface, Category editing rules, Scope of dynamic categories, Existing built-in categories, Compatibility UX, Reference handling

---

## Category creation surface

| Option | Description | Selected |
|--------|-------------|----------|
| Inline in the component form | Create categories while adding/editing a base or extra | |
| Separate category-management UI | Manage categories outside the component form | ✓ |
| Both | Support both entry points | |

**User's choice:** Separate category-management UI
**Notes:** The component form should consume dynamic categories but not be the place where categories are authored.

---

## Category editing rules

| Option | Description | Selected |
|--------|-------------|----------|
| Add-only | Only create new categories in this phase | |
| Add + rename | Allow editing names, but no delete | |
| Add + rename + delete | Full lifecycle management in this phase | ✓ |

**User's choice:** Add, rename, and delete custom categories
**Notes:** This pushes the phase into real category management rather than a one-time expansion of fixed options.

---

## Scope of dynamic categories

| Option | Description | Selected |
|--------|-------------|----------|
| Full system now | Library, rules, generator, picker filters, descriptions, persistence | ✓ |
| Library forms first | Defer rule/generator propagation | |
| Something narrower | Partial rollout | |

**User's choice:** Full system now
**Notes:** Planning should treat this as a model and propagation phase, not a library-only feature.

---

## Existing built-in categories

| Option | Description | Selected |
|--------|-------------|----------|
| Keep built-ins locked | Add custom categories alongside fixed defaults | |
| Convert built-ins into normal editable categories | Built-ins become regular records too | ✓ |
| Something else | Custom handling | |

**User's choice:** Convert built-ins into normal editable categories
**Notes:** The product should not distinguish between built-in and added categories after migration.

---

## Compatibility UX for extras

| Option | Description | Selected |
|--------|-------------|----------|
| Keep the current multi-select checklist | Same interaction, dynamic options | ✓ |
| Replace with a different picker/search UI | New interaction model | |
| Something else | Custom UX | |

**User's choice:** Keep the multi-select checklist
**Notes:** The option source changes, but the interaction style should remain familiar.

---

## Reference handling

| Option | Description | Selected |
|--------|-------------|----------|
| Cascade update on rename, block delete while in use | Safe but restrictive delete model | |
| Cascade update on rename, auto-remove references on delete | Delete clears old references automatically | |
| ID-backed identity with cascade rename and allowed delete | Category identity survives rename; delete allowed with system cleanup | ✓ |

**User's choice:** Use category IDs as identity; cascade rename; allow delete
**Notes:** Names are labels only. Delete cleanup should normalize references rather than relying on string matching.

---

## the agent's Discretion

- Exact data model for category records
- Exact delete normalization rules per dependent surface
- Exact placement and layout of the category-management UI

## Deferred Ideas

None.
