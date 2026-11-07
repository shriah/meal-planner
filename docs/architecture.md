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
when, only with these bases, never together, only on certain days, prefer/avoid) has a params schema, a compiler to planner constraints, a description, the ids
it references, and form metadata the editor is generated from. Count-based templates take a
`must` (hard) or `prefer` (soft) strength, and a `prefer` rule may set its own `cost` (1–10).

Every library starts with **default rules** (`src/rules/defaults.ts`): extras per meal, variety across
the week, no dish on the same or next day, curries, subzis and extras only when a rule asks, and
frequent over rare dishes. A meal is therefore its base alone until a rule (for example "also include
when" or "always include") asks for a side. They are ordinary rules that can be edited or switched off;
their costs (2, 3, 2, 1) sit below a user's own `prefer` rules (10 by default). Those two are no longer defaults (v19 removes them from libraries
where they were still off and unedited, and otherwise drops their `default_key`). Each remaining default carries a stable
`default_key`, so it stays recognisable after a rename and "Restore defaults" can add back any that
were deleted without touching the ones that remain. The seed runs once (`runSeed` has an in-flight guard and one
transaction), so React running effects twice cannot duplicate rules. Prefer and avoid weights are shown as Slightly,
Moderately or Strongly (`LEVELS`, weight only); the stored numbers are unchanged.

The v20 upgrade merges a library that was seeded twice: categories with the same kind and name, and dishes with the same type
and name, are merged into the copy with the lowest id (`src/db/dedupe.ts`). Dishes, rules and plans that named a removed copy
name the kept one; a removed dish's own rules are dropped where the kept dish has one for the same slot and moved to it otherwise.

The v19 upgrade also removes duplicate unowned rules (same name, spec and enabled flag; the lowest id stays) and converts
exact-shape hand-written `require_with` pairings (unowned, no extra categories, `when` a single base `id` or `base_category_id`
leaf, components all existing curries, subzis or extras) into dish-owned served-with links, keeping strength, scope and enabled.
It merges into a dish's existing served-with link only when enabled, strength and scope match; otherwise the hand-written rule
stays, trimmed.

Rules that are invalid or refer to deleted components or categories are skipped and named, never
applied with a changed meaning.

A rule may be owned by a component (`owner_component_id`, at most one per template), edited on that
component's form; the Rules page does not list owned rules, and a link to one goes to its dish. Any dish can own a list of **goes with / never with**
links (`DishLink` in `src/rules/owned.ts`). A link has a mode, a target, values, a strength and an optional scope. The target is
the categories of another kind of dish (base categories, extra categories, curry types) or specific dishes (bases, curries,
subzis, extras); a dish is never offered its own kind where a meal holds only one, and a base is not offered base categories or
bases. "Only with" limits the dish to the chosen values, "never with" keeps it away from them; none chosen is no rule. Both modes
of one target may be set at once, each as its own rule (`with:<target>`, `never:<target>`). A curry, subzi or extra may also be
**served with** specific bases or base categories (`serve:<target>`, a `require_with` rule the dish owns): whenever one of them
is the meal's base, the dish is added. Served with is the way to add a side to a base. The planner does this through the rule;
picking a base by hand on the plan re-plans only that meal through the planner: `pinsForMeal` in `src/services/pins.ts` pins every
other meal exactly (and holds a role empty with `null` in `SlotPins`), so the meal's sides follow every rule and locked parts stay.

Strength is one set of words, `STRENGTH_WORDS` in `src/rules/levels.ts`: **Always** (`must`), **Usually**, **Often** and
**Sometimes** (`prefer` with cost 10, 6 or 3). Links, the Rules page cost select and the assistant all use it. A stored cost
reads back as Usually at 8 or more, Often at 5 to 7 and Sometimes at 4 or less, so older links keep their meaning. A scope limits a link to some days or meals. Storage is unchanged: "only with base categories" is a
`pairs_with` rule (which also accepts `scope`, editable on the Rules page), every other link an `avoid_with` rule whose other
side is the dish type plus the (negated) categories.

