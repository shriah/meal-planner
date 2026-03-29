---
phase: 17-curry-compatibility-data
status: draft
nyquist_compliant: false
wave_0_complete: false
last_updated: 2026-03-29
---

# Phase 17 Validation

## Scope

Phase 17 validates curry compatibility as persisted Library data:
- explicit `compatible_base_category_ids` on curry records
- curated seeded compatibility mappings
- upgrade/backfill for legacy curry rows
- category delete normalization for curry compatibility
- Library form and collapsed-row warning/summary behavior

Generator enforcement and explicit override behavior are out of scope for this phase and belong to Phases 18 and 19.

## Requirement Map

| Requirement | Validation Target | Command |
|---|---|---|
| CURRY-01 | Curry Library create/edit checklist, collapsed labels, zero-compatible warning | `npx vitest run src/components/library/ComponentForm.test.tsx src/components/library/ComponentRow.test.tsx` |
| CURRY-02 | Seeded curry compatibility materialization plus Dexie upgrade/backfill behavior | `npx vitest run src/db/seed.test.ts src/db/migrations.test.ts` |
| CURRY-07 | Category-ID-safe delete normalization and rename-safe label resolution | `npx vitest run src/services/food-db.test.ts src/components/library/ComponentForm.test.tsx src/components/library/ComponentRow.test.tsx` |

## Validation Commands

### Focused commands

```bash
npx vitest run src/db/seed.test.ts
npx vitest run src/db/migrations.test.ts src/services/food-db.test.ts
npx vitest run src/components/library/ComponentForm.test.tsx src/components/library/ComponentRow.test.tsx
```

### Phase gate

```bash
npx vitest run src/db/seed.test.ts src/db/migrations.test.ts src/services/food-db.test.ts src/components/library/ComponentForm.test.tsx src/components/library/ComponentRow.test.tsx
npm test
```

## Wave 0 Gaps

- [ ] `src/db/seed.test.ts` proves seeded/default curries materialize explicit curated compatibility arrays
- [ ] `src/db/migrations.test.ts` proves curated upgrade, all-base fallback, and preservation of explicit `[]`
- [ ] `src/services/food-db.test.ts` proves delete normalization strips deleted base IDs from curry compatibility arrays
- [ ] `src/components/library/ComponentForm.test.tsx` proves curry checklist editing and zero-compatible warning behavior
- [ ] `src/components/library/ComponentRow.test.tsx` proves collapsed curry summaries and zero-compatible badge state

## Approval Standard

This phase is ready for execution when:
- the focused DB and Library UI tests above exist and pass
- the phase gate command passes
- the phase summary updates this file to approved Nyquist state with rerun evidence

---
*Validation contract created: 2026-03-29*
