@AGENTS.md

## Forms over stored data

- **Never save what the user did not change.** A form that edits stored rules writes only the fields that differ from what
  it showed when it opened (a baseline such as `linksBase` or `settingsBase` in `ComponentForm`). A save with no edits writes
  nothing. A wrong starting value must not be able to delete stored data.
- **Prefer "edited value ?? stored value" over copying loaded data into state.** Keep the edit as `null` until the user
  touches it and read the stored value live otherwise (as `links` and `served` do). Copy into state only when unavoidable,
  and then from the data as it is on the first render, not from an empty placeholder.
- **Test both load orders.** For any form or view that reads the shared library lookup, cover opening it before the data has
  loaded and after (render it under `LibraryLookupProvider` only once `useLibraryLookup().loaded` is true, as the library page
  does). Test that a save with no edits leaves stored rules unchanged.
- **Database upgrades are additive and tested.** Each Dexie version gets a test in `src/db/rule-migration.test.ts` that opens
  the previous version with realistic rows and checks the result.
