# Planner search budget: measurements

Date: 2026-11-16 (second run, after review). Machine: Apple M4, macOS 26.7.1, on AC power, Low Power Mode off, run under `caffeinate -i`.
Command: `MEASURE_BUDGET=1 npx vitest run src/rule-cases/measure-budget.test.ts --silent=false` (about 29 s).

## Two different measurements

The two sets measure different things and are not one curve.

- **Rule cases: outcome need.** Smallest `maxIterations` in [50, 100, 250, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000] (plateau 3000, no time limit) at which the case passes on seeds 1-8 and still fails without its subject. "Max iterations used" is the largest `stats.iterations` over seeds 1-8 at that budget. Constraints and pairs count compiled rules (own, given, defaults), not planner built-ins. No case is marked `known`.
- **Seeded library: convergence.** Iterations until the plateau stop (best score unchanged for 3000 iterations after no hard violation), with `maxIterations: 200_000`, over seeds 1-60. This is how long the search keeps improving, not how many steps a rule needs to pass, so it is much larger. It is the set that decides the budget, because the budget must not cut a search that is still improving.

Seeded libraries: the 87 seed dishes (plus Poori, ids from 100, frequency as in `scenarios.test.ts`), default rules plus links. "Rice" is **Plain Rice** (no plain "Rice" in the seed). 3 links: Plain Rice comes with Sambar; Plain Rice comes with Papad when the curry is Sambar; Idli comes with Coconut Chutney. Smaller libraries: cut by taking an even spread of each part (base, curry, subzi, extra) in proportion, always keeping Plain Rice, Sambar, Papad, Idli and Coconut Chutney (31 dishes, not 30, because of rounding per part). Heavy links: the 3 links plus 15 more (six other bases and six curries each bring an extra, three bases bring a curry) = 18 links, 18 pairs.

## Rule cases (outcome need)

| case | dishes | constraints | pairs | need | max iterations used |
|---|---|---|---|---|---|
| pairing-always-beats-own-meals | 18 | 12 | 2 | 50 | 50 |
| pairing-usually-gives-way-to-never-auto | 18 | 12 | 2 | 50 | 50 |
| pairing-two-always-curries | 18 | 10 | 2 | 50 | 50 |
| pairing-brings-its-own-pairing | 18 | 12 | 2 | 50 | 50 |
| pairing-to-base-category | 18 | 9 | 1 | 50 | 50 |
| pairing-scoped-to-breakfast | 18 | 9 | 1 | 50 | 50 |
| served-with-ignores-its-limit | 18 | 10 | 1 | 50 | 50 |
| comes-with-either-stew | 23 | 10 | 1 | 50 | 50 |
| comes-with-respects-frequency | 21 | 10 | 1 | 50 | 50 |
| comes-with-curry-to-extra | 23 | 10 | 1 | 50 | 50 |
| comes-with-from-base-and-curry | 23 | 10 | 2 | 50 | 50 |
| comes-with-two-links | 23 | 10 | 2 | 50 | 50 |
| comes-with-usually | 23 | 10 | 1 | 50 | 50 |
| comes-with-curry-type | 23 | 10 | 1 | 50 | 50 |
| comes-with-chain | 23 | 11 | 2 | 50 | 50 |
| only-with-bases-still-limits | 18 | 10 | 0 | 50 | 50 |
| old-only-with-still-limits | 23 | 11 | 0 | 50 | 50 |
| comes-with-clash | 23 | 11 | 2 | 50 | 50 |
| brought-side-ignores-its-limit | 23 | 11 | 1 | 50 | 50 |
| brought-side-ignores-its-limit-usually | 23 | 11 | 1 | 50 | 50 |
| limit-ranks-a-links-dishes | 21 | 11 | 1 | 50 | 50 |
| brought-chain-ignores-limit | 23 | 12 | 2 | 50 | 50 |
| when-curry-brings | 18 | 10 | 1 | 50 | 50 |
| when-curry-keeps-curry-count | 18 | 11 | 2 | 50 | 50 |
| when-curry-usually | 18 | 11 | 2 | 50 | 50 |
| when-curry-two-curries | 18 | 10 | 1 | 50 | 50 |
| when-curry-and-subzi | 18 | 12 | 2 | 50 | 50 |
| when-curry-chain | 18 | 10 | 2 | 50 | 50 |
| when-curry-subzi | 18 | 10 | 1 | 50 | 50 |
| when-curry-scope | 18 | 11 | 2 | 50 | 50 |
| when-curry-beats-plain-subzi | 18 | 12 | 2 | 50 | 50 |
| when-curry-ignores-limit | 18 | 12 | 2 | 50 | 50 |
| when-curry-ranks-two-extras | 19 | 12 | 2 | 50 | 50 |
| when-curry-extras-cap-full | 18 | 14 | 4 | 50 | 50 |
| when-curry-locked-curry | 18 | 10 | 1 | 50 | 50 |
| when-curry-locked-other-curry | 18 | 10 | 1 | 50 | 50 |
| when-curry-lock-nudge | 18 | 11 | 1 | 50 | 50 |
| when-curry-blind-link-pick | 18 | 12 | 2 | 50 | 50 |
| when-curry-retried-after-polish | 18 | 13 | 2 | 50 | 50 |
| meals-lunch-only-dish | 18 | 10 | 0 | 50 | 50 |
| meals-never-auto-dish | 18 | 10 | 0 | 50 | 50 |
| variety-no-base-on-consecutive-days | 18 | 8 | 0 | 1000 | 1000 |
| lock-beats-pairing | 18 | 9 | 1 | 50 | 50 |
| lock-picks-never-auto-dish | 18 | 9 | 0 | 50 | 50 |
| extras-cap-per-meal | 18 | 9 | 0 | 50 | 50 |

