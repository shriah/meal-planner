# Stack Research

**Domain:** Personal meal planning web app with LLM integration (Indian cuisine)
**Researched:** 2026-03-19
**Confidence:** HIGH (all core choices verified against official docs or npm registry)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js | 16.2.0 | Full-stack React framework | Dominant React meta-framework in 2025-2026; App Router handles both UI and API routes in one project, eliminating the need for a separate backend. `create-next-app` defaults now include TypeScript, Tailwind, ESLint, and Turbopack out of the box. Personal app needs no server complexity — API routes for LLM calls live alongside the UI. |
| TypeScript | 5.x (bundled) | Type safety across the stack | Next.js 16 includes TS out of the box. Zod schemas for LLM structured outputs flow naturally into typed domain models (Meal, MealPlan, Rule). Prevents silent bugs in the randomization and rule-evaluation logic. |
| Tailwind CSS | 4.x (bundled) | Utility-first styling | Bundled with `create-next-app` defaults. v4's `@theme` directive makes design tokens easy to customize. No context-switching between CSS files and components — fast to build drag-drop weekly grid UIs. |
| shadcn/ui | latest | Accessible component library | Copy-paste components built on Radix UI primitives. Officially supports Tailwind v4 and React 19. Provides Dialog, Select, Table, Popover, and DnD-ready Card components needed for meal slot editing. Owned in the project, not a node_modules black box. |
| Zustand | 5.0.12 | Client-side state management | Minimal boilerplate, no providers needed. Ideal for single-user apps where the weekly plan, locked meals, and meal library live in memory. Persist middleware syncs slices to localStorage or Dexie automatically. Far simpler than Redux or React Context for this use case. |
| Dexie.js | 4.3.0 | Local database (IndexedDB wrapper) | Single-user app with no backend — all meal library, rules, and saved plans live in the browser. Dexie provides a clean TypeScript API over raw IndexedDB, with the `useLiveQuery` hook for reactive UI updates. v4 adds Suspense integration. SQLite WASM is overkill; localStorage 5 MB cap is too small for a growing meal library. |

### LLM Integration

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Vercel AI SDK | 6.0.116 (package: `ai`) | LLM orchestration layer | Unified TypeScript API for calling Claude (and other providers) from Next.js API routes. `generateObject` with a Zod schema returns fully typed, schema-validated JSON — no manual JSON parsing or retry logic. Works with both `@ai-sdk/anthropic` and direct Anthropic SDK. |
| `@ai-sdk/anthropic` | latest | Anthropic provider for AI SDK | Official provider adapter. Plugs Claude models into `generateObject` cleanly. Swap model IDs without changing call structure. |
| Claude Haiku 4.5 (`claude-haiku-4-5`) | — | Rule parsing and meal filter generation | At $1/$5 per million tokens and fastest latency, Haiku is the right tier for this task. Rule parsing is a single, constrained prompt ("translate this English rule into a JSON filter object") — not an agentic reasoning task. Haiku's intelligence is sufficient; Sonnet's cost premium is not justified for interactive, user-triggered calls. |

**Model selection rationale:** The LLM task here is narrow — parse a natural language rule like "Fridays are fish days" into a structured filter object. This is a classification/extraction task, not complex reasoning. Claude Haiku 4.5 handles it reliably at 5x lower cost than Sonnet. If rule parsing quality is unsatisfactory in testing, the upgrade path to `claude-sonnet-4-6` is a one-line model ID change.

### Food Database

| Approach | Version | Purpose | Why Recommended |
|----------|---------|---------|-----------------|
| Custom Dexie database seeded from curated JSON | — | Indian meal library | No existing open dataset structures meals as Base + Curry + Subzi + Extras — the app's core data model. Edamam and USDA databases are Western-nutrition-focused and lack this compositional structure. The 6000+ Indian recipe datasets on Kaggle and Mendeley are recipe datasets, not meal-component libraries. The app needs 50-150 curated Indian meals (rice, roti, dosa as bases; dal, sabzi, curry as sides) — build it manually or seed from a curated JSON file. This is 1-2 days of data entry, not an engineering problem. |

