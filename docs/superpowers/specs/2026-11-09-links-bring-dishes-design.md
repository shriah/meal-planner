# Links That Bring Dishes — Design

**Status:** agreed in conversation 2026-11-09, awaiting approval. Extends `2026-11-08-pairing-units-design.md`.

## Why

A dish's "only with" link to side dishes is a limit: "Idiyappam always planned only with Kerala Stew (Veg) or Kerala
Stew (Non-Veg)" stops any other curry, but Idiyappam is still planned plain, because the default "Curries, subzis and
extras only when a rule asks for them" keeps the meal bare. To get the stew, the user must find Kerala Stew's form and
add "Served with → Idiyappam" there. Nobody wants plain Idiyappam when they named its stews; the link they set on
Idiyappam should bring the stew.

The same holds beyond bases: "Mutton Curry with Rasam" set on Mutton Curry should put Rasam in every Mutton Curry meal.

Two more gaps found on the way (2026-11-08, measured over 8 weeks on the rule-case test library):

- Only one dish can be Always served with a base per curry or subzi role, so "Idiyappam with either stew" cannot be
  said. With both stews at Usually, the first in rule order always wins: Kerala Stew (Non-Veg) was never planned.
- A softer pairing makes its base rarer: Idiyappam (breakfast only) was planned 18 times with no pairing and 8 with
  one Usually stew. The default "Vary dishes across the week" counts the brought stew, so a second Idiyappam meal costs
  either variety (stew repeated) or the pairing (stew left out), and the planner drops Idiyappam. Switching that default
  off restored 18.

## The rule

**A link from a dish to side dishes or side types names what comes with it.** Whenever the dish is in a meal, the link
brings one of the dishes it names. A dish may hold several such links; each brings its own.

| Set on | Link | Effect |
|---|---|---|
| Idiyappam (base) | with Kerala Stew (Veg), Kerala Stew (Non-Veg) — Always | every Idiyappam meal has one of the stews, varied across the week |
| Mutton Curry (curry) | with Rasam — Always | every Mutton Curry meal has Rasam |
| Idli (base) | with Coconut Chutney — Always, and with Tomato Chutney — Always (two links) | every Idli meal has both |
| Rice (base) | with Papad; and the meal's curry Mutton Curry has with Rasam | Rice + Mutton Curry gets Papad and Rasam |

In these examples Rasam is the **extra** (liquid category), which the seed library already holds beside the Rasam curry
(`src/db/seed-data.ts:729`). A curry never links to another curry: a meal holds one curry and one subzi, and that stays.

## Goals

- A "with" link to side dishes or side types (specific curries, subzis or extras; curry types; extra categories), set
  on any dish, brings one of the named dishes into every meal holding that dish.
- A dish can hold several such links, including several to the same kind of target, each with its own values,
  strength and scope. "Both chutneys" is two links.
- One link naming several specific dishes brings one of them per meal, and over a few weeks each of them that the rest of
  the week allows is planned. For a link to a curry type or extra category, any member may be picked; not every member
  has to appear (my call).
- Strength works as everywhere else: Always is hard (the named dish is always there); Usually, Often and Sometimes bring
  it when it fits and give way otherwise.
- A link of any strength never makes its own dish less likely to be planned: the dish is planned about as often as
  with no link (within 1.5×, the rule-case `nearNoRulesCount` measure).
- The planner, the meal picker, the plan labels ("with Idiyappam") and the assistant describe the same thing.

## Non-goals

- **Combination conditions** ("Papad only when the meal has Sambar **and** Rice"). A separate project after this one;
  the planner change here should not rule it out.
- **Links that point at bases.** "Sambar only with Idli, Dosa" keeps today's meaning, a limit on where Sambar goes; a side
  cannot bring a base. "Served with" on a side dish is unchanged and keeps working alongside the new links.
- **"Never with"** is unchanged.
- **An "all of these" switch on a link.** Several links cover it.
- **Changing what a stored link means.** No upgrade rewrites or reinterprets existing rules (see Existing links).

## Anti-goals (a failure even if it works)

- A link that is stored but not shown, or shown but not applied. Today a second stored rule in a link's slot is silently
  dropped by the form (`readOwned`, `src/rules/owned.ts:251`) and survives untouched in the database.
- Saving a dish rewrites a link the user did not touch (`CLAUDE.md`, "Forms over stored data").
- A stored link changes meaning without the user saving it.
- One of a link's specific dishes is never chosen although nothing forbids it.
- A softer link pushes its own dish out of the plan.

## Behaviour

