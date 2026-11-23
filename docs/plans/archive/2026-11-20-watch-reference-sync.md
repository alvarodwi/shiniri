# watch reference sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every `watch` check refreshes the five reference files, never appends rows with unknown NIKKE or
stage names (holds them instead), and logs one line per sheet write before the summary line.

**Architecture:** A `log: Callable[[str], None]` is created in `watch` (timestamped `print`) and passed
down `_check` → `sync_clears` / `sync_union` → `append_missing` / `append_seasons`, which log a `wrote` or
`held` line per block. `_check` calls `sync_reference` once per check through a new
`refresh_reference(store)`. Hold detection is one helper next to the `NIKKE_` fallback in `store.py`.

**Tech Stack:** Python 3.14, httpx, pytest, uv.

**Spec:** `docs/superpowers/specs/2026-11-20-watch-reference-sync-design.md`

## Global Constraints

- `write_rows` and every header unchanged; no web app change.
- Append-only: held rows are skipped, never written then fixed.
- Every new `log` parameter defaults to a no-op (`lambda _: None`) so other callers are unchanged.
- No commits per task: the owner commits once at the end ("commit and merge").
- Line formats (exact):
  - `sync: <name> <status> · <name> <status> …` (status as `sync_reference` returns it); on an exception
    `sync: <ExcType>: <msg>`
  - `<Tab>: wrote <n> rows, <range> (<first stageName> … <last stageName>)`; one row: `(<stageName>)`
  - `<Tab>: wrote season <n>, <k> rows, <range>`
  - `<Tab>: held <k> rows, <reasons>` / `<Tab>: held season <n>, <reasons>`, reasons joined by `, ` from
    `<j> unknown NIKKE (<NIKKE_a>, <NIKKE_b>)` and `<j> unknown stages (<id>, <id>)`
  - profile summary suffix ` (stage_list missing)` when `stage_names(store)` is empty

## Review Focus

- Wiped `data/` and the CDN down: union squads all `NIKKE_` → every season held, nothing written (Task 2 test).
- A `NIKKE_` row already in the sheet must not block new known rows; only new rows are checked (Task 1 test).
- One held union season must not stop a later good season (Task 2 test).
- Missing or broken `config/sources.json`: sync line shows the error, the check carries on (Task 3 test).
- `stage_list` missing: Campaign held for blank stage names; profile row still written with the note (Task 1, Task 3 tests).

---

### Task 1: Hold helper, Campaign/Tower hold and per-write log

**Files:**
- Modify: `src/shiniri_cli/store.py` (add `unknown_nikkes`)
- Modify: `src/shiniri_cli/clear_sheet.py` (`append_missing`, `sync_clears`)
- Modify: `tests/conftest.py` (tower clear fixture)
- Test: `tests/test_clear_sheet.py`, `tests/test_store.py`

**Interfaces:**
- Produces: `unknown_nikkes(rows: list[list], first_slot: int) -> list[str]` in `store.py`: sorted unique
  cells of `row[first_slot:]` that are strings starting with `"NIKKE_"`.
- Produces: `append_missing(api, source, rows, *, timestamp, log=lambda _: None) -> int` (rows written; 0 when held).
- Produces: `sync_clears(store, client, api, *, timestamp, log=lambda _: None) -> str`.

- [ ] **Step 1: Make the fixture's tower clear fully known.** In `conftest.py` change the `tower_clears`
  slot-1 tid `999999` to `5001` ("Anis", in `nikke_list_en`, not in `character_id_map`). Update
  `test_store.py:54` to `(1, "Anis", "N/A")` and `test_clear_sheet.py:24` to `["Anis", "Anis: Star"]`.
  Existing "Tower +1" expectations then hold.

- [ ] **Step 2: Write failing tests** in `tests/test_clear_sheet.py` (helper `_tower_clear(store, sid, tid)`
  adds a clear `{"cleared_at": "1794364900", "list": [{"slot": 1, "tid": tid, "lv": 1, "combat": 1}]}`):

