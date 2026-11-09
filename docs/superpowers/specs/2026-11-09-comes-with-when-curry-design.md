# "Comes With … When the Curry Is" — Design

**Status:** agreed in conversation 2026-11-09, awaiting approval. Builds on `2026-11-09-links-bring-dishes-design.md`
(the "Comes with" link), which listed combination conditions as the next project.

## Why

The user wants Papad in a meal when it has Rice **and** Sambar, and not because of either alone. A "Comes with" link on
Rice brings Papad to every Rice meal; one on Sambar brings it to every Sambar meal (Sambar is also eaten with Idli and
Dosa). Nothing today says "only when both are there".

The user has no other combination in mind yet, but finds the construct useful. It is generalised to: **on a base, when
the meal's curry is one of these curries, bring an extra or a subzi.**

## The rule

A "Comes with" link on a base may carry a condition: **when the curry is** one or more named curries.

| Set on | Link | Effect |
|---|---|---|
| Rice (base) | with Papad when the curry is Sambar — Always | every Rice + Sambar meal has Papad; Rice + Rasam does not get it from this link |
| Rice (base) | with Papad when the curry is Sambar or Rasam — Usually | most Rice meals with either curry have Papad |

Decided with the user:
- It only **brings**. It never keeps the extra or subzi out of other meals ("Papad only with Rice + Sambar" is not built).
- It is set on the **base's** form (the user would open Rice first).
- The condition is the meal's **curry**, and only the curry. Sambar is treated as a curry only; the Sambar extra in the
  seed library is not a condition target.
- **Dish form only.** The rules assistant does not draft these links.

Agreed from my proposals (the user said "works"):
- The condition names one or several specific curries ("when the curry is Sambar or Rasam").
- Strength works as for "Comes with": Always (`must`) brings it to every meal that meets the condition; Usually, Often,
  Sometimes to correspondingly fewer.
- **The link does not make the curry more or less likely.** Rice is planned with Sambar as often as without the link;
  the curry is settled first, and the link only adds its dish once the curry is there.
- The curry counts however it got into the meal: chosen by the planner, brought by another link (including Rice's own
  "Comes with Sambar"), or locked by the user before a regenerate.
- **The brought dish's own rules never limit the base or the curry** (user, after the builder check). Neither Papad's
  limits nor a missing pair may move the curry choice.
- **Count and repeat limits do not stop a brought dish** (user; generalised below to every link). When the link names one dish, that dish is brought
  whatever its count or repeat limits say ("Papad at most 2 a week", "Vary dishes across the week", "No dish on the same
  or next day"), and those limits are not charged for it. When the link names several, the limits are used only to
  choose among them; one of them is still brought.

## Frequency rules follow the hierarchy (user, applies to all links)

**A lower level's frequency rules never influence a higher level.** A link puts the dish it brings below the dish (or
dishes) that brought it: Rice → Sambar brought by Rice → Papad brought by Rice when the curry is Sambar; Papad "served
with" Rice sits below Rice. Frequency rules are count and repeat limits: the user's "at most N", "Vary dishes across the
week", "No dish on the same or next day", and the like.

- A brought dish's frequency rules never decide whether the dish above it is planned, nor whether the link brings
  something. They only rank the choice among the link's several dishes.
- This applies to **every** link that brings a dish — existing plain "Comes with" and "Served with" links included
  (user), at every strength — not only the new conditional one. It is a planner change, not a change to any stored rule.
- The brought dish's other rules (days, meals, never planned automatically) work as today: an Always link overrides
  them, a softer link gives way to them.
- Existing plans can come out differently: a side that today was dropped by its own limit is now brought. Existing rule
  cases that rely on the old behaviour are updated with a note in their `why`; the "What gives way to a unit" table in
  `2026-11-08-pairing-units-design.md`, the gives-way section of `2026-11-09-links-bring-dishes-design.md` and
  `docs/architecture.md` are updated to state the hierarchy.
- A dish the planner picks freely (not brought) is at its own level and its frequency rules work as today.
- **Not frequency rules** (user confirmed): the per-meal extras cap (`extras-limit-*`) is what a meal can hold, and keeps
  working as today; the "Extras cap per meal" case is unchanged.

