# Domain Pitfalls

**Domain:** Existing Indian meal planner adding curry/base compatibility with rule-based override semantics
**Researched:** 2026-03-29
**Overall confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Compatibility becomes a second rule system instead of a generator default
**What goes wrong:** Curry/base compatibility is implemented as ad hoc conditionals in one branch of `generate()` while existing rules still run separately. The milestone ships two competing semantics: "hard default compatibility" and "compiled rule effects", with no single precedence contract.
**Why it happens:** The current architecture already has one rule pipeline: target + scope + effects compiled at save time, then applied synchronously in the generator. Adding curry compatibility as a special-case branch outside that model is the shortest implementation path, but it creates hidden precedence.
**Consequences:** Rule overrides behave inconsistently, warning messages become misleading, and later rule work has to reverse-engineer one-off compatibility behavior.
**Prevention:** Define the precedence contract before coding:
- Default generator constraint: curry pool is compatibility-filtered after base selection.
- Explicit override: only a clearly named override path may bypass compatibility.
- Relaxation: compatibility is never silently relaxed unless the override path or locked/manual selection explicitly requests it.
Keep the compatibility filter and override check in one helper so generator, tests, and future picker logic all call the same policy.
**Detection:** If product language says "hard default" but code review finds multiple scattered `compatible_*` checks or multiple warning texts for the same incompatibility, the contract is already drifting.
**Workstream:** Generator semantics + rule model

### Pitfall 2: Override semantics are ambiguous, so "explicit override" leaks into normal rules
**What goes wrong:** Existing `filter_pool`, `exclude`, and `require_one` rules accidentally bypass compatibility because they were not designed to distinguish "normal matching" from "intentional compatibility override".
**Why it happens:** The current generator lets `require_one` override from the full library, explicitly bypassing `filter_pool`. If curry compatibility is added without a separate override concept, every current `require_one` curry rule may become an implicit compatibility escape hatch.
**Consequences:** Users get incompatible curry/base pairings without understanding why. The app appears nondeterministic: some rules respect compatibility, some do not, depending on effect kind.
**Prevention:** Add explicit override semantics at the compiled-rule boundary, not as an inference from existing effects. Good options are:
- a dedicated effect/flag meaning "allow incompatible curry for this slot"
- or a dedicated target/effect combination that is only available for curries
Do not overload plain `require_one` to mean override unless the UI and descriptions say so. Update rule descriptions and impact preview so override intent is visible before save.
**Detection:** A test that requires a specific curry on a bread-based slot passes without any explicit override field. That is a bug, not convenience.
**Workstream:** Rule model, compiler/decompiler, rules UI

### Pitfall 3: Legacy category aliases drift from canonical category IDs during curry backfill
**What goes wrong:** New curry compatibility is stored partly in `compatible_base_category_ids` and partly in legacy string aliases like `base_type`/`compatible_base_types`, and the two stop matching after category rename/delete or partial edits.
**Why it happens:** v1.2 deliberately kept legacy string fields as defensive fallback while making numeric category IDs canonical. That was safe for extras because the migration and picker were updated together. Repeating the pattern for curries without tightening the contract creates a second long-lived dual-write path.
**Consequences:** Generated plans differ between old and newly edited curries, deleted categories leave stale compatibility lists behind, and migration bugs only appear on upgraded libraries.
**Prevention:** Treat `compatible_base_category_ids` as the only canonical field for curry compatibility in v1.3 runtime behavior. If temporary legacy mirrors are needed for existing helpers or seeds, they must be write-through only and covered by migration tests. Also extend delete normalization so removing a base category strips that ID from curry compatibility arrays exactly like extras today.
**Detection:** Any curry record can be saved with compatibility labels visible in the UI but `compatible_base_category_ids` missing or empty in Dexie. Any delete-category path leaves incompatible IDs on curries.
**Workstream:** Data model + Dexie migration + category normalization

### Pitfall 4: Backfill defaults overfit the seed library and silently corrupt user intent
**What goes wrong:** The app auto-populates compatibility for existing curries using simplistic heuristics such as "all lentil curries are rice-only" or "all curries compatible with all bases", and these guesses become invisible persisted truth.
**Why it happens:** The milestone explicitly requires backfilling existing curry data inside the app. That creates pressure to infer compatibility from names, `curry_category`, or regional tags even though those fields were not designed as authoritative compatibility metadata.
**Consequences:** Users inherit wrong defaults, generated plans suddenly lose variety or produce culturally odd pairings, and later manual cleanup is hard because users do not know which records were guessed.
**Prevention:** Make backfill policy explicit and conservative:
- distinguish seeded records from user-authored records
- prefer permissive-but-reviewable defaults over aggressive guesses
- record whether compatibility was backfilled vs. user-confirmed
- surface a library review affordance for curries that still have inferred compatibility
For existing user data, "unknown compatibility" is safer than pretending to know.
**Detection:** Large numbers of curries gain narrow compatibility without any user action, or tests only cover seed data and never upgraded real-world mixed libraries.
**Workstream:** Data migration + library UX

