# Sheet grid growth and read-quota retry design

**Intent.** The first homeserver run of `watch` failed two ways. The Union write hit the edge of the tab's grid:

```
Sheets API 400: Range (Union!A1024:P1169) exceeds grid limits. Max rows: 1023
```

and Roster ran out of read quota (`Sheets API 429 ... 'Read requests per minute per user'`). The grid failure never clears on its own: every hourly check fails the same way. Writes must keep working as tabs fill up.

**Two separate causes.**
- *400 grid:* `write_rows` writes to exact ranges via `values:batchUpdate`, which never adds rows. Any tab whose data reaches its last grid row breaks.
- *429 quota:* each `write_rows` block costs 6 reads (header + column A for the tab and for AuditLog, plus two empty-range checks). A backfill of many locked seasons in one check goes past 60 reads/min. Adding rows does not cause or cure it.

**Goals.**
- Every tab the CLI writes (Profile, Campaign, Tower, Union, Roster, AuditLog) gains blank rows at the bottom when a write needs rows past its grid, before the empty-range check and the write.
- A 429 from the Sheets API is waited out and retried instead of failing the tab.

**Non-goals.** Reducing reads per write (batching the checks, caching the AuditLog position). Backfill is one-time, and normal hourly checks use ~10 reads. Porting the fix to the shiniri web app's `tabWriter.ts`, which has the same gap; that is a separate change in that repo.

**Anti-goals.** Inserting rows or shifting existing data. Splitting the data row and its AuditLog row into separate requests.

**Constraints.** `write_rows` keeps its contract: one `values:batchUpdate` carrying the data block and its AuditLog row, written only into rows confirmed empty.

**Approaches.**
1. *Picked:* grow, then write. A new `SheetsApi.ensure_rows({tab: last_row_needed})` reads sheet metadata (`sheetId`, `title`, `gridProperties.rowCount`), cached per `HttpSheets` instance (one metadata read per check), and sends one `spreadsheets:batchUpdate` with `appendDimension` for each tab that is short. `write_rows` calls it for the target tab and AuditLog before `_ensure_empty`. Separately, `HttpSheets._request` retries a 429 after a 60 s wait, up to 3 times, with the sleep injectable for tests.
2. `values.append` for writes (grows the grid by itself). Rejected: data and audit row would land in separate requests, breaking the atomic-audit guarantee.
3. Catch the "exceeds grid limits" 400, grow, retry. Rejected: depends on Google's error text; the failure could also come from the empty-check read, not only the write.

**Builder's calls.** How many extra rows to append (exactly the shortfall is fine; rows are cheap either way), updating the cached row count after appending, and the `sheets.py` module docstring ("never inserts") wording.

**Tests.** `HttpSheets` against `httpx.MockTransport`: a short tab gets one `appendDimension` for the shortfall, a long-enough tab gets none, and metadata is read once across two calls. A 429 then 200 returns the 200 after one fake sleep; four 429s raise `SheetsError`. `FakeSheets` gains a recording `ensure_rows`, and a `write_rows` test asserts it was asked for the target end row and the AuditLog row.