**What changes from today** (`givesWayTo` in `src/rules/record.ts`):
- "Vary dishes across the week" and "No dish on the same or next day" already give way to every brought dish; unchanged.
- Hand-written frequency rules (Rules page `limit`, `no_repeat`) on a brought dish: today they count; now they only rank
  the pick.
- A dish's own frequency rules under a softer link: today they give way only to Always links; now to every link.
- "Prefer frequent" and "Avoid rare": today a softer link's side can lose to them; now they only rank the pick. The case
  "Comes with a frequent stew more often than a rare one" must keep passing.
- Expected impact: all 47 existing rule cases pass unchanged. Unit tests that encode the old rule are rewritten to the
  new one: `src/rules/record.test.ts` ("extras caps and prefer-frequent give way to a unit only", "leaves hand-written
  rules unmarked") and possibly the gives-way tests in `src/planner/scorer.test.ts`.

## Picks and locks (user)

- **A hand swap in the plan re-runs nothing.** Swapping a meal's curry to Sambar does not add Papad, and swapping away
  from Sambar does not remove it; the meal changes only at the next regenerate (as today for every link; `swapComponent`
  in `src/stores/plan-store.ts` is unchanged).
- **The one exception to "the link does not move the curry":** when the user has locked the brought dish and the base in a
  meal (Papad and Rice) and regenerates, the planner should make that meal more likely to get one of the link's curries
  (Sambar). It is a nudge, not a requirement: it never overrides a hard rule, and with several curries in the condition
  any of them counts. Whether the base must be locked too or merely be Rice in that meal: my call is that the nudge
  applies when the brought dish is locked and the meal's base is the link's base, locked or not.
- If the user locked the meal's extras (or subzi) so the brought dish cannot be added, the link gives way; the curry is
  not swapped away to avoid the miss (my call).
- The brought dish's own links still apply (chains), and the link's day/meal scope limits it as for any link.
- No curry, or a curry not named: the link does nothing.

## Goals

- Rice + Sambar meals get Papad; other Rice meals and other Sambar meals do not get it from this link.
- How often Rice and Sambar appear together does not change because of the link.
- The planner, plan labels and slot explanations say which link brought the dish ("Rice comes with Papad when the curry is
  Sambar").

## Non-goals

- "Only when" limits (keeping a dish out unless a combination is present).
- Conditions on anything but the curry: the subzi, an extra, a curry type, a dish's tags, or several conditions at once.
- Conditional links on curries, subzis or extras. Only bases carry them.
- Conditional links that bring a curry (the curry role holds the condition).
- Rules-page or assistant support. The assistant's `propose_pairing` must still keep such a link intact when it merges
  into a base that has one (it never drops or rewrites a link it did not draft), and `explain_plan_slot` may describe it.
- Any Dexie upgrade or change to what an existing stored rule means.

## Anti-goals

- The link nudging the planner to pick Sambar more (or less) often for Rice, except for the lock nudge below.
- Saving a base's form with no edits changing a stored conditional link, or a wrong first value deleting one (see
  "Forms over stored data" in `CLAUDE.md`).

## The form

- On a base's "Goes with", a "Comes with" link to extras or subzis offers an optional **"when the curry is"** picker
  that takes one or more curries. Not shown for curry targets, and not shown on non-base dishes.
- Sentences: "Rice always comes with Papad when the curry is Sambar"; "Rice usually comes with Papad when the curry is
  Sambar or Rasam". Badge: "Comes with Papad (with Sambar)" (exact badge wording is the builder's call; strength words
  only from `STRENGTH_WORDS`).
- A base may hold several such links, including one unconditional and one conditional to the same target; each is edited
  and removed on its own (as "Comes with" today, matched by rule id).
- Removing the condition turns it into a plain "Comes with" link (it then brings to every meal of the base).
- Renaming, deleting or merging a curry named in a condition updates or drops that curry from the condition, as for any
  dish a link names; a condition left with no curry drops the link (my call — a link with an empty condition must not
  silently become unconditional).
- Both load orders and the no-edit save are tested, per `CLAUDE.md`.

## Clashes (my calls)

- Two Always links needing the subzi role with no dish in common clash only in meals where both apply. The form refuses an
  Always conditional subzi link against the base's own unconditional Always subzi link (they always meet when the
  condition holds), and against another Always conditional subzi link whose curries overlap. It does not try to judge
  links on other dishes beyond what the existing meal-level check already does.