### Export Libraries

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| `@react-pdf/renderer` | 4.3.2 | PDF export of weekly meal plan | Produces real vector PDFs with selectable text — not rasterized screenshots. Uses React-like JSX primitives (`View`, `Text`, `Image`) to compose a weekly plan grid. Runs client-side (no server needed). 860K weekly downloads, actively maintained. `react-pdf-table` companion library handles tabular weekly plan layout. |
| `html-to-image` | latest | Image export / share | Converts a DOM element to PNG/JPEG/SVG without a server. More modern API than html2canvas (uses `foreignObject` SVG rendering, handles modern CSS better). Ideal for "share as image" feature where users export the week grid as a PNG for WhatsApp/messaging. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Biome | Linting + formatting | `create-next-app` now offers Biome as an alternative to ESLint. Faster than ESLint + Prettier combo. Single config, single tool. |
| Vitest | Unit testing | Faster than Jest in Next.js projects. Critical for testing the meal randomization and rule-evaluation logic in isolation. |

## Installation

```bash
# Scaffold project (App Router, TypeScript, Tailwind, Turbopack defaults)
npx create-next-app@latest food-planner --yes

# LLM integration
npm install ai @ai-sdk/anthropic zod

# Local database
npm install dexie

# State management
npm install zustand

# UI components (shadcn/ui uses CLI-based installation)
npx shadcn@latest init

# Export
npm install @react-pdf/renderer html-to-image

# PDF table helper
npm install react-pdf-table

# Dev dependencies
npm install -D vitest @vitest/ui
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Next.js 16 | SvelteKit 2 | If the team has strong Svelte experience or bundle size is a primary constraint (Svelte ships 50-70% less JS). For this project, the React ecosystem (shadcn/ui, Dexie hooks, AI SDK) justifies staying on Next.js. |
| Next.js 16 | Remix v2 | If progressive enhancement and web standards primitives matter more than ecosystem breadth. Remix has excellent form handling but a smaller component library ecosystem than React/Next.js. |
| Claude Haiku 4.5 | GPT-4o mini | If OpenAI is already in use elsewhere. For a greenfield project with no vendor lock-in, Claude Haiku 4.5's pricing ($1/$5 per MTok) matches GPT-4o mini ($0.15/$0.6 per MTok — cheaper, but requires OpenAI account). Claude's structured outputs are natively constrained via grammar decoding, while OpenAI's JSON mode relies on prompting. Either works. |
| Claude Haiku 4.5 | Claude Sonnet 4.6 | If rule parsing quality proves insufficient for complex multi-condition rules during testing. One-line model ID change. |
| Dexie.js | SQLite WASM (OPFS) | If complex SQL queries (full-text search, multi-table JOINs) are needed later. For this app's data model, Dexie's query API is sufficient. SQLite WASM adds 30-40ms startup overhead and OPFS browser support constraints. |
| `@react-pdf/renderer` | html2canvas + jsPDF | If pixel-faithful screenshot exports are preferred over structured PDFs. html2canvas produces rasterized images embedded in PDF — text is not selectable or searchable. Avoid for a plan document users may want to copy-paste from. |
| `@react-pdf/renderer` | Puppeteer (server-side) | If PDF fidelity of complex CSS layouts is critical. Puppeteer renders real Chromium — perfect pixel match — but requires a server/lambda, adding infrastructure complexity inappropriate for a personal app. |
| Zustand | Jotai | If atomic state granularity is needed per meal slot. Zustand stores are sufficient for this app's data shape. Jotai adds complexity without benefit at this scale. |
| Custom curated DB | Edamam Food API | If nutritional data becomes a requirement in v2. Edamam has good Indian food coverage for nutrition lookups. For v1 (scheduling only, no calorie tracking), it's unnecessary API cost and complexity. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Redux Toolkit | Massive boilerplate for a single-user app with no server synchronization. The meal library, plan state, and locked meals fit cleanly in 2-3 Zustand stores. | Zustand 5 |
| html2canvas + jsPDF | Produces image-based PDFs where text cannot be selected or searched. The meal plan is a document users will read repeatedly — searchable text matters. Also, html2canvas has known rendering issues with modern CSS (grid, flexbox, custom properties). | `@react-pdf/renderer` |
| Prisma + PostgreSQL | A full relational database and ORM is architectural overkill for a single-user personal app. All data lives in one browser session. | Dexie.js (IndexedDB) |
| Firebase / Supabase | Real-time database sync and auth services are unnecessary when there is exactly one user and no backend needed. Adds vendor dependency, egress costs, and complexity. | Dexie.js (IndexedDB) |
| React Query / TanStack Query | Designed for server state (cache, refetch, optimistic updates). This app has no server state — all data is local. Adds unnecessary complexity. | Zustand + Dexie |
| Claude Opus 4.6 | $5/$25 per MTok for a rule-parsing task is 5x the cost of Sonnet and 25x Haiku with no quality improvement for this specific, narrow task. | Claude Haiku 4.5 |
| Claude 3 Haiku (`claude-3-haiku-20240307`) | Deprecated — retirement date April 19, 2026. Do not start new projects on this model. | Claude Haiku 4.5 (`claude-haiku-4-5`) |
| localStorage for meal data | 5 MB hard cap. A meal library with images or even moderate metadata (50+ meals, saved plans, rule history) will hit this limit. | Dexie.js (IndexedDB) |
| Webpack (explicit) | Next.js 16 uses Turbopack by default. Forcing Webpack loses 40-70% faster HMR speeds in development. | Turbopack (Next.js default) |

## Stack Patterns by Variant

**If deploying to Vercel (recommended for personal use):**
- Use Next.js API routes for LLM calls (keeps API key server-side)
- Free tier covers hobby usage; no server management needed
- Because Vercel is the natural deployment target for Next.js with zero config

**If deploying as a purely static/local app (no server):**
- Move LLM calls to a server-side proxy or use Anthropic SDK from the browser with a CORS-safe endpoint
- All Dexie data stays local anyway — no architecture changes needed
- Because browser security prevents exposing API keys in client-side code

**If the meal library grows beyond 500 items:**
- Add Dexie full-text search (`dexie-full-text-search`) plugin for meal lookup
- Because IndexedDB has no native full-text search; Dexie plugin fills this gap efficiently

**If sharing/collaboration becomes a requirement (v2+):**
- Add a backend (Supabase or Convex) with plan export/import via URL
- Current Dexie-first architecture does not need to change — add sync layer on top
- Because the local-first model is forward compatible with cloud sync

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| Next.js 16.x | React 19, TypeScript 5.x, Tailwind CSS 4.x | All bundled via `create-next-app` defaults |
| shadcn/ui (latest) | Tailwind CSS 4.x, React 19 | Full v4 support confirmed in shadcn docs |
| Zustand 5.x | React 18+ and React 19 | Uses `useSyncExternalStore`; compatible with React 19 concurrent features |
| Dexie 4.x | React 18+, TypeScript 5.x | `useLiveQuery` hook is stable; `useSuspendingLiveQuery` is experimental |
| `@react-pdf/renderer` 4.x | React 18+, Node 18+ | Runs in browser and Node; compatible with Next.js API routes for server-side PDF generation if needed |
| Vercel AI SDK 6.x (`ai`) | Next.js 15+, TypeScript 5.x | `generateObject` works with `@ai-sdk/anthropic` and `zod` schemas |
| Claude Haiku 4.5 | Anthropic API, Vercel AI SDK 6 | Use model ID `claude-haiku-4-5`; structured outputs beta header optional when using Vercel AI SDK's `generateObject` |

## Sources

- [Anthropic Models Overview](https://platform.claude.com/docs/en/about-claude/models/overview) — Model IDs, pricing, context windows (HIGH confidence, official docs, fetched 2026-03-19)
- [Next.js Installation Docs](https://nextjs.org/docs/app/getting-started/installation) — Version 16.2.0, default stack confirmed (HIGH confidence, official docs, fetched 2026-03-19)
- [Vercel AI SDK Introduction](https://ai-sdk.dev/docs/introduction) — v6, Anthropic provider, `generateObject` capability (HIGH confidence, official docs)
- [Anthropic Structured Outputs Docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) — Constrained decoding, Zod/JSON Schema support (HIGH confidence, official docs)
- [Dexie.js npm registry](https://www.npmjs.com/package/dexie) — v4.3.0, confirmed via `npm show` (HIGH confidence)
- [Zustand npm registry](https://www.npmjs.com/package/zustand) — v5.0.12, confirmed via `npm show` (HIGH confidence)
- [@react-pdf/renderer npm](https://www.npmjs.com/package/@react-pdf/renderer) — v4.3.2, confirmed via `npm show` (HIGH confidence)
- [shadcn/ui Tailwind v4 docs](https://ui.shadcn.com/docs/tailwind-v4) — Full v4 support, React 19 compatibility (HIGH confidence, official docs)
- WebSearch: Next.js vs Remix vs SvelteKit 2025 comparison — Framework selection rationale (MEDIUM confidence, multiple sources agree)
- WebSearch: Indian food datasets (Kaggle, Mendeley, arxiv Khana) — No suitable structured open dataset for Base+Curry+Subzi model (MEDIUM confidence, surveyed available datasets)
- WebSearch: html-to-image vs html2canvas 2025 — Image export approach (MEDIUM confidence, community sources)

---
*Stack research for: Indian food meal planner web app with LLM rule parsing*
*Researched: 2026-03-19*
