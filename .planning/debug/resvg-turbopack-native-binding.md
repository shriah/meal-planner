---
status: resolved
trigger: "Investigate issue: @resvg/resvg-js Turbopack build failure"
created: 2026-03-28T08:12:00+05:30
updated: 2026-03-28T08:12:00+05:30
---

## Symptoms

expected: `next build` should compile the export-plan route without Turbopack failing on the native `@resvg/resvg-js` package.
actual: `next build` failed during Turbopack compilation with `non-ecmascript placeable asset` from `@resvg/resvg-js/js-binding.js`.
reproduction: Run `npm run build`.

## Evidence

- `src/app/api/export-plan/route.ts` statically imports `Resvg` from `@resvg/resvg-js`.
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverExternalPackages.md` documents `serverExternalPackages` for opting native Node packages out of server bundling.
- `next.config.ts` had no config, so Next/Turbopack attempted to bundle the native package into the App Route chunk.

## Resolution

root_cause: Turbopack was trying to bundle the native `@resvg/resvg-js` binding for the App Route instead of treating it as a server external package.
fix: Added `serverExternalPackages: ["@resvg/resvg-js"]` to `next.config.ts`.
verification:
  - `npm run build` now compiles successfully past the previous Turbopack/resvg step.
  - The next failure is unrelated: TypeScript reports that `estimateHeight` is not exported from `@/services/export-template`.
files_changed:
  - `next.config.ts`
