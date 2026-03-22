---
created: 2026-03-22T02:50:34.966Z
title: Refactor and move slot setting to Rules tab
area: ui
files:
  - src/app/settings/slots/page.tsx
  - src/components/settings/SlotSettings.tsx
  - src/components/settings/SlotGrid.tsx
  - src/components/settings/ComponentExceptions.tsx
---

## Problem

Slot settings (meal slot assignment and component exceptions) currently live at `/settings/slots` as a separate page. Conceptually, slot assignment is a scheduling constraint — the same category as rules. Having it on a separate settings page creates navigation friction and splits related concerns.

The idea is to consolidate slot settings into the Rules tab (or a sub-section within Rules), so all scheduling constraints (rules + slot assignments) live in one place.

## Solution

TBD — could be:
- A new tab within `/rules` (e.g., "Slots" tab alongside "Rules" list)
- A collapsible section at the bottom of the rules page
- Repurpose the AppNav "Settings" entry to go to `/rules` with tabs

Requires updating AppNav links, potentially consolidating routes, and reviewing whether `/settings/slots` should be redirected or removed.
