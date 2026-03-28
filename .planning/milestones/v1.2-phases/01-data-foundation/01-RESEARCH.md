# Phase 1: Data Foundation - Research

**Researched:** 2026-03-19
**Domain:** Dexie.js v4 schema design, TypeScript type modeling, Next.js project scaffold for local-first IndexedDB apps
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Components (Base, Curry, Subzi, Extra) are **reusable entities stored in their own tables** — not inline strings per meal
- A "meal" does not exist as a pre-composed record. The generator assembles components at generation time by picking one from each pool
- The Meal Library (Phase 2) manages **component pools**: 4 tabs — Bases, Curries, Subzis, Extras
- Generated plan slots store component IDs (base_id, curry_id?, subzi_id?, extra_ids[])
- Rules can reference component entity IDs (e.g., "never repeat same subzi_id twice this week")
- **No slot field on components** — components carry no valid_slots information at the schema level
- Slot assignment is handled entirely by the **global user preferences** layer (a top-level config object), not by component attributes
- The global preferences object supports slot restrictions per base type or component category
- Tag taxonomy is fixed enumerations (dietary, protein, regional, occasion) — see below
- Extra compatibility layers: base-type compat + curry incompatibility + mandatory extra category + quantity limits
- Stack: Next.js 16, Dexie.js v4.3.0, Zustand v5, TypeScript, Tailwind v4

**Tag taxonomy (fixed):**
- Dietary (multi-select): `veg` | `non-veg` | `vegan` | `jain` | `eggetarian`
- Protein (single-select, optional): `fish` | `chicken` | `mutton` | `egg` | `paneer` | `dal` | `none`
- Regional (multi-select): `south-indian` | `north-indian` | `coastal-konkan` | `pan-indian`
- Occasion (multi-select): `everyday` | `fasting` | `festive` | `weekend`

**Extra compatibility:**
1. `compatible_base_types: ('rice-based' | 'bread-based' | 'other')[]`
2. `incompatible_curry_categories: string[]` (curry incompatibility)
3. Mandatory extra category per base type — stored in UserPreferences
4. Quantity limits per slot — stored in UserPreferences

**Extra categories (DATA-03):** Liquid | Crunchy | Condiment | Dairy | Sweet

### Claude's Discretion
- Exact Dexie table names and index design
- TypeScript union vs enum for tag values (either works; pick what integrates best with Vercel AI SDK Zod schemas)
- Whether `incompatible_curry_categories` is stored as a free list or references curry entity IDs

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DATA-01 | System supports typed meal components — Base, Curry, Subzi, Extra — where all except Base are optional | TypeScript discriminated union on `componentType` field; separate tables per type OR single `components` table with type discriminator |
| DATA-02 | Each Base has a type tag: `rice-based` \| `bread-based` \| `other` | `base_type` field on Base records only; enforced via TypeScript discriminated union |
| DATA-03 | Extras categorized into fixed types: Liquid, Crunchy, Condiment, Dairy, Sweet | `extra_category` field on Extra records; enforced as string literal union |
| DATA-04 | Each Extra has a `compatible_with` list of Base types | `compatible_base_types` stored as JSON array; multi-entry Dexie index optional for query efficiency |
| DATA-05 | Tag catalog covers: dietary, protein type, regional cuisine, occasion | Four tag arrays per component record; stored as JSON arrays; filterable via in-memory Array methods |
</phase_requirements>

---

## Summary

Phase 1 establishes the TypeScript type system, Dexie.js v4 database schema, and Food DB Service layer that all subsequent phases build on. The project is greenfield — no existing code exists.

The core challenge is modeling a compositional Indian meal data model where components (Base, Curry, Subzi, Extra) are first-class reusable entities with typed constraints, not inline strings. Dexie.js v4 provides the right abstraction: a typed IndexedDB wrapper with a clean `EntityTable<T, K>` pattern for TypeScript and a `useLiveQuery` hook for reactive UI (used in Phase 2+).

The tag taxonomy is fixed and should be modeled as TypeScript string literal unions (not enums) so the values serialize cleanly to JSON and compose naturally with Zod schemas. Tags are stored as JSON arrays in Dexie; filtering happens in application code rather than via IndexedDB indexes — this is correct at this dataset size (hundreds of records). Multi-entry Dexie indexes are used for the `compatible_base_types` array on Extras because it is a direct query criterion during plan generation.

