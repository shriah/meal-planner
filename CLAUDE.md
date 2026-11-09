@AGENTS.md

## What this is

A personal weekly Indian meal planner. Local-first: all data lives in the browser (Dexie / IndexedDB); the only server
route is `src/app/api/export-plan`. Read `docs/architecture.md` before changing the planner, rules or the database.

- `src/planner` — constraint planner: rules score a whole week, a seeded search (`rng.ts`) looks for the best plan.
  Score is lexicographic: any hard violation outweighs every soft cost.
- `src/rules` — rules are data (templates compiled to constraints), not code paths in the generator.
- `src/db` — Dexie schema, versioned upgrades, seed library.
- `src/services` — DB access and plan generation (runs in a worker). `src/stores` — Zustand plan store.
- `src/assistant` — Gemini-backed rules assistant; its tools only validate and return drafts, never write.
- `src/rule-cases` — rule-engine case library and HTML report (rule engine only, no UI cases).

## Vocabulary

- A **meal** is a **base** plus optional **curry**, **subzi** and **extras**. "Dish" = any component.
- **Served with**: a link a dish owns that adds it whenever one of its bases is the meal's base. This is how a side is added to a base.
- **Owned rule**: a rule belonging to a dish, edited on that dish's form, not listed on the Rules page.
- **Strength** words come only from `STRENGTH_WORDS` in `src/rules/levels.ts`: Always (`must`), Usually, Often, Sometimes.
  Prefer/avoid weights use `LEVELS`: Slightly, Moderately, Strongly. Don't invent other wording.
- **Default rules** (`src/rules/defaults.ts`) sit below the user's own rules; "gives way" means a softer rule yields to a firmer one.

## Commands

- `npm test` — all tests. One file: `npx vitest run src/path/file.test.ts`.
- `npx tsc --noEmit` — typecheck (no npm script for it).
- `npm run lint`
- `npm run rule-cases` — runs the rule case library and writes `rule-cases-report.html`.

Work is done when tests, typecheck and lint all pass. Planner or rule changes must also pass `npm run rule-cases`.

## Planner and rule cases

- **Every edge case found in the rules or the planner becomes a rule case.** When debugging one, add a case to
  `src/rule-cases/cases/` (the matching group file) that reproduces it from stored-style rules, see it fail, then fix.
  Its `why` names the bug. If the shared test library (`src/rule-cases/library.ts`) lacks a dish the situation needs, add
  it there when other cases could use it (and update the dish count in `run.test.ts`), or as a case-only dish (`dishes`,
  ids from 900). Planner-internal unit tests may
  be added too, but they do not replace the case.
- Every rule case must fail without its subject (its `rules`, `pins` and `without` defaults); supporting rules go in
  `given`. `rule-cases.test.ts` enforces this.
- Keep the planner deterministic for a given seed; tests rely on it.
- Bounds on the search are deliberate (e.g. the final descent pass is bounded by `DESCENT_PASSES`, not the time limit).
  Don't change a bound without a test for both sides of it.

## Forms over stored data

- **Never save what the user did not change.** A form that edits stored rules writes only the fields that differ from what
  it showed when it opened (a baseline such as `linksBase` or `settingsBase` in `ComponentForm`). A save with no edits writes
  nothing. A wrong starting value must not be able to delete stored data.
- **Prefer "edited value ?? stored value" over copying loaded data into state.** Keep the edit as `null` until the user
  touches it and read the stored value live otherwise (as `links` and `served` do). Copy into state only when unavoidable,
  and then from the data as it is on the first render, not from an empty placeholder.
- **Test both load orders.** For any form or view that reads the shared library lookup, cover opening it before the data has
  loaded and after (render it under `LibraryLookupProvider` only once `useLibraryLookup().loaded` is true, as the library page
  does). Test that a save with no edits leaves stored rules unchanged.
- **Database upgrades are additive and tested.** Each Dexie version gets a test in `src/db/rule-migration.test.ts` that opens
  the previous version with realistic rows and checks the result.

## Planning docs

- `docs/superpowers/specs` and `docs/superpowers/plans` — current design and implementation plans (dated). Write new ones here.
- `.planning/` — GSD milestone roadmap and phases (v1.4: meal composition, login, plan sharing).
- Login and sharing will end the "single device, local only" assumption; revisit the data-ownership rules here when they land.

## Commits

`type(scope): what now happens, in plain English` — e.g. `fix(planner): a replaced dish takes the sides it brought with it`.
Types: `feat`, `fix`, `test`, `refactor`, `docs`. Scopes: `planner`, `rules`, `links`, `library`, `plan`, `picker`,
`assistant`, `rule-cases`, `db`.
