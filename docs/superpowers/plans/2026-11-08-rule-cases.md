# Rule Case Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a catalogue of rule situations, written in code, each with its own test dishes, rules and
expected outcome. The catalogue runs in `npm test`, and one command writes a standalone HTML report from the
latest run.

**Architecture:** `src/rule-cases/` holds:
- the case types;
- a fixed test library of dishes;
- the expectation helpers;
- a runner, which turns a case into stored-style rules, compiles them with `compileRules`, plans 8 weeks with
  `planWeek` and evaluates the expectations;
- a pure HTML renderer;
- the cases themselves.

One Vitest file runs every case as its own test. When `RULE_CASES_REPORT=1`, it writes the report in
`afterAll`.

**Tech Stack:** TypeScript, Vitest (node environment).

**Spec:** `docs/superpowers/specs/2026-11-08-rule-cases-design.md`

## Global Constraints

- **Each case's fields:** `id` (a stable slug), `group`, `name`, `why`, optional extra `dishes`, `rules`,
  optional `defaults: false`, optional `pins`, `expect`, and optional `known: '<what is wrong>'`.
- **Groups:** Pairings, Days and meals, Variety, Locks and picks, Extras.
- **Scope:** the rule engine and planner only. No UI is rendered or imported.
- **Weeks:** 8 per case, on seeds 1–8. Every case has a fixed iteration budget (`timeLimitMs: Infinity`) and
  never depends on wall-clock time.
- **Rules are built the way the app stores them:**
  - owned links through `linkRule`;
  - days, meals and never-auto through `dayRule`, `mealRule` and `exclusionRule`;
  - hand-written rules as `RuleRecord` specs.
  - `defaultRules()` is included unless `defaults: false`.
  - Everything is compiled through `compileRules`. Cases never build planner constraints directly.
- **"No hard rule is broken"** means no `justifications` entry from `planWeek` has `level === 'hard'`.
- **"Near its no-rules count":**
  - the baseline is the same case with its own rules removed and the defaults kept, totalled over the same 8
    weeks;
  - the case passes when its total is within `[baseline / 1.5, baseline × 1.5]`;
  - when the baseline is under 4, the case passes at 4 or more instead.
- **Pins** use the planner's `Pins` type.
- **The test library:** about 18 dishes with fixed ids and familiar names.
  - Base categories: Rice-based (Pongal, Rice), Tiffin (Idli, Dosa, Upma), Breads (Roti, Chapati).
  - Curries: Sambar, Rasam, Dal, Chole. Subzis: Beans Poriyal, Aloo Gobi.
  - Extra categories: Condiments (Coconut Chutney, Pickle), Crunchy (Papad), Dairy (Curd).
  - The library holds no days, meals or never-auto rules. Case dishes use ids from 900 up.
- **Known failure:**
  - it runs like any case, does not fail the run, and shows as "Known issue" in its own colour;
  - if it starts passing, the run fails with `Known issue now passes: remove \`known\` from <id>`.
- **Report:**
  - written to `rule-cases-report.html` at the repo root, and git-ignored;
  - one self-contained file: inline CSS and inline plain JavaScript, no external requests;
  - `npm run rule-cases` sets `RULE_CASES_REPORT=1` and still exits non-zero when a case fails.
- **Separation:** the report renderer and the case library import nothing from app UI code. File-system
  code lives only in the Vitest file.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Verification for every task: `npx tsc --noEmit -p .`, `npx eslint src`, `npx vitest run`. All clean.

## Review Focus

1. **Flakiness.** A case that passes on one run and fails on the next. Run the cases file 3 times in Task 3
   and compare the observed values.
2. **A case that passes for the wrong reason.** For example, Pongal is never planned, so "every Pongal meal
   has Sambar" holds vacuously. Every-meal expectations must report the number of meals checked, and fail
   when it is 0.
3. **The report renderer and dish or rule text.** Names with `<`, `&` or quotes must be escaped. Tested in
   Task 3.
