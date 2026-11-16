# Planner Repair Loop

Third of four planner generalisation projects (search budget, rule levels, repair loop, user-defined meal parts).

## Why

After the random search, `solve` (`src/planner/solver.ts`) runs a chain of one-off passes, each added for one situation:
final descent (bounded by `DESCENT_PASSES`), re-pick of a link's dish, sweep of conditional sides that break a hard rule,
polish (drop sides whose removal improves the score), and retry of refused conditional sides. 16 of the 65 commits on
`feat/comes-with-when` were planner fixes, most adding or adjusting such a pass. Each new kind of link is likely to need
another. Several passes also name the curry and subzi roles directly, which blocks user-defined meal parts.

## What the user decided

- (Agreed with the proposal) The passes become one repair loop. Nothing changes for the user.

## Goals

- One repair phase after the search: a fixed list of move kinds (change a free dish, re-pick a link's dish, drop a side,
  bring a refused side again), tried meal by meal until a full round keeps nothing, bounded by a round limit.
- A change is kept only if it strictly improves the score (hard first, then soft), as the passes do today.
- Move kinds are written over parts generically (any part a dish can fill), with no curry or subzi names, ready for
  user-defined parts.
- Deterministic: meals in order, moves in a fixed order, candidates in library order.

## Non-goals

- Changing the random search (construct and late acceptance).
- New behaviour. Every rule case passes unchanged.

## Anti-goals

- A repair phase without a bound, or one bounded by the time limit (CLAUDE.md: bounds are deliberate; the final descent is
  bounded by passes, not time).
- Slower generation: the seeded library must not get slower than today by more than 10% (my call).

## Constraints

- A bound changed needs a test for both sides of it (CLAUDE.md). The round limit replaces `DESCENT_PASSES` and gets those
  tests.
- Depends on the search budget project (rule cases run at the shared budget).

## Settled after the builder check (my calls)

- **A round** runs the move kinds in a fixed order, each over all meals in order: the shape of today's passes, so results
  stay closest to today. Rounds repeat until one keeps nothing or the round limit is reached.
- **Round limit:** 10 by default (today's `DESCENT_PASSES`). Changed only for a measured need, with tests on both sides.
- **If no order passes every case:** a move kind may be split or given a precondition. If a pass still cannot join the
  loop, it stays a separate step after it, with the reason written beside it. This is a consolidation, not a redesign.
- **Exact-plan tests** (`solver.test.ts`, `scenarios.test.ts`) may be updated where only the chosen week changes and
  every rule case still holds; each update is listed in the PR with why.
- **Pins and locks keep today's meaning:** `isFree`, unit members, and the pull toward a locked side's curry
  (`lockNudge`) behave as now.
- **Parts:** the move kinds read the list of parts from one place. Until the meal-parts project lands, that list is the
  fixed base, curry, subzi, extras.
- **Speed check:** seeded library, seeds 1–8, at the search budget from the first project (step-based, so no time noise),
  median of 5 runs, against the branch just before this change. More than 10% slower fails.

## Left to the builder

- Order of move kinds within a round, as long as every case passes and the result is deterministic.
- Whether the conditional-side blindness of the search stays as is (it may; this project is about the passes after it).

## Acceptance

- All tests, typecheck, lint and rule cases pass, case expectations unchanged.
- The re-pick, sweep, polish, retry and final-descent passes are gone from `solver.ts`; one repair function replaces them.
- Generation time measured before and after on the seeded library, recorded in the PR.