On the dish form, "Goes with" is a list of sentences (`describeLink`, with `shortLink` for the row badges in
`src/rules/link-text.ts`), each with Edit and Remove, and an "Add link" flow (`src/components/library/links`) with a searchable
option picker and optional day and meal limits. `addableSlots(componentType, links)` in `src/rules/owned.ts` decides what the
flow offers: Served with first, then "Only with" and "Never with" for every target the dish may link to, specific dishes
included. Existing links always stay listed and editable. A stored link that is switched off (as the v19 upgrade may leave a hand-written pairing) is
marked "(off)" and stays off until it is changed and saved, which switches it on; `propose_pairing` treats it as not in force. Links left untouched are never rewritten on save. `link-warnings.ts` shows
non-blocking warnings: a contradiction between modes, nothing plannable to pair with, and a link hidden by another dish's meal or
day limits. The form also lists, read only, "Other rules mentioning this dish" (linking to `/rules#rule-<id>`), and in edit mode
a "Preview on this week" button that compares the current plan with and without the unsaved links
(`compareRuleSets` and `pendingRules` in `src/services/compare-rules.ts`; it needs a stored plan). Rows and forms share one
library lookup (`LibraryLookup.tsx`: dishes, categories and all rules, provided by `ComponentTab`; outside it, the hook runs its
own queries).

Manage Categories has no pairing editor. A base's form has a "Served with" picker (Curries, Subzis, Extras, each searchable):
ticking a dish adds this base to that dish's own `serve:base_dish` link, created at the "new picks" strength when the dish has
none, and unticking takes the base out (`setServedWithBase` in `src/services/food-db.ts`); nothing is written when the list is
left alone. Dishes served with the base's whole category are shown there for context and edited on those dishes. A dish's specific days
are an `only on certain days` (`allowed_days`) rule (any day, weekdays, weekends or specific days);
"never plan automatically" is an `exclude` rule. Occasion tags are only descriptive (`fasting`,
`festive`). Owned rules are renamed and deleted with their component and lose a deleted value
instead of being skipped, keeping the link's scope and strength; a link left with no value is removed. With nothing chosen, a dish
goes with any base, any curry and any day (it owns no rule). The meal picker marks a choice as an override
when scoring the current plan with it adds a hard violation, so every rule counts there, not only
pairings.