4. **A known failure that silently passes.** Tested in Task 1.
5. **The whole case set's run time.** It must stay a few seconds inside `npm test`. Measured in Task 3.

---

### Task 1: Case model, test library, expectations and runner

**Files:**
- Create:
  - `src/rule-cases/types.ts`
  - `src/rule-cases/library.ts`
  - `src/rule-cases/expect.ts`
  - `src/rule-cases/run.ts`
  - `src/rule-cases/cases/index.ts`
  - `src/rule-cases/cases/pairings.ts` (case 1 only)
  - `src/rule-cases/rule-cases.test.ts`
- Test: `src/rule-cases/run.test.ts`

**Interfaces:**
- Produces:
  - `type CaseGroup = 'Pairings' | 'Days and meals' | 'Variety' | 'Locks and picks' | 'Extras'`.
  - `interface CaseLibrary { dishes: ComponentRecord[]; categories: CategoryRecord[]; dish(name: string): ComponentRecord; category(name: string): CategoryRecord }`.
  - `const TEST_LIBRARY: CaseLibrary`.
  - `type CaseRule = Omit<RuleRecord, 'id' | 'enabled' | 'created_at'>`. `OwnedRule` is assignable to it.
  - `interface CaseWeeks { weeks: PlanSlotLike[][]; hard: Justification[][]; lib: CaseLibrary }`.
  - `interface Outcome { pass: boolean; got: string }`.
  - `interface PlanExpectation { says: string; check(w: CaseWeeks, ctx: { baseline(): CaseWeeks }): Outcome; highlights?(slot: PlanSlotLike): boolean }`.
  - `interface PlanCase { kind: 'plan'; id: string; group: CaseGroup; name: string; why: string; dishes?: ComponentRecord[]; rules(lib: CaseLibrary): CaseRule[]; defaults?: false; pins?: Pins; expect: PlanExpectation[]; known?: string }`.
  - `type RuleCase = PlanCase`.
  - `type CaseStatus = 'pass' | 'fail' | 'known' | 'known-now-passes'`.
  - `interface CaseResult { id; group; name; why; kind: 'plan'; status: CaseStatus; known?: string; dishes: { name: string; type: ComponentType }[]; rules: string[]; expectations: { says: string; pass: boolean; got: string }[]; sampleWeek?: { slot: PlanSlotLike; text: string; highlight: boolean }[] }`.
  - `runPlanCase(c: PlanCase): CaseResult`. It plans seeds 1–8 with
    `{ timeLimitMs: Infinity, maxIterations: 20_000, plateauIterations: 3000 }`.
    - `rules` holds the case's own rules as sentences, using `describeSpec` with names from the library.
    - `dishes` holds the dishes its rules reference (`specReferences`) plus any `dishes` the case adds.
    - `sampleWeek` is seed 1. A meal is highlighted when any expectation's `highlights` returns true.
  - Expectation helpers in `expect.ts`, each returning a `PlanExpectation`. The sentence is generated:
    - `plannedAtLeast(dish: string, n: number)`;
    - `plannedBetween(dish, min, max)`;
    - `everyMealWith(dish: string, alsoHas: string[])`. Its `got` is "k of m"; it fails when m is 0, and it
      highlights those meals;
    - `neverAt(dish, { meals?, days? })`;
    - `noHardProblems()`;
    - `lockedMealKept(key: \`${Day}-${Meal}\`, part: 'curry' | 'subzi' | 'base', dish: string)`;
    - `nearNoRulesCount(dish)`.
  - `statusOf(allPass: boolean, known?: string): CaseStatus`:
    - `known` and all passing gives `'known-now-passes'`;
    - `known` and not all passing gives `'known'`;
    - otherwise `'pass'` or `'fail'`.