**Primary recommendation:** Single `components` table with a `componentType` discriminator field, four typed tag arrays stored as JSON, and a `UserPreferences` singleton row with a fixed primary key of `'prefs'`. The Food DB Service layer is plain TypeScript async functions (no React dependencies) exported from `src/db/food-db.ts`.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Dexie.js | 4.3.0 | IndexedDB wrapper and ORM | TypeScript-native API, `EntityTable<T,K>` typing, `useLiveQuery` hook for reactive UI, no backend needed |
| TypeScript | 5.9.3 (bundled) | Type safety for schema, services, types | Next.js 16 bundles TS; strict mode catches schema drift at compile time |
| Next.js | 16.2.0 | Project scaffold, App Router | Already decided; establishes the `src/` structure this phase defines |
| Vitest | 4.1.0 | Unit tests for DB service | Faster than Jest in Next.js projects; critical for testing CRUD functions in isolation |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `dexie-react-hooks` | bundled with dexie | `useLiveQuery` hook | Phase 2+ UI components — not needed in Phase 1 itself |
| Zod | latest | Schema validation | Phase 3+ (rule compilation); define Zod schemas alongside TypeScript types from the start to avoid drift |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| String literal union types | TypeScript `enum` | Enums don't serialize to plain strings by default (numeric enums), require extra Zod handling, and add compiled JS overhead. String literal unions (`type BaseType = 'rice-based' | 'bread-based' | 'other'`) serialize cleanly to JSON and work directly with `z.enum([...])`. **Use string literals.** |
| Single `components` table with `componentType` | Separate tables per type | Separate tables would require separate CRUD functions per type and make cross-type queries impossible. Single table with discriminator is correct when components share most fields. |
| JSON array for tags | Separate tag junction table | At hundreds of records, in-memory filtering after `.toArray()` is instant. Junction tables add join complexity Dexie doesn't simplify. JSON arrays are the right choice. |

**Installation (for Phase 1):**
```bash
npm install dexie
npm install -D vitest @vitest/ui
```

**Version verification (confirmed 2026-03-19):**
```
dexie:          4.3.0  (npm registry, published 2026-03-18)
zustand:        5.0.12 (npm registry)
vitest:         4.1.0  (npm registry)
typescript:     5.9.3  (npm registry)
next:           16.2.0 (npm registry)
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── types/                  # TypeScript types — no runtime code
│   ├── component.ts        # MealComponent discriminated union
│   ├── meal.ts             # Meal record type (plan slot)
│   ├── rule.ts             # NLRule, CompiledFilter (stubs for Phase 3)
│   └── preferences.ts      # UserPreferences type
│
├── db/                     # Dexie schema + singleton client
│   ├── client.ts           # Dexie class instance (THE singleton export)
│   └── schema.ts           # Table interfaces (mirrors types/ but Dexie-flattened)
│
└── services/               # Business logic — pure TypeScript, no React
    └── food-db.ts          # CRUD functions for components and meals
```

The `types/` directory defines domain types. The `db/` directory defines the Dexie schema (which may flatten some types for IndexedDB storage). The `services/food-db.ts` is the only file the rest of the app imports for data operations.

### Pattern 1: Dexie v4 Singleton with EntityTable

**What:** One Dexie instance exported from `src/db/client.ts`. All tables are typed via `EntityTable<T, PrimaryKeyField>`. No class inheritance required in v4.

**When to use:** Always. Never instantiate Dexie per-component or per-request.

