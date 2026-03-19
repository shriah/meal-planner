# Indian Food Planner

## What This Is

A personal weekly meal planner built for Indian dietary patterns. Users build a library of Indian meals (structured as Base + Curry + Subzi + Extras), write natural language rules for scheduling constraints, and generate randomized Mon-Sun plans that respect those rules — with the ability to lock specific meals, edit the plan, save it, and export/share it.

## Core Value

Generate a complete, realistic Indian weekly meal plan in one click — with smart randomization that respects personal rules and locked meals.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Indian food database with meals structured as Base + Curry + Subzi + Extras (rasam, pappad, sweets)
- [ ] Configurable meal slots: breakfast, lunch, dinner per day
- [ ] Natural language rules (LLM-translated) to constrain meal randomization (day-based and rotation rules)
- [ ] Lock specific meals at the day or meal-slot level; randomize the rest
- [ ] Generate a full Mon-Sun meal plan with one action
- [ ] Edit generated plan (swap individual meals)
- [ ] Save plans for future reference
- [ ] Export/share plans (PDF, image, or text)

### Out of Scope

- Calorie/macro tracking — not needed for v1; focus is scheduling
- Multi-user / family accounts — personal use only for v1
- Public user accounts / social features — single user, no auth complexity needed for v1
- Native mobile app — web-first for v1

## Context

- Modeled on eatthismuch.com's meal generation UX but adapted for Indian cuisine
- Indian meals have a distinct compositional structure: a starchy base (rice, roti, dosa) paired with a curry/dal, a dry subzi, and optional extras (rasam, sambar, pappad, sweets, pickle)
- The same base (e.g., rice) can appear with many different combinations — the randomization value comes from varying the sides, not just the base
- LLM used to translate English rules like "Fridays are fish days" or "Never repeat the same subzi twice in a week" into meal filters at generation time
- Personal use — no need for complex auth, multi-tenancy, or social features

## Constraints

- **Scope**: Single-user personal app — no auth complexity, no multi-tenancy
- **Tech stack**: To be determined during research phase
- **Nutrition**: Explicitly out of scope for v1 — do not track calories or macros
- **LLM dependency**: Natural language rules require LLM API integration (e.g., Claude API)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| LLM for rule interpretation | English rules are flexible and human-friendly; LLM translates to filters | — Pending |
| Meal structure as components | Base + Curry + Subzi + Extras matches real Indian meal patterns | — Pending |
| Personal-use scope for v1 | Simplifies auth, data model, and UX significantly | — Pending |

---
*Last updated: 2026-03-19 after initialization*
