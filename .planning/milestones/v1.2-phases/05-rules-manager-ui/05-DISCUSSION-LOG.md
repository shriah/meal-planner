# Phase 5: Rules Manager UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-21
**Phase:** 05-rules-manager-ui
**Areas discussed:** Rule entry method, Navigation & placement, Rule list display, Pre-save impact feedback

---

## Rule entry method

| Option | Description | Selected |
|--------|-------------|----------|
| LLM natural language (as ROADMAP) | User types plain English — Claude Haiku parses to RuleDefinition. Shows 'Compiling...' spinner. Requires API + network. | |
| Structured form only | User picks rule type, fills type-specific fields. No LLM. compileRule() runs locally. Offline-capable. | ✓ |
| Hybrid — form with optional LLM assist | Primary UI is the structured form. Optional 'Describe in plain English' button auto-fills form via Claude Haiku. | |

**User's choice:** Structured form only

---

| Option | Description | Selected |
|--------|-------------|----------|
| Pick type first, then type-specific form | Top-level select/tab reveals type-specific fields after selection. | ✓ |
| Single adaptive form | One form that hides/shows field groups as user makes selections. | |

**User's choice:** Pick type first, then type-specific form

---

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-generate name from fields | Claude generates 'Fish on Fridays' from the compiled rule. User can edit. | |
| User names it manually | Required text field above rule type selector. User must type a name before saving. | ✓ |

**User's choice:** User names it manually

---

## Navigation & placement

| Option | Description | Selected |
|--------|-------------|----------|
| New /rules page in AppNav | Adds 'Rules' link to AppNav. Clean first-class section. | ✓ |
| Under /settings | Rules at /settings/rules, nested under settings alongside slot config. | |
| Drawer/panel from plan board | 'Manage Rules' button on plan board opens side panel or sheet. | |

**User's choice:** New /rules page in AppNav

---

| Option | Description | Selected |
|--------|-------------|----------|
| Inline at top of the page | Form always visible above the rules list. | |
| Sheet/drawer (like MealPickerSheet) | 'Add Rule' opens bottom sheet. Same Phase 4 pattern. | |
| Separate /rules/new route | Full-screen form page, back button returns to list. | ✓ |

**User's choice:** Separate /rules/new route

---

## Rule list display

| Option | Description | Selected |
|--------|-------------|----------|
| Name + human-readable summary + toggle + delete | Rule name + plain-English description of what it does + toggle + delete. | ✓ |
| Name + type badge + toggle + delete | Rule name + small type badge (Day Filter, No Repeat, Require Component). Compact, technical. | |
| Cards with full detail | Full compiled filter details, toggle, and delete. More verbose. | |

**User's choice:** Name + human-readable summary + toggle + delete

---

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal placeholder text + Add Rule button | Simple 'No rules yet.' text with Add Rule button. | |
| Example rules shown as suggestions | 2–3 greyed-out example rules to illustrate. Clicking one pre-fills the form. | ✓ |

**User's choice:** Example rules shown as suggestions

---

| Option | Description | Selected |
|--------|-------------|----------|
| Greyed out / muted text + toggle shows off state | Inactive rules have dimmed text. Immediate visual difference. | ✓ |
| Same appearance, just toggle state differs | Active and inactive rules look identical — only toggle position differs. | |

**User's choice:** Greyed out / muted text + toggle shows off state

---

## Pre-save impact feedback

| Option | Description | Selected |
|--------|-------------|----------|
| Live preview while filling the form | Impact count updates in real-time below form as user selects fields. | ✓ |
| After clicking a 'Check impact' button | User explicitly requests preview. Shows summary, then enables Save. | |
| After submit — on a confirmation step | Confirmation view shows summary, asks 'Save this rule?' before writing to Dexie. | |

**User's choice:** Live preview while filling the form

---

| Option | Description | Selected |
|--------|-------------|----------|
| Inline warning below the impact count | Amber warning: 'Warning: This rule matches 0 components. Generator will ignore it.' Save still allowed. | ✓ |
| Toast after saving | Rule saves, then a toast warning appears about 0 matches. | |

**User's choice:** Inline warning below the impact count (RULE-05 satisfied)

---

## Claude's Discretion

- Human-readable summary generation (CompiledFilter → readable sentence)
- Impact preview query logic (count components matching TagFilter)
- Form validation UX (what's required to enable Save button)
- Styling of type selector (tabs vs select vs radio group)
- Delete confirmation UX

## Deferred Ideas

- LLM natural language rule input — future enhancement, explicitly deferred
- Rule editing (click to edit an existing rule) — deferred from Phase 5 scope
