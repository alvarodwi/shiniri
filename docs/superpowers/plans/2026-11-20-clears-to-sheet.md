# Clears to the Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drop the `clear` shell group. After each daily profile row, `watch` fetches new campaign and tower clears and appends the ones missing from the `Campaign` and `Tower` tabs, sorted by clear time.

**Architecture:** A new `clear_sheet.py` turns the flattened clears into tab rows, compares them with the stage ids in column A, and appends the missing rows with a multi-row version of the existing atomic writer (`sheets.write_rows`). `profile.check_once` calls it after the profile write, through a callback, the same way it already takes `write`. The shell keeps only the union group, sync, cookie, help and quit.

**Tech Stack:** Python ≥ 3.14, httpx, pytest (`uv run pytest`).

**Spec:** `docs/superpowers/specs/2026-11-20-clears-to-sheet-design.md`

## Global Constraints

- Tabs `Campaign` and `Tower`. AuditLog form: `cli-clears`.
- Campaign headers: `stageId | mode | chapter | stageName | clearedAt | recommendedCp | teamCp | synchroLevel | slot1 | slot2 | slot3 | slot4 | slot5`. Tower uses the same list with `floor` in place of `chapter`.
- `clearedAt` is WIB (`profile.WIB`), `YYYY-MM-DD HH:MM:SS`, written with a leading `'`. Never the machine's local zone.
- Never overwrite or reorder sheet rows. Each data block and its one AuditLog row go in a single `batch_update`.
- A clears failure never changes the profile outcome or the guard.
- Keep the raw `data/raw/json/*_clears.json`, `fetch.fetch_clears` and `sync`.

## Review Focus

1. **First run on a tab with only headers:** every local clear is written starting at row 2 (Task 2 test `test_first_run_backfills_from_row_2`).
2. **Column A ids come back as floats or text** (for example `6002003.0`, `"6002003"`, or junk the user typed): they still count as present, junk is ignored, and nothing is written twice (Task 2 `test_existing_ids_any_form`).
3. **A clear with no timestamp** (`cleared_at` is `None`): its `clearedAt` cell is blank and it sorts after the dated rows (Task 2 `test_missing_time_sorts_last`).
4. **The Campaign tab is broken (headers changed):** Tower is still appended, and the log names the Campaign error (Task 2 `test_one_tab_error_keeps_the_other`).
5. **The clears step fails after the profile row was written:** the log keeps `wrote …`, and the guard stays `written: true` (Task 3 `test_clears_error_keeps_profile_result`).

---

### Task 1: Remove the clear shell group and queries

**Files:**
- Delete: `src/shiniri_cli/queries.py`, `tests/test_queries.py`
- Modify: `src/shiniri_cli/union_queries.py` (it becomes the home of `Result` and `QueryError`), `src/shiniri_cli/cli.py`, `src/shiniri_cli/store.py`
- Test: `tests/test_cli.py`, `tests/test_store.py`, `tests/test_union_queries.py`, `tests/conftest.py`

**Interfaces:**
- Produces: `Store.build_clears() -> list[dict]`. It's today's `build_tables().clears` unchanged, each dict with `source, stage_id, mode, chapter, floor, cleared_at (aware datetime | None), stage_name, recommended_cp, team_cp, synchro_level, team` (team items: `slot`, `name`, plus the existing fields). `Tables`, `LINEUP_KEYS`, lineups and nikke names go.
- Produces: `union_queries.Result`, `union_queries.QueryError`, moved verbatim from `queries.py`.

- [ ] **Step 1: Update the tests first.**
  - In `test_store.py`: rename to `test_build_clears_joins`, assert on `store.build_clears()` (same assertions, minus the `lineups` and `nikke_names` line), and update `test_cleared_at_zero_is_none` and the empty-store test to `store.build_clears() == []`. Delete `test_write_parsed`. Import `Result` from `shiniri_cli.union_queries`. `test_scopes_to_wipe` now asserts: `scopes_to_wipe(synced={"nikke_list_en"}) == {"union"}`, `scopes_to_wipe(synced={"raid_list"}) == {"union"}`, `scopes_to_wipe(synced={"stage_list"}) == set()`, `scopes_to_wipe() == set()`.
  - In `test_cli.py`: delete the tests that only exercise the clear group, searches, clear fetch or the clears parsed CSV (`test_search_writes_then_reuses_export`, `test_parsed_csv_written_on_start`, `test_fetch_failure_still_refreshes`, `test_start_rebuilds_when_raw_newer_than_parsed`, `test_fetch_arg_any_case`, `test_reversed_date_range_is_swapped`, `test_stage_entry_and_missing_entry`, `test_spread_command`, `test_clear_mode_and_back`, `test_clear_one_shot_and_force`, `test_main_rejects_clear_commands`, `test_completer_in_clear_mode`, `test_help_hints_group_for_old_habit`, `test_hint_keeps_force_and_bare_bang_is_blank`, `test_clear_top_one_shot_force`). Rewrite any remaining test that used a clear command for behaviour that still exists (bad args, unexpected error, damaged export, completer prefixes, help groups, empty first run, status) to use a union command instead. Add `test_clear_is_gone`: `App.execute("clear")` prints `unknown command 'clear'`. Import `QueryError` from `shiniri_cli.union_queries`.
  - In `test_union_queries.py`: import `QueryError` from `shiniri_cli.union_queries`. In `conftest.py`, drop the `tables` fixture.

