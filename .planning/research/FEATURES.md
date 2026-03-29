# Feature Landscape

**Domain:** Curry base compatibility in an Indian weekly meal planner
**Researched:** 2026-03-29
**Overall confidence:** MEDIUM

## Scope

This research covers only the new user-facing behavior for `v1.3`:

- Curries declare which base categories they work with
- Existing curry data can be backfilled inside the app
- Auto-generation respects compatibility by default
- Rules and manual edits can intentionally override the default

It does not cover subzi compatibility, recipe authoring, nutrition, or broader recommendation systems.

## Table Stakes

Features users will reasonably expect once curry/base compatibility exists. These should be in the milestone.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Curry form shows compatible base categories | If compatibility drives generation, users need to see and edit it where curries are managed | Low | Multi-select on curry create/edit; use existing base category identities |
| Existing curries are usable after upgrade | Users should not have to rebuild the seeded library manually | Medium | Provide an in-app backfill path with sensible defaults for seeded curries |
| Generator treats compatibility as the normal rule | "Rice with anything" and "roti with anything" should stop unless explicitly allowed | Medium | Compatibility should act as a hard default filter during automatic selection |
| Manual meal edits surface only compatible curries first | Picker behavior should match generator behavior or users will not trust the model | Medium | Default picker list/filter should favor compatible curries for the chosen base |
| Clear escape hatch for exceptional pairings | Households sometimes make uncommon combinations; users need a way to do that deliberately | Medium | Rule-based override and manual selection override are both acceptable, but must feel intentional |
| Missing compatibility is visible and fixable | Backfilled data will be imperfect; users need to notice gaps and correct them quickly | Medium | Show "compatibility not set" or equivalent in library/backfill UI rather than silently guessing forever |
| Backfill flow explains what happened | Users need confidence that existing curries were updated rather than mysteriously changed | Low | Short one-time explanation or review screen is enough; avoid hidden migration magic |

## Useful Differentiators

These improve trust and speed, but should only ship if the table stakes above are already solid.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Seeded curry presets map to common Indian pairings | Reduces cleanup effort after migration and makes the feature feel immediately smart | Medium | Examples: dosa/idli curries vs rice curries vs roti/paratha curries |
| Bulk edit compatibility for multiple curries | Speeds up cleanup when users have many existing custom curries | Medium | Useful if backfill leaves many ambiguous records |
| Compatibility hints in picker UI | Helps users understand why some curries are shown or hidden | Low | Small labels like "matches selected base" or "override required" are enough |
| Empty-state repair guidance | Prevents frustration when a rule+base combination yields no compatible curries | Low | Explain whether to edit curry compatibility, relax rules, or use override |
| Review queue for backfilled ambiguities | Makes cleanup manageable without forcing all edits up front | Medium | Example: "5 curries need compatibility review" badge or filter |

## Anti-Features

These are tempting extensions but should be deferred for this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Compatibility scoring or ranking engine | Adds fuzzy logic when the milestone needs clear, dependable constraints | Use simple allowed/not-allowed category matching |
| AI-suggested pairings from recipe text | Hard to verify, hard to test, and unnecessary for a seeded local library | Hand-curate seeded defaults and let users edit |
| Automatic override during generation | If the generator silently breaks compatibility to fill a slot, users lose trust | Fail visibly, warn, or require explicit rule/manual override |
| Subzi compatibility in the same milestone | Doubles the surface area and muddies the mental model | Keep v1.3 strictly about curry-to-base only |
| Deep regional ontology of every bread/rice variant | Too much taxonomy work for low user value right now | Reuse current base categories; refine only if real gaps appear |
| Per-slot compatibility exceptions UI everywhere | Too much new UX for a narrowly scoped milestone | Route exceptions through existing rules and manual picker edits |

## Critical UX Expectations

These are the practical behaviors the milestone should guarantee.

### 1. Default-safe, explicit-exception model

Users should experience compatibility as the normal behavior:

- Auto-generation picks only curries compatible with the chosen base
- Manual selection can still make an exception, but that exception should be obvious
- Rule overrides should read as "I know better in this case", not as an invisible engine fallback