```typescript
// Source: https://old.dexie.org/docs/Tutorial/React (verified 2026-03-19)
// src/db/client.ts

import Dexie, { type EntityTable } from 'dexie';
import type { ComponentRecord, MealRecord, RuleRecord, SavedPlanRecord, UserPreferencesRecord } from './schema';

const db = new Dexie('FoodPlannerDB') as Dexie & {
  components:     EntityTable<ComponentRecord,    'id'>;
  meals:          EntityTable<MealRecord,         'id'>;
  meal_extras:    EntityTable<MealExtraRecord,    'meal_id'>; // composite PK needs care
  rules:          EntityTable<RuleRecord,         'id'>;
  saved_plans:    EntityTable<SavedPlanRecord,    'id'>;
  preferences:    EntityTable<UserPreferencesRecord, 'id'>;
};

db.version(1).stores({
  components:  '++id, componentType, base_type, extra_category, *dietary_tags, *regional_tags, *occasion_tags',
  meals:       '++id, base_id, curry_id, subzi_id',
  meal_extras: '[meal_id+component_id], meal_id, component_id',
  rules:       '++id, is_active',
  saved_plans: '++id',
  preferences: 'id',   // fixed key 'prefs', no auto-increment
});

export { db };
```

### Pattern 2: Schema String Syntax Reference

**What:** Dexie `stores()` uses a compact string syntax. Only indexed fields appear here — non-indexed fields are stored but not queryable via `where()`.

```
++keyPath      Auto-increment primary key (visible on object)
++             Auto-increment primary key (hidden)
keyPath        Manually assigned primary key
(blank)        Hidden, non-auto-increment primary key
&keyPath       Unique index (unique constraint)
*keyPath       Multi-entry index (for array properties — indexes each element)
[a+b]          Compound index on two fields
```

**Full example for this project:**
```typescript
// stores() schema strings for FoodPlannerDB
{
  // components: index type, base_type (for Bases only), extra_category (for Extras),
  //             multi-entry on the three multi-select tag arrays
  components:  '++id, componentType, base_type, extra_category, *dietary_tags, *regional_tags, *occasion_tags',

  // meals: index foreign keys for efficient lookups during generation
  meals:       '++id, base_id, curry_id, subzi_id',

  // meal_extras: compound primary key on (meal_id, component_id)
  meal_extras: '[meal_id+component_id], meal_id, component_id',

  // rules: index is_active to quickly load active rules at generation time
  rules:       '++id, is_active',

  // saved_plans: no secondary index needed (full scan on small table is fine)
  saved_plans: '++id',

  // preferences: singleton — use fixed string key 'prefs', no auto-increment
  preferences: 'id',
}
```

**Important:** Only fields listed in the schema string are indexed. All other fields on the stored object are saved and retrievable but cannot be used in `where()` queries. This is fine for tags stored as JSON arrays — filter them in application code.

### Pattern 3: TypeScript Type Design for Components

**What:** A single `ComponentRecord` type with a `componentType` discriminator. TypeScript discriminated unions provide type narrowing. Dexie stores as flat records.

```typescript
// src/types/component.ts

// Base types — locked decision, DATA-02
export type BaseType = 'rice-based' | 'bread-based' | 'other';

// Extra categories — DATA-03
export type ExtraCategory = 'liquid' | 'crunchy' | 'condiment' | 'dairy' | 'sweet';

// Component type discriminator
export type ComponentType = 'base' | 'curry' | 'subzi' | 'extra';

// Tag string literal unions — DATA-05
export type DietaryTag  = 'veg' | 'non-veg' | 'vegan' | 'jain' | 'eggetarian';
export type ProteinTag  = 'fish' | 'chicken' | 'mutton' | 'egg' | 'paneer' | 'dal' | 'none';
export type RegionalTag = 'south-indian' | 'north-indian' | 'coastal-konkan' | 'pan-indian';
export type OccasionTag = 'everyday' | 'fasting' | 'festive' | 'weekend';

// Shared base for all components
interface BaseComponentRecord {
  id?: number;                         // auto-assigned by Dexie
  name: string;
  componentType: ComponentType;
  dietary_tags:  DietaryTag[];
  protein_tag?:  ProteinTag;           // single-select, optional
  regional_tags: RegionalTag[];
  occasion_tags: OccasionTag[];
  notes?: string;
  created_at: string;
}

// Discriminated types for type-narrowing in application code
export interface BaseRecord extends BaseComponentRecord {
  componentType: 'base';
  base_type: BaseType;                 // DATA-02 — required for Bases
}

export interface CurryRecord extends BaseComponentRecord {
  componentType: 'curry';
  curry_category?: string;             // optional free-text category
}

export interface SubziRecord extends BaseComponentRecord {
  componentType: 'subzi';
  compatible_base_types?: BaseType[];  // "beans poriyal is only for rice"
}

export interface ExtraRecord extends BaseComponentRecord {
  componentType: 'extra';
  extra_category: ExtraCategory;       // DATA-03 — required
  compatible_base_types: BaseType[];   // DATA-04 — required, drives plan generation
  incompatible_curry_categories?: string[];  // curry incompatibility (free list)
}

// Union type for use in application code
export type MealComponent = BaseRecord | CurryRecord | SubziRecord | ExtraRecord;

// Flat record for Dexie storage — all fields merged, optionals for type-specific fields
export type ComponentRecord = BaseComponentRecord & {
  base_type?: BaseType;
  curry_category?: string;
  compatible_base_types?: BaseType[];
  extra_category?: ExtraCategory;
  incompatible_curry_categories?: string[];
};
```

