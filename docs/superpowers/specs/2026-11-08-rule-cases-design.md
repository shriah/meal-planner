# Rule Case Library — Design

**Status:** agreed in conversation 2026-11-08.

## Why

Changes to the rules or the planner keep breaking behaviour that worked before. For example:
- a base with an Always pairing stopped being planned;
- meals were lost after saving;
- a Usually pairing kept its base out of the plan.

Each fix added tests, but they are spread across many files and written as planner internals. There is no
one place that says, in plain words, "this situation must produce this week". The rule case library is that
place:
- a catalogue of situations, written in code, each with its dishes, its rules and the outcome it must
  produce;
- it runs on every test run, so a change that breaks an old situation fails straight away;
- a standalone report page shows the catalogue and the last run's results, so the cases also document the
  edge cases.

## Goals

- One case per situation: a name, a group, why it exists, the dishes and rules it uses, and its expectations.
  Each expectation is a plain sentence with a check behind it.
- Every case runs inside the normal test run (`npm test`). A broken case fails the run like any other test.
- One command writes a standalone report page from the latest run, with no server and nothing to click Run
  on.
- The cases use their own test dishes, never the app's seed library or the user's data, so a result can only
  change because the rules or the planner changed.
- Seeded with the situations this project has already fixed.

## Non-goals

- The report is not part of the food planner app. There is no route, no navigation entry, and no import from
  app UI code.
- The report runs nothing. It shows what the last run found.
- No editing of cases from the report, and no running cases against the user's own library.
- Not a replacement for the existing unit tests. Those keep testing internals; cases test outcomes.

## Anti-goals (a failure even if it works)

- Cases that pass or fail depending on timing or machine load. Every case uses fixed seeds and an iteration
  budget, never wall-clock time.
- Cases written against planner internals (constraint ids, matcher shapes) instead of the stored rules a user
  would have. Such cases document nothing a person would recognise.
- A report that drifts from the tests: the report must be produced from the same run, never from a separate
  copy of the cases.

## What a case is

A case is a TypeScript object:

| Field | Meaning |
|---|---|
| `id` | A stable slug, e.g. `pairing-always-beats-own-meals`. |
| `group` | One of: Pairings, Days and meals, Variety, Locks and picks, Extras, Saving dishes. Builders may add groups. |
| `name` | A short title in plain words. |
| `why` | One or two sentences on what the case protects, naming the bug it guards against if there is one. |
| `dishes` | Optional extra dishes for this case only, on top of the shared test library. |
| `rules` | The rules, built the way the app stores them: owned links through `linkRule`, days, meals and never-auto through the owned-rule builders, hand-written rules as `RuleRecord` specs. The default rules (`defaultRules()`) are included unless the case says `defaults: false`. |
| `pins` | Optional locked meals, as the plan page sends them. |
| `weeks` | Fixed at 8: seeds 1–8, one planned week each. |
| `expect` | A list of expectations (below). |

**Expectations.** Each expectation has:
- a sentence, e.g. "Every Pongal meal has Sambar and Coconut Chutney";
- a check over the 8 planned weeks, returning pass or fail and the observed value, e.g. "8 of 8".

A small set of helpers covers the common shapes:
- a dish is planned at least, at most or between N times;
- every meal with X also has Y;
- X never appears at a given meal or on a given day;
- no hard rule is broken;
- a locked meal keeps its dishes;
- a dish appears near its no-rules count, within 1.5× of a run of the same case without its rules.

A case may also write its own check.

Settled after the builder check (my calls):
- **"No hard rule is broken"** means no entry with `level: 'hard'` in the `justifications` that `planWeek`
  returns.
- **"Near its no-rules count":**
  - The baseline is the same case run with its own rules removed and the default rules kept, totalled over
    the same 8 weeks.
  - The case passes when its total lies within `[baseline / 1.5, baseline × 1.5]`.
  - When the baseline is under 4, the case passes at 4 or more instead, so a tiny baseline can't make the
    check vacuous or flaky.
- **Pins** use the planner's own `Pins` type (`src/planner/types.ts`). No app UI code is imported.

**Saving-dish cases.** Some fixed bugs, such as "meals lost after saving", are about the dish form, not the
planner. They live in the form's starting state, so calling `saveComponent` directly would not exercise them.
These cases:
1. seed a fresh fake-indexeddb;
2. render the real `ComponentForm` under `LibraryLookupProvider`, in the existing happy-dom test environment;
3. make the case's edits (possibly none) and save;
4. compare the stored rules before and after.

