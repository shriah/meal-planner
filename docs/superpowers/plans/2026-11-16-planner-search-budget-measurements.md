# Planner search budget: measurements

Date: 2026-11-16. Machine: Apple M4, macOS 26.7.1, on AC power, Low Power Mode off, run under `caffeinate -i`.
Command: `MEASURE_BUDGET=1 npx vitest run src/rule-cases/measure-budget.test.ts --silent=false`.

Method. **Need** = smallest `maxIterations` in [500, 1000, 2000, 4000, 8000, 16000, 32000, 64000] (plateau 3000, no time limit) at which the case passes on seeds 1-8 and still fails without its subject. 500 is the bottom of the list, so "500" means "500 or fewer". "Max iterations used" = the largest `stats.iterations` over seeds 1-8 at that budget (equal to the budget when the cap, not the plateau, ended the search). Constraints and pairs count the compiled rules (own, given and defaults), not the planner's built-ins. Cases with a `known` field are skipped; none are currently marked known.

Seeded library: 87 dishes (seed components plus Poori, ids from 100, frequency as in `scenarios.test.ts`), default rules plus three links. Substitution: "Rice" is **Plain Rice** (the seed has no plain "Rice"). Links: Plain Rice comes with Sambar (curry); Plain Rice comes with Papad when the curry is Sambar; Idli comes with Coconut Chutney. Seeds 1-8 at `maxIterations: 200_000`, plateau 3000.

## Rule cases

| case | dishes | constraints | pairs | need | max iterations used |
|---|---|---|---|---|---|
| pairing-always-beats-own-meals | 18 | 12 | 2 | 500 | 500 |
| pairing-usually-gives-way-to-never-auto | 18 | 12 | 2 | 500 | 500 |
| pairing-two-always-curries | 18 | 10 | 2 | 500 | 500 |
| pairing-brings-its-own-pairing | 18 | 12 | 2 | 500 | 500 |
| pairing-to-base-category | 18 | 9 | 1 | 500 | 500 |
| pairing-scoped-to-breakfast | 18 | 9 | 1 | 500 | 500 |
| served-with-ignores-its-limit | 18 | 10 | 1 | 500 | 500 |
| comes-with-either-stew | 23 | 10 | 1 | 500 | 500 |
| comes-with-respects-frequency | 21 | 10 | 1 | 500 | 500 |
| comes-with-curry-to-extra | 23 | 10 | 1 | 500 | 500 |
| comes-with-from-base-and-curry | 23 | 10 | 2 | 500 | 500 |
| comes-with-two-links | 23 | 10 | 2 | 500 | 500 |
| comes-with-usually | 23 | 10 | 1 | 500 | 500 |
| comes-with-curry-type | 23 | 10 | 1 | 500 | 500 |
| comes-with-chain | 23 | 11 | 2 | 500 | 500 |
| only-with-bases-still-limits | 18 | 10 | 0 | 500 | 500 |
| old-only-with-still-limits | 23 | 11 | 0 | 500 | 500 |
| comes-with-clash | 23 | 11 | 2 | 500 | 500 |
| brought-side-ignores-its-limit | 23 | 11 | 1 | 500 | 500 |
| brought-side-ignores-its-limit-usually | 23 | 11 | 1 | 500 | 500 |
| limit-ranks-a-links-dishes | 21 | 11 | 1 | 500 | 500 |
| brought-chain-ignores-limit | 23 | 12 | 2 | 500 | 500 |
| when-curry-brings | 18 | 10 | 1 | 500 | 500 |
| when-curry-keeps-curry-count | 18 | 11 | 2 | 500 | 500 |
| when-curry-usually | 18 | 11 | 2 | 500 | 500 |
| when-curry-two-curries | 18 | 10 | 1 | 500 | 500 |
| when-curry-and-subzi | 18 | 12 | 2 | 500 | 500 |
| when-curry-chain | 18 | 10 | 2 | 500 | 500 |
| when-curry-subzi | 18 | 10 | 1 | 500 | 500 |
| when-curry-scope | 18 | 11 | 2 | 500 | 500 |
| when-curry-beats-plain-subzi | 18 | 12 | 2 | 500 | 500 |
| when-curry-ignores-limit | 18 | 12 | 2 | 500 | 500 |
| when-curry-ranks-two-extras | 19 | 12 | 2 | 500 | 500 |
| when-curry-extras-cap-full | 18 | 14 | 4 | 500 | 500 |
| when-curry-locked-curry | 18 | 10 | 1 | 500 | 500 |
| when-curry-locked-other-curry | 18 | 10 | 1 | 500 | 500 |
| when-curry-lock-nudge | 18 | 11 | 1 | 500 | 500 |
| when-curry-blind-link-pick | 18 | 12 | 2 | 500 | 500 |
| when-curry-retried-after-polish | 18 | 13 | 2 | 500 | 500 |
| meals-lunch-only-dish | 18 | 10 | 0 | 500 | 500 |
| meals-never-auto-dish | 18 | 10 | 0 | 500 | 500 |
| variety-no-base-on-consecutive-days | 18 | 8 | 0 | 1000 | 1000 |
| lock-beats-pairing | 18 | 9 | 1 | 500 | 500 |
| lock-picks-never-auto-dish | 18 | 9 | 0 | 500 | 500 |
| extras-cap-per-meal | 18 | 9 | 0 | 500 | 500 |
## Seeded library

