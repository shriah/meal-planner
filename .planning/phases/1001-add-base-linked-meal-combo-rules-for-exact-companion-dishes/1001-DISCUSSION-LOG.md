# Phase 1001 Discussion Log

**Date:** 2026-04-03
**Phase:** `1001` — Add base-linked meal combo rules for exact companion dishes

## Locked Decisions

- This should be modeled as a new dedicated rule type.
- The rule target can be either a specific base component or a base category.
- If both target types match, the base-component combo wins over the base-category combo.
- The rule is for exact companion dishes, not generic composition defaults.
- Companion curry/subzi/extras are explicitly named components.
- Extras use an exact extra component list.
- Combo rules may define any subset of companion slots instead of requiring a full bundle.
- When a combo rule applies, its named companions are authoritative.
- Other rules should not further modify combo-selected companions.
- Manual user choices win over combo rules.
- Regenerate should not overwrite explicit manual component picks with combo-rule companions.
- If some referenced companion components are missing, apply the remaining valid companions and warn.

## Key Example

- `Pongal -> Sambar + Coconut chutney`
- A more partial combo is also valid, such as a base-category rule that only pins exact extras.

## Deferred

- Broad meal composition semantics such as `curry-only`, `subzi-only`, `both`, and `one-of` remain in Phase `999.1`.
