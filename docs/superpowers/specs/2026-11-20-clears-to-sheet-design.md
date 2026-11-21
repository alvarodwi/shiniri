# Clears to the sheet: Campaign and Tower tabs, filled by `watch`

## Why

The `clear` shell group (fetch plus queries like `nikke`, `top` and `synchro`) moves to the Progression
spreadsheet, where the user filters the clears themselves. Fetching becomes automatic, bundled with the daily
profile row. The raw JSON stays on disk, and the query logic can come back later in the web UI (git history
keeps it).

## Goals

- Two new tabs, `Campaign` and `Tower`, with one row per stage clear, sorted by clear time.
- Every time `watch` writes the profile row (daily done, or the 02:59 fallback), it also fetches new clears and
  appends the ones the sheet doesn't have yet.
- The first run backfills everything stored locally (about 3,700 campaign and 5,800 tower rows).

## Non-goals

- Shell queries, exports and parsed CSVs for clears. They are all removed.
- Per-Nikke dupe, level and CP. Only the slot names are written.
- Re-sorting rows that are already in the sheet.

## Anti-goals

- Overwriting or reordering anything already in the sheet.
- A clears failure that blocks or undoes the profile row.
- A data write with no `AuditLog` row.

## Approaches (user picked A)

- **A. Append what's missing (picked).** Read the stage ids in column A of the tab, then append every local
  clear that isn't there, sorted by clear time, plus one `AuditLog` row, in one `batchUpdate`. The first run is
  the backfill. It heals itself, because a failed day's rows are added the next time.
- B. Rewrite the whole tab each time. Rejected: it overwrites the rows the user filters, breaks any notes or
  colours they add beside them, and breaks the never-overwrite rule.
- C. A one-off backfill command, then append only each fetch's new clears. Rejected: it's more code than A, and
  a lost write is never recovered.

## Design

### Flow (inside `profile.check_once`)

After the profile row is written and the guard saved:
1. For `campaign`, then `tower`, call `fetch.fetch_clears(store, source, client)` with the same client.
2. Build the rows from `store.build_tables().clears` (this already resolves names, synchro and team CP).
3. For each tab: read column A, drop the clears whose `stage_id` is already there, sort the rest by
   `cleared_at`, and append them. If nothing is new, skip the write.
4. Add the result to the log line, for example `wrote Profile!A12:AU12 · Campaign +3 · Tower +0`.

Errors (`AuthError`, httpx errors, `SheetsError`) in these steps are logged and end only the clears part. The
guard already says `written: true`, so the profile row is never repeated. Clears missed today are picked up at
the next day's write, because the diff is against the sheet.

### Writer

Add a multi-row form of `sheets.write_row` (for example `write_rows(api, tab, headers, rows, *, form,
timestamp)`) with the same steps: check the headers, find the next row from column A, refuse a non-empty target,
then send one `batchUpdate` with the data block plus one `AuditLog` row
`['<wib ts>, 'cli-clears', '<range>, <n rows>`. `write_row` can become a thin call to it. Also needed: a read of
column A's existing stage ids, since `_checked` already reads that column.

### Columns

The same 13 columns as today's CSVs, in camelCase like the `Profile` tab, checked word for word:

`stageId | mode | chapter | stageName | clearedAt | recommendedCp | teamCp | synchroLevel | slot1 | slot2 | slot3 | slot4 | slot5`

`Tower` uses `floor` in place of `chapter`. `clearedAt` is WIB `YYYY-MM-DD HH:MM:SS`, written as text with a
leading `'` like `takenAt`, so it sorts and filters correctly. Note that `store._local_time` uses the machine's
zone today, and the homeserver may be on UTC, so the sheet value must be converted to WIB explicitly.

### Removed

- From `cli.py`: the `clear` group (`CLEAR_COMMANDS`, `CLEAR_FOOTER`, the `c_*` handlers, `search`, the
  completer entry, `_clear_habit`, `clear fetch` and its pending-stage report), and the parsed-CSV rebuild on
  start, as far as it concerns clears.
- `queries.py` and `tests/test_queries.py`.
- `store.write_parsed` and the `campaign`, `tower` and `all` export scopes. Union keeps its own parsed CSV and
  exports.
- What stays: the raw `*_clears.json`, `fetch_clears`, `build_tables` (trimmed to what the rows need), and
  `sync`, because stage and Nikke names come from the CDN files.

## Setup

Add `Campaign` and `Tower` tabs to the test sheet, then the real one, with the headers above in row 1.

## Calls made by Claude (correct if wrong)

- **Late older clears:** a stage whose fetch failed one day and succeeds later is appended at the bottom
  even though its clear time is older. This should be rare. Rows already in the sheet are never reordered;
  use a filter view to sort if it matters.
- **Rows per write:** the backfill is one request of about 5,800 rows (roughly 1 MB), which is within the
  Sheets limits. No chunking.
- **Fetch time:** a daily fetch only asks about stages not stored yet, so it runs well within the hour.

## Left to the builder

- How to split `check_once` so the clears step is testable with fake HTTP, like the existing tests.
- Tests: the diff against column A, sorting, an empty diff that skips the write, a clears error that keeps the
  profile result, the header mismatch, and the removal of the shell group (update `tests/test_cli.py`).
