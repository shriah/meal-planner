# Architecture Research

**Domain:** Personal meal planning web app (Indian cuisine, single user)
**Researched:** 2026-03-19
**Confidence:** MEDIUM-HIGH

---

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        UI Layer (React)                          │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  Food Library│  │  Plan Board  │  │   Rules Manager      │   │
│  │  (CRUD UI)   │  │  (weekly     │  │   (natural language  │   │
│  │              │  │   grid +     │  │    rule editor)      │   │
│  │              │  │   lock/swap) │  │                      │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘   │
│         │                │                      │               │
├─────────┴────────────────┴──────────────────────┴───────────────┤
│                     Application Layer                            │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  Food DB     │  │  Plan        │  │   Rule Engine        │   │
│  │  Service     │  │  Generator   │  │   (compile NL rules  │   │
│  │  (CRUD for   │  │  (randomize +│  │    to filter fns     │   │
│  │   meals/     │  │   lock logic)│  │    via LLM)          │   │
│  │   components)│  │              │  │                      │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘   │
│         │                │                      │               │
├─────────┴────────────────┴──────────────────────┴───────────────┤
│                     Data Layer                                   │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │  SQLite (local)  │  │  Plan Store  │  │  Rule Store        │ │
│  │  meals, comps,   │  │  (saved      │  │  (compiled filter  │ │
│  │  categories      │  │   weekly     │  │   JSON + NL text)  │ │
│  │                  │  │   plans)     │  │                    │ │
│  └──────────────────┘  └──────────────┘  └────────────────────┘ │
├──────────────────────────────────────────────────────────────────┤
│                     External Services                            │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Claude API (LLM) — NL rule → structured filter JSON       │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| Food Library UI | Add/edit/delete meals and their components | Food DB Service |
| Plan Board UI | Display weekly grid, handle lock/unlock, trigger regenerate, swap meals | Plan Generator, Plan Store |
| Rules Manager UI | Text editor for natural language rules, trigger LLM compilation | Rule Engine |
| Food DB Service | CRUD operations for meals, components, tags, categories | SQLite |
| Plan Generator | Randomize meal selection per slot, apply compiled filters, respect locks | Food DB Service, Rule Engine, Plan Store |
| Rule Engine | Send NL rules to LLM, receive structured filter JSON, persist compiled rules | Claude API, Rule Store |
| SQLite (local) | Durable local storage: meals, components, saved plans, compiled rules | All services |
| Claude API | Translate natural language rules into structured filter predicates | Rule Engine only |
| Export Pipeline | Render weekly grid to PDF or image for download/share | Plan Board UI, browser APIs |

---

## Recommended Project Structure

```
src/
├── components/            # React UI components
│   ├── food-library/      # Meal and component CRUD
│   ├── plan-board/        # Weekly grid, lock controls, swap UI
│   ├── rules-manager/     # NL rule input, rule list display
│   └── export/            # Export trigger and print-ready layout
│
├── services/              # Business logic, no React dependencies
│   ├── food-db.ts         # Meal/component CRUD, tag queries
│   ├── plan-generator.ts  # Randomization + filter application
│   ├── rule-engine.ts     # LLM call, filter compilation, caching
│   └── export.ts          # html2canvas + jsPDF orchestration
│
├── db/                    # Data access layer
│   ├── schema.ts          # Table definitions (Drizzle or raw SQL)
│   ├── migrations/        # Versioned schema migrations
│   └── client.ts          # SQLite connection singleton
│
├── types/                 # Shared TypeScript types
│   ├── meal.ts            # Meal, MealComponent, MealSlot
│   ├── plan.ts            # WeeklyPlan, DayPlan, SlotState
│   └── rule.ts            # NLRule, CompiledFilter
│
├── store/                 # Client-side state (Zustand or similar)
│   ├── plan-store.ts      # Current week plan state, lock state
│   └── ui-store.ts        # UI state (selected slot, modal open)
│
└── lib/
    ├── llm-client.ts      # Claude API wrapper with retry logic
    └── randomizer.ts      # Weighted random selection utilities
```