**Note on JSON arrays in Dexie:** Fields typed as arrays (`dietary_tags`, `regional_tags`, etc.) are stored as JSON. Dexie handles serialization automatically. The multi-entry index (`*dietary_tags`) allows `where('dietary_tags').equals('veg')` but the protein_tag (single-select) uses a plain index.

### Pattern 4: Meal Record Design

```typescript
// src/types/meal.ts

export interface MealRecord {
  id?: number;
  name?: string;                      // optional display name
  base_id: number;                    // required — FK to components
  curry_id?: number;                  // optional
  subzi_id?: number;                  // optional
  created_at: string;
}

// meal_extras junction: many-to-many meal → extra components
export interface MealExtraRecord {
  meal_id: number;
  component_id: number;
}
```

### Pattern 5: UserPreferences Singleton

**What:** Single row in `preferences` table with fixed string key `'prefs'`. Use `db.preferences.put()` to upsert, `db.preferences.get('prefs')` to read.

```typescript
// src/types/preferences.ts

export interface SlotRestrictions {
  // base_type → which slots it can appear in
  base_type_slots: Partial<Record<BaseType, MealSlot[]>>;
  // component_id overrides (specific component locked to slot)
  component_slot_overrides: Record<number, MealSlot[]>;
}

export type MealSlot = 'breakfast' | 'lunch' | 'dinner';

export interface BaseTypeRule {
  base_type: BaseType;
  required_extra_category?: ExtraCategory;  // "idli/dosa always needs condiment"
}

export interface UserPreferencesRecord {
  id: 'prefs';                               // fixed key — singleton pattern
  slot_restrictions: SlotRestrictions;
  extra_quantity_limits: Record<MealSlot, number>;  // max extras per slot
  base_type_rules: BaseTypeRule[];           // mandatory extra rules per base type
}
```

**Read/write pattern:**
```typescript
// Read
const prefs = await db.preferences.get('prefs');

// Write (upsert)
await db.preferences.put({
  id: 'prefs',
  slot_restrictions: { base_type_slots: {}, component_slot_overrides: {} },
  extra_quantity_limits: { breakfast: 1, lunch: 3, dinner: 2 },
  base_type_rules: [],
});
```

### Pattern 6: Food DB Service Layer

**What:** Plain async TypeScript functions in `src/services/food-db.ts`. No React, no hooks. Every operation either returns a typed value or throws. All callers handle errors.