- [ ] **Step 1: Write the failing tests** in `run.test.ts`:
  - `TEST_LIBRARY` has 18 dishes, with unique ids under 900. `dish('Pongal').componentType === 'base'` and
    its category is Rice-based.
  - `everyMealWith` over a hand-built `CaseWeeks` with no Pongal meal returns
    `{ pass: false, got: '0 of 0' }`.
  - `statusOf(true, 'x') === 'known-now-passes'`, `statusOf(false, 'x') === 'known'`,
    `statusOf(false) === 'fail'`.
  - `nearNoRulesCount('Pongal')`:
    - with a baseline of 8 and a case total of 6, it passes;
    - at 13 it fails;
    - with a baseline of 2 and a total of 4, it passes.
  - `runPlanCase` on a case with `rules: () => []` and `expect: [noHardProblems()]` returns status `'pass'`
    and 21 sample meals.

- [ ] **Step 2: Run** `npx vitest run src/rule-cases/run.test.ts`. Expected: FAIL (modules missing).

- [ ] **Step 3: Implement.**
  - Build library dishes as `ComponentRecord`s with `dietary_tags: ['veg']`, empty regional and occasion
    tags, and `frequency: 'normal'`.
  - The baseline runs once per case, lazily and memoised.
  - Write case 1, "Always pairing beats the side's own meals" (spec seed list), in `cases/pairings.ts`. It is
    exported through `cases/index.ts` as `ALL_CASES: RuleCase[]`.
  - `rule-cases.test.ts` runs `it(c.name, ...)` for each case. A test fails when the status is `'fail'` or `'known-now-passes'`, with a
    message listing the failed expectations, or the "Known issue now passes" message.

- [ ] **Step 4: Run** `npx vitest run src/rule-cases`. Expected: PASS.

- [ ] **Step 5: Commit:** `feat(rule-cases): case model, test library, expectations and runner`

### Task 2: The report

**Files:**
- Create: `src/rule-cases/report.ts`
- Test: `src/rule-cases/report.test.ts`
- Modify:
  - `src/rule-cases/rule-cases.test.ts` (collect results; write the report in `afterAll` when
    `process.env.RULE_CASES_REPORT === '1'`)
  - `package.json` (`"rule-cases": "RULE_CASES_REPORT=1 vitest run src/rule-cases/rule-cases.test.ts"`)
  - `.gitignore` (`/rule-cases-report.html`)

**Interfaces:**
- Consumes: `CaseResult[]` and `TEST_LIBRARY`.
- Produces: `renderReport(results: CaseResult[], lib: CaseLibrary, runAt: Date): string`. It returns a full
  HTML document laid out as in mockup B:
  - **Header:** run time, and counts of passed, failed and known issues.
  - **Left column:**
    - cases grouped in the spec's group order, each with a mark (✅ pass, ❌ fail or known-now-passes,
      ⚠️ known);
    - a filter box and a "Failing only" checkbox, in inline JavaScript;
    - a "Dishes library" entry, which shows a table of every test dish with its type and category.
  - **Right column:** one panel per case, with only the selected one visible. The first failing case is
    selected by default, otherwise the first case. Each panel shows:
    - name, status and why;
    - the known-issue line;
    - the dishes;
    - the rules, plus "+ default rules" unless `defaults: false`;
    - the expectations, as a table of mark, says and got;
    - a 7×3 sample week with highlighted meals.

- [ ] **Step 1: Write the failing tests** in `report.test.ts`:
  - the HTML contains each case name, the pass/fail/known counts and `Dishes library`;
  - with a failing case, its panel is the visible one;
  - a dish named `Dal <b>&` appears escaped as `Dal &lt;b&gt;&amp;`;
  - the output has no `<script src` and no `<link`;
  - a known case shows "Known issue" and its text.
