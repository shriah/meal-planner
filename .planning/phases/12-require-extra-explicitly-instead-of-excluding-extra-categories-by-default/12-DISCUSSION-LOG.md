# Phase 12: Require extra explicitly instead of excluding extra categories by default - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 12-require-extra-explicitly-instead-of-excluding-extra-categories-by-default
**Areas discussed:** Rule semantics, UI shape, Existing rule migration, Generator behavior and warnings, Rule list / description copy

---

## Rule semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Require-only model | Meal-template rules can require an extra category, otherwise extras are unconstrained | |
| Require-or-none with explicit "no extras logic" state in the UI | Keeps extra logic opt-in and allows an intentional empty state | ✓ |
| Something else | Custom semantics | |

**User's choice:** Require-or-none with an empty require-extra state meaning "no extras logic"
**Notes:** User later clarified that the empty state itself should carry that meaning; no separate explicit exclusion behavior remains.

---

## UI shape

| Option | Description | Selected |
|--------|-------------|----------|
| Remove the entire "Exclude extra categories" section | Keep only require-extra controls in the UI | ✓ |
| Replace both sections with a single simpler control | Collapse to one required-extra dropdown/select | |
| Keep advanced controls hidden behind an expander | Preserve legacy controls but reduce visibility | |

**User's choice:** Remove the entire exclude-extra section
**Notes:** The remaining require-extra control may stay empty to represent no extra logic.

---

## Existing saved rules

| Option | Description | Selected |
|--------|-------------|----------|
| Ignore old exclude data going forward | Stop reading it without cleaning persisted records | |
| Strip old exclude data in migration/update path | Clean existing records so the obsolete concept is removed | ✓ |
| Preserve old behavior for existing rules only | Legacy compatibility path | |

**User's choice:** Strip old exclude data in migration/update path
**Notes:** Existing persisted rules should be normalized, not merely hidden in UI.

---

## Generator behavior and warnings

| Option | Description | Selected |
|--------|-------------|----------|
| No extra-related warnings unless a required extra cannot be satisfied | Warning behavior becomes explicitly requirement-driven | ✓ |
| Keep current warning behavior even when no extra is required | Preserve current noisy warnings | |
| Something else | Custom warning model | |

**User's choice:** No extra warnings unless an explicit required-extra rule fails
**Notes:** When no required extra is set, extras should be unconstrained by meal-template logic.

---

## Rule list / description copy

| Option | Description | Selected |
|--------|-------------|----------|
| Only describe explicitly required extras | No exclusion language in user-visible copy | ✓ |
| Show legacy exclusion text for old rules until edited | Transitional copy model | |
| Something else | Custom copy approach | |

**User's choice:** Only describe explicitly required extras
**Notes:** This aligns with the migration decision to strip legacy exclude data rather than preserving hidden compatibility.

---

## the agent's Discretion

- Exact control style for the remaining require-extra field
- Exact migration helper naming and test naming

## Deferred Ideas

- Historical todo `Meal Template rule type — unify slot settings and composition constraints` was reviewed as background and not folded into Phase 12 scope.