```typescript
// src/services/food-db.ts

import { db } from '../db/client';
import type { ComponentRecord, MealComponent, BaseType } from '../types/component';
import type { MealRecord } from '../types/meal';

// --- Components ---

export async function getAllComponents(): Promise<ComponentRecord[]> {
  return db.components.toArray();
}

export async function getComponentsByType(type: ComponentType): Promise<ComponentRecord[]> {
  return db.components.where('componentType').equals(type).toArray();
}

export async function getExtrasByBaseType(baseType: BaseType): Promise<ComponentRecord[]> {
  return db.components
    .where('componentType').equals('extra')
    .toArray()
    .then(extras => extras.filter(e =>
      (e.compatible_base_types ?? []).includes(baseType)
    ));
}

export async function addComponent(component: Omit<ComponentRecord, 'id'>): Promise<number> {
  return db.components.add({ ...component, created_at: new Date().toISOString() });
}

export async function updateComponent(id: number, changes: Partial<ComponentRecord>): Promise<void> {
  await db.components.update(id, changes);
}

export async function deleteComponent(id: number): Promise<void> {
  await db.components.delete(id);
}

// --- Meals ---

export async function getAllMeals(): Promise<MealRecord[]> {
  return db.meals.toArray();
}

export async function addMeal(meal: Omit<MealRecord, 'id'>, extraIds: number[]): Promise<number> {
  return db.transaction('rw', db.meals, db.meal_extras, async () => {
    const mealId = await db.meals.add({ ...meal, created_at: new Date().toISOString() });
    if (extraIds.length > 0) {
      await db.meal_extras.bulkAdd(extraIds.map(eid => ({ meal_id: mealId, component_id: eid })));
    }
    return mealId;
  });
}

export async function deleteMeal(id: number): Promise<void> {
  return db.transaction('rw', db.meals, db.meal_extras, async () => {
    await db.meal_extras.where('meal_id').equals(id).delete();
    await db.meals.delete(id);
  });
}

export async function getMealExtras(mealId: number): Promise<ComponentRecord[]> {
  const links = await db.meal_extras.where('meal_id').equals(mealId).toArray();
  const ids = links.map(l => l.component_id);
  return db.components.bulkGet(ids).then(r => r.filter(Boolean) as ComponentRecord[]);
}
```

### Anti-Patterns to Avoid

- **Storing tags as comma-separated strings:** `LIKE '%veg%'` matches `non-veg`. Use JSON arrays and filter in app code.
- **Putting business logic in Dexie schema:** The schema is for storage and indexing only. Rules about what makes a valid Extra pairing live in `food-db.ts` and `preferences`.
- **Calling `useLiveQuery` outside a Client Component:** In Next.js App Router, `useLiveQuery` requires `'use client'`. Put Dexie hooks only in client components; the service layer (`food-db.ts`) uses raw `await` calls and is callable from anywhere.
- **Creating Dexie instance per module:** One exported singleton from `src/db/client.ts`. Multiple Dexie instances pointing at the same DB will cause version conflicts.
- **Putting the Dexie import in Server Components:** IndexedDB is browser-only. Any file that imports `dexie` must be a client module or called from one. Keep `db/client.ts` import-free from server-side paths.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| IndexedDB transactions | Manual IDBTransaction | `db.transaction('rw', ...)` | Dexie handles abort/rollback; raw IndexedDB transaction API is error-prone and verbose |
| Schema migrations | Manual `onupgradeneeded` | `db.version(N).stores(...).upgrade(tx => ...)` | Dexie manages version gating; raw upgrade callbacks fire non-deterministically |
| Reactive data fetching | Manual IndexedDB event listeners | `useLiveQuery(() => db.table.toArray())` | Dexie's liveQuery tracks which tables were read and re-runs the query on any mutation to those tables |
| Array containment queries | Scanning all records | Multi-entry index `*compatible_base_types` + `.where().equals()` | At scale, index-based lookup is O(log n); full scan is O(n) |
| JSON tag serialization | `JSON.stringify` / `JSON.parse` everywhere | Dexie handles automatically | Dexie serializes object properties; arrays round-trip correctly |

**Key insight:** IndexedDB's raw API is one of the most complex browser APIs. Dexie removes ~80% of the boilerplate while keeping the full power of versioned schemas and transactions. Never bypass it with raw `window.indexedDB` calls.

---

## Common Pitfalls

### Pitfall 1: Dexie Imports Break SSR in Next.js App Router
**What goes wrong:** Importing `dexie` in any module that gets bundled for the server throws `ReferenceError: indexedDB is not defined` at build or runtime.
**Why it happens:** IndexedDB is a browser API. Next.js App Router Server Components run on Node.js.
**How to avoid:** Mark any component that uses `useLiveQuery` or imports from `db/client.ts` with `'use client'` at the top. For Phase 1 (no UI), this is not yet an issue — but structure `db/client.ts` so it is never inadvertently imported by a Server Component.
**Warning signs:** Build error `ReferenceError: indexedDB is not defined` or `window is not defined`.

