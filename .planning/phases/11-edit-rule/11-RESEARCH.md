# Phase 11: Edit Rule - Research

**Researched:** 2026-03-27
**Domain:** Rule editing UI on Next.js App Router with Dexie persistence
**Confidence:** HIGH

<user_constraints>
## User Constraints

No `CONTEXT.md` exists for this phase.

Locked scope from roadmap / requirements / UI spec:
- Edit happens inline from the rules list on `/rules`; no navigation to a separate edit page.
- The edit UI is a right-side `Sheet` overlay.
- The form must open fully pre-populated from the persisted rule.
- Saving must overwrite the existing Dexie row, not create a duplicate.
- Cancel, close, and Escape must discard unsaved edits.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EDIT-01 | User can open an edit sheet for any existing rule from the rules list | Add a controlled `Sheet` from `RuleRow` using the existing shadcn/Radix pattern |
| EDIT-02 | Edit sheet opens with RuleForm pre-populated with the rule's current target, scope, and effects | Implement `decompileRule(compiled_filter) -> RuleFormState` as a pure inverse of `compileRule` |
| EDIT-03 | Saving overwrites the existing rule record in Dexie (no duplicate created) | Use `updateRule(rule.id, ...)`, preserve `enabled` and `created_at`, and add CRUD/UI tests that assert rule count is unchanged |
| EDIT-04 | Closing or canceling the sheet discards unsaved changes | Keep sheet form state local and re-seed from the original rule each time the sheet opens |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Read the relevant guide in `node_modules/next/dist/docs/` before writing code because this project uses a breaking-change-heavy Next.js version.
- Heed deprecation notices from local Next.js docs instead of relying on older framework knowledge.

## Summary

Phase 11 is not primarily a modal task. The hard part is reversible rule state. The current app has a one-way pipeline: `RuleFormState -> compileRule() -> RuleRecord.compiled_filter`. Edit support requires the inverse mapping to be exact for every current persisted rule shape, otherwise the sheet will silently reset fields and fail EDIT-02.

The safest implementation is to keep editing entirely local to each `RuleRow`: a controlled `Sheet`, a local reducer-backed form state, and a save path that calls Dexie `updateRule()` with the existing `id`. `useLiveQuery(getRules)` already keeps the list reactive, so a successful update should refresh the row without any manual cache invalidation.

One planning gap is error toast infrastructure. The UI spec requires a toast on save failure, but the repo currently has no toast usage or toaster provider. Plan either a tiny Wave 0 to add `sonner`, or explicitly confirm a different error surface. Do not use deprecated shadcn toast for new work.

**Primary recommendation:** Build a reusable `decompileRule` + shared form-state module first, then compose a dedicated `EditRuleSheet` around it and prove overwrite semantics with Vitest.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js App Router | 16.2.0 (installed) | Route shell and client/server boundaries | Existing app already uses App Router pages under `src/app/` |
| React | 19.2.4 (installed) | Local component state and effects | Existing rule UI is already reducer-driven React client code |
| Dexie | 4.3.0 (installed) | IndexedDB CRUD for `rules` table | Existing persistence layer already exposes `addRule`, `updateRule`, `deleteRule`, `getRules` |
| dexie-react-hooks | 4.2.0 (installed) | Reactive rule list updates via `useLiveQuery` | Existing `RuleList` already depends on it; no extra state layer needed |
| shadcn Sheet (Radix Dialog based) | repo-local installed | Controlled edit overlay with Escape/close semantics | Matches UI spec and existing component inventory |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | 0.577.0 (installed) | `Pencil` edit icon | For the `RuleRow` edit action button |
| sonner | not installed in repo; recommended for this phase | Failure toast on save error | Use only if implementing the UI-spec toast requirement |
| Vitest + Testing Library + happy-dom | 4.1.0 / 16.3.2 / 20.8.4 (installed) | Pure function and component interaction tests | For `decompileRule`, save overwrite, and discard behavior |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline sheet editing from `RuleRow` | Separate `/rules/[id]/edit` page | Violates phase goal and adds navigation complexity |
| Dexie `updateRule(id, changes)` | Rebuild object and `put()` | `update()` is simpler for in-place overwrite and avoids accidental insert semantics |
| `sonner` for new error toasts | Deprecated shadcn `toast` component | Official shadcn docs now deprecate the toast component in favor of Sonner |