Recommendation: compatibility is a default constraint, not a suggestion.

### 2. Backfill should minimize forced cleanup

Users already have a seeded library and possibly custom curries. Requiring one-by-one repair before the app works would feel like a regression.

Must-have behavior:

- Seeded curries receive initial compatibility data automatically
- Custom curries without compatibility should remain editable and discoverable
- The app should reveal unresolved items, not bury them

Recommendation: distinguish "seeded confidently backfilled" from "user data needs review".

### 3. Rules must override defaults without destroying the mental model

The user already has a rules system. Compatibility should fit that model cleanly:

- Default: generator filters curries by chosen base
- Override: a rule can explicitly require or allow an otherwise incompatible curry
- Result: user understands that the unusual pairing happened because of a rule, not a bug

Recommendation: override copy should be explicit in descriptions and warnings.

### 4. Picker and generator must agree

If generation hides incompatible curries but the picker shows everything without explanation, users will see the system as inconsistent.

Must-have behavior:

- Compatible options shown by default for the currently selected base
- Incompatible options either hidden by default or clearly marked
- Selecting an incompatible curry should be a deliberate action

### 5. "No compatible curry" is a first-class state

This will happen during migration and edge-case rule combinations. The app should handle it intentionally.

Must-have behavior:

- Tell the user why the slot could not be filled
- Point to the fastest fix: edit compatibility, change rule, or override manually
- Avoid silent fallbacks that produce a random incompatible pairing

## Feature Dependencies

```text
Base categories exist as stable records
  -> Curries can store compatible base category IDs
  -> Seeded curry library can be backfilled
  -> Generator can filter curry candidates by selected base
  -> Picker can default to compatible curries
  -> Rules/manual edits can expose explicit override paths
```

## MVP Recommendation

Prioritize:

1. Curry create/edit supports compatible base category selection
2. Seeded curry data is backfilled in-app with practical defaults
3. Generator enforces compatibility by default
4. Manual picker behavior aligns with generator defaults
5. Explicit rule/manual override path exists for exceptional pairings
6. Empty-state and migration-review UX makes missing compatibility understandable

Defer:

- Bulk editing beyond a minimal review flow: helpful, but not required if backfill quality is high
- Compatibility badges and richer explanation UI: useful polish, not milestone-defining
- Any fuzzy recommendation/scoring logic: wrong abstraction for this milestone
- Subzi compatibility and broader composition intelligence: separate milestone

## Milestone Boundary

`v1.3` should make curry compatibility feel like a dependable default constraint layered onto the existing planner. It should not become a recipe intelligence system, a regional pairing encyclopedia, or a full meal-composition redesign.

If a capability does not directly improve:

- curry record setup
- backfilling existing curry data
- generation correctness
- manual edit consistency
- explicit override clarity

it should probably be deferred.

## Sources

- [Eat This Much help: manual entry vs automatic generator](https://help.eatthismuch.com/help/can-i-disable-the-automatic-generator-and-enter-my-own-foods) - confirms that planners typically need a clear coexistence between automatic generation and manual edits. Confidence: MEDIUM.
- [Eat This Much help/tutorial ecosystem](https://help.eatthismuch.com/) - supports the broader pattern that generation controls, regeneration, and explicit user correction are standard planner UX. Confidence: MEDIUM.
- [CookBook App Store listing](https://apps.apple.com/sr/app/cookbook-recipe-manager/id1073341917) - confirms current recipe/planner expectations around custom organization, bulk tag management, search/filtering, and planner integration. Confidence: MEDIUM.
- [AnyList recipe help](https://help.anylist.com/articles/alexa-skill-recipes-overview/) - additional evidence that recipe organizers expose structured recipe retrieval by user-managed categorization. Confidence: LOW.

## Confidence Notes

- HIGH confidence: users need visible compatibility editing, dependable default filtering, and an explicit exception path. This follows directly from the milestone goal and established planner UX.
- MEDIUM confidence: review queues, bulk edit, and compatibility labeling are useful but not mandatory. They are strong UX improvements, not universal table stakes.
- LOW confidence: exact competitor implementations for "compatibility" are sparse because this is domain-specific to the app's Indian meal model.
