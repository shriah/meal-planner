# Phase 3: Plan Generator + Rule Engine - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement two pure back-end services with no UI:

1. **Plan Generator** — A synchronous TypeScript function that reads the component pool, user preferences (slot restrictions), and compiled rules from Dexie, then produces a full 7-day × 3-slot (21-slot) `WeeklyPlan` with recency-weighted randomization and rule enforcement. Returns `{ plan, warnings: Warning[] }`.

2. **Rule Engine (compile side)** — A local TypeScript function that takes a `RuleDefinition` (structured form data from Phase 5 UI) and converts it directly to a `CompiledFilter` JSON record, stored in the `rules` Dexie table. **No LLM involved at any point in Phase 3.** Generation is fully synchronous and network-free.

Phase 4 calls the generator. Phase 5 calls the rule compiler (compile side). This phase delivers only the services and their unit tests — no UI.

</domain>

<decisions>
## Implementation Decisions

### LLM: Removed entirely
- **No LLM in Phase 3 or in the rule engine at all.** The original design used Claude API to translate natural language rules into CompiledFilter JSON. This is removed.
- The rule compiler is a pure local TypeScript function that accepts structured `RuleDefinition` input (produced by the Phase 5 form UI) and emits `CompiledFilter` JSON.
- LLM natural-language rule parsing is an **optional Phase 5 enhancement** only — it can be layered on top of the structured form if desired, but is not required.
- This removes the Anthropic API dependency, makes the app work offline, and makes rule compilation instant and deterministic.

### CompiledFilter DSL structure
Rules are stored as typed discriminated union objects. Each rule is one object; multiple rules live as an array in the `rules` Dexie table.

**Three rule types:**

```typescript
type CompiledFilter =
  | DayFilterRule
  | NoRepeatRule
  | RequireComponentRule

interface DayFilterRule {
  type: 'day-filter'
  days: DayOfWeek[]          // ['monday', 'friday', ...] — which days this applies to
  slots: MealSlot[] | null   // null = all three slots; or ['breakfast'] for slot-specific
  filter: TagFilter          // what to require on selected components
}

interface NoRepeatRule {
  type: 'no-repeat'
  component_type: 'base' | 'curry' | 'subzi'  // which component type to deduplicate
  within: 'week'             // current week only (cross-week is v2)
}

interface RequireComponentRule {
  type: 'require-component'
  component_id: number       // specific component to assign
  days: DayOfWeek[]
  slots: MealSlot[] | null   // null = all slots on those days
}

interface TagFilter {
  dietary_tag?: DietaryTag   // e.g., 'vegan', 'non-veg'
  protein_tag?: ProteinTag   // e.g., 'fish', 'chicken'
  regional_tag?: RegionalTag // e.g., 'south-indian'
  occasion_tag?: OccasionTag // e.g., 'fasting', 'festive'
}
```

- Day + slot are independent targeting axes: a rule can target a specific day + all slots, or a specific day + specific slot
- Tag filters use AND logic within a single filter object (all specified tags must match)
- Multiple rules in the array are evaluated independently per slot (a slot must satisfy ALL active rules that apply to it)

### CompiledFilter storage
- Stored in the existing `rules` Dexie table (already in Phase 1 schema)
- Each row: `{ id, name, enabled, compiled_filter: CompiledFilter, created_at }`
- Generator queries only `enabled: true` rules at generation time
- The `enabled` flag lets users toggle rules without deleting them

### No-repeat rotation scope
- Tracks **Subzi, Curry, and Base** component types for within-week deduplication
- **Within current week only** — the 7-day plan being generated
- Cross-week rotation (avoid repeating across consecutive weeks) is a v2 requirement
- No-repeat is enforced by tracking assigned component IDs during the generation pass

### Component frequency preference
- Add a `frequency: 'frequent' | 'normal' | 'rare'` field to `ComponentRecord`
- Default: `'normal'`
- Maps to weights: `frequent = 3`, `normal = 1`, `rare = 0.3`
- Used as the base weight before recency adjustment

