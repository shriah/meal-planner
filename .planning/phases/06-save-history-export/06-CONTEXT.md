# Phase 6: Save, History, and Export - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can navigate between calendar weeks, each with its own auto-saved plan. Past weeks are read-only. The current and future weeks are editable. The current plan can be exported as a clean PNG image suitable for sharing on WhatsApp.

**Scope change from original ROADMAP:** The original spec described named plan saving and a history browser. After discussion, this was replaced with a calendar-week model — plans auto-save per week (keyed by week start date), no manual naming. SAVE-01 and SAVE-02 requirements are reinterpreted under this model.

</domain>

<decisions>
## Implementation Decisions

### Week storage model
- **D-01:** Each week is stored as its own Dexie record, keyed by ISO week start date (e.g., `"2026-03-17"`) — not a user-chosen name
- **D-02:** Auto-save on every change (same fire-and-forget pattern as current `saveActivePlan`) — no explicit save button
- **D-03:** Use `saved_plans` table for all weeks; current `active_plan` singleton is superseded or remains for "current week" fast-path — implementation decision
- **D-04:** `SavedPlanRecord.slots: unknown` must be typed as `WeeklyPlan`; a `locks` field and `week_start` field must be added

### Week navigation
- **D-05:** Week navigator lives above the plan grid inside the plan board (not in AppNav)
- **D-06:** Navigation is unlimited — user can navigate to any past or future week
- **D-07:** Past weeks are read-only — no Regenerate, no lock toggles, no swap
- **D-08:** Future weeks start blank — show an empty state with a "Generate plan for this week" prompt; do not auto-generate
- **D-09:** Navigating back to the current week loads the active plan's current state

### Export image design
- **D-10:** Layout is a vertical list — 7 rows, one per day (portrait orientation, optimized for phone screens)
- **D-11:** Each day shows all three slots with label + component names: `"Breakfast: Idli, Sambar · Lunch: Rice, Dal, Aloo Gobi · Dinner: Roti, Paneer"`
- **D-12:** Image has a header with the week date range — e.g., `"Week of Mar 17–23, 2026"`
- **D-13:** Color-coded by meal slot (breakfast / lunch / dinner each get a distinct background color); overall style is simple and clean — not decorative
- **D-14:** Rendered via **satori + resvg-js** — JSX → SVG → PNG; no DOM capture (html2canvas not used)

### Export trigger
- **D-15:** Export button lives in the PlanActionBar, available on all weeks (current and past read-only)
- **D-16:** On desktop — triggers browser download (PNG saved to Downloads)
- **D-17:** On mobile — triggers native Web Share API with the PNG as the shared file; fall back to download if share not available

### Claude's Discretion
- Exact color palette for breakfast/lunch/dinner slots in the PNG (should align with app design tokens in `globals.css`)
- Whether `active_plan` singleton is kept as a write-through cache or removed in favor of week-keyed `saved_plans`
- Font and sizing in the satori template
- Whether the week navigator shows only the current week date range or also allows typing/picking a date

</decisions>

<specifics>
## Specific Ideas

- Portrait layout for the PNG is intentional — optimized for WhatsApp sharing on phones (tall image, not wide)
- The app already has color design tokens in `globals.css` — the PNG color palette should be derived from those, not arbitrary colors
- The read-only past week view should feel clearly distinct from the editable current-week view — visual cue like a banner or muted colors

</specifics>

<canonical_refs>
## Canonical References

No external specs — requirements are fully captured in decisions above.

### Requirements being implemented
- `SAVE-01` — reinterpreted as: current week auto-saves; each week has its own Dexie slot keyed by week start date
- `SAVE-02` — reinterpreted as: user navigates prev/next between weeks; past weeks are read-only
- `EXPORT-01` — unchanged: export current plan as PNG suitable for sharing

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/services/plan-db.ts` — `saveActivePlan` / `getActivePlan` pattern; Phase 6 extends with week-keyed equivalents (`saveWeekPlan`, `getWeekPlan`)
- `src/stores/plan-store.ts` — Zustand store; needs `currentWeekStart` state + `navigateToWeek(date)` action + read-only mode flag
- `src/components/plan/PlanBoard.tsx` — main grid; week navigator slots in above it; read-only mode needs to suppress lock toggles and MealPickerSheet
- `src/components/plan/PlanActionBar.tsx` — add Export button here alongside Regenerate
- `src/db/client.ts` — `SavedPlanRecord` needs `week_start: string`, `locks: Record<string, boolean>`, and `slots` retyped as `WeeklyPlan`; requires `db.version(4)` migration
- `src/types/plan.ts` — `WeeklyPlan`, `PlanSlot` are the types the PNG renderer will consume

### Established Patterns
- Singleton key pattern (`'current'`, `'prefs'`) — week keys will be ISO date strings (`'2026-03-17'`)
- Fire-and-forget `saveActivePlan` — same pattern for week auto-save
- `useLiveQuery` for reactive DB reads — use for loading week records on navigation
- `db.version(N)` migrations — Phase 6 needs version 4 to add `week_start` + `locks` to `saved_plans`

### Integration Points
- PlanBoard receives `isReadOnly` prop (or derives from `currentWeekStart < today`)
- `plan-store` becomes week-aware: `currentWeekStart` drives which Dexie record is loaded/saved
- PNG export reads from Zustand store's `plan` (already resolved component IDs) — needs component names resolved from DB for display

</code_context>

<deferred>
## Deferred Ideas

- The todo "Refactor and move slot setting to Rules tab" is captured separately — not part of Phase 6
- PDF export (`EXP-02`) — explicitly v2 scope per REQUIREMENTS.md
- Cross-week rotation rules (`RULE-07`) — v2 scope

</deferred>

---

*Phase: 06-save-history-export*
*Context gathered: 2026-03-22*
