# Phase 9: Meal Template Engine - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-25
**Phase:** 09-meal-template-engine
**Areas discussed:** Prefs coexistence, Slot scope semantics, Multiple rules per base type, Failure behavior

---

## Todo Folded

| Item | Decision |
|------|----------|
| Meal Template rule type — unify slot settings and composition constraints | Folded into scope as design foundation for D-01 schema |

---

## Prefs Coexistence

| Option | Description | Selected |
|--------|-------------|----------|
| Template overrides prefs | If any meal-template rule exists for a base type, ignore prefs for that base type | ✓ |
| Both apply (additive) | Meal-template constraints layer on top of prefs | |
| Clean break — ignore prefs always | Remove prefs reading from generator entirely in Phase 9 | |

**User's choice:** Template overrides prefs
**Notes:** Per-base-type override — check meal-template first, fall through to prefs only if no template exists for that base type. Allows partial adoption.

---

## Slot Scope Semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Allowed_slots is always unscoped | slots context field gates ONLY composition constraints; allowed_slots always applies globally | ✓ |
| Slots context applies to all fields | Context scope gates everything including allowed_slots | |
| Forbid mixing both in one rule | Validation: allowed_slots OR context scope, not both | |

**User's choice:** Allowed_slots is always unscoped
**Notes:** Clean semantics — avoids the circular logic of "this base type is allowed in these slots when generating these slots." Context scope (days/slots) narrows when composition constraints fire; slot assignment is unconditional.

---

## Multiple Rules Per Base Type

| Option | Description | Selected |
|--------|-------------|----------|
| Compose — all rules apply | Intersection for allowed_slots, union for exclusions, all require_extra_category attempted | ✓ |
| Last-write wins | Most recently created rule replaces previous ones | |
| First match wins | First rule found applies, others ignored | |

**User's choice:** Compose — all rules apply
**Notes:** Mirrors how scheduling-rule handles multiple rules per slot. Intersection for allowed_slots (most restrictive wins). Union for exclusions. Independent attempts for required extras.

---

## Failure Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Relax + warn | All failures degrade gracefully; generation always completes | ✓ |
| Hard fail for required extras only | require_extra_category failures are fatal | |

**User's choice:** Relax + warn
**Notes:** Consistent with Phase 7 D-01 through D-04. All four failure modes emit a warning and fall back to unrestricted behavior.

---

## Claude's Discretion

- Exact Zod schema expression for the flat meal-template variant
- Helper function naming and structure
- Order of constraint application in generator loop
- Warning message strings

## Deferred Ideas

- UI form for meal-template rules (Phase 10)
- /settings/slots deletion (Phase 10)
- Prefs migration (Phase 10)
- component_slot_overrides migration (Phase 10 or separate)
