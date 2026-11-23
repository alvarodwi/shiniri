# 0001 Audit row in the same batch, grow before write

## Context
Every save needs an `AuditLog` row, and tabs can be too short for the next rows.

## Decision
The audit row rides in the same `values:batchUpdate` as the data, so it exists only if the save
landed. A short tab gains blank rows (`ensureRows` / `ensure_rows`) before the empty checks, and
the write itself is one batch. Failed saves are not logged.

## Rejected
- A central log spreadsheet: a second write that can fail halfway.
- Browser storage for the log: not cross-device, and the sheet must stay the only copy.
- `values.append`: splits data from its audit row and breaks the atomic audit.
- Writing, catching the 400, then growing: depends on Google's error text, and the empty-check
  read can fail too.
- Shifting or inserting data rows: the grid only ever grows by blank rows at the bottom.

Code: `ui/src/services/sheets/tabWriter.ts`, `cli/src/shiniri_cli/sheets.py`.