### Pitfall 2: Compound Primary Key on `meal_extras` Requires Explicit Handling
**What goes wrong:** Dexie's `EntityTable<T, K>` assumes a single-field primary key. Using `[meal_id+component_id]` as PK means `.get()` requires `[mealId, componentId]` array syntax, not a plain ID.
**Why it happens:** Compound keys in IndexedDB use an array as the key.
**How to avoid:** In `meal_extras`, use `where('meal_id').equals(mealId)` for filtering. Use `bulkAdd` for insertion. Avoid using `.get()` on this table directly.
**Warning signs:** Type errors on `db.meal_extras.get(...)` call signatures.

### Pitfall 3: Multi-Entry Index Limitation — Cannot Combine with Other Index Filters
**What goes wrong:** `db.components.where('*dietary_tags').equals('veg').and(r => r.regional_tags.includes('south-indian'))` works, but chaining two `where()` clauses on two multi-entry indexes does not (IndexedDB limitation).
**Why it happens:** IndexedDB only allows one active cursor index per query. Multi-entry indexes can be used for `where().equals()` but cannot be AND-combined with other indexes at the DB level.
**How to avoid:** Filter the first (most selective) tag with `where().equals()` to get a candidate set, then apply further tag filters in JavaScript using `.filter()`. This is the standard pattern for this dataset size.
**Warning signs:** Query returns unexpected results or throws when trying to chain two multi-entry `where()` clauses.

### Pitfall 4: Forgetting to Wrap Multi-Table Writes in a Transaction
**What goes wrong:** Adding a meal and its extras in separate `await` calls — if the extras insert fails, the meal record is orphaned.
**Why it happens:** IndexedDB operations are individually atomic but not grouped across calls without an explicit transaction.
**How to avoid:** Always use `db.transaction('rw', db.meals, db.meal_extras, async () => { ... })` for any write that touches multiple tables.
**Warning signs:** Orphaned meal records with no corresponding `meal_extras` rows.

### Pitfall 5: Protein Tag Is Single-Select But Stored Differently from Multi-Select Tags
**What goes wrong:** Treating `protein_tag` the same as `dietary_tags` array — if stored as an array, multi-entry index semantics are wrong for a single value.
**Why it happens:** Protein is single-select (one per component) while dietary/regional/occasion are multi-select.
**How to avoid:** Store `protein_tag` as a plain string field (not an array). Index it as a plain index, not `*protein_tag`. Query via `where('protein_tag').equals('fish')`.
**Warning signs:** Type definitions allow `protein_tag` to be an array when it should be a scalar.

### Pitfall 6: `preferences` Table Initialization
**What goes wrong:** Reading `await db.preferences.get('prefs')` on first app load returns `undefined` because the row has never been written.
**Why it happens:** The singleton row doesn't exist until first write.
**How to avoid:** In the app initialization sequence (Next.js root layout or db setup function), check if preferences exist and `put()` the default record if not. This is a one-time setup, not an ongoing concern.
**Warning signs:** `prefs` returns `undefined`, causing null pointer errors downstream.

---

## Code Examples

Verified patterns from official sources and community documentation:

### Define Dexie v4 Schema with EntityTable
```typescript
// Source: https://old.dexie.org/docs/Tutorial/React (official Dexie docs)
import Dexie, { type EntityTable } from 'dexie';

const db = new Dexie('FoodPlannerDB') as Dexie & {
  friends: EntityTable<Friend, 'id'>;
};

db.version(1).stores({
  friends: '++id, name, age',
});

export { db };
```

### Multi-Entry Index for Tag Filtering
```typescript
// Schema (from Dexie.js MultiEntry-Index docs, confirmed via WebSearch 2026-03-19)
db.version(1).stores({
  components: '++id, componentType, *dietary_tags',
});

// Query — finds all components tagged 'veg'
const vegComponents = await db.components
  .where('dietary_tags').equals('veg')
  .toArray();

// Query — finds components tagged any of multiple values
const filtered = await db.components
  .where('dietary_tags').anyOf('veg', 'vegan')
  .distinct()
  .toArray();
```

