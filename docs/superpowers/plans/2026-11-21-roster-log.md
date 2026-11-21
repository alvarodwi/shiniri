# RosterLog and cdn tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `watch` appends copy-count changes from `GetUserCharacters` to the gacha sheet's `RosterLog` tab, and `tools/cdn.py` prints CDN URLs for asset paths.

**Architecture:** A new `roster_sheet.py` module, shaped like `nikke_sheet.py`: pure row-building functions plus one never-raising `sync_roster_log` that fetches, diffs against the tab and writes through `write_rows`. `_check` in `profile.py` calls it right after the NikkeDatabase sync, with its own cookie client. `tools/cdn.py` wraps `fetch.cdn_url`.

**Tech Stack:** Python 3.14, uv, httpx, pytest (`FakeSheets`, `httpx.MockTransport`).

**Spec:** `docs/superpowers/specs/2026-11-21-roster-log-design.md`, `docs/superpowers/specs/2026-11-21-cdn-url-tool-design.md`

## Global Constraints

- All paths below are relative to `cli/`. Run tests with `uv run pytest` from `cli/`.
- Tab `RosterLog`, headers exactly `("date", "nameCode", "name", "copies")`, form `cli-roster-log`.
- `copies` = 1 + `grade` + `core`. Valid: `name_code` int, `grade` int 0..3, `core` int 0..7 (`bool` is not an int here, as in `nikke_sheet._int`).
- `date` is `profile.game_day(now)`; the AuditLog timestamp is `profile.wib_timestamp(now)`.
- `name` comes from the `NikkeDatabase` tab (A = `nameCode`, B = `name`), never from `nikke_list_en.json`.
- Log lines: `RosterLog +N`, with skipped entries appended as ` (skipped ...)`; failures `RosterLog: <error>`; no sheet id `RosterLog: no gacha_spreadsheet_id`.
- Append-only. Nothing is written on any failure. An empty `characters` list is a failure.
- No git commits: the owner commits by hand (their standing rule). Leave changes in the working tree.

## Review Focus

1. Hand-typed or blank cells in `RosterLog` or `NikkeDatabase` (blank rows, text in `nameCode`, numbers read back as floats like `5075.0`): skipped, no crash. Test in Task 1.
2. The owner fixes a `RosterLog` row by hand, or a Nikke has several rows: the lowest row on the sheet is the logged count. Test in Task 1.
3. The same `name_code` twice in one API answer: written once (first wins). Test in Task 1.
4. An expired cookie (`AuthError`) or an answer with `code != 0`: a `RosterLog:` line, no write. Test in Task 1.
5. RosterLog failing must not change the progression result or the NikkeDatabase line. Test in Task 2.

---

### Task 1: `roster_sheet.py`

**Files:**
- Create: `src/shiniri_cli/roster_sheet.py`
- Test: `tests/test_roster_sheet.py`

**Interfaces:**
- Consumes: `api_call(client, name, body) -> dict` and `AREA_ID` from `fetch.py`; `write_rows`, `SheetsApi`, `SheetsError` from `sheets.py`.
- Produces:
  - `TAB = "RosterLog"`, `FORM = "cli-roster-log"`, `HEADERS = ("date", "nameCode", "name", "copies")`
  - `logged_copies(values: list[list]) -> dict[int, int]`: from `'RosterLog'!A:D` values (row 1 is the header). Later rows overwrite earlier ones. Rows whose `nameCode` or `copies` isn't a whole number (parse with `int(float(v))`, like `sheets.int_ids`) are skipped.
  - `database_names(values: list[list]) -> dict[int, str]`: from `'NikkeDatabase'!A:B` values, same parsing, header skipped, blank names skipped.
  - `roster_rows(characters: list, names: dict[int, str], logged: dict[int, int], day: str) -> tuple[list[list], list[str]]`: rows `[day, nameCode, name, copies]` sorted by `nameCode`, only where `copies != logged.get(nameCode)`; notes are `entry <index>` for an invalid entry and `<nameCode> not in NikkeDatabase` for an unknown one. A repeated `name_code` keeps the first.
  - `async sync_roster_log(client: httpx.AsyncClient, openid: str, api: SheetsApi, *, day: str, timestamp: str) -> str`: the log line; never raises.