### Pitfall 5: Auto-generation, manual swap, and locked regeneration diverge
**What goes wrong:** The generator respects curry compatibility, but manual curry swaps or locked-slot regeneration still allow stale incompatible combinations without warning or intentional override semantics.
**Why it happens:** The current plan board architecture has separate paths:
- auto-generation in `src/services/generator.ts`
- manual selection in `src/components/plan/MealPickerSheet.tsx`
- locked replay through `lockedSlots` in `src/stores/plan-store.ts`
Today only extras picker filtering is category-aware. Curry picker currently loads all curries by type.
**Consequences:** Users can create incompatible plans manually, then future regenerations preserve them through locks. The feature appears broken because the same slot behaves differently depending on how it was created.
**Prevention:** Decide the UX contract for non-generator paths:
- manual picker should either filter to compatible curries by default and expose an explicit "show incompatible" action, or visibly mark incompatible options
- locked incompatible curry/base pairs must be preserved only as explicit existing state, not silently created by fresh generation
- warning banner language should distinguish "preserved locked incompatible pairing" from "generator relaxed a constraint"
**Detection:** A slot generated with chapati only shows compatible curries, but editing that same slot can pick any curry with no badge or warning. Regeneration then keeps it because it is locked.
**Workstream:** Plan board / picker UX + store semantics

### Pitfall 6: Compatibility interacts badly with meal-template skip rules and composition backlog boundaries
**What goes wrong:** Curry compatibility is used to encode composition intent such as "chapati should usually be subzi-only" or "idli prefers sambar over subzi", even though composition modes were explicitly deferred to backlog phase `999.1`.
**Why it happens:** The current generator picks base first, then independently decides curry/subzi while also honoring `skip_component` effects from meal-template rules. Curry compatibility is tempting as a shortcut for meal-shape behavior.
**Consequences:** Compatibility arrays become a hidden composition language, making future curry-vs-subzi mode work harder. Bread bases may end up with empty curry pools and misleading compatibility warnings when the real intent was "no curry".
**Prevention:** Keep scope hard:
- curry compatibility answers only "if a curry is chosen, which bases is it allowed with?"
- meal-template `skip_component` remains the only way to suppress curry entirely
- no v1.3 logic should infer subzi-only or curry-only behavior from compatibility metadata
Add explicit tests proving bread bases can still have compatible curries unless a template skips curry.
**Detection:** Product discussion or code review starts using phrases like "mark this curry incompatible so chapati gets subzi instead." That is backlog work leaking into this milestone.
**Workstream:** Generator semantics + roadmap guardrails

### Pitfall 7: Warning and explanation surfaces hide the real failure mode
**What goes wrong:** Users only see generic "no components match, constraint relaxed" warnings even when the actual issue is missing curry compatibility metadata, deleted base categories, or an override rule forcing an exception.
**Why it happens:** Current warnings in `generate()` are generic pool-relaxation strings. They work for broad scheduling rules, but curry compatibility adds a new class of domain-specific failures that users will need to debug.
**Consequences:** Users cannot tell whether they should edit a curry record, disable a rule, unlock a slot, or widen a base category. Debugging shifts from product to source code.
**Prevention:** Add domain-specific warning messages for:
- no compatible curries for selected base
- override rule forced incompatible curry
- locked/manual incompatible pairing preserved
- curry references deleted/missing base categories
Mirror the same language in rule descriptions or picker badges so runtime warnings match authoring semantics.
**Detection:** QA cannot explain why a slot ended up with no curry or an incompatible curry without stepping through the generator.
**Workstream:** Generator warnings + rules/library UX copy

### Pitfall 8: Test coverage only proves the happy path, not upgraded-state behavior
**What goes wrong:** New tests cover only fresh curry records with explicit compatibility, while real upgraded users have old curries, renamed categories, manual edits, locked plans, and existing rules that all combine.
**Why it happens:** The current suite is strong on generator behavior and prior category migration, but this milestone crosses data migration, rules, generator, and plan-board seams at once.
**Consequences:** The feature appears stable on clean DBs and fails only on actual user devices after upgrade.
**Prevention:** Require cross-seam coverage:
- migration tests for old curry rows with no compatibility metadata
- generator tests for default compatibility, explicit override, and impossible pools
- picker/store tests for compatible filtering and locked incompatible preservation
- normalization tests for deleted base categories removing curry compatibility IDs
Use upgraded fixtures, not just new records created in-test with the final schema.
**Detection:** The milestone ships with generator tests only, or all new tests create brand-new curries using the final UI path.
**Workstream:** Verification / regression harness