### Structure Rationale

- **services/:** Pure TypeScript business logic, independently testable without React. The plan generator and rule engine are the most complex parts — keeping them out of components makes them testable and replaceable.
- **db/:** Isolating the data access layer means the rest of the app never writes raw SQL. If the storage engine changes, only this folder changes.
- **types/:** Shared types prevent interface drift between layers. Define them once, import everywhere.
- **store/:** Only UI-session state lives here (current week view, which slot is selected, which meals are locked). Persisted state lives in SQLite.

---

## Architectural Patterns

### Pattern 1: NL Rules Compiled to Filter Predicates (One-Time LLM Call)

**What:** When a user writes a natural language rule, the Rule Engine calls the LLM once to translate it into a structured JSON filter. That filter is stored in the database. At plan generation time, only the stored filters are used — no LLM calls during generation.

**When to use:** Any time you need LLM intelligence at configuration time but deterministic, fast behavior at runtime.

**Trade-offs:** LLM is called only on rule save/edit, not on every generation — generation is fast and offline-capable. The compiled filter must be expressive enough to cover all rule types. Rules that change meaning with context (e.g., "no repeats this week") need to be re-evaluated against live plan state, not purely as static filters.

**Example:**
```typescript
// NL rule: "Fridays are fish days"
// LLM outputs structured filter:
interface CompiledFilter {
  scope: "slot";             // applies per slot
  conditions: {
    dayOfWeek: ["friday"];   // only evaluate on Fridays
    requiredTags: ["fish"];  // meal must have this tag
  };
}

// NL rule: "Never repeat the same subzi twice in a week"
interface CompiledFilter {
  scope: "week";
  conditions: {
    uniqueField: "subzi_id"; // subzi must be unique across all slots this week
  };
}
```

The LLM prompt should include:
1. The full filter JSON schema (so output is constrained)
2. A catalog of available tags and field names from the food database
3. A few-shot example mapping NL rules to filter JSON

**LLM prompt pattern:**
```
You convert meal scheduling rules to JSON filters.
Available tags: [fish, vegetarian, rice-based, ...]
Available fields: base_id, curry_id, subzi_id, extras_ids, tags
JSON schema: [CompiledFilter schema]

Rule: "Fridays are fish days"
Filter: { ... }

Rule: "{user_input}"
Filter:
```

### Pattern 2: Compositional Meal Model (Components, Not Monolithic Recipes)

**What:** A "meal" is not a single record — it is a named slot configuration composed of independently stored components: a Base (required), a Curry (optional), a Subzi (optional), and Extras (zero or many). Components are shared across meals.

**When to use:** This is the correct model for Indian cuisine where the same rice can appear with 20 different curry combinations. The variation is in the combination, not in creating 20 separate "rice meals."

**Trade-offs:** Slightly more complex schema than a monolithic recipe table, but allows precise de-duplication rules ("no repeated subzi") and flexible randomization at the component level. You can randomize just the curry while locking the base.

**Example schema:**
```typescript
// Components are first-class entities
interface MealComponent {
  id: string;
  name: string;                          // "Sambar", "Palak Paneer", "Jeera Rice"
  type: "base" | "curry" | "subzi" | "extra";
  tags: string[];                        // ["vegetarian", "south-indian", "dal-based"]
  notes?: string;
}

// A meal is a named combination of components
interface Meal {
  id: string;
  name: string;                          // "South Indian Lunch" — optional display name
  baseId: string;                        // required
  curryId?: string;
  subziId?: string;
  extraIds: string[];                    // rasam, pappad, pickle, etc.
  tags: string[];                        // union of component tags + meal-level tags
}

// A plan slot references a meal (or is empty/locked-empty)
interface SlotState {
  day: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
  mealType: "breakfast" | "lunch" | "dinner";
  mealId: string | null;
  locked: boolean;
}
```

### Pattern 3: Plan as Mutable Session State, Saved Plans as Snapshots

**What:** The current working weekly plan lives in client-side state (Zustand). It is mutable — users can swap meals, lock slots, regenerate freely. When the user explicitly saves, a snapshot is written to SQLite. Saved plans are read-only records.