- [ ] **Step 1: Write the failing tests** in `tests/test_roster_sheet.py`. Fixtures: `AUDIT` as in `tests/test_nikke_sheet.py`; sheet keys `"'RosterLog'!A1:D1"`, `"'RosterLog'!A:A"`, `"'RosterLog'!A:D"`, `"'NikkeDatabase'!A:B"`; a `MockTransport` client answering `GetUserCharacters` with `{"code": 0, "data": {"characters": [...]}}`, where an entry is `{"name_code": c, "grade": g, "core": k, "lv": 1, "combat": 1, "costume_id": 0}`.

```python
def test_rows_copies_and_order():
    chars = [char(5075, 3, 7), char(1023, 0, 0), char(5136, 3, 0)]
    rows, notes = roster_rows(chars, {5075: "A", 1023: "B", 5136: "C"}, {}, "2026-11-21")
    assert rows == [["2026-11-21", 1023, "B", 1], ["2026-11-21", 5075, "A", 11], ["2026-11-21", 5136, "C", 4]]
    assert notes == []

def test_unchanged_skipped_changed_written():
    rows, _ = roster_rows([char(1, 3, 0), char(2, 3, 1)], {1: "A", 2: "B"}, {1: 4, 2: 4}, "d")
    assert rows == [["d", 2, "B", 5]]

def test_bad_and_unknown_entries_noted():
    chars = [char(1, 4, 0), char(2, 3, 8), char(True, 0, 0), char(3, 1.0, 0), "junk", char(9, 0, 0), char(1, 0, 0)]
    rows, notes = roster_rows(chars, {1: "A", 2: "B", 3: "C"}, {}, "d")
    assert rows == [["d", 1, "A", 1]]  # index 6 (valid, repeated name_code 1) is the one written
    assert notes == ["entry 0", "entry 1", "entry 2", "entry 3", "entry 4", "9 not in NikkeDatabase"]

def test_repeated_name_code_first_wins():
    rows, _ = roster_rows([char(1, 1, 0), char(1, 2, 0)], {1: "A"}, {}, "d")
    assert rows == [["d", 1, "A", 2]]

def test_logged_copies_last_row_wins_and_junk_skipped():
    values = [["date", "nameCode", "name", "copies"], [46000, 1, "A", 4], [], ["x", "typo", "A", 2],
              [46001, 1.0, "A", 5.0], [46001, 2, "B", ""]]
    assert logged_copies(values) == {1: 5}

def test_database_names_skips_junk():
    assert database_names([["nameCode", "name"], [5001, "Rapi"], ["", "x"], [5002, ""], ["5003", "Anis"]]) \
        == {5001: "Rapi", 5003: "Anis"}

async def test_sync_first_run_writes_all(...):   # empty RosterLog: every owned Nikke, one batch, AuditLog row form "cli-roster-log"
    assert line == "RosterLog +3"
async def test_sync_rerun_writes_nothing(...):   # RosterLog already matches: no batch
    assert line == "RosterLog +0" and api.batches == []
async def test_sync_empty_characters_is_failure(...):
    assert line.startswith("RosterLog: ") and api.batches == []
async def test_sync_code_not_zero(...):          # {"code": 1, "msg": "nope"}
    assert line == "RosterLog: nope" and api.batches == []
async def test_sync_auth_error(...):             # answer with fetch.AUTH_CODE
    assert line.startswith("RosterLog: ") and api.batches == []
async def test_sync_header_mismatch(...):        # wrong RosterLog row 1
    assert line.startswith("RosterLog: ") and api.batches == []
async def test_sync_skipped_noted(...):          # one unknown nameCode
    assert line == "RosterLog +1 (skipped 9 not in NikkeDatabase)"
```

Check how existing async tests run (`tests/test_union.py`) and follow the same style.

- [ ] **Step 2: Run and see them fail**

Run: `uv run pytest tests/test_roster_sheet.py -v`
Expected: FAIL, `ModuleNotFoundError: shiniri_cli.roster_sheet`.

- [ ] **Step 3: Implement `src/shiniri_cli/roster_sheet.py`** with the interfaces above. `sync_roster_log` order: fetch characters (`code != 0`: message is `resp.get("msg")`; a missing or empty `data.characters`: `no characters`), then read `NikkeDatabase` A:B and `RosterLog` A:D (unformatted), build rows, `write_rows(api, TAB, HEADERS, rows, form=FORM, timestamp=timestamp)` only if rows exist. Catch `SheetsError` as `RosterLog: <e>` and any other `Exception` (including `AuthError`) as `RosterLog: <TypeName>: <e>`, like `nikke_sheet.sync_nikke_database`.