### useLiveQuery in a Client Component
```typescript
// Source: https://old.dexie.org/docs/Tutorial/React (official Dexie docs)
'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/client';

export function ComponentList() {
  const components = useLiveQuery(
    () => db.components.where('componentType').equals('base').toArray(),
    []
  );

  if (!components) return <div>Loading...</div>;
  return <ul>{components.map(c => <li key={c.id}>{c.name}</li>)}</ul>;
}
```

### Transactional Multi-Table Write
```typescript
// Dexie transaction pattern — ensures atomicity across tables
const mealId = await db.transaction('rw', db.meals, db.meal_extras, async () => {
  const id = await db.meals.add({
    name: 'South Indian Lunch',
    base_id: 1,
    curry_id: 5,
    created_at: new Date().toISOString(),
  });
  await db.meal_extras.bulkAdd([
    { meal_id: id, component_id: 10 }, // rasam
    { meal_id: id, component_id: 11 }, // pappad
  ]);
  return id;
});
```

### Schema Version Upgrade Pattern
```typescript
// Add a new field to existing records in a schema migration
db.version(2)
  .stores({ components: '++id, componentType, base_type, extra_category, *dietary_tags, *regional_tags, *occasion_tags' })
  .upgrade(tx => {
    return tx.table('components').toCollection().modify(component => {
      if (!component.occasion_tags) {
        component.occasion_tags = ['everyday'];
      }
    });
  });
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `class AppDB extends Dexie` with constructor | `new Dexie(...) as Dexie & { table: EntityTable<T, K> }` (non-class singleton) | Dexie v4 (2024) | Simpler, no constructor ceremony; both patterns still valid |
| `Table<T, TKey>` typing | `EntityTable<T, 'keyField'>` typing | Dexie v4 | `EntityTable` ensures the key field is typed as required on the object |
| `dexie-react-hooks` as separate package | `dexie-react-hooks` still separate but ships with Dexie | Dexie v4 | Import `useLiveQuery` from `dexie-react-hooks`; `useSuspendingLiveQuery` is v4 experimental |
| Manual JSON serialization of arrays | Dexie handles object serialization automatically | Always | Don't `JSON.stringify` before `put()` — Dexie serializes the whole object |

**Deprecated / outdated:**
- `Table.defineClass()`: Old pattern for mapping table rows to class instances. Not needed in v4 with `EntityTable`.
- `dexie-react-hooks@<1.1.3`: Had SSR issues with Next.js. Current version (bundled with Dexie v4) works correctly with `'use client'` directive.

---

## Open Questions

1. **`incompatible_curry_categories` — free list vs curry entity IDs**
   - What we know: The decision is Claude's discretion. Free-text category strings are simpler; entity ID references allow stricter validation.
   - What's unclear: Whether Phase 3 (generator) will need to query "all extras incompatible with curry X" at generation time.
   - Recommendation: Use free-text category strings for Phase 1. A string like `'liquid'` is both human-readable and queryable via in-memory filter. Entity ID references add coupling without query benefit at this dataset size.

2. **`subzi.compatible_base_types` — needed or not?**
   - What we know: CONTEXT.md example says "beans poriyal is only for rice" — suggesting Subzi also carries base-type compatibility. DATA-04 specifically mentions Extras, not Subzis.
   - What's unclear: Whether the planner needs `compatible_base_types` on Subzi as well as Extra.
   - Recommendation: Add `compatible_base_types?: BaseType[]` as an optional field on Subzi records. Zero cost to add now; costly to add later if generator already depends on the schema.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `vitest.config.ts` — does not yet exist (Wave 0 gap) |
| Quick run command | `npx vitest run src/services/` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-01 | `addComponent()` stores Base/Curry/Subzi/Extra with correct `componentType`; `getComponentsByType()` returns only the requested type | unit | `npx vitest run src/services/food-db.test.ts -t "componentType"` | ❌ Wave 0 |
| DATA-02 | Base records have `base_type` field; non-Base records do not require it; TypeScript enforces at compile time | unit (type check + runtime) | `npx vitest run src/services/food-db.test.ts -t "base_type"` | ❌ Wave 0 |
| DATA-03 | Extra records have `extra_category` in `['liquid','crunchy','condiment','dairy','sweet']`; missing category is rejected | unit | `npx vitest run src/services/food-db.test.ts -t "extra_category"` | ❌ Wave 0 |
| DATA-04 | `getExtrasByBaseType('rice-based')` returns only Extras whose `compatible_base_types` includes `'rice-based'` | unit | `npx vitest run src/services/food-db.test.ts -t "compatible_base_types"` | ❌ Wave 0 |
| DATA-05 | Components can be stored with all four tag arrays; `getComponentsByType()` returns components with correct tag structure | unit | `npx vitest run src/services/food-db.test.ts -t "tags"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/services/food-db.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/services/food-db.test.ts` — covers DATA-01 through DATA-05; needs fake-indexeddb for in-process testing
- [ ] `vitest.config.ts` — project root; configure jsdom environment for IndexedDB tests
- [ ] `package.json` test script — `"test": "vitest run"`
- [ ] Install: `npm install -D vitest @vitest/ui fake-indexeddb` — `fake-indexeddb` is required for testing Dexie outside a browser (no real IndexedDB in Node.js/Vitest)

**Critical:** Dexie tests require `fake-indexeddb`. Without it, every `db.*` call throws because Node.js has no IndexedDB. Set it up in `vitest.config.ts`:
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
  },
});

// src/test/setup.ts
import 'fake-indexeddb/auto';
```