```python
def test_unknown_nikkes():
    assert unknown_nikkes([[1, "x", "NIKKE_9", "Anis"], [2, "NIKKE_9", "NIKKE_1", ""]], 1) == ["NIKKE_1", "NIKKE_9"]

def test_written_rows_are_logged(store):
    lines = []
    api = FakeSheets({**AUDIT, **sheet("Tower", [["stageId"]])})
    append_missing(api, "tower", clear_rows(store.build_clears(), "tower"), timestamp="ts", log=lines.append)
    assert lines == ["Tower: wrote 1 rows, 'Tower'!A2:M2 (1F)"]

def test_unknown_nikke_holds_the_tab(store):
    _tower_clear(store, "50002", 999999)
    lines = []
    api = FakeSheets({**AUDIT, **sheet("Tower", [["stageId"]])})
    assert append_missing(api, "tower", clear_rows(store.build_clears(), "tower"), timestamp="ts",
                          log=lines.append) == 0
    assert api.batches == [] and lines == ["Tower: held 2 rows, 1 unknown NIKKE (NIKKE_999999)"]

def test_unknown_row_already_in_sheet_does_not_hold(store):
    _tower_clear(store, "50002", 999999)
    _tower_clear(store, "50003", 433004)
    api = FakeSheets({**AUDIT, **sheet("Tower", [["stageId"], [50001], [50002]])})
    assert append_missing(api, "tower", clear_rows(store.build_clears(), "tower"), timestamp="ts") == 1

def test_missing_stage_list_holds_campaign(store):
    (store.raw_dir / "stage_list.json").unlink()
    lines = []
    api = FakeSheets({**AUDIT, **sheet("Campaign", [["stageId"]])})
    assert append_missing(api, "campaign", clear_rows(store.build_clears(), "campaign"), timestamp="ts",
                          log=lines.append) == 0
    assert lines == ["Campaign: held 1 rows, 1 unknown stages (6002003)"]

def test_sync_clears_passes_log(store, monkeypatch):  # fetch_clears faked as in test_one_tab_error_keeps_the_other
    ...  # both tabs empty sheets; assert lines == ["Campaign: wrote 1 rows, 'Campaign'!A2:M2 (2-3 STAGE)",
         #                                          "Tower: wrote 1 rows, 'Tower'!A2:M2 (1F)"]
```

- [ ] **Step 3: Run** `uv run pytest tests/test_clear_sheet.py -q`. Expected: the new tests FAIL
  (`unknown_nikkes` import / `log` keyword).

- [ ] **Step 4: Implement.** `unknown_nikkes` in `store.py`. In `append_missing`, after computing `new`:
  slots start at index 8, stage name is index 3; if any unknown NIKKE or blank stage name, log the `held`
  line and return 0; otherwise `write_rows`, log the `wrote` line with its returned range, return
  `len(new)`. Nothing new: no line. `sync_clears` passes `log` through.

- [ ] **Step 5: Run** `uv run pytest -q`. Expected: all pass.

### Task 2: Union hold, per-season log, drop the raid_list refresh

**Files:**
- Modify: `src/shiniri_cli/union_sheet.py` (`append_seasons`, `sync_union`, imports)
- Test: `tests/test_union_sheet.py`

**Interfaces:**
- Consumes: `unknown_nikkes` (Task 1).
- Produces: `append_seasons(api, kind, rows_by_season, *, timestamp, log=lambda _: None) -> int` (seasons written).
- Produces: `sync_union(store, client, api, *, timestamp, now, log=lambda _: None) -> str`; no longer calls
  `sync_reference` (removed from the import).

- [ ] **Step 1: Update existing tests.** `_no_fetch` stops patching `sync_reference`; delete
  `test_refresh_error_still_fetches` (that refresh now lives in `_check`, Task 3).

- [ ] **Step 2: Write failing tests:**