The report shows their before/after rules instead of a week. (My call.)

## The shared test library

- One fixed library of about 18 dishes with familiar names:
  - bases: Pongal, Idli, Dosa, Upma, Rice, Roti, Chapati;
  - curries: Sambar, Rasam, Dal, Chole;
  - subzis: Beans Poriyal, Aloo Gobi;
  - extras: Coconut Chutney, Papad, Curd, Pickle.
- Categories (my call):
  - base categories: Rice-based (Pongal, Rice), Tiffin (Idli, Dosa, Upma), Breads (Roti, Chapati);
  - extra categories: Condiments (Coconut Chutney, Pickle), Crunchy (Papad), Dairy (Curd).
- No dish has its own days, meals or never-auto rules in the library itself. A case adds those as rules.
- Category ids and dish ids are fixed, so cases and the report stay stable.
- A case may add dishes of its own, with ids in a reserved range.
- The test library never changes to make a case pass. Changing it is a deliberate edit, and every case is
  re-checked.

## Running

- Each case runs through the real rule pipeline:
  1. `compileRules` over the case's `RuleRecord`s;
  2. `planWeek` with fixed seeds and an iteration budget;
  3. the expectations evaluated on the resulting weeks.
- Cases live in `src/rule-cases/` and run from one Vitest file there, one test per case, so `npm test`
  covers them.
- `npm run rule-cases` runs that file with `RULE_CASES_REPORT=1`.
  - The file collects every case's result.
  - When the flag is set, it writes the report in `afterAll` to `rule-cases-report.html` at the repo root.
    That file is git-ignored.
  - The command still exits with a failure when a case fails, after writing the report.
- File-system code lives only in that test file, so nothing the app builds can reach it.

## The report (layout B, as mocked up)

- **One self-contained HTML file:** inline CSS, no external scripts, opens from disk.
- **Header:** run time, and pass and fail counts.
- **Left column:**
  - cases grouped by `group`, each with a pass or fail mark;
  - a filter box and a "Failing only" switch, in plain inline JavaScript;
  - an entry for the shared dishes library, which lists every test dish with its type and category.
- **Right column, for the selected case:**
  - name and pass/fail;
  - why;
  - the dishes it uses;
  - its rules as sentences (using the app's own `describeSpec` / `describeLink` wording), with the defaults
    noted;
  - each expectation with a pass/fail mark and the observed value;
  - a sample week (seed 1) as a 7×3 grid, with the meals the expectations look at highlighted;
  - for saving-dish cases, before/after rules instead of a week.
- A failing case is open by default.

## Seed cases (the first set)

1. Always pairing beats the side's own meals: Pongal with Sambar and Coconut Chutney, Sambar lunch-only and
   never-auto.
2. Usually pairing gives way to never-auto: Pongal is still planned near its no-rules count.
3. Two Always curries for one base: the older rule wins, the base is still planned, and there are no hard
   problems.
4. A lock beats a pairing: a locked different curry is kept.
5. Pairing to a base category: every base in the category holds the side.
6. Pairing scoped to breakfast.
7. Lunch-only dish never at breakfast or dinner.
8. Never-auto dish is never planned unless locked.
9. No dish on the same or next day (variety default), soft: it holds when the library allows.
10. Extras cap per meal.
11. Meals and days survive a save with no edits (the "lost after saving" bug).
12. A stored conflict does not block saving an unrelated edit.

## A case that fails on today's code (decided: known failure)

If a seed case fails on the current code, it reveals an existing bug. Fixing the planner is out of scope for
this work.

- The case is kept, with `known: '<one line on what is wrong>'`.
- A known failure:
  - runs like any other case;
  - does not fail `npm test`;
  - shows in the report as "Known issue", with what was seen, in its own colour.
- If a known failure starts passing, the run does fail, with the message "Known issue now passes: remove
  `known` from <id>". That keeps the list honest.
- The builder lists every known failure at the end of the work, so they can be fixed separately.

## Left to the builder

- Exact helper names and the case file layout inside `src/rule-cases/`.
- The iteration budget per week, as long as every case is deterministic and the whole set finishes in a few
  seconds.
- Report styling within the mockup.