### Generation algorithm
**Slot fill order:** All 7 breakfasts first, then all 7 lunches, then all 7 dinners (Mon→Sun within each meal type). This makes within-slot-type no-repeat rules trivial to enforce.

**Weight computation per candidate component:**
```
effective_weight = frequency_weight × recency_multiplier
frequency_weight = 3 (frequent) | 1 (normal) | 0.3 (rare)
recency_multiplier = 0.5 ^ (times_used_so_far_this_week)
```
Each time a component is assigned to any slot in the current plan, its recency multiplier halves for all subsequent slot assignments.

**Selection:** Weighted random sample from the filtered + weighted pool.

**For each slot, the generator:**
1. Determines eligible base types from `UserPreferences.slot_restrictions` (base_type_slots + component_slot_overrides)
2. Filters components by eligible base types and applicable `CompiledFilter` rules for this day+slot
3. Applies frequency × recency weights to remaining candidates
4. Picks one via weighted random
5. Selects compatible Curry (filtered by active rules, weighted random)
6. Selects compatible Subzi (filtered by active rules + no-repeat tracking, weighted random)
7. Selects compatible Extras (filtered by `compatible_base_types`, respecting `extra_quantity_limits` from preferences)

### Over-constrained handling
- **Strategy:** Pick the least-constrained candidate — the component with the most rules satisfied (or fewest violated) — rather than failing or leaving the slot empty
- **Slot restrictions are hard constraints** (never relaxed) — if no base type is eligible for a slot due to preferences, that's a configuration error
- **Rules are soft constraints** — when no candidate satisfies all active rules, score candidates by partial rule satisfaction and pick the highest-scoring one
- **Return value:** Generator always returns `{ plan: WeeklyPlan, warnings: Warning[] }`
- `Warning` shape: `{ slot: { day, meal_slot }, rule_id: number, message: string }` — identifies which slot had an issue and which rule was violated/relaxed
- Phase 4 UI decides how to display warnings (banner, slot highlight, toast — not Phase 3's concern)

### Generator return type
```typescript
interface WeeklyPlan {
  slots: PlanSlot[]  // 21 entries
}

interface PlanSlot {
  day: DayOfWeek
  meal_slot: MealSlot
  base_id: number
  curry_id?: number
  subzi_id?: number
  extra_ids: number[]
}

interface Warning {
  slot: { day: DayOfWeek; meal_slot: MealSlot }
  rule_id: number | null  // null = slot restriction issue
  message: string
}

interface GeneratorResult {
  plan: WeeklyPlan
  warnings: Warning[]
}
```

### Test coverage requirement
- Unit test suite of 20+ cases covering:
  - All 3 rule types (day-filter, no-repeat, require-component)
  - Extra compatibility (Rasam never with roti-based)
  - Mandatory extras (idli/dosa must have a condiment)
  - Over-constrained scenarios (warnings returned, slot filled)
  - Frequency weighting (frequent components appear more often across N runs)
  - Recency halving (same component less likely after first use)
  - Generation completes in under 500ms for a full 21-slot plan

### Claude's Discretion
- Exact Zod schema for CompiledFilter types (for runtime validation of rule records)
- Whether weighted random uses reservoir sampling or a cumulative probability approach
- Test fixture design (mocked Dexie vs. real fake-indexeddb)
- File structure: one `generator.ts` + one `rule-compiler.ts`, or a single `plan-engine.ts`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Data types (Phase 1 contracts)
- `src/types/component.ts` — `ComponentRecord`, `BaseType`, `ExtraCategory`, `DietaryTag`, `ProteinTag`, `RegionalTag`, `OccasionTag`. Generator filters components using these types.
- `src/types/preferences.ts` — `UserPreferencesRecord`, `SlotRestrictions`, `MealSlot`, `BaseTypeRule`, `extra_quantity_limits`. Generator reads preferences to determine slot eligibility and extra limits.
- `src/types/meal.ts` — `MealRecord`, `MealExtraRecord`. The generator's output maps to these (or a new `PlanSlot` type that supersedes them).
- `src/db/client.ts` — Dexie schema. `rules` table already exists. Generator reads `components`, `preferences`, and `rules` tables.
- `src/services/food-db.ts` — All existing CRUD functions. Generator should use `getAllComponents`, `getExtrasByBaseType`, `getPreferences` rather than calling Dexie directly.

### Requirements (Phase 3 scope)
- `.planning/REQUIREMENTS.md` — PLAN-01, PLAN-04, RULE-02, RULE-03, RULE-04 are the acceptance criteria for this phase
- `.planning/ROADMAP.md` — Phase 3 success criteria

### Prior context
- `.planning/phases/01-data-foundation/01-CONTEXT.md` — Extra compatibility rules (base-type compat, curry incompatibility, mandatory extras, quantity limits). Generator must enforce all four layers.
- `.planning/phases/02-meal-library-ui/02-CONTEXT.md` — Slot assignment decisions (base_type_slots grid + component_slot_overrides). Generator reads these from UserPreferences.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/services/food-db.ts` — `getAllComponents()`, `getExtrasByBaseType(baseType)`, `getPreferences()`. Generator should call these rather than touching Dexie directly.
- `src/db/client.ts` — `db.rules` table exists (from Phase 1 schema). Phase 3 adds `getRules()` / `addRule()` / `updateRule()` / `deleteRule()` to `food-db.ts`, then the generator calls `getRules()`.
- `src/test/` — `fake-indexeddb` already set up for browser-free Dexie testing. Generator tests can reuse this pattern.
- `src/lib/filter-components.ts` — Existing filter logic for the component library UI. May contain reusable predicate patterns (tag matching via `.every()`).

### Established Patterns
- **No React in service layer** — generator and rule compiler are pure `async` TypeScript functions, no hooks, no JSX. Callable from server components, API routes, or client code.
- **String literal unions for all tags** — matches Dexie index format and existing type definitions.
- **`useLiveQuery` for reactive reads** — not relevant to Phase 3 (generator is a one-shot call), but Phase 4 will use it to subscribe to plan state.

### Integration Points
- Phase 4 Plan Board UI will `import { generate } from '@/services/generator'` (or similar) and call it on mount and on "Regenerate" button press.
- Phase 5 Rule Manager UI will `import { compileRule } from '@/services/rule-compiler'` when saving a rule form.
- The `frequency` field added to `ComponentRecord` requires a Dexie schema migration or a default value fallback in the generator (read `component.frequency ?? 'normal'`).

</code_context>

<specifics>
## Specific Ideas

- **`frequency` field on ComponentRecord** — needs to be added to the type and handled in the component library UI edit form (Phase 2 enhancement or Phase 3 adds it). Generator reads `component.frequency ?? 'normal'` as a safe fallback.
- **Slot fill order rationale** — breakfasts-first (then lunches, then dinners) makes it easy to track "has this subzi appeared in any breakfast this week" without cross-slot-type lookups.
- **No-repeat enforcement** — maintain a `Set<number>` per component type during the generation pass: `usedSubziIds`, `usedCurryIds`, `usedBaseIds`. Filter these out of candidates before weighting.
- **Required extras for idli/dosa** — `BaseTypeRule.required_extra_category` in preferences says `other` base type needs at least one `condiment`. Generator must check this and add a condiment extra even if the quantity limit would otherwise allow zero.

</specifics>

<deferred>
## Deferred Ideas

- **LLM natural language rule parsing** — Optional Phase 5 enhancement. The structured rule builder in Phase 5 can optionally send user's English text to Claude API and auto-fill the form fields. Not needed for Phase 3 or Phase 5 baseline.
- **Cross-week rotation rules** — "Don't repeat the same subzi across consecutive weeks." Requires reading saved plan history at generation time. Deferred to v2 (RULE-07).
- **User-assigned numeric weights (1–10)** — The 3-level `frequent/normal/rare` covers the use case. Fine-grained numeric weights deferred to v2.
- **Seasonal/occasion rules** — "During Navratri, only veg." Would be a new `occasion-filter` rule type. Deferred to v2 (RULE-06).

</deferred>

---

*Phase: 03-plan-generator-rule-engine*
*Context gathered: 2026-03-20*
