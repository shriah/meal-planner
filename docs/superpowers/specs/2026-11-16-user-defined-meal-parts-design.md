# User-Defined Meal Parts

Fourth of four planner generalisation projects (search budget, rule levels, repair loop, user-defined meal parts). It
builds on the other three: rule levels remove the shape guesses, and the repair loop removes the passes that name curry
and subzi.

## Why

The shape of a meal is code today: one base, one curry, one subzi, a list of extras (`COMPONENT_TYPES` in
`src/types/component.ts`, `SlotState` in `src/planner/types.ts`, `PlanSlot` in `src/types/plan.ts`). "One curry and one
subzi per meal" is built into the scorer and solver, and about 50 source files name the parts. Base categories, extra
categories and curry types are separate, fixed mechanisms, and the tag lists (dietary, protein, region, occasion) are fixed
enums. A user who wants Main, Entree, Side and Dessert, or a "spice level" tag, cannot have them.

## What the user decided

- **The user shapes the meal.** They define the parts (any names, e.g. Main, Entree) and their order. The planner reads the
  list and its order at run time; nothing in it knows "base" or "curry".
- **Order is the hierarchy.** The planner fills parts top to bottom; dishes in a higher part decide what goes in lower ones.
  The plan board shows parts in the same order.
- **A dish belongs to exactly one part**, for now.
- **The first part always holds exactly one dish per meal**, for now (like the base today).
- **Lower parts are filled only by rules.** No part has a capacity number. Each link still brings one dish; a Main with two
  "comes with a Side" links gets two Sides, and a general rule ("every Main has a Side") asks too.
- **One dish counts toward every rule it satisfies.** A part holds the fewest dishes that meet all rules asking for it (a
  general "Rice has a Curry" and Rice's "comes with Sambar" give one curry, Sambar). Any upper limit is itself a rule.
- **Every part has its own categories**, created by the user.
- **Tag groups are user-defined**, each with its own values, and rules can match them.

## Consequences (my reading, agreed in the playback)

- The built-in "one curry, one subzi" limit goes. Two Always links to different curries give two curries rather than a
  clash, unless a rule caps the part. The link-clash warnings that rest on "a meal holds one curry and one subzi"
  (`link-warnings.ts`) become warnings against a cap rule, if one exists.
- Today's curry types become the categories of the Curry part; base and extra categories become their parts' categories.
- Today's dietary, protein, region and occasion lists become the starting tag groups.

## My calls

- **Existing libraries convert to parts Base, Curry, Subzi, Extras** (in that order), with their categories, curry types and
  tags carried over, and every rule, link, plan and lock rewritten to the new ids. The day it lands, plans and rules behave
  as before. A new library is seeded the same way.
- **"How often" (rare, normal, frequent) stays a fixed field**; the default rules use it.
- **Days and meal times stay fixed** (7 days; breakfast, lunch, dinner). Not part of this project.
- **A tag group says whether a dish takes one value or several** (protein takes one, region several), so rules can match
  "is" or "has".
- **Today's per-meal extras limit becomes an ordinary cap rule on the Extras part** after conversion, and the default
  "sides only when a rule asks" applies to every part below the first.
- **Links follow the order:** "comes with" brings dishes from parts below the owner's; "served with" names dishes or
  categories of parts above; "never with" works between any parts; a conditional link ("when the meal has …") may wait
  for dishes of any part other than the one it brings into (today: curry and subzi only).
- **Editing the part list:**
  - A part that still holds dishes cannot be deleted; its dishes must be moved or deleted first.
  - Reordering is allowed. A link that would then point the wrong way (a comes link to a part now above its owner) is
    skipped and named, like a rule that refers to something deleted, and shown on its dish's form until edited.
  - Renaming a part, category or tag value changes nothing stored (rules refer by id).
  - At least one part always exists.

## Settled after the builder check (my calls)

- **Converted libraries get visible cap rules.** Today "one curry, one subzi" is hard-coded (`builtin:max-curry`,
  `builtin:max-subzi` in `src/planner/builtins.ts`). Conversion adds two ordinary Always rules, "At most one Curry per meal"
  and "At most one Subzi per meal". They are listed and editable on the Rules page, and the clash warnings read them. A
  converted library behaves exactly as before; a user who deletes a cap gets two curries where two links ask.
- **Default rules name parts by id.**
  - "Sides only when a rule asks" covers every part below the first, by position. A new part is covered automatically.
  - Variety and spacing become a per-part setting on the part's form, "Keep this part varied across the week".
  - Conversion sets that setting to today's choices: on for Base, Curry and Subzi, off for Extras. A new part starts on.
- **Saved weeks are history.** A past week is shown as stored, even if the part list has changed since. A dish whose part
  was deleted shows under an "Other" row.
- **Locks follow dishes, not positions.** A lock on the current week is kept by dish id and re-keyed to the dish's part.
  A lock whose dish no longer fits the meal (for example a second dish in the first part) is dropped. The plan board says so
  once.
- **Reordering, including the first part, is allowed.** Only plans generated afterwards follow the new order.
- **A dish can move to another part** from its form; this is how a part is emptied before deleting it.
  - Its links that now point the wrong way are skipped and named on its form, as for reordering.
  - Rules that match by part apply to its new part.
  - Saved weeks show it where it was stored.
- **Lock, swap and pick act on each dish.** A part holding two Sides shows two dishes, each with its own lock and swap,
  and an "add" to put another dish into that part by hand. Today's extras-as-one-list lock is converted to one lock per
  extra.

## Goals

- Parts, part categories and tag groups are stored data the user edits (in the Library), with a Dexie upgrade that converts
  existing data and is tested from the previous version with realistic rows (CLAUDE.md).
- The planner takes the ordered part list as input: a meal is "one dish of the first part, plus dishes per lower part",
  and matchers read part, category and tag fields by id.
- Rules, links, their forms and descriptions, the Rules page, the plan board (lock, swap, pick per part), the export
  image and the assistant's prompt and tools all read the part list instead of naming parts.
- Every existing rule case keeps passing after its test library is converted to the four parts; new cases cover a library
  with other parts (e.g. Main, Side, Dessert) and a part with two dishes asked by two links.

## Non-goals

- A dish in several parts; several dishes in the first part; user-defined days or meal times.
- Changing what any existing rule means on a converted library.

## Anti-goals

- Any code path that names a part ("curry", "subzi") outside the conversion and the seed.
- Conversion that changes a stored rule's meaning or loses a plan or a lock.
- Saving what the user did not change (CLAUDE.md forms rules), now also for part, category and tag edits.

## Delivery

Too large for one plan. Delivered in stages, each one shippable with all checks passing and no visible change until the
last two:

1. Data model and conversion: parts, part categories, tag groups stored; existing data converted; old fields still read.
2. Planner over parts: `SlotState`, scorer and solver over the part list; matchers over part, category and tag ids.
3. Rules and links over parts: templates, link targets, conditional links, warnings, descriptions.
4. Library UI: create, rename, reorder, delete parts; part categories; tag groups and values.
5. Plan board, export and assistant over parts; old fields removed.

Each stage gets its own plan.

## Left to the builder

- Store layout (new tables or fields), id scheme and Dexie version numbers.
- How matcher fields are named for dynamic tag groups.
- UI layout for editing parts and tag groups, following the existing Library and link editor patterns.

## Acceptance

- Per stage: tests, typecheck, lint and rule cases pass; DB upgrade tested from the previous version.
- After stage 5: a library with parts Main, Side, Dessert and a tag group "Spice level" can be built in the UI, rules and
  links made on it, and plans generated that follow them; no source file outside conversion and seed names a part.
