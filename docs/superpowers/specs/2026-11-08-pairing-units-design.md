# Pairings as Units — Design

**Status:** approved direction, 2026-11-08. Extends `2026-03-27-unified-rule-system-design.md` (Generator Changes).

## Why

A base with a pairing is never planned. Measured on the seed library over 8 weeks, Pongal with Sambar and
Coconut Chutney "served with" it:

| Pongal's pairings | Pongal meals in 8 weeks |
|---|---|
| none | 7–8 |
| Always | 0 |
| Usually / Often / Sometimes | 0 |

Two causes:

1. **The planner judges a base on an empty meal.** It picks the base first, then the curry, subzi and extras.
   When it scores Pongal, Sambar is not there yet, so "Pongal needs Sambar" counts as broken (a hard
   violation for Always, a cost for the softer strengths), and every base without pairings wins. Later
   changes move one dish at a time, so Pongal and its sides never arrive together.
2. **Pairings are judged against the side dish's own rules.** Even with its sides, Pongal costs more than a
   plain base: "Curries, subzis and extras only when a rule asks for them" charges for each side, and the
   side's own rules (lunch-only, never planned automatically, variety) can forbid it outright.

The assistant then guessed at reasons ("variety preferences or slot constraints"), because
`explain_plan_slot` tests Pongal alone and reports the missing Sambar as the obstacle.

## The rule

**A base and its Always pairings are one unit.** Choosing Pongal means choosing Pongal with Sambar and Coconut
Chutney. A pairing is never dropped and is never a reason to leave its base out. Softer pairings
(Usually, Often, Sometimes) bring their side along when it fits and give way otherwise, but they never make
the base itself less likely to be planned.

## Goals

- A base with pairings of any strength is planned about as often as the same base without them.
- Every planned meal with an Always pairing holds the paired side, whatever the side's own rules say.
- The planner, the meal picker, the plan view and the assistant all describe the same thing: "Sambar is here
  because it is always served with Pongal".
- No change to stored rules or stored plans; no Dexie version.

## Non-goals

- Rules that work across the meal or the week do not give way (see the table). The pairing still holds:
  the unit as a whole is judged by them, so it is the base that moves, never the pairing that breaks.
- Pairings to a category of extras ("an extra from condiments") stay ordinary requirements: there is no
  single dish to bring.
- Planning one role at a time across the whole week. Rules couple roles in both directions; the planner
  keeps building meal by meal.

## What gives way to a unit

A side placed by an Always pairing is a **unit member** in that meal. A side placed by a softer pairing is
**asked for** in that meal. Every unit member is also asked for.

| Rule | Unit member (Always) | Asked for (any strength) | Free pick |
|---|---|---|---|
| The side's own days, meals, "never plan automatically" | gives way | applies | applies |
| The side's own "only with" / "never with" links | gives way | applies | applies |
| Default variety and spacing | gives way | applies | applies |
| Default prefer-frequent / avoid-rare | gives way | applies | applies |
| Default extras-per-meal caps | gives way | applies | applies |
| Default "sides only when a rule asks" | gives way | gives way | applies |
| The base's own rules where the unit member is only the trigger (Pongal "never with Sambar") | gives way | applies | applies |
| Another dish's rule where the unit member is only the trigger (Chutney "never with Sambar") | applies; Chutney gives way | applies | applies |
| Hand-written rules (not owned by a dish, not a default) | applies to the whole meal | applies | applies |
| Built-ins: one base, one curry, one subzi, roles, no extra twice | applies | applies | applies |
| The base's own rules (Pongal lunch-only) | applies to the base | applies | applies |

In rule terms:
- **Owned rules** (`owner_component_id`) and **default rules** (`default_key`) give way to unit members.
- `sides-only-when-asked` also gives way to asked-for sides.
- **Hand-written rules** and **built-ins** never give way.

## Which rules make units

- **Units:** every enabled `require_with` at strength `must` that names specific dishes (`components`). That
  covers owned `serve:*` links at Always and hand-written "also include" rules that name dishes.
- **Asked for:** the same rules at strength `prefer` (Usually, Often, Sometimes).
- `require_with.extraCategories` stays an ordinary slot count, as today.
- A pairing's scope (days, meals) limits where it makes a unit.

