# Architecture

The weekly plan is produced by a constraint planner: rules **score** a whole candidate plan, and a
search looks for the plan with the best score. Rules are data (templates), not code paths in the
generator.

## App flow

```mermaid
flowchart TD
    subgraph UI["UI (Next.js client)"]
        Home["/ Plan board"]
        Lib["/library Components + Categories"]
        RulesPage["/rules list, /rules/new + edit sheet: RuleEditor"]
    end

    subgraph Store["Zustand plan-store"]
        Gen["generateFresh / regenerate"]
        Edit["setLock / lockDay / swapComponent"]
        Nav["navigateToWeek"]
        Exp["exportPlan"]
    end

    subgraph DB["Dexie (IndexedDB)"]
        Comps[("components")]
        Cats[("categories")]
        RulesT[("rules: { name, enabled, spec }")]
        Prefs[("preferences: extras limits")]
        Active[("active_plan")]
        Saved[("saved_plans")]
        Notices[("notices")]
    end

    subgraph Svc["Services"]
        Planning["planning.ts: load data, run in Web Worker"]
        Worker["plan-generation.worker: planFromData"]
    end

    subgraph Pure["Pure modules"]
        RulesMod["src/rules: templates, editor forms, legacy converter"]
        Planner["src/planner: matcher, constraints, scorer, solver"]
    end

    API["POST /api/export-plan (satori to PNG)"]

    Lib -->|CRUD| Comps
    Lib -->|CRUD| Cats
    RulesPage -->|validateDraft, describe, preview| RulesMod
    RulesPage -->|save| RulesT
    RulesPage -->|check draft| Planning

    Home --> Gen
    Home --> Edit
    Home --> Nav
    Home --> Exp
    Edit -->|locks become pins| Gen
    Gen --> Planning
    Comps --> Planning
    Cats --> Planning
    RulesT --> Planning
    Prefs --> Planning
    Planning --> Worker
    Worker -->|compileRules| RulesMod
    Worker -->|planWeek| Planner
    Worker -->|plan + problems + skipped rules| Gen
    Gen -->|save| Active
    Nav --> Saved
    Exp --> API
    RulesT -.->|v14 upgrade converts old rules, lists dropped ones| Notices
```

## Rules model (`src/rules`)

A stored rule is `{ name, enabled, spec: { template, params } }`. Each template (never include, only
allow, always include, how often, no repeats, only at certain meals, leave out when, also include
when, prefer/avoid) has a params schema, a compiler to planner constraints, a description, the ids
it references, and form metadata the editor is generated from. Count-based templates take a
`must` (hard) or `prefer` (soft) strength.

Rules that are invalid or refer to deleted components or categories are skipped and named, never
applied with a changed meaning.

## Planner (`src/planner`)

```mermaid
flowchart TD
    A["Constraints: built-ins + compiled rules"] --> B["compileModel: matchers to closures, groups"]
    B --> C["Construction: fill 21 slots, pins first, softmax over candidates"]
    C --> D["Local search (late acceptance): change, swap, base+curry, add/remove extra"]
    D --> E{"No hard violations and no improvement for N iterations, or time cap?"}
    E -->|no| D
    E -->|yes| F["Polish: drop extras that do not help"]
    F --> G["Best plan + score (hard, soft) + justification per violated group"]
```

- **Count** constraint: select assignments (component + role + day + meal), group them (slot, day,
  meal, week, per component, sliding k-day window), optionally only where a trigger exists in the
  same group, and bound the count with hard and/or soft min/max.
- **Prefer** constraint: soft cost or reward per matching assignment.
- **Score** is lexicographic: any hard violation outweighs every soft cost.
- **Built-ins** use the same primitives: plan structure, extras per meal, occasion days,
  curry–base compatibility, and preferences for a curry and subzi in every meal and for variety
  (repeats in the week cost a little, the same dish on the same or next day costs more).
- Locked parts of the plan are **pins** the search never moves; rules they break are reported.