**What a link brings.**
- The link's dishes are its specific dishes, or every dish of its curry types or extra categories.
- Only dishes of the link's kind are brought (a curry link fills the curry role, an extra link adds an extra).
- A link brings nothing else and keeps nothing out: with Rice + Mutton Curry, Rasam (Mutton Curry's link) and Papad
  (Rice's link) both come; an extra that no link or rule asks for stays out through the existing default.
- A brought dish brings its own links' dishes in turn (chains, as today with `BRING_ROUNDS`).
- The link's scope (days, meals) limits where it brings.

**Choosing among a link's dishes.**
- The planner picks one per meal and varies the pick across the week, so each named dish is planned.
- It prefers a dish the rest of the week allows (the dish's own days, meals, never-auto) over one it would have to
  override; it overrides only when none is allowed and the link is Always.
- Same seed, same week: deterministic, like the rest of the planner.

**What gives way.** As in the pairing-units design, with one change:
- A dish brought by an **Always** link is a unit member: its own rules and the defaults give way (unchanged).
- A dish brought by a **softer** link is asked for: "sides only when a rule asks" gives way (unchanged), and **now also
  the defaults "Vary dishes across the week" and "No dish on the same or next day"**. The repeat rules count the dish
  the link is on, not the side it brings. The side's own rules (days, meals, never-auto, its links) still apply, so a
  softer link still gives way where the side itself is not allowed.
- This applies to every softer pairing, including existing softer "Served with" links (my call). It is a planner fix
  toward the existing design goal that a softer pairing never makes its base less likely to be planned, not a change to
  what any stored rule says; the existing rule cases must still pass.
- Update the "What gives way to a unit" table in `2026-11-08-pairing-units-design.md` and `docs/architecture.md`.

**Clashes.**
- Two Always links that need the same curry (or subzi) role with no dish in common cannot both hold. At save time the
  dish form and the assistant refuse the second, as they refuse a second Always "served with" curry today. This covers a
  dish's own two links, its link against another dish's "served with" link, and a meal-level clash the form can see
  (the base's link against its own Always curry's link).
- Where links name dishes in common, the planner picks from the overlap. When an Always "Served with" link on a side
  narrows a dish's "comes with" link to one dish (Kerala Stew (Veg) always served with Idiyappam, while Idiyappam comes
  with either stew), the form shows a non-blocking warning on the "comes with" link saying the other dishes will never be
  picked and naming the "Served with" link to remove (my call).
- A clash already stored, or one only the plan reveals: the lower rule id wins, the other is reported once as a soft
  problem and never blocks the dish (as today).
- Your picks and locks win, worded "replaced by your pick" (as today).

## The form

- On a dish's "Goes with", "Add link" offers for side targets the mode **"Comes with"** (replacing "Only with" there);
  for base targets it keeps "Only with". "Never with" and "Served with" are unchanged.
- "Comes with" may be added again for a target already used; every other mode stays one per target.
- Sentences: "Idiyappam always comes with Kerala Stew (Veg) or Kerala Stew (Non-Veg)", "Mutton Curry usually comes with
  Rasam", "Idli always comes with Coconut Chutney". Badges: "Comes with Rasam", "Usually comes with Rasam".
- The "How firmly" strength row gets a visible label (today only `aria-label`).
- Each link is edited and removed on its own; editing one never touches another of the same kind.

## Existing links

- No upgrade changes or reinterprets stored rules.
- An existing "only with" link to side targets keeps compiling as today (a limit) and is shown with its old sentence plus
  a short note that it only limits and that saving it as "Comes with" makes it bring the dish. Saving that link from the
  form stores it in the new form, and its old limit is dropped: the user confirmed that a link to sides should bring, not
  keep others out. Any other link the user did not touch is left as stored.
- If a dish already has two stored rules in one slot (possible only by hand or an old bug), both are shown and both
  apply; neither is dropped.

## Storage (my calls)

- A "comes with" link is stored as a new rule template owned by the dish, not as `require_with` (whose `components` mean
  "all of these") or `avoid_with` (a limit), so no stored rule changes meaning. It names the owner, the candidate dishes
  or types, strength, cost and scope.
- Owned links are matched to stored rules by rule id, not by slot, everywhere a dish's links are read, compared,
  saved, renamed, deleted or merged (form, `food-db`, `category-db`, `compare-rules`, link warnings, assistant
  `propose_pairing`). The form's baseline compares links by rule id, and a save writes only links that changed.
- No Dexie schema change is needed: nothing in the database limits one rule per slot. Any later upgrade must not assume
  one owned rule per slot (v19 and v20 do; they are past and are not changed).
- Hand-written rules on the Rules page are unaffected; the new template is not offered there.

## Planner (my calls)

- The `pair` constraint takes a set of candidates (specific ids, or a matcher for curry types and extra categories)
  instead of one component; it is met when any candidate is in the meal. One-dish links are the one-candidate case, so
  existing `serve:*` links and `require_with` compile unchanged.
- Bringing places one chosen candidate; scoring, unit flags, role claims, `slotPairs`, `pairedSides`, `slotConflicts`,
  plan labels and explanations treat "the candidate present" as the paired dish.
- How the pick is varied across the week is left to the builder, within: deterministic per seed, each candidate
  planned, no cost to the base.

## Assistant

- `propose_dish` and `propose_pairing` can draft "comes with" links on the dish itself, with several links of one kind.
- Drafts merge into the form by link, not by slot; "Review" saves only the new or changed links.
- `explain_plan_slot` names the link that brought a side.

## Acceptance

Rule cases (each written first, failing on today's code, and failing without its subject):

- Idiyappam with both stews, Always: every Idiyappam meal has a stew, both stews are planned over 8 weeks, Idiyappam
  near its no-link count.
- Mutton Curry with Rasam, Always: every Mutton Curry meal has Rasam.
- Rice with Papad and Mutton Curry with Rasam: a Rice + Mutton Curry meal has both, and no extra that no link asks for.
- Idli with two links, Coconut Chutney and Tomato Chutney: every Idli meal has both.
- A Usually link: its dish stays near its no-link count and the side comes in most of its meals.
- A link to a curry type brings a curry of that type.
- A chain: a base brings a curry that brings an extra.
- "Sambar only with Idli, Dosa" (a link to bases) still only limits.
- An old stored "only with" link to side dishes still only limits.
- Two Always links clashing on the curry role: one holds, one soft problem, the dish still planned.

Form and storage tests:
- Opened before and after the library lookup loads; a save with no edits writes nothing.
- Two links of the same kind are saved, shown, edited and removed independently.
- Editing an old "only with" link stores it as "comes with"; untouched links stay as stored.
- Renaming or deleting a dish keeps every link of the same kind.

`npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run rule-cases` pass, and `docs/architecture.md` is updated.

## Left to the builder

- The new template's name and params shape, and how it compiles.
- How the pick among candidates is varied.
- The exact wording of the old-link note and of problem texts, within the examples above.
