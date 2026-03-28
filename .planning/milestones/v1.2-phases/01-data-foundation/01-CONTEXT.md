# Phase 1: Data Foundation - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish the typed meal data model, Dexie database schema, and Food DB Service layer. This phase delivers the foundation — TypeScript types, DB tables, and CRUD functions — that every subsequent phase builds on. No UI. No generation logic. No LLM integration.

</domain>

<decisions>
## Implementation Decisions

### Component storage model
- Components (Base, Curry, Subzi, Extra) are **reusable entities stored in their own tables** — not inline strings per meal
- A "meal" does not exist as a pre-composed record. The generator assembles components at generation time by picking one from each pool
- The Meal Library (Phase 2) manages **component pools**: 4 tabs — Bases, Curries, Subzis, Extras
- Generated plan slots store component IDs (base_id, curry_id?, subzi_id?, extra_ids[])
- Rules can reference component entity IDs (e.g., "never repeat same subzi_id twice this week")

### Slot assignment
- **No slot field on components** — components carry no valid_slots information at the schema level
- Slot assignment is handled entirely by the **global user preferences** layer (a top-level config object), not by component attributes
- The global preferences object supports slot restrictions per base type or component category (e.g., "Rice: lunch only", "Idli: breakfast only")
- This applies to all component types — even Bases have no inherent slot encoding in the DB schema

### Tag taxonomy (fixed enumerations)

**Dietary tags** (multi-select per component):
- `veg` — vegetarian
- `non-veg` — contains meat/fish
- `vegan` — no animal products including dairy
- `jain` — no root vegetables (potato, onion, garlic)
- `eggetarian` — vegetarian + eggs, no meat/fish

**Protein tags** (single-select, optional — for non-veg filtering):
- `fish` — fish or seafood
- `chicken` — chicken-based
- `mutton` — mutton or lamb
- `egg` — egg-based
- `paneer` — paneer-based
- `dal` — lentil/legume-based
- `none` — no dominant protein (plain rice, plain roti, etc.)

**Regional tags** (multi-select per component):
- `south-indian`
- `north-indian`
- `coastal-konkan`
- `pan-indian`

**Occasion tags** (multi-select per component):
- `everyday` — regular use
- `fasting` — suitable for fasting days (Ekadashi, Navratri, etc.)
- `festive` — special occasion / festival food
- `weekend` — heavier/special meals for weekends

### Extra compatibility rules
Extras have multiple layers of compatibility:

1. **Base-type compatibility** (primary constraint): Each Extra has `compatible_base_types: ('rice-based' | 'bread-based' | 'other')[]`
   - Rasam: `['rice-based']` only
   - Curd: `['rice-based', 'bread-based']`
   - Pappad: `['rice-based', 'bread-based']`
   - Coconut chutney: `['other']` (idli, dosa)
   - Pickle: `['rice-based', 'bread-based']`

2. **Curry incompatibility**: Extras can declare curries they should not appear alongside
   - Rasam incompatible with Sambar (both are liquids — redundant in the same meal)
   - Modeled as: `incompatible_curry_categories: string[]` or `incompatible_if_curry_has_tag: string[]`

3. **Mandatory extras**: Base types can declare a required extra category
   - `other` (idli/dosa) requires at least one `condiment` extra (chutney)
   - Stored as: `base_type_rules.required_extra_category` in global preferences

4. **Quantity limits**: Configurable globally per meal slot type
   - User sets max extras per slot (e.g., breakfast: 1, lunch: 3, dinner: 2)
   - Stored in global user preferences, not on component schema

### Global user preferences schema
A top-level `UserPreferences` object (stored in Dexie, single-row) covers:
- Slot restrictions: which components/base-types are valid for which meal slots
- Extra quantity limits per slot type (breakfast/lunch/dinner)
- Any other generation-behavior overrides

### Claude's Discretion
- Exact Dexie table names and index design
- TypeScript union vs enum for tag values (either works; pick what integrates best with Vercel AI SDK Zod schemas)
- Whether `incompatible_curry_categories` is stored as a free list or references curry entity IDs

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project context
- `.planning/PROJECT.md` — Project vision, core value, and constraints (single-user, no auth, no nutrition)
- `.planning/REQUIREMENTS.md` — DATA-01 through DATA-05 are the acceptance criteria for this phase

### Research findings
- `.planning/research/STACK.md` — Technology choices: Next.js 16, Dexie.js v4.3.0, Zustand v5, TypeScript, Tailwind v4
- `.planning/research/ARCHITECTURE.md` — Component boundaries, DB schema design, data flow, build order
- `.planning/research/SUMMARY.md` — Synthesized findings including tag taxonomy and build order implications

No external ADRs or design docs — requirements are fully captured in decisions above and the planning documents.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project. No existing components, hooks, or utilities.

### Established Patterns
- None yet — this is Phase 1. Patterns established here become the baseline for all subsequent phases.

### Integration Points
- Dexie client initializes on app startup; all subsequent phases import from the Food DB Service layer built here
- Global UserPreferences object is read by the generator (Phase 3) and the Rules Manager (Phase 5)

</code_context>

<specifics>
## Specific Ideas

- "Beans poriyal is only for rice" — not just a tag match, but a `compatible_base_types` constraint on the Subzi entity
- "Rasam does not work with Chapati" and "Rasam + Sambar together is redundant" — two distinct constraint mechanisms (base-type compat + curry incompatibility)
- "Idli always needs chutney" — mandatory extra category requirement, configured at base-type level in UserPreferences
- The user explicitly wants slot assignment to live outside component data — "don't store slot preference at component level even for base"

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-data-foundation*
*Context gathered: 2026-03-19*