- In a meal where a conditional link and a plain link on the same base both want the subzi role with no dish in common,
  the **conditional link wins** (it is more specific), whatever the rule ids or strengths of the two (my call). Where the
  condition does not hold, the conditional link suppresses nothing.
- Anything else the form cannot see is handled at plan time as today: lower rule id wins, the other reported once as a
  soft problem.
- Extras never clash (as today).

## Storage (my calls)

- Stored as the existing `comes_with` template with one new optional param, `whenCurry` (a matcher naming curry ids).
  Absent means unconditional, so every stored `comes_with` rule keeps its meaning and no upgrade is needed.
- The template's validation rejects `whenCurry` when `of` names curries.
- `describe` and `references` include the condition, so rename/delete/merge, compare-rules and link warnings see it.

## Planner (my calls)

- The `pair` constraint gains an optional meal-level condition: the meal's curry must match it for the pair to trigger.
  Today a pair is triggered per dish (`bits[p.when]` in `memoFor`, memoised by dish, role and slot); the condition
  depends on another dish in the meal, so it is checked where the meal is known (scoring and bringing), not in the
  per-dish memo. How is left to the builder, within: deterministic per seed, no measurable slowdown on the rule cases.
- Bringing: the condition can only be met after the curry is placed. The bring rounds (`BRING_ROUNDS` in `solver.ts`)
  must re-check conditional pairs after a curry is placed or replaced, and a replaced curry takes away the dish its
  condition brought (as "a replaced dish takes the sides it brought with it").
- Whom it gives way to matches "Comes with": Always → unit member; softer → asked for.
- The base's own rules on Rice and the curry's own rules on Sambar are not changed by the link. Today the solver scores
  a curry choice on the whole meal after `bring()` (`chooseBest`), so the brought dish's costs and a missing pair would
  count against Sambar. The curry choice (construction and local search, curry moves and swaps) must be blind to
  everything a conditional link causes: the missing-pair cost and the brought dish's own costs and limits. How (score
  the curry before conditional brings, or leave those costs out of curry moves) is left to the builder.
- An Always conditional link overrides the brought dish's day/meal/never-auto rules (as "Comes with" does). Count and
  repeat limits never stop a brought dish (see The rule); with several candidates they only rank the pick.
- The lock nudge (see Picks and locks) is the only path by which the link may move the curry.
- Moving suppression to where the meal is known: a conditional pair can only claim the subzi role in meals where its
  curry is present.

## Acceptance

Rule cases in `src/rule-cases/cases/` (each written first, failing on today's code, failing without its subject). Papad
and Sambar are in the shared library or added there:

- Rice comes with Papad when the curry is Sambar, Always: every Rice + Sambar meal has Papad; no Rice + other-curry meal
  and no Idli + Sambar meal has Papad from it.
- The same link does not change how many Rice + Sambar meals are planned over 8 weeks (within the tolerance the
  links-bring-dishes cases use).
- Usually: most Rice + Sambar meals have Papad.
- Condition with two curries (Sambar or Rasam).
- Sambar brought by Rice's own "Comes with Sambar" still triggers the Papad link (chain).
- A locked Sambar on a Rice meal triggers it at regenerate; a locked Rasam does not.
- Papad at most 2 a week with an Always link: Rice + Sambar meals are as many as without the link, every one has Papad,
  and the limit reports no violation for them.
- A link naming Papad and a second crunchy extra, with Papad at most 2 a week: every Rice + Sambar meal has one of them,
  and the pick favours the other extra once Papad has reached its limit.
- Existing links: Idiyappam always comes with Kerala Stew (Veg), with the stew limited to 2 a week: Idiyappam is planned
  as often as without the limit, every Idiyappam meal has the stew. The same for a softer link and for a "Served with"
  link.
- A chain: a curry brought by a base, with an extra brought by that curry limited to once a week; neither the curry nor
  the base is planned less often.
- Papad and Rice locked in a meal: over many seeds, that meal gets Sambar more often than with Papad unlocked.
- A conditional subzi link beats a plain Usually subzi link on the same base in Sambar meals, and does not suppress it
  in other meals.
- Bringing a subzi when the curry is Sambar.
- Scope: a link limited to lunch does not bring at dinner.

Plus: form tests (both load orders, no-edit save, condition picker only on bases and only for extra/subzi targets),
template validation tests, and the usual `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run rule-cases`.