**When to use:** Any planner-style UI where the working state is temporary and the save action is deliberate. This avoids accidental overwrites and keeps the UX responsive.

**Trade-offs:** Unsaved work can be lost on browser close. For a personal app, this is acceptable — add a "You have unsaved changes" indicator. Do not auto-save to a named plan without user intent.

**State model:**
```typescript
// In-memory Zustand store (current working plan)
interface PlanStore {
  slots: SlotState[];                    // 7 days × 3 meals = 21 slots
  generatedAt: Date | null;
  isDirty: boolean;                      // true after any change since last save
  generate: () => Promise<void>;
  lockSlot: (day, mealType) => void;
  unlockSlot: (day, mealType) => void;
  swapMeal: (day, mealType, newMealId) => void;
  save: (name: string) => Promise<void>;
}

// Persisted snapshot in SQLite
interface SavedPlan {
  id: string;
  name: string;
  createdAt: Date;
  slots: SlotState[];                    // JSON blob — denormalized snapshot
}
```

---

## Database Schema

### Core Tables

```sql
-- Individual meal components (base, curry, subzi, extra)
CREATE TABLE components (
  id          TEXT PRIMARY KEY,          -- uuid
  name        TEXT NOT NULL,
  type        TEXT NOT NULL              -- 'base' | 'curry' | 'subzi' | 'extra'
                CHECK(type IN ('base','curry','subzi','extra')),
  tags        TEXT NOT NULL DEFAULT '[]', -- JSON array of tag strings
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Named meal combinations
CREATE TABLE meals (
  id          TEXT PRIMARY KEY,
  name        TEXT,                      -- display name, nullable
  base_id     TEXT NOT NULL REFERENCES components(id),
  curry_id    TEXT REFERENCES components(id),
  subzi_id    TEXT REFERENCES components(id),
  tags        TEXT NOT NULL DEFAULT '[]', -- JSON array
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Many-to-many: meals → extras
CREATE TABLE meal_extras (
  meal_id     TEXT NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  component_id TEXT NOT NULL REFERENCES components(id),
  PRIMARY KEY (meal_id, component_id)
);

-- Natural language rules + their compiled filter JSON
CREATE TABLE rules (
  id            TEXT PRIMARY KEY,
  nl_text       TEXT NOT NULL,           -- "Fridays are fish days"
  compiled_json TEXT NOT NULL,           -- CompiledFilter as JSON string
  is_active     BOOLEAN NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Saved weekly plans (read-only snapshots)
CREATE TABLE saved_plans (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slots_json  TEXT NOT NULL,             -- JSON array of SlotState
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Index Strategy

```sql
-- Filter components by type (most common query during generation)
CREATE INDEX idx_components_type ON components(type);

-- Find meals by base (for randomization constrained to a base)
CREATE INDEX idx_meals_base ON meals(base_id);

-- List active rules (always small table, but explicit is better)
CREATE INDEX idx_rules_active ON rules(is_active);
```

### Schema Notes

- Tags stored as JSON strings in SQLite. For a single-user personal app, full-text or array operators are unnecessary — deserialize in application code and filter in memory. The dataset is small (hundreds of meals at most).
- `saved_plans.slots_json` is a denormalized snapshot. It captures meal names and component names at save time so the plan remains readable even if underlying meals are later edited or deleted.
- No user ID columns anywhere. Single-user scope means no row-level isolation needed.

---

## Data Flow

### Flow 1: Plan Generation

```
User clicks "Generate"
    │
    ▼
PlanStore.generate()
    │  reads locked slots from current state
    ▼
PlanGenerator.generatePlan(lockedSlots, activeRules)
    │
    ├─ 1. Load all meals from Food DB Service
    │
    ├─ 2. Load active CompiledFilters from Rule Store
    │
    ├─ 3. For each unlocked slot (day × mealType):
    │       a. Apply slot-scoped filters (e.g., "Fridays → fish tag required")
    │       b. Apply week-scoped filters (e.g., "unique subzi per week")
    │          — evaluated against already-assigned slots
    │       c. From remaining candidates, pick one at random (weighted if needed)
    │       d. Assign to slot, update week-scope filter state
    │
    └─ 4. Return completed SlotState[21]
         │
         ▼
    PlanStore updates in-memory state → React re-renders Plan Board
