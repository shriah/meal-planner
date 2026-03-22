---
status: partial
phase: 06-save-history-export
source: [06-VERIFICATION.md]
started: 2026-03-22T09:50:00Z
updated: 2026-03-22T09:50:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Export PNG on mobile — Web Share API
expected: Clicking Export PNG on a mobile device opens the native share sheet with a .png file named `meal-plan-YYYY-MM-DD.png` ready to share to WhatsApp or other apps
result: [pending]

### 2. Export PNG visual fidelity
expected: The downloaded PNG is a portrait 390x1100px image with header, 7 day rows, color-coded slot pills (amber/green/blue), and the correct week date range in the subtitle
result: [pending]

### 3. Read-only amber banner appearance
expected: Navigating to a past week shows an amber banner reading "This is a past week — the plan is read-only." above the grid
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