Library: 87 dishes, 11 constraints, 3 pairs, 0 issues

| seed | iterations | stop | total ms | ms per iteration |
|---|---|---|---|---|
| 1 | 10092 | plateau | 63 | 0.0063 |
| 2 | 15311 | plateau | 83 | 0.0054 |
| 3 | 15874 | plateau | 87 | 0.0055 |
| 4 | 18111 | plateau | 93 | 0.0051 |
| 5 | 12267 | plateau | 71 | 0.0058 |
| 6 | 25901 | plateau | 121 | 0.0047 |
| 7 | 17320 | plateau | 92 | 0.0053 |
| 8 | 18144 | plateau | 96 | 0.0053 |
## Reading the numbers

- Every rule case needs at most 1000 iterations (all but one need 500 or fewer) with 18-23 dishes and 0-4 pairs. No case failed to pass.
- The seeded library is stopped by the plateau, not the cap: 10 092 to 25 901 iterations (max 25 901, seed 6), 0.0047-0.0063 ms per iteration, 63-121 ms total. Today's 300 ms limit is never reached on this machine, but would be on a throttled one.
- So the needs are 1000 at 18-23 dishes and about 26 000 at 87 dishes: roughly linear in dishes. Pairs show no measurable effect on the rule cases (their needs sit at the floor), so PER_PAIR is a precaution, not a fit.

## Chosen formula

`searchBudget = clamp(BASE + PER_DISH * dishes + PER_PAIR * pairs, MIN, MAX)` with
BASE = 10000, PER_DISH = 400, PER_PAIR = 500, MIN = 10000, MAX = 200000. Plateau stays 3000.

Margin check (budget / need, 1.5x required):

| set | dishes, pairs | budget | need | ratio |
|---|---|---|---|---|
| rule cases, smallest (18 dishes, 0-1 pairs) | 18, 1 | 17 700 | 1000 (worst case) | 17.7x |
| rule cases, largest (23 dishes, 2 pairs) | 23, 2 | 20 200 | 1000 (worst case) | 20.2x |
| rule cases, 18 dishes 4 pairs | 18, 4 | 19 200 | 1000 | 19.2x |
| seeded library | 87, 3 | 46 300 | 25 901 | 1.79x |

The rule-case budgets (17 700 to 20 200) are close to today's fixed 20 000, so case outcomes should not change. The seeded library gets 1.79x its largest measured need.

## Projected Generate time (seeded library)

Worst case the cap is hit: 46 300 iterations x 0.0063 ms (slowest measured) = about 0.29 s; typical run stops on the plateau at 63-121 ms. Both are under the ~1 s target, so no trade-off needs the user's decision.