- [ ] **Step 2: Run** `npx vitest run src/rule-cases/report.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `renderReport`, the `afterAll` writer (`node:fs` `writeFileSync` into
  `path.resolve(process.cwd(), 'rule-cases-report.html')`), the npm script and the gitignore line.
- [ ] **Step 4: Run** `npm run rule-cases`. Expected: PASS, and `rule-cases-report.html` exists. Then run
  `npx vitest run`. Expected: PASS, and no report written without the flag.
- [ ] **Step 5: Commit:** `feat(rule-cases): standalone HTML report of the last run`

### Task 3: The seed cases

**Files:**
- Modify/Create:
  - `src/rule-cases/cases/pairings.ts`
  - `src/rule-cases/cases/days-meals.ts`
  - `src/rule-cases/cases/variety.ts`
  - `src/rule-cases/cases/locks.ts`
  - `src/rule-cases/cases/extras.ts`
  - `src/rule-cases/cases/index.ts`

**Interfaces:**
- Consumes: the helpers from Task 1.
- Produces: the spec's seed cases 2–10. Each has a `why` naming what it guards. Where it applies, the `why`
  names the fixed bug, such as the Pongal pairing fix of 8 Nov 2026.

- [ ] **Step 1: Write the cases**, each with the expectations below:
  - **2. Usually pairing gives way to never-auto:** Sambar and Coconut Chutney usually served with Pongal;
    Sambar lunch-only and never-auto. Expect `nearNoRulesCount('Pongal')` and `noHardProblems()`.
  - **3. Two Always curries for one base:** Sambar, then Rasam, always served with Pongal. Expect
    `plannedAtLeast('Pongal', 4)`, `everyMealWith('Pongal', ['Sambar'])` and `noHardProblems()`.
  - **4. A lock beats a pairing:**
    - Sambar always served with Pongal;
    - pins: `{ 'monday-breakfast': { base_id: Pongal, curry_id: Dal } }`;
    - expect `lockedMealKept('monday-breakfast', 'curry', 'Dal')`.
  - **5. Pairing to a base category:** Sambar always served with the Tiffin category. Expect
    `everyMealWith` for Idli, Dosa and Upma, each also having Sambar, and `noHardProblems()`.
  - **6. Pairing scoped to breakfast:** Coconut Chutney always served with Idli at breakfast. Expect:
    - every breakfast Idli has Coconut Chutney;
    - a custom expectation that some non-breakfast Idli has no Coconut Chutney across the 8 weeks. If Idli
      is never planned outside breakfast, this fails, and the case is marked `known` with the observation.
  - **7. Lunch-only dish:** Dal lunch-only, and `require` hand-written "a curry at every lunch". Expect
    `neverAt('Dal', { meals: ['breakfast', 'dinner'] })` and `plannedAtLeast('Dal', 1)`.
  - **8. Never-auto dish:** Chole has `exclusionRule`. Expect `plannedBetween('Chole', 0, 0)`. A variant
    with a pin of Chole into Monday lunch expects `lockedMealKept`.
  - **9. No dish on the same or next day** (defaults only): a custom expectation that no base repeats on
    consecutive days in any of the 8 weeks.
  - **10. Extras cap per meal:** hand-written `require` asking for 4 extras at breakfast, against the
    default breakfast cap of 2. Expect no breakfast with more than 2 extras, and the hard problem reported.
    This is a custom expectation over `hard`.
- [ ] **Step 2: Run** `npx vitest run src/rule-cases` 3 times. Expected: identical observed values each run.
  For any case that fails on today's code, decide per the spec:
  - if the expectation is right and the behaviour is wrong, add `known: '<what was seen>'`;
  - if the expectation itself was miswritten, correct it, and write in the report file why it was not a bug.
- [ ] **Step 3: Measure** the cases file on its own with `npx vitest run src/rule-cases --reporter=verbose`.
  Record its duration in the report. It must be at most 10 s.
- [ ] **Step 4: Run** `npm run rule-cases`, open the report, and check it against mockup B. Then run
  `npx tsc --noEmit -p .`, `npx eslint src` and `npx vitest run`. All clean.
- [ ] **Step 5: Commit:** `test(rule-cases): seed cases for pairings, days and meals, variety, locks and extras`.
  In the task report, list every case marked `known`, with its observation.