**Installation:**
```bash
npm install sonner
```

Only needed if the plan chooses to satisfy the save-failure toast requirement exactly as written in the UI spec.

**Version verification:** Package versions above were verified against the repo's installed dependency graph (`package-lock.json`). I did not verify latest registry publish versions from the shell because networked `npm view` is not available in this environment.

## Architecture Patterns

### Recommended Project Structure
```text
src/
├── components/rules/
│   ├── RuleRow.tsx              # Keeps row actions and sheet open state
│   ├── EditRuleSheet.tsx        # New local editing shell around shared form pieces
│   ├── form-state.ts            # Shared initialState, reducer, validator
│   └── RuleFormFields/RuleFields.tsx
└── services/
    └── rule-compiler.ts         # compileRule + decompileRule pair
```

### Pattern 1: Share form state, do not fork it
**What:** Extract `initialState`, `formReducer`, and `isFormValid` from [`src/components/rules/RuleForm.tsx`](/Users/harish/workspace/food-planner/src/components/rules/RuleForm.tsx) into a shared module consumed by both the create route and the edit sheet.

**When to use:** Immediately. Edit support otherwise duplicates reducer logic and guarantees future drift between create/edit behavior.

**Why:** The current reducer, validation, and effect shape rules are embedded inside `RuleForm.tsx`, but the edit sheet needs the exact same state machine with different save behavior.

### Pattern 2: Make `decompileRule` the inverse of `compileRule`
**What:** Add a pure function that maps `CompiledRule` back to `RuleFormState`.

**When to use:** Before any sheet UI wiring. Pre-population is blocked until this exists.

**Local mapping rules to preserve:**
- `scope.days === null` -> `days: []`
- `scope.slots === null` -> `slots: []`
- `target` variants map directly back to `TargetFormState`
- `filter_pool | require_one | exclude | no_repeat` -> `selection`
- `allowed_slots`, `skip_component`, `exclude_extra`, `require_extra` map back to their corresponding arrays
- Missing effect variants -> empty arrays / `selection: ''`

### Pattern 3: Controlled sheet with local reset-on-open
**What:** `RuleRow` owns `open` state and passes `rule`, `open`, and `onOpenChange` into `EditRuleSheet`.

**When to use:** For EDIT-01 and EDIT-04.

**Implementation shape:**
- Open button sets `open = true`
- `EditRuleSheet` uses `useReducer` for local draft state
- `useEffect` or equivalent reset logic dispatches `LOAD_PRESET` from the current `rule` each time the sheet opens
- Close, Escape, and "Discard Changes" only flip `open` false
- Save calls `updateRule(rule.id!, { name, compiled_filter, enabled: rule.enabled })`

### Anti-Patterns to Avoid
- **Reducer duplication:** Copy-pasting `formReducer` into a second component will drift quickly and break create/edit parity.
- **Hydrating from partial fields:** Do not infer only the visible subset; EDIT-02 requires every persisted field to round-trip.
- **Using `addRule` for edits:** This will create duplicates and fail the phase even if the UI appears to save.
- **Keeping dirty edit state after close:** The sheet must reinitialize from the source record on every open, not from the last unsaved draft.
- **Introducing a custom modal or keyboard handler:** Radix Sheet already handles focus trap, Escape, overlay dismissal, and accessibility.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Overlay focus/Escape handling | Custom drawer/modal logic | Existing shadcn `Sheet` | Radix already handles dialog accessibility and close interactions |
| Rule list cache refresh | Manual local rule cache | `useLiveQuery(getRules)` | Dexie already re-renders observers after Dexie writes |
| IndexedDB overwrite flow | Delete-then-add or manual array replacement | `updateRule(id, changes)` | Keeps row identity stable and avoids duplicate inserts |
| Toast system | Ad-hoc alert banner for transient save errors | `sonner` if toast is required | shadcn marks old toast component deprecated |

**Key insight:** The only custom logic worth building here is the pure compile/decompile pair. Everything else already has a framework or project-standard primitive.

## Common Pitfalls

### Pitfall 1: Non-lossless decompilation
**What goes wrong:** The sheet opens with target, scope, or composition effects blank even though the stored rule contains them.

**Why it happens:** `compileRule` is currently one-way, and planning treats prefill as a trivial prop-mapping problem instead of a schema inversion problem.

