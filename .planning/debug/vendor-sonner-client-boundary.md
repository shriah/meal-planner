---
status: resolved
trigger: "Investigate issue: vendor-sonner-client-boundary"
created: 2026-03-28T00:00:00+05:30
updated: 2026-03-28T08:07:00+05:30
---

## Current Focus

hypothesis: adding `'use client'` to the vendored `sonner` entrypoint should resolve the client/server boundary error for `<Toaster />`
test: run targeted verification against the Next app build and existing tests that import `Toaster`
expecting: no `useState only works in Client Components` error from `vendor/sonner/index.js`
next_action: none

## Symptoms

expected: Rendering the global toaster should not throw; the app should load with the local sonner shim mounted from layout.
actual: Runtime error in the browser/server render path: `useState only works in Client Components. Add the "use client" directive at the top of the file.`
errors: `vendor/sonner/index.js (41:45) @ Toaster` with `const [toasts, setToasts] = React.useState(toastState);`
reproduction: Load the app after Phase 11 changes with the global `<Toaster />` mounted from `src/app/layout.tsx`.
started: Started after Phase 11 introduced the local file-based `vendor/sonner` shim.

## Eliminated

## Evidence

- timestamp: 2026-03-28T00:02:00+05:30
  checked: `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md`
  found: The current Next.js docs require `'use client'` at the top of a file that is rendered directly within a Server Component and uses client-only features like state/effects.
  implication: A package entry exporting `Toaster` with hooks must declare the client boundary itself when imported by `src/app/layout.tsx`.

- timestamp: 2026-03-28T00:03:00+05:30
  checked: `vendor/sonner/index.js`
  found: The local shim exports `Toaster` and calls `React.useState` and `React.useEffect`, but the file starts with `import * as React from 'react';` and has no `'use client'` directive.
  implication: The exact runtime error matches the implementation; Next is treating the module as a Server Component entry.

- timestamp: 2026-03-28T00:04:00+05:30
  checked: `src/app/layout.tsx`, `package.json`, and `node_modules/sonner`
  found: The root layout imports `{ Toaster }` from `sonner`, `package.json` resolves `sonner` to `file:vendor/sonner`, and `node_modules/sonner` is a symlink to `../vendor/sonner`.
  implication: Fixing `vendor/sonner/index.js` is the correct and sufficient source-level change; there is no separate installed copy to patch.

## Resolution

root_cause: `vendor/sonner/index.js` defines a hook-using `Toaster` entrypoint but does not declare a client boundary, so Next.js imports it from the server layout as a Server Component and throws on `useState`.
fix: Added `'use client'` to `vendor/sonner/index.js` so the local `sonner` shim is treated as a Client Component entrypoint when imported from the server layout.
verification:
  - "`npm test -- src/components/rules/RuleRow.test.tsx` passed (4 tests)"
  - "`npm run build` no longer fails on `vendor/sonner/index.js`; build now stops on an unrelated `@resvg/resvg-js` Turbopack asset error from `src/app/api/export-plan/route.ts`"
files_changed: [`vendor/sonner/index.js`]