```

### Flow 2: Rule Compilation (LLM)

```
User types rule: "Fridays are fish days" → clicks Save
    │
    ▼
Rule Engine.compileRule(nlText)
    │
    ├─ 1. Fetch current tag catalog from Food DB Service
    │       (so LLM knows what tags are available)
    │
    ├─ 2. Build LLM prompt:
    │       - System: filter JSON schema + few-shot examples
    │       - User: the NL rule text + available tags
    │
    ├─ 3. Call Claude API with structured output enforcement
    │       (JSON schema mode or function calling)
    │
    ├─ 4. Validate returned JSON against CompiledFilter schema
    │       — if validation fails, surface error to user with raw LLM explanation
    │
    └─ 5. Persist { nl_text, compiled_json } to rules table
         │
         ▼
    Rules Manager UI shows rule as active
```

### Flow 3: Export

```
User clicks "Export as PDF"
    │
    ▼
Export Service.exportPDF()
    │
    ├─ 1. Render print-optimized React component (hidden, full-week grid)
    │       with current plan state injected as props
    │
    ├─ 2. html2canvas captures the rendered DOM element → Canvas
    │
    ├─ 3. jsPDF receives canvas as image, builds PDF document
    │
    └─ 4. Trigger browser download: `meal-plan-YYYY-MM-DD.pdf`
```

### State Management Flow

```
SQLite (persistent)
    │  read on app load
    ▼
Zustand PlanStore (in-memory session state)
    │  subscribed to by
    ▼
React components (re-render on state change)
    │
    │  user actions (lock, swap, generate)
    ▼
Zustand actions → update PlanStore state
    │
    │  on explicit "Save"
    ▼
SQLite saved_plans table (persisted snapshot)
```

---

## Component Build Order (Dependency Graph)

Build in this order — each layer depends on the one above it being stable:

```
1. DB schema + migrations       ← foundation, everything else reads/writes here
        │
        ▼
2. Food DB Service (CRUD)       ← Plan Generator needs queryable meals
        │
        ▼
3. Food Library UI              ← seed the database before generation works
        │
        ▼
4. Rule Engine (LLM)            ← needs tag catalog from Food DB Service
        │
        ▼
5. Plan Generator               ← needs meals + compiled rules
        │
        ▼
6. Plan Board UI                ← needs generator + Zustand store
        │
        ▼
7. Save / Saved Plans UI        ← needs working plan board first
        │
        ▼