44 of 45 cases need 50 iterations or fewer (50 is the bottom of the list, so the real need is lower); variety-no-base-on-consecutive-days needs 1000. Dishes 18-23, pairs 0-4. No case needs more than 1000, so for the cases the need does not grow with dishes or pairs in this range.

## Seeded library (convergence), 3 links, by library size

| dishes | links | constraints | pairs | seeds | mean it | p95 it | max it | stop | ms per iteration |
|---|---|---|---|---|---|---|---|---|---|
| 31 | 3 | 11 | 3 | 60 | 11302 | 19469 | 20217 | plateau | 0.0053 |
| 45 | 3 | 11 | 3 | 60 | 13748 | 21074 | 27445 | plateau | 0.0052 |
| 60 | 3 | 11 | 3 | 60 | 14637 | 23511 | 27544 | plateau | 0.0053 |
| 87 | 3 | 11 | 3 | 60 | 13961 | 23935 | 25901 | plateau | 0.0055 |

## Seeded library, 87 dishes, 18 links

| dishes | links | constraints | pairs | seeds | mean it | p95 it | max it | stop | ms per iteration |
|---|---|---|---|---|---|---|---|---|---|
| 87 | 18 | 26 | 18 | 60 | 14198 | 26115 | 29808 | plateau | 0.0066 |

## Reading the numbers

- Convergence does not grow linearly with dishes. Max iterations: 20 217 (31 dishes), 27 445 (45), 27 544 (60), 25 901 (87). It rises from 31 to 45 dishes, then is flat; seed spread (mean 11-15k, p95 19-24k, max 20-27k) is larger than the trend. Heavier links raise it a little (max 29 808 at 18 pairs vs 25 901 at 3).
- So the formula is mostly a base amount covering convergence, with small terms for dishes and pairs. The data supports "about 30 000 at the worst measured point", not a steep slope.
- Cost per iteration: 0.0052-0.0055 ms with 3 links, 0.0066 ms with 18 links (about 20% more, 6 times the pairs).

## Chosen formula

`searchBudget = clamp(BASE + PER_DISH * dishes + PER_PAIR * pairs, MIN, MAX)` with
BASE = 36000, PER_DISH = 150, PER_PAIR = 400, MIN = 36000 (equal to BASE, so the floor never binds), MAX = 200000. Plateau stays 3000.

Margin (budget / worst measured iterations over 60 seeds, 1.5x required):

| set | dishes, pairs | budget | max it | ratio |
|---|---|---|---|---|
| seeded, cut | 31, 3 | 41 850 | 20 217 | 2.07x |
| seeded, cut | 45, 3 | 43 950 | 27 445 | 1.60x |
| seeded, cut | 60, 3 | 46 200 | 27 544 | 1.68x |
| seeded, full | 87, 3 | 50 250 | 25 901 | 1.94x |
| seeded, full, heavy links | 87, 18 | 56 250 | 29 808 | 1.89x |
| rule cases (worst: 18 dishes, 0 pairs) | 18, 0 | 38 700 (floor 36 000 never binds) | 1000 | 38x |

The 45-dish set is the tightest margin (1.60x), still above the 1.5x required.

The rule cases now run at about 39 000 instead of today's fixed 20 000. The plateau stops most searches long before the cap, so the cases cost little more, but a case that today passes only because its search ends at 20 000 would now see more search; Task 3 must confirm `npm run rule-cases` outcomes are unchanged.

## Projected Generate time (seeded library)

Typical: the plateau stop comes at 10-30k iterations, at about 0.0055 ms each, so about 55-165 ms. Worst case the cap is hit: 87 dishes, 18 links gives 56 250 x 0.0066 ms = about 0.37 s; 87 dishes, 3 links gives 50 250 x 0.0055 = about 0.28 s. Both are under the ~1 s target, with about 2.7x headroom on the heavy case. Headroom: per-iteration cost would have to reach about 0.018 ms (nearly 3x the 18-link cost) before the capped search passes 1 s. Libraries much larger than 87 dishes or with far more than 18 links were not measured.

## Measured Generate time (default budget)

`planWeek` with no explicit budget, seeded library (87 dishes plus Poori), 3 links, seeds 1-8, same machine, under `caffeinate -i`. All eight stopped on the plateau (10 092 to 25 901 iterations). Median 91 ms, max 118 ms (seed 6, 25 901 iterations). Far under the 1 s target. Test: `generate time at the default budget` in `src/rule-cases/measure-budget.test.ts`.
