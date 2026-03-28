---
phase: 1
slug: data-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 |
| **Config file** | `vitest.config.ts` — does not yet exist (Wave 0 installs) |
| **Quick run command** | `npx vitest run src/services/food-db.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/services/food-db.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 0 | DATA-01–05 | unit setup | `npx vitest run src/services/food-db.test.ts` | ❌ W0 | ⬜ pending |
| 1-02-01 | 02 | 1 | DATA-01 | unit | `npx vitest run src/services/food-db.test.ts -t "componentType"` | ❌ W0 | ⬜ pending |
| 1-02-02 | 02 | 1 | DATA-02 | unit | `npx vitest run src/services/food-db.test.ts -t "base_type"` | ❌ W0 | ⬜ pending |
| 1-02-03 | 02 | 1 | DATA-03 | unit | `npx vitest run src/services/food-db.test.ts -t "extra_category"` | ❌ W0 | ⬜ pending |
| 1-02-04 | 02 | 1 | DATA-04 | unit | `npx vitest run src/services/food-db.test.ts -t "compatible_base_types"` | ❌ W0 | ⬜ pending |
| 1-02-05 | 02 | 1 | DATA-05 | unit | `npx vitest run src/services/food-db.test.ts -t "tags"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — project root; configure node environment with `setupFiles: ['./src/test/setup.ts']`
- [ ] `src/test/setup.ts` — imports `fake-indexeddb/auto` (mandatory for Dexie in Node.js)
- [ ] `src/services/food-db.test.ts` — test stubs covering DATA-01 through DATA-05
- [ ] Install: `npm install -D vitest @vitest/ui fake-indexeddb` — `fake-indexeddb` is required; Node.js has no IndexedDB

**vitest.config.ts content:**
```typescript
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

**src/test/setup.ts content:**
```typescript
import 'fake-indexeddb/auto';
```

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dexie DB initializes without error in browser | DATA-01–05 | Requires real browser IndexedDB | Open app in browser, open DevTools → Application → IndexedDB, verify `FoodPlannerDB` exists with all tables |
| UserPreferences singleton initialized on first load | DATA-05 (UserPreferences) | Requires browser app startup | Load app for first time, verify `preferences` table has one row with `id: 'prefs'` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
