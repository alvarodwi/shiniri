# Sheet grid growth and 429 message design

**Intent.** shiniri-cli hit two Sheets API failures on its first homeserver run (see
`shiniri-cli/docs/superpowers/specs/2026-11-20-sheet-grid-and-quota-design.md`). The web app has the
same gaps:

- _Grid full (400)._ `values:batchUpdate` never adds rows. Once a tab's data reaches its last grid
  row, every save to it fails with `Range (...) exceeds grid limits` until rows are added by hand.
  This happens on every tab sooner or later as logs grow daily.
- _Read quota (429)._ 60 reads/min per user. A save costs about 3 reads per tab, so a person saving
  by hand rarely hits it. When they do, the raw `Sheets API 429: Quota exceeded ...` text is
  unclear.

**Goals.**

- A save grows any target tab (and AuditLog) whose grid is too short, then writes as before.
- A 429 fails fast with "Google rate limit hit. Wait a minute and try again." The form keeps its
  inputs (stores already do this on error).

**Non-goals.** Waiting out and retrying a 429 (owner's call: a minute of "Saving…" on a phone is worse
than a clear message). Cutting reads per save.

**Anti-goals.** Inserting rows, shifting data, or splitting a save's data and AuditLog row into
separate value writes.

**Constraints.** `writeTabsAtEnd` stays the only write path and keeps its one atomic
`values:batchUpdate`. The app still never creates tabs or edits existing cells.

**Approaches.**

1. _Picked:_ grow, then write. A new `SheetsApi.ensureRows` reads tab metadata once and, if needed,
   sends one `spreadsheets:batchUpdate` with `insertDimension` past the last grid row for each short tab.
2. `values.append`: grows the grid by itself, but each tab becomes its own request, so data and
   AuditLog row could land apart. Rejected.
3. Catch the "exceeds grid limits" 400, grow, retry: depends on Google's error text and adds a
   mid-save failure path. Rejected.

**Design.**

- `SheetsApi.ensureRows(spreadsheetId, rows: Record<string, number>)`, where each entry maps a tab
  title to the last row the save needs. It does one
  `GET spreadsheets/{id}?fields=sheets.properties(sheetId,title,gridProperties.rowCount)`. A title
  missing from the metadata throws `<tab> tab not found`. Tabs whose `rowCount` is short get
  `insertDimension` (ROWS, `startIndex: rowCount`, `inheritFromBefore: true`) of `max(shortfall, 100)`, all in one `spreadsheets:batchUpdate`. Nothing
  is sent when no tab is short. Same minimum as the CLI, so a full tab isn't regrown on every save.
- `writeTabsAtEnd` splits `checkedRange` into two steps. First, the header check and next empty row
  for every tab, in parallel. Then one `ensureRows` call for all tabs plus AuditLog. Then the empty
  checks. The grow must come before the empty checks, because reading past the grid also fails.
- `request()` in `sheetsApi.ts`: a 429 throws `SheetsApiError` with the message above (status 429).
  This also covers page-load reads.
- Mock API: `ensureRows` is a no-op (the fake sheet has no grid limit).
- CLAUDE.md invariant: the app may append blank rows at the bottom of a tab before a write. If the
  write then fails, the extra blank rows stay. That's harmless, because `nextEmptyRow` ignores them.

**Tests.** `sheetsApi.test.ts`: a short tab gets one `insertDimension` for `max(shortfall, 100)`, a
long-enough tab gets no POST, a missing tab throws, and a 429 throws the rate-limit message.
`tabWriter.test.ts`: `ensureRows` gets each tab's end row and the AuditLog row, before any empty
check.

**Manual sheet step.** None. Owner check on the sheet copy: delete the blank rows under one tab's
data so the data reaches the last grid row, save a form that writes there, and confirm the save
landed and blank rows were added below it.

**Revision (sheet-copy check).** `appendDimension` added rows without the borders and formats of the
rows above. Rows are now inserted at index `rowCount` with `inheritFromBefore: true`, which copies the
last row's formatting. Nothing sits below that index, so no data shifts. Inheriting kept fonts and
number formats but still dropped borders, so a `copyPaste` with `PASTE_FORMAT` (format and data
validation) from the last row onto the new rows follows each insert in the same request.

**Builder's calls.** Exact test layout. The wording of the tabWriter header comment ("never inserts").