- [ ] **Step 4: Run and see them pass**

Run: `uv run pytest tests/test_roster_sheet.py -v`
Expected: all PASS.

### Task 2: Wire into `watch`

**Files:**
- Modify: `src/shiniri_cli/profile.py` (`_check`, around lines 193-223)
- Test: `tests/test_profile.py` (`_check_with_gacha` and the no-gacha-id test around line 252)

**Interfaces:**
- Consumes: `roster_sheet.sync_roster_log` from Task 1; `make_client`, `cookies["game_openid"]`, `game_day`, `wib_timestamp` already in `profile.py`.
- Produces: one more log line after the NikkeDatabase line on every check.

- [ ] **Step 1: Update the tests.** In the no-gacha-id test, `lines` now ends with `"NikkeDatabase: no gacha_spreadsheet_id", "RosterLog: no gacha_spreadsheet_id"`. `_check_with_gacha` takes a `fake_roster` too and monkeypatches `roster_sheet.sync_roster_log` with an async fake recording `(openid, api, day, timestamp)`. New tests:

```python
def test_check_logs_roster_after_nikke_database(store, monkeypatch):
    # fake_roster returns "RosterLog +2"
    assert lines[-2:] == ["NikkeDatabase +2", "RosterLog +2"]
    assert seen_roster == [("me", "sheets:g", "2026-11-20", "2026-11-20 12:59:00")]  # use wib_timestamp's real format
    assert text == "Campaign +0 · Union +1"

def test_roster_failure_leaves_the_rest(store, monkeypatch):
    # fake_roster returns "RosterLog: boom"
    assert lines[-2:] == ["NikkeDatabase +2", "RosterLog: boom"] and text == "Campaign +0 · Union +1"
```

- [ ] **Step 2: Run and see them fail**

Run: `uv run pytest tests/test_profile.py -v`
Expected: the three tests above FAIL; the others pass.

- [ ] **Step 3: Implement.** In `_check`, build the gacha `HttpSheets` once, log the NikkeDatabase line, then `log(asyncio.run(...))` on a small coroutine that opens `make_client(cookies)` and awaits `roster_sheet.sync_roster_log(client, cookies["game_openid"], gacha, day=game_day(now), timestamp=wib_timestamp(now))`. Import `roster_sheet` next to `nikke_sheet`. The else branch logs both "no gacha_spreadsheet_id" lines.

- [ ] **Step 4: Run the whole suite**

Run: `uv run pytest`
Expected: all PASS.

### Task 3: `tools/cdn.py`

**Files:**
- Create: `tools/cdn.py`

**Interfaces:**
- Consumes: `cdn_url(path: str) -> str` from `shiniri_cli.fetch`.
- Produces: `main(argv: list[str]) -> int`, run via `raise SystemExit(main(sys.argv[1:]))`.

- [ ] **Step 1: Implement.** Module docstring with the usage line `uv run python tools/cdn.py <path> [<path> ...]`, in the style of `tools/names.py`. No paths: print the usage line to stderr and return 2. Otherwise print `cdn_url(p)` per path, in order, and return 0. No network.

- [ ] **Step 2: Check by hand**

Run: `uv run python tools/cdn.py character/si/si_c010_00_s.webp /character/si/si_c010_00_s.webp; uv run python tools/cdn.py; echo $?`
Expected: two identical URLs starting with the `CDN_HOST` from `fetch.py`, then the usage line and `2`.

- [ ] **Step 3: Update `CLAUDE.md`** (`cli/CLAUDE.md`, the `tools/` bullet) to name `tools/cdn.py`, and add `RosterLog` to the column-A keys bullet with its `nameCode` + `copies` exception.

## Manual steps (owner, before the homeserver pulls `develop`)

1. Create tab `RosterLog` with headers `date`, `nameCode`, `name`, `copies` on the test copy, then the real sheet.
2. Delete or move the untracked root `blabla.yml`: it holds an `intl_open_id` and isn't gitignored.
3. Don't pull any gacha on the day of the first `watch` check with this change.
