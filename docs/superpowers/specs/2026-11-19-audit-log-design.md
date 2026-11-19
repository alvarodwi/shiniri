# Audit log (short design)

## Why

After a save the app shows a transient "Saved N rows" line that is gone on reload or sign-in. The
owner wants a lasting record of what the app wrote, readable in the app, per spreadsheet (today the
progression journal; a gacha spreadsheet will join later).

## Goals

- Every successful save leaves one audit row in an `AuditLog` tab of the spreadsheet it wrote to.
- An audit row exists if and only if the save landed.
- A `/log` page shows the last 20 saves per spreadsheet, newest first.
- New forms get logging without code of their own.

## Non-goals

- Logging failed saves (owner: successful saves only). Failures show in the app at the time.
- One central log across spreadsheets, browser-stored history, editing or pruning the log.
- Creating the `AuditLog` tab. The owner creates it and its header row by hand.

## Approaches

- **Audit row in the same write, per spreadsheet (picked).** The writer appends the audit row to the
  one `values:batchUpdate` it already sends, so the log cannot disagree with the data.
- A central log spreadsheet. Rejected: a second write per save, the failure mode rejected for T9Manu.
- Browser storage. Rejected: lost across devices, and the sheet must stay the only copy.

## Design

- **Tab:** `AuditLog`, headers exactly `savedAt | form | ranges | rows`.
- **Row:** `savedAt` is WIB (UTC+7) `YYYY-MM-DD HH:mm:ss`, device-independent like `gameDay()`,
  stored as text (`'` prefix) so its display never depends on the sheet's locale.
  `form` is `Anomaly` or `Gear`. `ranges` lists the data ranges written, comma-separated, stored as
  text (prefixed with `'`, since `USER_ENTERED` would strip the leading quote of `'Anomaly'!…`).
  `rows` is the total data rows written.
- **Writer:** `writeTabsAtEnd(api, targets, form)` finds the audit tab for the targets' spreadsheet
  from config, runs the usual guards on it too, and adds the audit row to the same batch. A
  spreadsheet with no audit tab configured is refused before any read. `writeRowsAtEnd` has no
  production caller and is removed.
- **Config:** a list of spreadsheets, each with a display name and its audit `TabSpec`. Today:
  `Progression` on `VITE_JOURNAL_SHEET_ID`.
- **Page `/log`:** linked in the nav. One section per configured spreadsheet: read the audit tab's
  column A to find the last row, read the last 20 rows, show newest first (time, form, rows, ranges).
  A read error shows in that section only.

## Left to the builder

- Store and component layout; how an empty log reads.