The Rules page groups rules as "Your rules" and "Planner defaults" (the last collapsed), with a
search box; dish settings (owned rules) are not listed there. A plan problem carries a plain `reason` (the rule's description, or a
built-in's label) and a `message` that adds where; links of the form `/rules#rule-<id>` and
`/library#dish-<id>` scroll to a rule or dish, highlight it and open its editor; a link to a dish
setting goes to the dish that owns it. A rule being edited is checked against the
library automatically once editing pauses.

## Planner (`src/planner`)

```mermaid
flowchart TD
    A["Constraints: built-ins + compiled rules"] --> B["compileModel: matchers to closures, groups"]
    B --> C["Construction: fill 21 slots, pins first, softmax over candidates"]
    C --> D["Local search (late acceptance): change, swap, base+curry, add/remove extra"]
    D --> E{"No hard violations and no improvement for N iterations, or time cap?"}
    E -->|no| D
    E -->|yes| F["Polish: drop curries, subzis and extras that do not help"]
    F --> G["Best plan + score (hard, soft) + justification per violated group"]
```

- **Count** constraint: select assignments (component + role + day + meal), group them (slot, day,
  meal, week, per component, sliding k-day window), optionally only where a trigger exists in the
  same group, and bound the count with hard and/or soft min/max.
- **Prefer** constraint: soft cost or reward per matching assignment.
- **Score** is lexicographic: any hard violation outweighs every soft cost.
- **Built-ins** are only the structure of a meal: one base, at most one curry and one subzi, each
  component in its own role, no extra twice. Everything else is a stored rule.
- Locked parts of the plan are **pins** the search never moves; rules they break are reported.

## Rules assistant (`src/assistant`)

An optional chat panel on the Rules page ("Ask assistant"). It answers questions about rules and the
current plan, and drafts rules and dishes from plain words. It runs entirely in the browser and calls
Gemini directly with the user's own key; there is no server route.

- `limits.ts`: caps (input length, tool calls, output tokens, history turns, list size) and a client-side rate limiter.
- `key-store.ts`: the Gemini key in `localStorage`, tolerant of blocked storage.
- `gemini.ts`: streaming `fetch` client (no SDK), the key sent in a header, and the `GEMINI_MODEL` constant.
- `retrieve.ts`: step 1, a local no-LLM slice of the library and rules relevant to the message.
- `prompt.ts`: constant system prompt, the `<data>` wrapper for untrusted text, and a cheap off-topic shortcut.
- `tools.ts` / `types.ts`: the closed tool set (declarations plus a never-throwing, Zod-validated dispatcher) and shared shapes.
- `compare.ts`: the assistant's before-and-after sample week; a thin wrapper over `compareRuleSets` in `src/services/compare-rules.ts`, which the dish form's link preview also uses.
- `agent.ts`: the loop that ties these together and emits text, draft and comparison events.
- `src/components/assistant`: `AssistantPanel`, `KeyPrompt`, `ComparisonView`, `DraftSheets`. Supporting
  pieces: `src/services/pins.ts` (locks to pins), `explainPlan` in `plan-generation.ts`, and a `draft` prop on `ComponentForm`.

**Data flow.** Step 1 builds a small slice locally (matched dishes, the rules that reference them,
a compact library summary, the discussed plan and its problems). Step 2 sends the slice and question to
Gemini, which may call read-only tools (`search_dishes`, `get_rule`, `list_rules`, `get_plan` for the
week's dish names, `explain_rule` for whether a rule is active and where the plan breaks it, `explain_plan_slot` for one slot's dishes and problems, optionally checking which rules a
named dish would break there, and `simulate_with_rule` for the comparison below) and two draft tools
(`propose_rule`, `propose_dish`, `propose_pairing`; ten tools in all) that only validate and return a draft. A rule spec travels as JSON text. `propose_dish` can
include the bases a new curry, subzi or extra is served with (by name), so the dish and its pairing are drafted and saved together. `propose_pairing` drafts served-with links for a dish that
already exists; "Review pairing" opens that dish's form in edit mode with the draft merged over its stored links, and saving
writes only the new link.
Each question makes at most 5 requests to Gemini (the last one without tools, so it must answer); the prompt
tells the model to answer from the slice when it can and to batch its tool calls into one step.
If the plan store has not loaded yet (the Rules page opened directly), the panel loads the stored plan first. A rule draft opens in
the existing `RuleEditor` sheet, a dish draft in the existing `ComponentForm` (a pairing draft in edit mode); nothing is saved except
through their own Save button.

**Comparison.** For a rule draft the app plans the current week twice with the same seed and the same
pins (locked slots), once with the current rules and once with the draft added, locally in the planning
worker. The diff is computed in code; Gemini only words the summary. Adding a rule can reshuffle
unrelated slots, so changes outside the rule's matcher are described as reshuffled.

**Guardrails.** A fixed system prompt that refuses anything off rules, dishes and plans; only the
declared tools exist, and unknown tool names are rejected; arguments are validated and ids must exist;
no tool writes to the database; names from user data reach the model inside delimited data blocks that
it is told never to obey; message length, tool calls, output tokens, history and request rate are
capped; chat text is rendered as plain text. The limit is honest: this is client-side code with the
user's own key, so it stops drift, accidental misuse and prompt injection, not someone editing the page.

**Key storage.** The key sits in `localStorage` in plain text, and the panel says so, along with the fact
that relevant library data (names, ids, short descriptions, capped) goes to Google with each question.

**Known limits.** History is text-only (tool calls and results are not replayed on later turns), and
is kept in memory for the open panel. `GEMINI_MODEL` in `gemini.ts` has not been checked against
Google's live model list; a 404 shows "The Gemini model isn't available to this key.", and then it needs
updating. Replies are capped at 2048 output tokens; a turn that ends with no text and no draft shows a
short notice instead of an empty reply.