## Moderate Pitfalls

### Pitfall 1: Empty compatibility means two different things
**What goes wrong:** `[]` is used both for "unknown/not backfilled yet" and "compatible with nothing".
**Prevention:** Reserve one meaning. Recommended: missing/undefined means unknown legacy data; empty array means intentionally incompatible with all bases and should usually fail validation.
**Workstream:** Data model + validation

### Pitfall 2: Rule editing round-trips drop new override fields
**What goes wrong:** A rule saves with override intent, but edit mode strips that intent because `decompileRule()` and form state do not fully rehydrate it.
**Prevention:** Extend compile/decompile together and add a round-trip test exactly like the v1.2 edit-rule work.
**Workstream:** Rule compiler/decompiler + edit UI

### Pitfall 3: Seed updates hide migration gaps
**What goes wrong:** Seed curries are updated with perfect compatibility data, so clean installs look correct while upgraded installs rely on untested backfill behavior.
**Prevention:** Treat seed updates and migration/backfill as separate deliverables with separate verification.
**Workstream:** Seed data + migration

## Minor Pitfalls

### Pitfall 1: Library rows do not display curry compatibility clearly
**What goes wrong:** Users cannot audit which curries are constrained and which are still inferred.
**Prevention:** Show compatible base labels on curry rows, and distinguish inferred/defaulted values from confirmed ones if backfill uses inference.
**Workstream:** Library UI

### Pitfall 2: Picker search results hide compatibility state
**What goes wrong:** A curry appears selectable but the user cannot tell whether it is compatible, incompatible, or only available through override.
**Prevention:** Add badges or sectioning in the picker if incompatible options are ever shown.
**Workstream:** Plan board / picker UX

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation | Workstream |
|-------------|---------------|------------|------------|
| Curry schema and Dexie upgrade | Curry compatibility stored in mixed ID/string forms with partial backfill | Canonicalize on `compatible_base_category_ids`, add migration fixtures for upgraded DBs, normalize deleted category refs | Data + migration |
| Library authoring UI | Backfilled values look authoritative even when inferred | Mark inferred/defaulted compatibility and provide review/edit flow | Library UX |
| Rule engine changes | Existing `require_one` silently acts as compatibility override | Add explicit override semantics in compiled rule model and rule descriptions | Rule engine + UI |
| Generator integration | Compatibility filtered in one branch but relaxed elsewhere | Centralize curry/base filtering and precedence in one helper with explicit warning messages | Generator |
| Manual swap / plan editing | Picker allows incompatible curries while generator does not | Filter compatible curries by default or label/show incompatible via explicit action | Plan board / picker |
| Locked regeneration | Old incompatible slots are re-generated or silently preserved without explanation | Preserve only explicit locked/manual exceptions and label them clearly in warnings | Store + generator |
| Verification | Clean-install tests pass while upgrade paths fail | Run upgraded-fixture tests spanning migration, generator, picker, and lock flows | QA / regression |

## Milestone Guidance

The milestone should be split along the real risk boundaries, not by file type:

1. **Data and migration workstream**
   - Add curry compatibility fields canonically on category IDs.
   - Implement conservative backfill for existing curries.
   - Extend category delete normalization and migration fixtures.

2. **Rule semantics workstream**
   - Define one explicit override mechanism.
   - Extend compile/decompile, rule descriptions, and edit round-trips.
   - Reject ambiguous "override by accident" behavior.

3. **Generator and runtime behavior workstream**
   - Enforce compatibility as the default curry pool constraint.
   - Preserve explicit locked/manual exceptions without silently broadening generation.
   - Emit domain-specific warnings.

4. **Plan board and library UX workstream**
   - Surface compatibility in curry rows and edit forms.
   - Align picker behavior with generator semantics.
   - Make inferred/backfilled data reviewable.

5. **Regression workstream**
   - Cover upgraded DBs, renamed/deleted categories, locked incompatible slots, and explicit override cases.

## Sources

- `.planning/PROJECT.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `src/services/generator.ts`
- `src/services/generator.test.ts`
- `src/services/rule-compiler.ts`
- `src/db/client.ts`
- `src/db/migrations.test.ts`
- `src/components/library/ComponentForm.tsx`
- `src/components/library/ComponentRow.tsx`
- `src/components/plan/PlanBoard.tsx`
- `src/components/plan/MealPickerSheet.tsx`
- `src/stores/plan-store.ts`
