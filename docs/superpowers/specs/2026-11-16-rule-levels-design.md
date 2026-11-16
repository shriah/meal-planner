# Rule Levels

Second of four planner generalisation projects (search budget, rule levels, repair loop, user-defined meal parts).

## Why

Which rule gives way to which is decided today by three mechanisms that are inferred, not stated:

- `givesWayTo` and `isFrequencyBody` in `src/rules/record.ts` guess from a rule's owner, `default_key` and shape (a count
  whose groupBy isn't `slot` with an upper bound, or any prefer) whether it is a "frequency" rule.
- Two give-way flags on constraints, `yieldsTo: 'unit' | 'ask'`.
- Hidden weights in the solver and scorer: `OVERRIDE_WEIGHT` (1e6) for a dish's own limit overridden by an Always link,
  `LIMIT_WEIGHT` (1e3) for a freed pick's hard limit.

They work (91 rule cases) but are hard to reason about, and the user-defined meal parts project needs a hierarchy that
does not depend on rule shapes or magic numbers.

## What the user decided

- The current behaviour is right: a link beats a frequency rule, even a hand-written "Avoid Papad, Strongly". Lower-level
  frequency rules never influence a higher level (from the comes-with design of 2026-11-09).
- (Agreed with the proposal) Strength words (Usually, Often, Sometimes = cost 10, 6, 3) keep meaning a cost on every
  level. Levels say who gives way, not how much a rule costs.
- (Agreed with the proposal) A rule's level comes from its kind; the user does not move rules between levels.

## The levels (behaviour unchanged from today)

Each compiled rule body gets one level, set by its template from its params and origin (one template can give
different levels, e.g. "how often" per meal vs per week):

| Level | Rules | Gives way to |
|---|---|---|
| Your rules | hand-written rules that are not frequency rules: never include, only allow, always include, only at certain meals or days, leave out when, never together; also a hand-written "how often" **per meal** (what one meal may hold is not frequency) | nothing |
| Bringing rules | every pair: comes with, served with, and a hand-written "also include when" | nothing; they bring dishes |
| Dish limits | a dish's own limits (owned days, meals, only/never with); the extras-per-meal default caps; retired defaults still stored (switched off) keep this level | Always bringing rules |
| Frequency | "how often" per day or week (upper bounds), no repeats, prefer and avoid, hand-written or owned; the defaults variety, spacing, sides-only-when-asked | any bringing rule |

"Gives way" is decided by the bringing rule being a pair, hand-written or link, exactly as today.

A count with both a minimum and a maximum keeps today's split: the minimum is on the rule's own level, the maximum on
Frequency. A brought dish's frequency limits count only when the link has several options, to choose between them
(2026-11-09 decision).

**User decision:** a hand-written rule that is not a frequency rule beats a link, as today. A hand-written "never include
Papad" still stops Rice's link.

Two pair behaviours stay pair logic, outside levels, unchanged: a missing pair gives way when an Always pair's dish
already fills its role (`yieldsToUnit`), and a dish an Always link brings does not trigger its own base's owned rules
(`owner`).

**Where the tiers go (my call):** 1e6 and 1e3 appear only in the solver's `broughtScore`, which ranks a link's candidates.
The explicit tiers replace them there and in `chooseCandidate`, not in the plan's `Score`, so plan scores do not change.
If a strict tier order would change any rule case's outcome against today's weighted sum, today's behaviour wins and the
builder reports the case.

## Goals

- Each compiled constraint carries its level instead of `yieldsTo`. "Gives way to" is a function of the level, in one
  place.
- `isFrequencyBody`'s shape test is replaced by each template declaring its level (and the min/max split).
- The scorer keeps the lexicographic score (hard before soft). The override and limit tiers that 1e6 and 1e3 encode become
  explicit components of the score, compared in order, not weight magnitudes. Final scores for every rule case must be
  unchanged in ordering.
- The Rules page shows each rule's level as a small label.

## Non-goals

- Letting users choose a rule's level.
- Changing any rule's behaviour. Every rule case passes unchanged, and no case's expectations are edited.

## Anti-goals

- A Sometimes link that behaves like Always against lower levels (strict level ranking of soft costs).

## Constraints

- Determinism, rule cases, CLAUDE.md commit and DB conventions. No Dexie version is needed if levels are derived at compile
  time (my call: derive, do not store, so old rules need no upgrade).

## Left to the builder

- The score representation (tuple or struct) and how the solver's `broughtScore` and `chooseCandidate` read it.
- Label wording on the Rules page, from the level names above.

## Acceptance

- All tests, typecheck, lint and rule cases pass with no case expectations changed.
- `OVERRIDE_WEIGHT`, `LIMIT_WEIGHT`, `isFrequencyBody` and `yieldsTo` no longer exist.
- A unit test per level shows what it gives way to.
