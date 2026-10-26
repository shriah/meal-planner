# Rules assistant (Gemini) — design

## Intent
Managing rules means knowing the rule templates and the form. Users should be able to say what they want ("no paneer on weekdays"), ask why the planner did something ("why no Pulao on Monday?"), and see what a new rule would change, all in plain words. An LLM assistant on the Rules page does this.

## Goals
- **Create rules** from a plain-language request. The assistant drafts a rule; the user reviews and saves it.
- **Answer questions** about existing rules and about the plan already generated in the app (current plan by default; a saved week if named). Answers come from the existing rules and the planner's own explanation of that plan.
- **Illustrate a draft** with a before-and-after sample week.
- Cost and latency stay low however large the catalog grows.

## Non-goals
- The assistant does not edit or delete rules itself. Every change goes through the draft form and an explicit Save.
- It does not invent rule types; it only uses the existing templates (`src/rules/templates.ts`). If nothing fits it says so.
- No server component, no shared key, no accounts.
- No embeddings or vector store in v1.
- It does not propose rule changes unprompted when answering a question.

## Anti-goals (a failure even if it works)
- Slow or expensive: whole-catalog prompts, long tool loops, repeated calls for one answer.
- Rules changed without the user pressing Save.
- Whole library sent to Google on every message.

## Decisions (from the user)
- LLM provider: **Gemini**, called **directly from the browser** with the **user's own API key** (pasted by the user, not stored on a server).
- Two-step, RAG-like pipeline instead of pushing all context to the model.
- Before-and-after sample week is the way a draft is illustrated.
- "Why" questions are answered about a plan already generated in the app, based on rules that already exist.

## Design

### Key handling
- Settings spot (in the assistant panel) to paste and remove the key. Stored in `localStorage` only; sent only to Google's Gemini endpoint.
- No key → the panel shows a short prompt to paste one, noting that the key is kept in this browser in plain text and that relevant library data is sent to Google with each question.
- Errors (bad key, rate limit, offline) appear as plain chat messages and change nothing.

### Step 1: retrieval (local, no LLM)
Given the user's message, the app builds a small context slice from the Dexie data (`db.components`, `db.categories`, `db.rules`, plan):
- names of dishes, categories and tags found in the message (case-insensitive / fuzzy name match),
- every rule that references those items (`specReferences` in `src/rules/templates.ts`), plus each matched dish's owned rules,
- a compact library summary (category names with counts, the list of rule templates and their parameters),
- for plan questions: the plan being discussed and its problems (see below).
This is structured lookup, not vector search. Slice size is bounded (cap on dishes/rules listed, with "N more" notes).

### Step 2: Gemini with tools
Gemini receives the slice and a system prompt, and may call tools, executed in the browser:
- `search_dishes(query)` / `get_rule(id)` / `list_rules(filter)` — read-only lookups for anything the slice missed.
- `explain_plan_slot(day, meal)` — runs the planner's scorer explain on the discussed plan (see `explain`/`Justification` in `src/planner/scorer.ts`, `PlanProblem` in `src/services/plan-generation.ts`) and returns hard/soft violations and the rules involved. Answers about "why not X" must be grounded in this output, and the assistant says when the cause was variety scoring rather than a rule.
- `propose_rule(spec)` — the only write-ish tool: validates the spec with `RuleSpecSchema`/`validateDraft` and hands it to the UI as a draft. It never saves.
- `simulate_with_rule(spec)` — returns the before/after comparison below.
Tool calls per question are capped (default 4); at the cap the assistant stops and says so.

### Draft and before-and-after
1. User describes a rule; Gemini calls `propose_rule`.
2. The app generates a sample week twice from the real library with the same seed: current rules, and current rules + draft. Uses the existing planning service (`src/services/plan-generation.ts`, `planWeek`, worker `plan-generation.worker.ts`) so the page stays responsive.
3. UI shows the two weeks side by side, changed slots highlighted, plus the rule's existing match preview (`previewMatches`).
4. Gemini writes a short summary of the diff in one call (the diff itself is computed locally, no LLM). If the draft makes the week worse (unfillable slot, new hard problem), the summary says so; the user can ask for a tweak, which re-drafts and reruns.
5. Save happens only through the existing rule form/save path.

### Cost and latency
- Small prompts via step 1; one call for simple answers; tool cap; streaming responses; Flash-class Gemini model by default (confirm current model name against Google docs when building; make it a constant).
- Comparison weeks computed locally; LLM only for wording.

## Constraints
- Next.js version in this repo differs from common training data: read `node_modules/next/dist/docs/` before touching app/route code (see AGENTS.md). Since there is no server route, most work is client components and `src/` modules.
- Stay within existing conventions: rules in `src/rules`, planner in `src/planner`, services in `src/services`, UI in `src/components/rules`. Add tests alongside (Vitest, happy-dom for components).
- Gemini is called with `fetch` or Google's JS SDK (builder's choice; prefer fewer dependencies). Calls must be mockable in tests; tests never hit the network.

## Left to the builder
- Panel layout and placement on the Rules page; chat message styling.
- Exact system prompt, fuzzy-matching approach, caps (dishes/rules in slice), tool-call cap tuning.
- Fetch vs SDK, streaming implementation, model constant.
- How to pick "the plan being discussed" in the UI (default: current plan; saved week by name).

## My calls (not yet confirmed by the user)
- Same-seed before/after comparison.
- Tool-call cap of 4.
- Plain-text `localStorage` key storage with an explicit notice.
- Name/tag lookup rather than embeddings for step 1.
- **Handing a draft to the form (answered by the code):** `RuleEditor` already takes `initial={{ name, spec }}` (used by the presets on `/rules/new`). The assistant's draft opens in it, in a sheet like `EditRuleSheet`; Save goes through the editor's existing save path. No form refactor needed.
- **Sample week inputs:** for the current week's dates, starting from the discussed plan's locks/pins (so locked slots stay), same seed for both runs, a plain re-plan with no extra stabilisation. Adding a rule can reshuffle unrelated slots, so the diff is shown as-is and the summary may only blame the rule for slots its matcher touches; other changes are described as "reshuffled".
- **"Why" questions use today's rules:** a stored plan holds slots only, so it is re-scored under the current rules, not a snapshot. If the plan was generated before a rule was last changed, the answer says it is judged against the current rules. No data-model change.
- **Ambiguous or multi-part requests:** the assistant asks one short clarifying question when hard vs soft or scope is unclear, defaulting to "must" (hard) for words like "never/no" and a preference for "try to/prefer". A request needing several templates yields several drafts, reviewed and saved one at a time (`propose_rule` returns one draft per call).
- **What goes to Google:** tool results return names, ids and short descriptions only, capped at 20 items each, never full library dumps. The notice states this.
- **Cost and latency targets (starting values, constants in code):** under ~3k input tokens for a typical question, streaming so first text appears quickly, at most 4 tool calls, and the summary step is skipped when the two weeks are identical.
- **"Worse" week:** a warning shown next to Save, never blocks it.
- **Conversation history:** kept in memory for the open panel only, not persisted.