## Conflicts

- **Two Always curries (or subzis) for one base.** A meal holds one curry, so both cannot be in the unit.
  - At save time, the dish form and the assistant (`propose_dish`, `propose_pairing`) refuse the second one.
    Today this is only a warning.
  - Stored data may already hold such a pair. At plan time the rule with the lower id makes the unit. The
    other one is not enforced for that base, and the plan reports it once as a soft problem ("Rasam is not
    served with Pongal: a meal holds one curry and Sambar is always served with it"). It never blocks the
    base.
- **Your picks and locks win.** A pinned curry other than the paired one, or a curry held empty, keeps the
  pin. The pairing shows as a problem worded "replaced by your pick", not as a planner failure. Picking
  Pongal by hand re-plans that meal (`replanMeal`), and its sides come with it.

## How it works

**Planner input (`src/planner/constraints.ts`).**
- A new constraint kind, `pair`:
  `{ kind: 'pair', when: Matcher, component: number, scope?, strength: 'must' | 'prefer', cost? }`.
  When an assignment in a meal matches `when` (other than the paired dish itself), the meal should hold
  `component`.
  - `must`: a missing component is a hard violation.
  - `prefer`: a missing component costs `cost`.
- Count and prefer constraints gain two optional fields, set by the rule compiler:
  - `yieldsTo?: 'unit' | 'ask'`
  - `owner?: number`, the dish that owns the rule.

**Scoring (`src/planner/scorer.ts`).** Before counting, each score works out the unit members and asked-for
sides of every meal from the `pair` constraints whose trigger is present. When counting:
- A unit member does not count as selected for a constraint with `yieldsTo` set.
- An asked-for side does not count as selected for a constraint with `yieldsTo: 'ask'`.
- A unit member does not trigger a constraint whose `owner` is the base of its meal.

All of this is worked out at scoring time from the plan and the rules. It is not stored, so stored plans,
`explainPlan`, `slotConflicts` and draft checks see the same thing as the solver.

**Solving (`src/planner/solver.ts`).**
- Placing a dish (in construction, and in every move that changes a base, curry or subzi) brings its
  pairings in the same step:
  - unit members always, and asked-for sides tentatively;
  - into free roles only, never over a pin;
  - then the members' own pairings, until nothing changes.
- So a base is scored with its sides in place.
- Construction skips the curry or subzi step when a unit member already fills that role.
- Unit members are not free to move while their base stays. Moves and polish skip them.
- Asked-for sides are free: polish drops one when that helps.

**Rule compiler (`src/rules`).**
- `require_with` compiles its `components` into `pair` constraints and its `extraCategories` into counts,
  as today.
- `compileRules` sets the fields on each constraint:
  - owned rules: `owner` and `yieldsTo: 'unit'`;
  - default rules: `yieldsTo: 'unit'`;
  - `sides-only-when-asked`: `yieldsTo: 'ask'`.

**Around the planner.**
- `slotConflicts` (the meal picker) places a candidate base together with its unit before counting problems.
  So Pongal shows no conflict.
- `PlanningOutcome` gains the paired sides of each meal, so the plan view can label a side "with Pongal".
- `explain_plan_slot`:
  - reports the paired sides;
  - no longer reports a missing pairing as the reason a base is left out.
- The prompt tells the assistant to give only reasons a tool returned.

## Acceptance

- Seed library, 8 weeks:
  - Always Sambar and Coconut Chutney on Pongal, with Sambar lunch-only and never planned automatically:
    Pongal is planned at least 4 times, and every Pongal meal holds both.
  - The same at Usually: Pongal is planned at least 4 times.
- A pairing scoped to breakfast makes a unit only at breakfast.
- A pairing to a base category makes a unit for every base in it.
- A stored conflict (two Always curries) still plans the base, with one curry and one soft problem.
- A pinned curry other than the paired one is kept, and the problem says it was replaced by your pick.
- The default planning time (300 ms budget) still reaches a plateau on the seed library.

## Left to the builder

- Internal data structures for the per-score unit sets.
- Wording of the plan label and problem texts, within the examples above.