---

## Sources

### Primary (HIGH confidence)
- [Dexie.js npm registry](https://www.npmjs.com/package/dexie) — v4.3.0 confirmed, published 2026-03-18
- [Dexie.js React Tutorial (official)](https://old.dexie.org/docs/Tutorial/React) — EntityTable pattern, useLiveQuery usage
- [Version.stores() GitHub Wiki (archived)](https://github.com/dexie/Dexie.js/wiki/Version.stores()/ab882ff1e53aed5c0d948cd24bbd5f5226b3c281) — complete schema string syntax
- [Next.js 16.2.0 npm registry](https://www.npmjs.com/package/next) — version confirmed
- [Vitest npm registry](https://www.npmjs.com/package/vitest) — v4.1.0 confirmed

### Secondary (MEDIUM confidence)
- [LogRocket: Dexie.js in React apps](https://blog.logrocket.com/dexie-js-indexeddb-react-apps-offline-data-storage/) — CRUD patterns, useLiveQuery usage verified against official docs
- [WebSearch: Dexie EntityTable TypeScript singleton pattern](https://dexie.org/docs/Typescript) — EntityTable pattern confirmed from multiple sources
- [WebSearch: Multi-entry index query patterns](https://dexie.org/docs/MultiEntry-Index) — `.where().equals()` and `.anyOf().distinct()` patterns
- [WebSearch: Compound Index syntax](https://dexie.org/docs/Compound-Index) — `[a+b]` notation confirmed
- [WebSearch: Dexie private singleton IDs](https://dexie.org/cloud/docs/consistency) — fixed string key pattern for singleton rows
- [fake-indexeddb npm](https://www.npmjs.com/package/fake-indexeddb) — standard approach for testing Dexie in Node.js (multiple community sources agree)

### Tertiary (LOW confidence)
- WebSearch: Next.js App Router project structure patterns 2025 — used for `src/` layout rationale; not authoritative but consistent across multiple sources

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions confirmed via npm registry on 2026-03-19
- Dexie schema API: HIGH — schema string syntax verified via official archived wiki; EntityTable pattern verified via official React tutorial
- Architecture patterns: HIGH — Dexie singleton, transaction pattern, multi-entry index behavior all verified from official sources
- TypeScript type design: HIGH — string literal unions, discriminated union pattern are well-established TypeScript idioms
- Pitfalls: MEDIUM-HIGH — SSR pitfall and transaction pitfall are confirmed from official sources; multi-entry limitation from official GitHub issues
- Test setup (fake-indexeddb): MEDIUM — widely used pattern confirmed from multiple community sources; official Dexie docs do not prescribe a specific test setup

**Research date:** 2026-03-19
**Valid until:** 2026-06-19 (Dexie v4 is stable; Next.js 16 is current; low churn expected)