- [ ] **Step 2: Run `uv run pytest`.** Expected: import errors or failures, because `build_clears` doesn't exist yet and `clear` is still a command.

- [ ] **Step 3: Implement.**
  - Move `Result` and `QueryError` into `union_queries.py`. Point `store.read_export`'s lazy import at `.union_queries`.
  - In `store.py`: rename `build_tables` to `build_clears`, returning the clears list. Drop `Tables`, `LINEUP_KEYS`, lineups, nikke names and `write_parsed`. Set `SCOPES = ("union",)`. `scopes_to_wipe(synced)` returns `{"union"}` when `synced` touches `nikke_list_en`, `character_id_map` or `raid_list`, and otherwise an empty set. Drop the `fetched` parameter.
  - In `cli.py`: drop `clear` from `COMMANDS`, `GROUPS` and the help examples (use `help union` in place of `help clear`). Drop `CLEAR_COMMANDS`, `CLEAR_FOOTER`, `FIXED_SCOPE`, `_clear_habit`, `_int` and `_date` if they're now unused, `_prepare`, `_scope`, `search`, the `c_*` handlers, `c_fetch`, `_fetch`, `do_clear`, the clear completer, `self.tables`, the clears parsed-CSV rebuild in `__init__`, `refresh`'s `write_parsed` call, and `do_sync`'s "stages to check" report. `status()` becomes `f"synced {synced}"`. `MAIN_FOOTER`'s example becomes `union s45`. Keep `_show` and `render`, which union uses. "no matching clears" becomes "no matching rows".

- [ ] **Step 4: Run `uv run pytest`.** Expected: all pass. Also run `grep -rn "queries\b\|build_tables\|CLEAR_COMMANDS" src tests` and expect only `union_queries` hits.

- [ ] **Step 5: Commit.** `git rm` the two files, then commit with the message `refactor: drop the clear shell group and queries`.

### Task 2: Multi-row writer and the clears append

**Files:**
- Modify: `src/shiniri_cli/sheets.py`, `tests/conftest.py` (`FakeSheets` moves here from `test_sheets.py`)
- Create: `src/shiniri_cli/clear_sheet.py`, `tests/test_clear_sheet.py`
- Test: `tests/test_sheets.py`

