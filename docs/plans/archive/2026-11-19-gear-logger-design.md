# Gear logger (T9Manu) and Anomaly sync: design

## Intent

The `T9Manu` tab logs every T9 manufacturer gear the owner gets, one row per gear. It feeds the
existing stats tabs and a future dashboard. Today the owner fills it by hand, including copying
every gear drop from the Anomaly logger. This work adds:

1. A **gear form** for the sources that are not interceptions: Manufacturer Arms, Manufacturer Arms
   Furnace, and Manufacturer Selection Box.
2. An **Anomaly sync**: when the Anomaly logger saves, every run that dropped gear also becomes a
   `T9Manu` row, in the same write.

This reverses a non-goal in `2026-11-17-anomaly-logger-design.md` ("Copying or syncing Anomaly gear
into T9Manu ... the app copies nothing"). The owner wants real rows, matching how they have synced
by hand so far.

## Domain facts (from the owner)

- Five gear sources exist:
  1. Special Interception. No longer farmed. `Special` and its T9Manu rows are frozen history.
  2. Anomaly Interception. Only reaches T9Manu through the Anomaly logger's sync.
  3. Manufacturer Arms. A shard-like item, full gacha: class, manufacturer and slot are random.
  4. Manufacturer Arms Furnace. Sacrifice 2 gear for 1 attempt with the manufacturer locked to a
     chosen target. Class and slot stay random. Used twice in 4 years. Unlikely to be used again,
     but the form must support it.
  5. Manufacturer Selection Box. The owner picks class, manufacturer and slot. No gacha.
- The owner opens one source type at a time, often in bulk. The game shows every result on one
  screen, and the owner knows how many items they opened.
- Every T9Manu row so far is from these five sources, so the tab has no other source types.
- Tabs with a year suffix (`T9Manu24`, `Anomaly24`, `T9Manu23`, ...) are legacy data, already
  migrated into the unsuffixed tabs. The app ignores them.

## Target tabs

- `T9Manu`, columns A–E: `date | sourceType | classType | manufacturer | slotType`. About 910 rows.
  Slot values seen: `Helmet`, `Torso`, `Gloves`, `Boots` (the same names as Anomaly's `dropType`).
- `Furnace`, columns A–E: `Date | Target | Sacrifice 1 | Sacrifice 2 | Result`. 2 rows of data.
  Target is a manufacturer (e.g. `Pilgrim`). Sacrifice 1, Sacrifice 2 and Result are each one gear
  written as `manufacturer-classType-slotType` (e.g. `Abnormal-Supporter-Helmet`). The Result gear is
  also copied into `T9Manu` with sourceType `Manufacturer Arms Furnace` (owner's answer).
- `Anomaly`, unchanged.

All three live in the same spreadsheet (`VITE_JOURNAL_SHEET_ID`).

## Goals

- Log a bulk opening of Arms, Selection Boxes or Furnace attempts in one save, one T9Manu row per
  gear.
- A Furnace save writes the T9Manu rows and the Furnace rows together.
- An Anomaly save writes the Anomaly rows and the T9Manu rows for its gear drops together.
- Both writes are all-or-nothing: either every tab gets its rows or none does.

## Non-goals

- Logging Special Interception or Anomaly Interception gear in the gear form.
- Any write to `Special` or the legacy suffixed tabs.
- Back-filling or checking the owner's hand-synced Anomaly rows in T9Manu.
- Tracking inventory. Furnace sacrifices are recorded in `Furnace` only. Nothing is removed from
  `T9Manu`, which is a log of what was obtained. Comparing against real inventory and suggesting
  sacrifices from history is a possible much-later version, not this one.
- Class or manufacturer icons. They may come later.
- Showing obtained gear in the app. That belongs to a future dashboard / stats page.
- Editing or deleting rows. Mistakes are fixed by hand in the sheet, as with the Anomaly logger.

## Anti-goals

- Two separate writes for one save. The owner has days where every Anomaly run dropped the same
  piece, so a "find what's missing and repair it" step cannot tell rows apart. A save that leaves
  one tab written and the other not is the failure this design exists to prevent.
- Anything that moves, overwrites or reorders existing cells (the project's append-only invariant).

## Approaches

### Entering a bulk result

- **B. Count first, then cards (picked by the owner).** The owner enters how many items they opened
  and gets that many cards, each filled in like an Anomaly gear pick. Picked because the owner
  always knows the count when opening.
- A. Tap to add: pick slot then a class × manufacturer cell, each tap appends one gear. Rejected:
  the owner prefers to count first.
- C. One 60-cell tally grid (5 manufacturers × 3 classes × 4 slots) with +/− per cell. Rejected:
  cramped on a phone, easy to bump the wrong cell, nothing to read back.

### Writing to two tabs in one save

- **X. One combined write (picked by the owner).** Run the existing guards on every target tab, then
  send all rows in one Sheets `values:batchUpdate` request.
- Y. Two writes plus a repair step that compares tabs on load. Rejected: see anti-goals.

## Design

### Writer (`src/services/sheets/tabWriter.ts`)

Generalise `writeRowsAtEnd` to take several `{ tab, rows }` targets in the same spreadsheet:

1. For each target: check headers, find the next empty row from column A, check the target range is
   empty. Same checks and errors as today.
2. Send every range in one `values:batchUpdate` with `valueInputOption=USER_ENTERED`.
3. Return the updated range per tab.

`writeRowsAtEnd(api, tab, rows)` keeps its signature as a one-target call. `SheetsApi` gains a
`batchUpdateValues(spreadsheetId, data: { range, rows }[])` method. The existing "check-then-write
window" shortcut comment carries over.

**Must be verified on the test copy before relying on it:** that a `values:batchUpdate` with one bad
range (for example a tab that does not exist) writes nothing to the other ranges. If it turns out
not to be all-or-nothing, stop and bring it back to the owner. Do not fall back to two writes.

### Anomaly sync

- On save, for each active run where `needsGear(run)` is true (non-Kraken, dropped), add a T9Manu
  row: `[date, <anomaly sourceType>, gear.classType, gear.manufacturer, DROP_TYPE[run.boss]]`.
- Anomaly rows and those T9Manu rows go in one combined write. A save with no gear drops writes
  Anomaly only.
- The once-a-day lock is unchanged. The save's status line also reports the T9Manu rows written.

### Gear form (new page)

- **Header:** date (game day by default, editable, same `gameDay()` as Anomaly), source picker
  (Arms, Selection Box, Furnace), and a count.
- **Cards** (revised after the owner's first use): one per item, numbered. Each gear pick is a row of
  manufacturer buttons plus a class × slot grid, not the Anomaly class × manufacturer grid. A hint
  under the header says Arms is gacha (log what came out) and a Selection Box is a choice (log what
  was picked). Save is enabled when every card is complete.
- **Furnace:** each card is one attempt, with labelled parts: Target manufacturer (buttons),
  Sacrifice 1 and 2 (manufacturer buttons plus class × slot grid each), and Result (class × slot
  grid only, since its manufacturer is the target). Any gear may be sacrificed: no rules to
  validate. Each attempt writes one T9Manu row (`[date, 'Manufacturer Arms Furnace', class, target,
slot]`) and one Furnace row (`[date, target, sacrifice1, sacrifice2, result]`, gear cells as
  `manufacturer-classType-slotType`) in the same combined write.
- **No once-a-day lock.** Openings happen any time and several times a day.
- **After save:** clear the cards, keep the source, and show one status line per tab
  ("Saved N rows to <range>"). No list of the saved or previously obtained gear: a bulk opening of
  20+ items would clutter the page (owner's decision). Save is disabled while a request is in
  flight.
- **Navigation:** the app has one page today and no nav. Add a way to switch between Anomaly and
  Gear.

## Source type strings

The owner wants the strings exactly as they are in the sheet. Only `Manufacturer Arms Furnace` was
confirmed verbatim. Claude's call: use the owner's own names, `Anomaly Interception`,
`Manufacturer Arms` and `Manufacturer Selection Box`, as constants in one place.

**First step of the build, before any row code:** list the distinct values of `T9Manu!B` and the
existing Furnace cells on the test copy, and correct the constants and the slot names to match
exactly. A mismatch would silently split rows in the stats tabs, and no header check catches it.

## Left to the builder

- Store and component structure, following "Adding a form" in `CLAUDE.md` (`TabSpec`s for
  `T9Manu` and `Furnace`, row logic in `src/services/gear/`, a store, a page, components in
  `src/components/gear/`, a route).
- Count limits and defaults, and whether picks carry forward between cards.
- Layout of the nav and the post-save summary.
- Tests: row mapping (pure), the writer's multi-target checks with a fake API, the Anomaly store
  including the sync rows, and the gear store.