```python
def test_seasons_written_are_logged(u):
    lines = []
    api = FakeSheets({**AUDIT, **sheet("union", [["season"]])})
    append_seasons(api, "union", {n: union_rows(u, n) for n in locked(u)}, timestamp="ts", log=lines.append)
    assert lines == ["Union: wrote season 45, 9 rows, 'Union'!A2:P10",
                     "Union: wrote season 46, 11 rows, 'Union'!A2:P12"]  # fake sheet never fills

def test_unknown_nikke_holds_only_that_season(union_store):
    raw = union_store.load_raw("union/1000045")
    hits = [{**h, "squad": [{"slot": 1, "tid": 999999, "lv": 1, "combat": 1}]} for h in raw["raid"]["participate_data"]]
    union_store.save_raw("union/1000045", {**raw, "raid": {**raw["raid"], "participate_data": hits}})
    u = build_union(union_store, None, 0)
    lines = []
    api = FakeSheets({**AUDIT, **sheet("union", [["season"]])})
    assert append_seasons(api, "union", {n: union_rows(u, n) for n in locked(u)}, timestamp="ts",
                          log=lines.append) == 1
    assert lines[0] == "Union: held season 45, 1 unknown NIKKE (NIKKE_999999)"

def test_no_reference_files_holds_every_union_season(union_store):
    for name in ("nikke_list_en", "character_id_map"):
        (union_store.raw_dir / f"{name}.json").unlink()
    u = build_union(union_store, None, 0)
    api = FakeSheets({**AUDIT, **sheet("union", [["season"]]), **sheet("roster", [["season"]])})
    assert append_seasons(api, "union", {n: union_rows(u, n) for n in locked(u)}, timestamp="ts") == 0
    assert append_seasons(api, "roster", {n: roster_rows(u, n) for n in locked(u)}, timestamp="ts") == 2  # never held
```

- [ ] **Step 3: Run** `uv run pytest tests/test_union_sheet.py -q`. Expected: new tests FAIL (`log` keyword).

- [ ] **Step 4: Implement.** In `append_seasons`, per season not in the sheet: for `kind == "union"`,
  `unknown_nikkes(rows, 11)` non-empty → log the `held season` line and skip; otherwise write and log the
  `wrote season` line. Remove the `sync_reference` block from `sync_union`; pass `log` through.

- [ ] **Step 5: Run** `uv run pytest -q`. Expected: all pass.

### Task 3: Refresh every check, log from watch, stage_list note

**Files:**
- Modify: `src/shiniri_cli/profile.py` (`refresh_reference`, `_check`, `watch`, `check_once`, imports)
- Test: `tests/test_profile.py`, `tests/test_cli.py`

**Interfaces:**
- Consumes: `sync_clears(..., log=)` (Task 1), `sync_union(..., log=)` (Task 2), `fetch.sync_reference`.
- Produces: `async def refresh_reference(store: Store) -> str`, never raises, returns the `sync:` line;
  uses its own `httpx.AsyncClient()` (game cookies never go to the CDN host).
- Produces: `_check(store: Store, now: datetime, log: Callable[[str], None]) -> str`.

- [ ] **Step 1: Update existing tests.** `test_cli.py::test_watch_stops_cleanly_on_interrupt` patches
  `_check` with `lambda s, now, log: stop(0)`. `test_check_joins_clears_and_union`: fakes take `log`,
  `profile.sync_reference` is patched to return `{"raid_list": "changed"}`, call `profile._check(store, now, lines.append)`,
  assert `lines == ["sync: raid_list changed"]` plus the existing return.

- [ ] **Step 2: Write failing tests** in `tests/test_profile.py`:

```python
def test_refresh_reference_line(store, monkeypatch):
    async def fake(store_, client):
        return {"nikke_list_en": "changed", "stage_list": "unchanged"}
    monkeypatch.setattr(profile, "sync_reference", fake)
    assert asyncio.run(profile.refresh_reference(store)) == "sync: nikke_list_en changed · stage_list unchanged"

def test_refresh_reference_never_raises(store):  # tmp store has no config/sources.json
    assert asyncio.run(profile.refresh_reference(store)).startswith("sync: FileNotFoundError: ")

def test_missing_stage_list_noted(store):
    (store.raw_dir / "stage_list.json").unlink()
    assert run_check(store, NOON, 100, make_write([])).endswith("wrote 'Profile'!A5:AU5 (stage_list missing)")
```

  And in `tests/test_cli.py::test_watch_logs_missing_config_and_keeps_going`, assert the first output line
  starts with `2026-11-20 12:00:00 sync: FileNotFoundError` and a later line names `cookie.txt`.

- [ ] **Step 3: Run** `uv run pytest tests/test_profile.py tests/test_cli.py -q`. Expected: new tests FAIL.

- [ ] **Step 4: Implement.** `watch` builds `log = lambda msg: print(f"{wib_timestamp(clock())} {msg}", flush=True)`,
  uses it for its own lines and passes it to `_check`. `_check` first does
  `log(asyncio.run(refresh_reference(store)))`, then the existing work, passing `log` to `sync_clears` /
  `sync_union`. `check_once` appends ` (stage_list missing)` to the `wrote` / `already in the sheet` text
  when `stages` is empty (before the clears text).

- [ ] **Step 5: Run** `uv run pytest -q`. Expected: all pass.

### Task 4: Grown rows keep the last row's format (port of web `24a3b28`)

The web app's `ensureRows` now inserts the rows instead of appending them, and pastes the last row's
format over them so borders survive. `HttpSheets.ensure_rows` still sends `appendDimension` (plain rows).

**Files:**
- Modify: `src/shiniri_cli/sheets.py` (`HttpSheets.ensure_rows`)
- Test: `tests/test_sheets.py` (the `appendDimension` assertions at lines 116, 167, 182)

**Interfaces:** unchanged (`ensure_rows(self, rows: dict[str, int]) -> None`, `GROW_MIN` stays).

- [ ] **Step 1: Update the tests** to expect, per short tab with `rowCount` `r` and growth `n` (`end = r + n`):

```python
{"insertDimension": {"range": {"sheetId": sid, "dimension": "ROWS", "startIndex": r, "endIndex": end},
                     "inheritFromBefore": True}},
{"copyPaste": {"source": {"sheetId": sid, "startRowIndex": r - 1, "endRowIndex": r},
               "destination": {"sheetId": sid, "startRowIndex": r, "endRowIndex": end},
               "pasteType": "PASTE_FORMAT"}}
```

  and add `test_ensure_rows_empty_grid_inserts_without_paste`: a tab with `rowCount` 0 gets only the
  `insertDimension` with `"inheritFromBefore": False`.

- [ ] **Step 2: Run** `uv run pytest tests/test_sheets.py -q`. Expected: FAIL (still `appendDimension`).

- [ ] **Step 3: Implement** in `ensure_rows`: build the request pair above per short tab (only the insert
  when `rowCount` is 0), same single `batchUpdate`, same `_grid` bookkeeping. The 429 handling stays as is
  (the CLI retries; the web app's fail-fast message is UI-only).

- [ ] **Step 4: Run** `uv run pytest -q`. Expected: all pass.

### Task 5: Owner checks

- [ ] Give the owner the homeserver check: move `data/raw/json` aside, `./stop.sh && ./start.sh`, then
  `tail -f data/watch.log`. Expected first line `… sync: nikke_list_en changed · … raid_list changed`, and on
  the day's writing check one `wrote`/`held` line per block before the summary, with no `NIKKE_` names in
  the new sheet rows. Campaign and Tower must get `wrote` lines too: on develop they stayed `+0` after a
  wipe, because clear targets come from `stage_list` / `tower_list` (`fetch.py:103-123`), which only `sync`
  downloaded.