**Interfaces:**
- Consumes: `Store.build_clears()` (Task 1), `fetch.fetch_clears(store, source, client) -> int`, `profile.WIB`.
- Produces:
  - `sheets.column_a(api, tab) -> list` gives the unformatted column-A values, header included. `_checked` uses it.
  - `sheets.write_rows(api, tab, headers, rows, *, form, timestamp, unless_last_a=None) -> str | None` returns the range written (`'Tab'!A{start}:{col}{start+n-1}`). Its AuditLog row is `["'"+timestamp, form, "'"+range, len(rows)]`. It raises `SheetsError` for empty `rows`, or for any row with the wrong length or a blank column A. `write_row` becomes `write_rows(..., [row], ...)`, and its existing tests stay unchanged.
  - `clear_sheet.TABS = {"campaign": "Campaign", "tower": "Tower"}`, `clear_sheet.HEADERS: dict[str, tuple[str, ...]]` (Global Constraints), `clear_sheet.FORM = "cli-clears"`.
  - `clear_sheet.clear_rows(clears: list[dict], source: str) -> list[list]` gives that source's rows in header order: `cleared_at.astimezone(WIB)` formatted with a leading `'` (or `""` when it's None), and slot names by slot 1–5 (`""` when a slot is empty). Rows are sorted by `cleared_at`, with None last.
  - `clear_sheet.append_missing(api, source, rows, *, timestamp) -> int` gives the number of rows written. It skips rows whose `stageId` is already in column A, and makes no write when nothing is new.
  - `async clear_sheet.sync_clears(store, client, api, *, timestamp) -> str`. For each source, in order: `fetch_clears`, then `append_missing` on `clear_rows(store.build_clears(), source)`. Each source sits in its own try for `AuthError` (`"Campaign: cookie rejected: <msg>"`), `SheetsError` (`"Campaign: <msg>"`) and `httpx.HTTPError` (`"Campaign: <ExcName>"`). It returns the parts joined with `" · "`, a success part being `"Campaign +3"`.

- [ ] **Step 1: Write the failing tests.**
  - In `test_sheets.py`: `test_write_rows_block_and_audit_count`, where two rows on a tab whose last data row is 2 give range `'Profile'!A3:C4`, and the audit row ends in `2`. Also `test_write_rows_rejects_empty_and_bad_rows`.
  - In `test_clear_sheet.py` (uses the `store` fixture and `FakeSheets`):
    - `test_clear_rows_campaign`: `clear_rows(store.build_clears(), "campaign") == [[6002003, "Normal", 2, "2-3 STAGE", "'2026-10-31 17:36:57", 1000, 909195, "740", "Crown", "Anis: Star", "", "", ""]]`.
    - `test_clear_rows_tower_slots_by_slot`: slot1 is `"NIKKE_999999"`, slot2 is `"Anis: Star"`, and clearedAt is `"'2026-11-11 09:40:31"`.
    - `test_missing_time_sorts_last`: adds tower clear `50002` with `cleared_at "0"`. That row is last, with clearedAt `""`.
    - `test_first_run_backfills_from_row_2`: with column A `[["stageId"]]`, it writes to `'Tower'!A2:M3`, returns 2, and the audit form is `cli-clears`.
    - `test_existing_ids_any_form`: with column A `[["stageId"], [50001.0], ["50002"], ["junk"]]`, it writes nothing and returns 0, so there's no batch.
    - `test_one_tab_error_keeps_the_other`: with a fake `fetch_clears` (monkeypatched to return 0) and Campaign headers wrong, the result is `"Campaign: Campaign headers changed…"` (match on the prefix), then `" · Tower +1"`, and Tower is in the batch.

- [ ] **Step 2: Run `uv run pytest tests/test_sheets.py tests/test_clear_sheet.py -v`.** Expected: FAIL, because `write_rows` and `clear_sheet` don't exist.

- [ ] **Step 3: Implement** the Interfaces above. Column A ids: `int(float(v))` for each value after the header, skipping values that fail to parse.

- [ ] **Step 4: Run `uv run pytest`.** Expected: all pass.

- [ ] **Step 5: Commit** with the message `feat: append missing clears to Campaign and Tower tabs`.

### Task 3: Run the clears after the profile row

**Files:**
- Modify: `src/shiniri_cli/profile.py` (`check_once`, `_check`)
- Test: `tests/test_profile.py`

**Interfaces:**
- Consumes: `clear_sheet.sync_clears` (Task 2).
- Produces: `check_once(store, now, client, openid, write, clears=None)`, where `clears: Callable[[], Awaitable[str]] | None`. It's awaited after the guard is saved as written, on both the "wrote" and the "already in the sheet" paths. Its text is appended as `" · " + text`. Any exception from it is caught and appended as `" · clears: <ExcName>: <msg>"`. Not called when the profile write fails, or when the day is still unfinished before 02:59.

- [ ] **Step 1: Write the failing tests** in `test_profile.py`:
  - `test_clears_run_after_write`: a fake `clears` returning `"Campaign +3 · Tower +0"`. The result ends with that text, after `wrote 'Profile'!A5:AU5`.
  - `test_clears_run_when_day_already_in_sheet`: with `write` returning None, the text is still appended.
  - `test_clears_not_run_when_not_done`: at 30 points, mid-day, `clears` is never called.
  - `test_clears_error_keeps_profile_result`: `clears` raises `RuntimeError("boom")`. The result contains `wrote` and `clears: RuntimeError: boom`, and `guard(store)["written"] is True`.

- [ ] **Step 2: Run `uv run pytest tests/test_profile.py -v`.** Expected: FAIL on the unexpected keyword `clears`.

- [ ] **Step 3: Implement.** In `check_once`, add the parameter and the call. In `_check`'s `go()`, pass `clears=lambda: sync_clears(store, client, sheets, timestamp=wib_timestamp(now))`.

- [ ] **Step 4: Run `uv run pytest`.** Expected: all pass.

- [ ] **Step 5: Manual check against the test sheet.** Add `Campaign` and `Tower` tabs with the headers in row 1, then run `uv run python -c "from datetime import datetime; from pathlib import Path; from shiniri_cli.profile import WIB, _check; from shiniri_cli.store import Store; print(_check(Store(Path('.')), datetime.now(WIB)))"`. Run it after today's daily is done. If today's profile row is already in the sheet, delete `data/daily.json` first. The duplicate guard then returns "already in the sheet", and the clears still run. Expected: the log line ends `Campaign +~3670 · Tower +~5790`. Rows are sorted by `clearedAt`, and AuditLog has two `cli-clears` rows. A second run gives `Campaign +0 · Tower +0`.

- [ ] **Step 6: Commit** with the message `feat: watch appends new clears after the profile row`.
