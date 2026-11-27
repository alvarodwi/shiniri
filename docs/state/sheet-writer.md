# Sheet writer and Sheets clients

## Purpose

The only code that writes to the Google Sheets, once in TypeScript (`ui/`) and once in Python
(`cli/`). Both append rows below the last used row of a tab and write the `AuditLog` row in the same
request. Neither ever updates, clears, inserts or deletes existing cells.

## Public surface

UI:

- `writeTabsAtEnd` in `ui/src/services/sheets/tabWriter.ts`. One call writes every target tab of one
  spreadsheet plus its audit row. Returns `{ updatedRanges }` for the data tabs only.
- Reads used by forms and the Log: `readColumnA`, `readRows`, `nextEmptyRow`, `checkHeaders`,
  `columnLetter` (same file). Errors: `HeaderMismatchError`, `TargetNotEmptyError`.
- `SheetsApi` (`getValues`, `batchUpdateValues`, `ensureRows`) and `createSheetsApi` in
  `ui/src/services/google/sheetsApi.ts`. The app's instance is `sheetsApi` in
  `ui/src/stores/authStore.ts`.
- Sign-in: `ui/src/services/google/auth.ts` (Google Identity Services, scope `spreadsheets`).
- Mock: `createMockSheetsApi` in `ui/src/services/mock/mockSheetsApi.ts`, data in
  `ui/src/services/mock/fixtures.ts`.
- Tab and spreadsheet config: `ui/src/config/sheets.ts` (`TabSpec`, `SPREADSHEETS`, `AUDIT_HEADERS`).

CLI:

- `write_rows` and `write_row` in `cli/src/shiniri_cli/sheets.py`. `write_row` is `write_rows` with
  one row. Returns the written range, or `None` when skipped by `unless_last_a`.
- `SheetsApi` protocol (`get_values`, `batch_update`, `ensure_rows`), `HttpSheets`,
  `service_account_token`, `column_a`, `int_ids`, `serial_to_iso`, `SheetsError` (same file).

## Invariants and rules

- Append-only. Rows go into a range just confirmed empty (`TargetNotEmptyError` and
  `Refusing to write: ... is not empty.`). Tested in `tabWriter.test.ts` and `test_sheets.py`.
- Headers are checked before any write: the first row must equal the `TabSpec` headers after
  trimming. Mismatch writes nothing, audit tab included.
- Next row comes from the last non-empty cell of column A, read at call time, unformatted. Every
  row therefore needs a value in column A, and a function cell is refused there.
- One `values:batchUpdate` carries all data and the audit row, so the audit row exists only if the
  write landed. UI guards for every tab run before the batch.
- UI writes one spreadsheet per call: all targets share one `spreadsheetId`, no tab repeats, and the
  spreadsheet needs an audit tab in `SPREADSHEETS`.
- A tab whose grid is too short gains blank rows at the bottom first (`ensureRows` /
  `ensure_rows`): at least 100 rows (`GROW_MIN` in both), existing last-row format pasted over them,
  nothing shifts. Tabs that are long enough send nothing. A missing tab throws.
- UI API client: a 401 gets exactly one fresh-token retry; a 429 becomes a plain rate-limit
  message and is not retried. CLI: a 429 is waited out (a fixed 60 s, the per-minute quota) and retried, 4 attempts in
  all, with an injectable sleep (`test_sheets.py`). See `docs/decisions/0002-ui-does-not-retry-rate-limits.md`.
- Audit row cells: `savedAt` (WIB timestamp), `form`, `ranges`, `rows`. Timestamp and ranges are
  stored as text with a leading `'`.

## Owns

- Env: `VITE_GOOGLE_CLIENT_ID`, `VITE_JOURNAL_SHEET_ID`, `VITE_GACHA_SHEET_ID` (`ui/.env.example`).
- The `AuditLog` tab of each spreadsheet and its headers (`AUDIT_HEADERS`, `AUDIT_HEADERS` in
  `sheets.py`).
- Browser `sessionStorage` key `shiniri.token` (access token, about 1h, no refresh token).
- CLI service-account file, read by `service_account_token`.
- Mock mode: `yarn dev:mock` only. `vite.config.ts` throws on `build` in mock mode and `__MOCK__` is
  a literal `false` in every build.

## Gotchas

- The sheet's own display name is the `name` in `SPREADSHEETS` (`Journal`, `Gacha`). The mock
  fixtures key audit rows by it.
- Writes use `USER_ENTERED`, so text that must stay text (timestamps, `'Tab'!A1` ranges) is written
  with a leading `'`.
- The CLI writer never skips by itself: callers pass `unless_last_a` (`profile.py`) or filter rows
  against `int_ids` / `logged_copies` first (`nikke_sheet.py`, `clear_sheet.py`, `roster_sheet.py`).
  The UI writer has no skip at all; the Anomaly store locks a game day instead.
- The two writers are ports of each other. Change one, change the other in the same branch
  (`docs/decisions/0003-two-ports-one-repo.md`).
- `ensureRows` inserts after the last grid row (`inheritFromBefore` unless the grid is empty) and
  pastes the last row's format over the new rows to keep borders. Growth is
  `max(shortfall, GROW_MIN)`. A tab with no `gridProperties` is not a tab; a missing `sheetId` is 0.
  The CLI reads grid metadata once per `HttpSheets` instance (`HttpSheets._grid`), so a tab
  added by hand mid-run is not seen until the next instance (each `watch` check makes a new one). Why: `docs/decisions/0001-audit-row-in-the-same-batch.md`.
- Tab and header names are the renamed ones (`Anomaly`, `Gear`, `LevelLog`, `SoloRaid`, `Furnace`,
  `Mold`, `Exchange`, CLI `UnionRaid`/`UnionRoster`/`UnionSeason`). Old names survive only as code identifiers
  (`SpareBody.vue`, `moldsStore`). `ui/src/config/sheets.test.ts` pins every `TabSpec`, so a header
  rename updates it. The live sheet still has legacy values the code no longer writes: old `AllPulls`
  source values (`Molds`, `SpareBody`, `Other`, matched by the owner's `SWITCH` formula) and old
  `AuditLog` `form`/`ranges` rows. Why: `docs/decisions/0004-sheet-names-one-cutover.md`.
- Releases: Cloudflare deploys `main` through Workers static assets, not classic Pages. The live
  origin is `shiniri.varoa-dwi.workers.dev` (`README.md`) and the OAuth origin must match it. Hash
  history means no redirect rules. The CLI ships by the homeserver pulling `develop`
  (`CONTRIBUTING.md`, `ui/CLAUDE.md`).

## Known gaps

- A write from another device between the empty check and the batch can overwrite rows (and one
  audit row). Accepted for one person. The code comments say to move to `values.append` if that
  changes (`tabWriter.ts`, `sheets.py`).
- Stale comments still say "Molds" and "SpareBody" in `ui/src/services/molds/moldRows.ts` and
  `ui/src/services/spareBody/spareBodyRows.ts`.
- Root `CLAUDE.md` says every writer "skips what the sheet already has, keyed on column A". In code
  that holds only for the CLI callers above, not for `writeTabsAtEnd` (unconfirmed which is meant).
