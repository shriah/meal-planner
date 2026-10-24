# Planner rewrite

Replace the greedy, filter-while-building generator and the 8-effect rule model with a
constraint-scoring planner. Correctness and completeness take priority over preserving old
behaviour. Proven feasible in spike D (scratchpad); this plan productionises it.

## Model

- **Assignment**: a component placed in a role (base, curry, subzi, extra) of a slot (day × meal).
- **Primitives**
  - **Count**: select assignments (typed matcher over component fields + role/day/meal), group them
    (slot, day, meal, plan, component, component × time, sliding window of k days), optionally only
    when a trigger exists in the group, and bound the count with hard and/or soft min/max and a
    linear cost per unit outside the bounds.
  - **Prefer**: soft reward or penalty per matching assignment.
- **Score**: lexicographic (hard, soft). No relax-with-warning: an infeasible rule set still yields
  the best plan found plus justifications naming each broken rule, group and count.
- **Built-ins are constraints**: plan structure (one base per slot, at most one curry/subzi),
  extras per-meal limit, occasion days, curry–base compatibility, variety/frequency preferences.
- **Rules are templates**: each user-facing rule type has a params schema, a compiler to primitives,
  a description renderer and form metadata. A new rule type is a new template; the engine and UI
  do not change.
- **Solver**: seeded construction + local search, locks as pins, early stop once hard = 0 and the
  soft score plateaus, hard time cap. Runs off the main thread (Web Worker).

## Phases

Each phase ends with eslint 0, tsc 0, all tests green, and a check-in.

1. **Planner core** (`src/planner/`, headless, zod only): matcher, primitives, scorer with
   justifications, built-ins, solver with real score levels and early stop. Ported from spike D and
   reviewed line by line; the spike's legacy adapter and weight-based hard priorities are dropped.
   The spike's evaluation scenarios become a permanent regression suite.
2. **Rule templates** (`src/rules/`, pure): template registry (exclude, only allow, require, limit
   per meal/day/week, no repeats in the week or within k days, allowed meals, leave out when, also
   include when, prefer/avoid), each with a must/prefer strength. Stored rule shape
   `{ name, enabled, spec: { template, params } }`, compilation to constraints that skips and reports
   invalid rules or rules referring to deleted components/categories, and a pure converter for old
   rules. Storage is not touched yet.
3. **Storage + generation wiring**: Dexie migration runs the converter (converted rules mean what the
   old form said; unconvertible rules are dropped and listed once). Plan store calls the planner in a
   Web Worker; locks become pins; the plan view shows justifications instead of ad hoc warnings.
   Category deletion cleans up rule references through `specReferences`. Old generator, rule
   compiler and effect types are deleted.
4. **Rules UI**: template picker, params form generated from template metadata, live description,
   impact preview powered by the scorer. Old form state and fields are deleted.
5. **Cleanup**: seed rules as templates, update `docs/architecture.md`, remove dead code.

## Decisions (defaults; change before the phase that uses them)

- Old stored rules: converted when the mapping is exact, otherwise dropped and listed once (decided).
  "Exact" means the old form's stated meaning: old generator quirks (e.g. no-repeat ignoring its days,
  skip rules on a specific component doing nothing) are fixed, not preserved. Dropped: unreadable,
  no effect, references to deleted components/categories, empty tag filter, scope selecting nothing.
- Per-meal extras limit from preferences becomes a real hard constraint.
- `require` beats `skip` when both apply (both are hard; the solver reports the conflict).