8. Export Pipeline              ← needs stable plan board rendering
```

Rationale: You cannot test the generator without meals in the database. You cannot test rules without a tag catalog. The Plan Board is useless without the generator. Export is the last thing to build because it depends on the Plan Board rendering being pixel-stable.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Claude API | REST call from Rule Engine only — never from UI directly | Keep API key server-side if deployed; for local-only app, `.env` is acceptable. Add retry with exponential backoff. |
| html2canvas | Client-side DOM capture | Fonts and custom CSS must be loaded before capture. Avoid transforms on the target element. |
| jsPDF | Client-side PDF construction from canvas | Pair with html2canvas; set `useCORS: true` if any external images (e.g., meal photos) are present. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| UI → Services | Direct function calls (not REST) — this is a local app | Services are plain TypeScript modules, not HTTP handlers |
| Services → DB | Drizzle ORM query builder or raw SQL via `better-sqlite3` | Never raw string interpolation; use parameterized queries |
| Plan Generator → Rule Engine | Rule Engine exposes `getActiveFilters(): CompiledFilter[]` — generator reads these, no callbacks | Rules are pre-compiled; generator is pure and synchronous |
| Rule Engine → Claude API | One async call per rule save/edit | Debounce UI input; show "Compiling..." state |
| Export → Plan Board | Export renders a separate, hidden print layout component | Do not screenshot the interactive grid — create a dedicated `PrintablePlan` component with fixed dimensions |

---

## Architectural Patterns

### Anti-Pattern 1: Calling LLM on Every Plan Generation

**What people do:** Send the user's rules as plain text to the LLM with each generation request and ask it to select meals.

**Why it's wrong:** Generation becomes slow (1-5 seconds LLM latency), expensive (API cost per generation), and non-deterministic. You lose the ability to show the user what rules are doing.

**Do this instead:** Compile rules once (LLM call on save) into a deterministic JSON filter. Generation is then synchronous, free, and fast. The user can edit a rule and recompile at any time.

### Anti-Pattern 2: Storing Meals as Monolithic Recipe Blobs

**What people do:** Store each meal as a flat text description: "Rice, sambar, rasam, papad" with no structure.

**Why it's wrong:** You cannot apply de-duplication rules ("no repeated subzi") because you have no machine-readable component identity. You cannot filter by component tag. Swapping only the curry while keeping the base is impossible.

**Do this instead:** Use the compositional model — components are first-class rows with IDs and tags. Meals reference them by foreign key.

### Anti-Pattern 3: Auto-Saving Working Plan State to a Named Plan

**What people do:** Continuously persist every change to the "current plan" as a named saved record.

**Why it's wrong:** The user loses the ability to compare generated options. Regenerating overwrites the previous version silently. The plan history becomes meaningless.

**Do this instead:** Keep the working plan as session state (Zustand). Require explicit user action to save. Show an "unsaved changes" indicator.

### Anti-Pattern 4: Using Full-Text Search for Tag Filtering

**What people do:** Store tags as a comma-separated string and use LIKE queries.

**Why it's wrong:** LIKE '%fish%' matches "fishcake" and "starfish". Tag queries become ambiguous and slow to reason about.

**Do this instead:** Store tags as a JSON array. Deserialize in application code and filter with Array methods. For this dataset size (hundreds of records), in-memory filtering is instant and requires no index.

---

## Scaling Considerations

This is a single-user personal app. Scaling is not a real concern. The architecture is sized correctly.

| Scale | Architecture |
|-------|-------------|
| 1 user, local data | Current design is correct. SQLite + local state is the right choice. |
| 10 users (shared household) | Add user ID column to all tables, add login. No architectural change needed. |
| 1,000+ users | Move to PostgreSQL + server-side API. LLM calls move to a queue. This would be a significant rewrite — don't pre-optimize for this. |

The first bottleneck for a personal app is not scale — it is data quality. The app is only as good as the meals in the library. Design the Food Library UI to make data entry fast.

---

## Sources

- [Database Design for Meal Plans — SitePoint Forums](https://www.sitepoint.com/community/t/database-design-for-meal-plans/26572)
- [Constraint Satisfaction for Meal Planning — DIVA portal](https://www.diva-portal.org/smash/get/diva2:21100/FULLTEXT01.pdf)
- [Structured Outputs and Function Calling with LLMs — Agenta](https://agenta.ai/blog/the-guide-to-structured-outputs-and-function-calling-with-llms)
- [Practical Techniques to Constrain LLM Output in JSON — Medium](https://mychen76.medium.com/practical-techniques-to-constraint-llm-output-in-json-format-e3e72396c670)
- [SQLite in 2025: Appropriate Uses — sqlite.org](https://sqlite.org/whentouse.html)
- [Offline-First Frontend Apps in 2025 — LogRocket](https://blog.logrocket.com/offline-first-frontend-apps-2025-indexeddb-sqlite/)
- [PDF Generation with html2canvas + jsPDF — HackMD](https://hackmd.io/@n6kGXbvAST2zb6hPLZ6sNQ/HJTVYZz8n)
- [INDoRI: Indian Dataset of Recipes and Ingredients — arXiv](https://arxiv.org/abs/2309.10403)

---

*Architecture research for: Indian meal planning web app (single-user, personal)*
*Researched: 2026-03-19*