**How to avoid:** Write `decompileRule` as a pure function with explicit coverage for every `target.mode` and `effect.kind`, then add round-trip tests.

**Warning signs:** Existing meal-template-derived rules lose `allowed_slots`, skip types, or required extra categories when opened for edit.

### Pitfall 2: Create and edit forms diverge
**What goes wrong:** New Rule and Edit Rule validate differently or support different fields after later changes.

**Why it happens:** The reducer and validator live only inside `RuleForm.tsx`.

**How to avoid:** Move form state helpers into a shared module before adding the sheet.

**Warning signs:** A field added to create flow is missing or behaves differently in edit flow.

### Pitfall 3: Silent duplicate rows
**What goes wrong:** Editing appears to work, but a second rule is created and the rule count increases.

**Why it happens:** Save path uses `addRule()` or `put()` without a guaranteed primary key.

**How to avoid:** Use `updateRule(rule.id!, ...)` and add a test that asserts rule count is unchanged after save.

**Warning signs:** Edited rule moves position, gets a new `id`, or rule count increments.

### Pitfall 4: Unsaved state survives close/reopen
**What goes wrong:** User closes the sheet, reopens it, and sees stale unsaved values instead of the persisted rule.

**Why it happens:** Local reducer state is initialized once on mount instead of reset per open cycle.

**How to avoid:** Re-dispatch `LOAD_PRESET` from the source rule whenever the sheet transitions to open.

**Warning signs:** Escape closes the sheet, but reopen shows previous draft edits.

### Pitfall 5: Toast requirement slips past planning
**What goes wrong:** Implementation finishes without the failure toast required by the UI spec, or introduces deprecated toast primitives.

**Why it happens:** The repo currently has no toast infrastructure, so planners may assume it already exists.

**How to avoid:** Decide explicitly: add `sonner` and app-level `<Toaster />`, or treat this as a clarified scope decision before execution.

**Warning signs:** No `toast`/`Toaster`/`sonner` usage exists anywhere in `src/`.

## Code Examples

Verified patterns from official sources:

### Controlled reactive query
```tsx
const rules = useLiveQuery(() => getRules(), [], [])

if (!rules) return null
```

Source: Dexie `useLiveQuery()` docs show `querier`, optional `deps`, and optional `defaultResult`, and confirm Dexie writes like `Table.update()` trigger rerenders.

### Controlled sheet shell
```tsx
<Sheet open={open} onOpenChange={onOpenChange}>
  <SheetContent side="right">
    <SheetHeader>
      <SheetTitle>Edit Rule</SheetTitle>
    </SheetHeader>
  </SheetContent>
</Sheet>
```

Source: shadcn Sheet docs and Radix Dialog controlled `open` / `onOpenChange` pattern.

### In-place Dexie overwrite
```ts
await updateRule(rule.id!, {
  name: nextName,
  compiled_filter: compileRule(state),
  enabled: rule.enabled,
})
```

Source: Dexie `Table.update()` semantics plus existing [`src/services/food-db.ts`](/Users/harish/workspace/food-planner/src/services/food-db.ts).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate rule variants (`no-repeat`, `scheduling-rule`, `meal-template`) | Unified persisted `CompiledRule` with `target + scope + effects[]` | DB v9 migration in current codebase | Edit can target one persisted rule shape instead of multiple UI forms |
| Route-based create-only flow | Inline create route plus planned row-level sheet editing | Current phase | Reuse existing form internals, but keep save behavior local |
| shadcn `toast` | `sonner` for new transient notifications | Official shadcn docs mark toast deprecated | Do not add new code on deprecated toast primitive |

**Deprecated/outdated:**
- shadcn `Toast`: Official docs mark it deprecated and direct new work to `sonner`.

## Open Questions

1. **Should the save-failure toast be implemented in this phase or treated as a UI-spec mismatch?**
   - What we know: UI spec requires a toast; the repo currently has no toast system.
   - What's unclear: Whether adding app-level toaster infrastructure is acceptable inside this phase scope.
   - Recommendation: Decide during planning. If no clarification arrives, include `sonner` setup in Wave 0.

2. **Where should shared form state live?**
   - What we know: Current create form owns reducer, initial state, and validation privately.
   - What's unclear: Whether the team prefers `form-state.ts` under `components/rules/` or a service/helper module.
   - Recommendation: Keep state-machine concerns near the form components (`src/components/rules/form-state.ts`) and keep compile/decompile in `src/services/rule-compiler.ts`.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified). This phase is code/config-only work on existing Next.js, Dexie, and test infrastructure already present in the repo.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 + Testing Library + happy-dom |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- src/services/rule-compiler.test.ts src/services/food-db.test.ts src/components/rules/RuleRow.test.tsx` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EDIT-01 | Edit button opens sheet from a rule row | component | `npm test -- src/components/rules/RuleRow.test.tsx -t "opens edit sheet"` | ❌ Wave 0 |
| EDIT-02 | Sheet loads all persisted fields into editable form state | unit + component | `npm test -- src/services/rule-compiler.test.ts src/components/rules/RuleRow.test.tsx` | `rule-compiler.test.ts` ✅, row test ❌ |
| EDIT-03 | Save updates existing record and rule count stays constant | service + component | `npm test -- src/services/food-db.test.ts src/components/rules/RuleRow.test.tsx` | `food-db.test.ts` ✅, row test ❌ |
| EDIT-04 | Close/cancel/Escape discard draft changes | component | `npm test -- src/components/rules/RuleRow.test.tsx -t "discards unsaved edits"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test -- src/services/rule-compiler.test.ts src/services/food-db.test.ts src/components/rules/RuleRow.test.tsx`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] [`src/components/rules/RuleRow.test.tsx`](/Users/harish/workspace/food-planner/src/components/rules/RuleRow.test.tsx) — open/save/discard interactions for edit sheet
- [ ] Extend [`src/services/rule-compiler.test.ts`](/Users/harish/workspace/food-planner/src/services/rule-compiler.test.ts) — add `decompileRule` and round-trip cases for scheduling and meal-template-derived rules
- [ ] Extend [`src/services/food-db.test.ts`](/Users/harish/workspace/food-planner/src/services/food-db.test.ts) — assert updating name/compiled filter preserves row count and primary key

## Sources

### Primary (HIGH confidence)
- Local codebase:
  - [`src/components/rules/RuleForm.tsx`](/Users/harish/workspace/food-planner/src/components/rules/RuleForm.tsx) - current reducer, validation, save flow
  - [`src/components/rules/RuleRow.tsx`](/Users/harish/workspace/food-planner/src/components/rules/RuleRow.tsx) - current row actions and delete pattern
  - [`src/components/rules/RuleList.tsx`](/Users/harish/workspace/food-planner/src/components/rules/RuleList.tsx) - `useLiveQuery(getRules)` pattern
  - [`src/services/rule-compiler.ts`](/Users/harish/workspace/food-planner/src/services/rule-compiler.ts) - one-way compile implementation
  - [`src/services/food-db.ts`](/Users/harish/workspace/food-planner/src/services/food-db.ts) - `addRule`, `updateRule`, `deleteRule`
  - [`src/db/client.ts`](/Users/harish/workspace/food-planner/src/db/client.ts) - unified `CompiledRule` migration boundary
  - [`vitest.config.ts`](/Users/harish/workspace/food-planner/vitest.config.ts) and [`src/test/setup.ts`](/Users/harish/workspace/food-planner/src/test/setup.ts) - test infrastructure
- Dexie `useLiveQuery()` docs: https://dexie.org/docs/dexie-react-hooks/useLiveQuery%28%29
- shadcn Sheet docs: https://ui.shadcn.com/docs/components/radix/sheet
- shadcn Toast docs (deprecation notice): https://ui.shadcn.com/docs/components/radix/toast
- Radix Dialog docs: https://www.radix-ui.com/primitives/docs/components/dialog
- Next local docs:
  - [`node_modules/next/dist/docs/index.md`](/Users/harish/workspace/food-planner/node_modules/next/dist/docs/index.md)
  - [`node_modules/next/dist/docs/01-app/index.md`](/Users/harish/workspace/food-planner/node_modules/next/dist/docs/01-app/index.md)

### Secondary (MEDIUM confidence)
- `sonner` npm package page for current install guidance: https://www.npmjs.com/package/sonner/v/1.4.2

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - mostly repo-verified installed dependencies plus official component/docs references
- Architecture: HIGH - based on existing local patterns and official controlled Sheet / Dexie observation behavior
- Pitfalls: HIGH - directly derived from current one-way compiler, missing toast infra, and existing reducer placement

**Research date:** 2026-03-27
**Valid until:** 2026-04-26
