# Profile Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `shiniri-cli watch`, a long-running loop that appends one profile row per game day to the `Profile` tab of the Progression sheet, once the daily is finished or at the 02:59 WIB check.

**Architecture:**
- `profile.py` holds the pure logic (game day, check times, row building) plus the daily check and its guard file.
- `fetch.py` gains the shared blablalink call. It is lifted out of `union.py` and used by the profile requests.
- `sheets.py` is a Python port of the web app's `writeTabsAtEnd`: one `values:batchUpdate` carrying the data row and its `AuditLog` row. It authenticates with a service account.
- `cli.run()` dispatches `watch` to the loop.

**Tech Stack:** Python ≥ 3.14, httpx (async for blablalink, sync for Sheets), `google-auth` + `requests` (new, token only), pytest with `httpx.MockTransport`.

**Spec:** `docs/superpowers/specs/2026-11-19-profile-tracking-design.md`

**Running tests:** `uv run pytest`. On the Windows PC `uv run` fails with "trampoline failed to canonicalize script path"; use `.venv/Scripts/python -m pytest` there. Baseline: 115 passed.

## Global Constraints

- WIB is a fixed `timezone(timedelta(hours=7))`. Never use the machine's local zone; the homeserver may run in UTC.
- Game day = WIB date of (now − 3h). The last check of a game day is at 02:59 WIB.
- "Daily finished" means `daily_mission_received_points >= 100`.
- Profile requests: `POST https://api.blablalink.com/api/game/proxy/Game/<Name>`, body `{"intl_open_id": <game_openid cookie>, "nikke_area_id": 85}`. `code == 300001` raises `AuthError`.
- Sheet tab `Profile`, 47 columns A–AU, headers exactly as `PROFILE_HEADERS` (Task 1). `AuditLog` headers: `savedAt | form | ranges | rows`. Form name: `cli-profile`.
- Writes use `valueInputOption: USER_ENTERED`. The audit timestamp and range are written with a leading `'`, as the web app does.
- Daily progress is never written to the sheet. It lives only in `data/daily.json` (`{"day", "written", "progress"}`).
- Config: `config/sheets.json` = `{"spreadsheet_id": "..."}` and `config/service-account.json`. Both are gitignored.
- A failed check never stops the loop.

## Review Focus

1. **The machine clock isn't WIB** (homeserver on UTC). Every time function takes an aware datetime and converts it to WIB. Task 1 tests pass UTC datetimes.
2. **The check right after 02:59 runs in the same minute.** `next_check` must return the next :59 strictly after now. A check at 02:59:40 schedules 03:59:00, not 02:59:00 again (Task 1).
3. **`data/daily.json` missing, corrupt, or from yesterday** is treated as a fresh day, never a crash (Task 4).
4. **`code: 0` with an empty `daily_progress` list,** or a missing `basic_info`/`outpost_info`, raises `ProfileError` and is logged, not an `IndexError`/`KeyError` that escapes (Task 2).
5. **The game adds or drops a currency, room or relic id.** A missing id writes `""`, an unknown id is ignored, and the row stays 47 cells (Task 1).

---

### Task 1: Row building and check timing

**Files:**
- Create: `src/shiniri_cli/profile.py`
- Modify: `tests/conftest.py` (add `PROFILE_FIXTURE`)
- Test: `tests/test_profile.py`

**Interfaces:**
- Produces:
  - `WIB: timezone`
  - `game_day(now: datetime) -> str`, returning `YYYY-MM-DD`
  - `is_last_check(now: datetime) -> bool`, true when WIB `HH:MM == "02:59"`
  - `next_check(now: datetime) -> datetime`, the next WIB `:59:00` strictly after `now`
  - `wib_timestamp(now: datetime) -> str`, returning `YYYY-MM-DD HH:MM:SS` in WIB
  - `PROFILE_HEADERS: tuple[str, ...]` (47 entries)
  - `stage_names(store: Store) -> dict[int, str]`
  - `build_row(basic: dict, outpost: dict, *, day: str, taken_at: str, daily_done: bool, stages: dict[int, str]) -> list`

- [ ] **Step 1: Add the sample responses to `tests/conftest.py`**

`PROFILE_FIXTURE = {"basic": {...}, "outpost": {...}, "daily": {...}}`. Each value is the full response body (`{"code":0,...,"data":{...}}`), copied verbatim from the `data:` line of the matching request's example in `blabla.yml` (folder `profile`: `GetUserProfileBasicInfo`, `GetUserProfileOutpostInfo`, `GetUserDailyContentsProgress`). Keep `"intl_open_id"` out of it; it lives only in the request bodies.

- [ ] **Step 2: Write the failing tests**

```python
from datetime import datetime, timezone
from conftest import PROFILE_FIXTURE
from shiniri_cli.profile import (PROFILE_HEADERS, build_row, game_day, is_last_check, next_check,
                                 stage_names, wib_timestamp, WIB)

UTC = timezone.utc
BASIC = PROFILE_FIXTURE["basic"]["data"]["basic_info"]
OUTPOST = PROFILE_FIXTURE["outpost"]["data"]["outpost_info"]
STAGES = {6050044: "50-36", 7050044: "50-36", 8050044: "50-36"}


def test_game_day_rolls_at_3am_wib():
    assert game_day(datetime(2026, 11, 20, 19, 59, tzinfo=UTC)) == "2026-11-20"  # 02:59 WIB on the 21st
    assert game_day(datetime(2026, 11, 20, 20, 0, tzinfo=UTC)) == "2026-11-21"   # 03:00 WIB


def test_last_check_and_next_check():
    assert is_last_check(datetime(2026, 11, 20, 19, 59, 30, tzinfo=UTC))
    assert not is_last_check(datetime(2026, 11, 20, 20, 59, tzinfo=UTC))
    assert next_check(datetime(2026, 11, 20, 19, 59, 40, tzinfo=UTC)) == datetime(2026, 11, 21, 3, 59, tzinfo=WIB)
    assert next_check(datetime(2026, 11, 20, 19, 10, tzinfo=UTC)) == datetime(2026, 11, 21, 2, 59, tzinfo=WIB)


def test_wib_timestamp():
    assert wib_timestamp(datetime(2026, 11, 19, 7, 8, 32, tzinfo=UTC)) == "2026-11-19 14:08:32"


def test_build_row_from_samples():
    row = build_row(BASIC, OUTPOST, day="2026-11-19", taken_at="2026-11-19 14:08:32",
                    daily_done=False, stages=STAGES)
    assert len(PROFILE_HEADERS) == len(row) == 47
    assert dict(zip(PROFILE_HEADERS, row)) == {
        "date": "2026-11-19", "takenAt": "'2026-11-19 14:08:32", "dailyDone": False,
        "level": 934, "teamCombat": 3399441, "nikkes": 200, "costumes": 99,
        "elysionNikkes": 49, "missilisNikkes": 41, "tetraNikkes": 56, "pilgrimNikkes": 26, "abnormalNikkes": 28,
        "paidGems": 5565, "freeGems": 17500, "battleData": 443078442, "credits": 49450668, "coreDust": 76359,
        "recruitVouchers": 59, "advRecruitVouchers": 0, "silverMileage": 630, "goldMileage": 1810,
        "easyCampaign": "50-36", "normalCampaign": "50-36", "hardCampaign": "50-36",
        "tribeTower": 1650, "elysionTower": 1036, "missilisTower": 1036, "tetraTower": 1036, "pilgrimTower": 1036,
        "overclockCurrent": 25, "overclockLatest": 25,
        "synchroLevel": 801, "synchroSlots": 172, "outpostLevel": 747,
        "recyclePersonal": 380, "recycleAttacker": 280, "recycleDefender": 255, "recycleSupporter": 255,
        "recycleElysion": 250, "recycleMissilis": 251, "recycleTetra": 250, "recyclePilgrim": 245,
        "recycleAbnormal": 247,
        "memoirs": 109, "callLogs": 39, "bgm": 952, "data": 124,
    }


def test_missing_and_unknown_ids():
    basic = {**BASIC, "currencies": [{"type": 99, "value": "1"}, {"type": 424242, "value": "9"}],
             "progress_hard_campaign": 123}
    row = dict(zip(PROFILE_HEADERS, build_row(basic, {**OUTPOST, "memorial_counts": []}, day="d",
                                              taken_at="t", daily_done=True, stages=STAGES)))
    assert row["paidGems"] == "" and row["freeGems"] == 1
    assert row["hardCampaign"] == 123          # not in stage_list: raw id
    assert row["memoirs"] == "" and row["data"] == 0


def test_stage_names_strip_suffix(store):
    store.save_raw("stage_list", [{"id": 6050044, "name_localkey": {"name": "50-36 BOSS"}},
                                  {"id": 7050044, "name_localkey": {"name": "50-36 HARD BOSS"}},
                                  {"id": 6000001, "name_localkey": {"name": "0-1 STAGE"}}])
    assert stage_names(store) == {6050044: "50-36", 7050044: "50-36", 6000001: "0-1"}
```

- [ ] **Step 3: Run to verify they fail**

Run: `uv run pytest tests/test_profile.py -v`
Expected: FAIL with `ModuleNotFoundError: shiniri_cli.profile`

- [ ] **Step 4: Implement `profile.py`**

- The id maps are module constants, one per group, ordered as the headers:
  - `CORPS = {1: "elysion", 2: "missilis", 3: "tetra", 4: "pilgrim", 7: "abnormal"}`
  - currencies `98, 99, 1000, 2000, 3000, 5100, 5200, 11000, 12000`
  - recycle `tid`s `1001, 1101, 1102, 1103, 1201–1205`
- Currency `value` strings become `int`.
- `data` is the sum of every `memorial_counts` category except `HandWriting` and `CallLog` (0 when the list is empty). `memoirs` and `callLogs` are `""` when their category is missing.
- `takenAt` gets a leading `'`, so USER_ENTERED keeps it as text.
- `stage_names` takes the first space-separated token of `name_localkey.name` from `store.load_raw("stage_list", [])`.

- [ ] **Step 5: Run to verify they pass**

Run: `uv run pytest tests/test_profile.py -v`
Expected: 6 passed

- [ ] **Step 6: Commit**

```bash
git add src/shiniri_cli/profile.py tests/conftest.py tests/test_profile.py
git commit -m "feat: build daily profile rows and check times"
```

---

### Task 2: Profile requests

**Files:**
- Modify: `src/shiniri_cli/fetch.py` (add `API`, `api_call`, moved from `union.py:12` and `union.py:83-102`)
- Modify: `src/shiniri_cli/union.py` (import `API` and `api_call` from `fetch`, drop its own `_call`)
- Modify: `src/shiniri_cli/profile.py`
- Test: `tests/test_profile.py`

**Interfaces:**
- Consumes: `AuthError`, `AREA_ID` from `fetch.py`.
- Produces:
  - `fetch.api_call(client: httpx.AsyncClient, name: str, body: dict) -> dict`, the same behaviour as today's `union._call`
  - `profile.ProfileError(Exception)`
  - `async profile.fetch_daily(client, openid: str) -> dict`, returning `data.daily_progress[0]`
  - `async profile.fetch_profile(client, openid: str) -> tuple[dict, dict]`, returning `(basic_info, outpost_info)`

- [ ] **Step 1: Write the failing tests**

```python
import asyncio, httpx, pytest
from shiniri_cli.fetch import AuthError
from shiniri_cli.profile import ProfileError, fetch_daily, fetch_profile


def client_for(responses: dict[str, dict], seen: list | None = None):
    def handler(req):
        if seen is not None:
            seen.append(json.loads(req.content))
        return httpx.Response(200, json=responses[req.url.path.rsplit("/", 1)[1]])
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def test_fetch_daily_and_profile_send_openid():
    seen = []
    c = client_for({"GetUserDailyContentsProgress": PROFILE_FIXTURE["daily"],
                    "GetUserProfileBasicInfo": PROFILE_FIXTURE["basic"],
                    "GetUserProfileOutpostInfo": PROFILE_FIXTURE["outpost"]}, seen)
    assert asyncio.run(fetch_daily(c, "42"))["daily_mission_received_points"] == 30
    basic, outpost = asyncio.run(fetch_profile(c, "42"))
    assert basic["lv"] == 934 and outpost["synchro_level"] == 801
    assert seen[0] == {"intl_open_id": "42", "nikke_area_id": 85}


def test_auth_code_raises_auth_error():
    c = client_for({"GetUserDailyContentsProgress": {"code": 300001, "msg": "game not login"}})
    with pytest.raises(AuthError):
        asyncio.run(fetch_daily(c, "42"))


@pytest.mark.parametrize("body", [{"code": 0, "data": {"daily_progress": []}},
                                  {"code": 5, "msg": "busy"}])
def test_bad_daily_raises_profile_error(body):
    with pytest.raises(ProfileError):
        asyncio.run(fetch_daily(client_for({"GetUserDailyContentsProgress": body}), "42"))


def test_missing_outpost_raises_profile_error():
    c = client_for({"GetUserProfileBasicInfo": PROFILE_FIXTURE["basic"],
                    "GetUserProfileOutpostInfo": {"code": 0, "data": {}}})
    with pytest.raises(ProfileError):
        asyncio.run(fetch_profile(c, "42"))
```

- [ ] **Step 2: Run to verify they fail**

Run: `uv run pytest tests/test_profile.py -v`
Expected: the 4 new tests FAIL with `ImportError: ProfileError`

- [ ] **Step 3: Move `_call` to `fetch.api_call` and update `union.py`'s three call sites**

- [ ] **Step 4: Implement `fetch_daily` and `fetch_profile`**

Any response without `code == 0`, or without the expected `data` key/non-empty list, raises `ProfileError(f"{name}: {msg}")`. `api_call`'s transport-error dicts (`code: -1`) end up here too.

- [ ] **Step 5: Run the full suite**

Run: `uv run pytest`
Expected: all pass (115 + 10)

- [ ] **Step 6: Commit**

```bash
git add src/shiniri_cli/fetch.py src/shiniri_cli/union.py src/shiniri_cli/profile.py tests/test_profile.py
git commit -m "feat: fetch daily progress and profile info"
```

---

### Task 3: Sheet writer

**Files:**
- Create: `src/shiniri_cli/sheets.py`
- Modify: `pyproject.toml` (`uv add google-auth requests`)
- Test: `tests/test_sheets.py`

**Interfaces:**
- Produces:
  - `SheetsError(Exception)`
  - `column_letter(n: int) -> str`
  - `serial_to_iso(v) -> str`: a Sheets date serial (int/float) becomes `YYYY-MM-DD` (epoch 1899-12-30), a string comes back stripped
  - `class HttpSheets(spreadsheet_id: str, token: Callable[[], str], client: httpx.Client)` with:
    - `get_values(range_: str, unformatted: bool = False) -> list[list]`
    - `batch_update(data: list[tuple[str, list[list]]]) -> list[str]`, returning the updated ranges
  - `service_account_token(path: Path) -> Callable[[], str]`
  - `write_row(api, tab: str, headers: Sequence[str], row: list, *, form: str, timestamp: str, unless_last_a: str | None = None) -> str | None`. It returns the data range written, or `None` when the last column-A value of `tab` (through `serial_to_iso`) equals `unless_last_a`.
  - `AUDIT_TAB = "AuditLog"`, `AUDIT_HEADERS = ("savedAt", "form", "ranges", "rows")`

- [ ] **Step 1: Write the failing tests**

Use a `FakeSheets` with `values: dict[str, list[list]]` keyed by exact range strings, recording `batch_update` calls.

```python
H = ("date", "x", "y")

def fake(profile_a, audit_a=(("savedAt",),), target_profile=(), target_audit=()):
    return FakeSheets({
        "'Profile'!A1:C1": [list(H)], "'AuditLog'!A1:D1": [["savedAt", "form", "ranges", "rows"]],
        "'Profile'!A:A": [list(r) for r in profile_a], "'AuditLog'!A:A": [list(r) for r in audit_a],
        "'Profile'!A3:C3": [list(target_profile)] if target_profile else [],
        "'AuditLog'!A2:D2": [list(target_audit)] if target_audit else [],
    })


def test_writes_data_and_audit_in_one_batch():
    api = fake([["date"], [46345]])
    rng = write_row(api, "Profile", H, ["2026-11-20", 1, 2], form="cli-profile", timestamp="2026-11-20 10:59:00")
    assert rng == "'Profile'!A3:C3"
    assert api.batches == [[("'Profile'!A3:C3", [["2026-11-20", 1, 2]]),
                            ("'AuditLog'!A2:D2", [["'2026-11-20 10:59:00", "cli-profile", "''Profile'!A3:C3", 1]])]]

def test_skips_when_last_date_is_today():   # 46346 == 2026-11-20
    api = fake([["date"], [46346]])
    assert write_row(api, "Profile", H, ["2026-11-20", 1, 2], form="f", timestamp="t",
                     unless_last_a="2026-11-20") is None
    assert api.batches == []

def test_header_mismatch_refuses():
    api = fake([["date"], [46345]]); api.values["'Profile'!A1:C1"] = [["date", "x", "z"]]
    with pytest.raises(SheetsError, match="headers"):
        write_row(api, "Profile", H, ["d", 1, 2], form="f", timestamp="t")
    assert api.batches == []

def test_non_empty_target_refuses():
    api = fake([["date"], [46345]], target_profile=("", "junk"))
    with pytest.raises(SheetsError, match="not empty"):
        write_row(api, "Profile", H, ["d", 1, 2], form="f", timestamp="t")

def test_blank_cells_inside_column_a_use_last_filled_row():
    api = fake([["date"], [46345], [""]])
    assert write_row(api, "Profile", H, ["d", 1, 2], form="f", timestamp="t") == "'Profile'!A3:C3"

def test_serial_and_column_letter():
    assert serial_to_iso(46346) == "2026-11-20" and serial_to_iso(" 2026-11-20 ") == "2026-11-20"
    assert column_letter(47) == "AU" and column_letter(26) == "Z"

def test_http_sheets_error_carries_google_message():
    def handler(req): return httpx.Response(403, json={"error": {"message": "The caller does not have permission"}})
    api = HttpSheets("sid", lambda: "tok", httpx.Client(transport=httpx.MockTransport(handler)))
    with pytest.raises(SheetsError, match="403.*permission"):
        api.get_values("'Profile'!A:A")
```

- [ ] **Step 2: Run to verify they fail**

Run: `uv run pytest tests/test_sheets.py -v`
Expected: FAIL with `ModuleNotFoundError: shiniri_cli.sheets`

- [ ] **Step 3: Add the dependencies**

Run: `uv add google-auth requests`
Expected: `pyproject.toml` and `uv.lock` updated

- [ ] **Step 4: Implement `sheets.py`**

Follow `shiniri/src/services/sheets/tabWriter.ts` (`checkedRange`, `nextEmptyRow`, `writeTabsAtEnd`) for one tab plus `AuditLog`:
- **Ranges:** the tab name is quoted, with `'` doubled.
- **Header check:** a mismatch raises `SheetsError("Profile headers changed: expected [...], found [...]")`.
- **Column A:** read with `unformatted=True`.
- **Write:** one `batch_update` call.
- **The race:** put the accepted race as a comment above the `batch_update` call: `# shortcut: a web app save landing between the empty check and this write can overwrite one AuditLog row; accepted for one person, switch the audit row to values.append if that changes.`

`HttpSheets`:
- Requests go to `https://sheets.googleapis.com/v4/spreadsheets/{id}/values/{range}` (`valueRenderOption=UNFORMATTED_VALUE` when `unformatted`) and to `.../values:batchUpdate` with `{"valueInputOption": "USER_ENTERED", "data": [{"range", "values"}]}`.
- Ranges are URL-encoded in the path, and the header is `Authorization: Bearer <token()>`.
- A non-2xx response raises `SheetsError(f"Sheets API {status}: {error.message}")`.

`service_account_token`:
- Use `google.oauth2.service_account.Credentials.from_service_account_file(path, scopes=["https://www.googleapis.com/auth/spreadsheets"])`.
- When `not creds.valid`, call `creds.refresh(google.auth.transport.requests.Request())`, then return `creds.token`.
- It isn't unit-tested; Task 5's live run covers it.

- [ ] **Step 5: Run to verify they pass**

Run: `uv run pytest tests/test_sheets.py -v`
Expected: 7 passed

- [ ] **Step 6: Commit**

```bash
git add src/shiniri_cli/sheets.py tests/test_sheets.py pyproject.toml uv.lock
git commit -m "feat: atomic sheet row writer with service account auth"
```

---

### Task 4: The daily check and its guard file

**Files:**
- Modify: `src/shiniri_cli/profile.py`
- Test: `tests/test_profile.py`

**Interfaces:**
- Consumes: `game_day`, `is_last_check`, `wib_timestamp`, `build_row`, `stage_names` (Task 1); `fetch_daily`, `fetch_profile`, `ProfileError` (Task 2); `SheetsError` (Task 3); `AuthError`; `store.atomic_write`.
- Produces:
  - `load_guard(store: Store, day: str) -> dict`: returns `{"day": day, "written": False}` when `data/daily.json` is missing, unreadable JSON, or for another day
  - `async check_once(store: Store, now: datetime, client: httpx.AsyncClient, openid: str, write: Callable[[list, str], str | None]) -> str`. `write(row, day)` returns the range written, or `None` for a duplicate. The result is the log line, without a timestamp.

- [ ] **Step 1: Write the failing tests**

These tests need three helpers, defined at the top of the test file:
- `client_for`, from Task 2.
- `daily(points)`, a deep copy of `PROFILE_FIXTURE["daily"]` with `daily_mission_received_points` set to `points`.
- `make_write(writes)`, which returns `lambda row, day: writes.append((row, day)) or "'Profile'!A5:AU5"`.

```python
NOON = datetime(2026, 11, 20, 5, 0, tzinfo=UTC)      # 12:00 WIB, game day 2026-11-20
LAST = datetime(2026, 11, 20, 19, 59, tzinfo=UTC)    # 02:59 WIB, still game day 2026-11-20

def run_check(store, now, points, write):
    c = client_for({"GetUserDailyContentsProgress": daily(points),
                    "GetUserProfileBasicInfo": PROFILE_FIXTURE["basic"],
                    "GetUserProfileOutpostInfo": PROFILE_FIXTURE["outpost"]})
    return asyncio.run(check_once(store, now, c, "42", write))

def guard(store): return json.loads((store.root / "data" / "daily.json").read_text(encoding="utf-8"))

def test_not_done_keeps_progress_and_writes_nothing(store):
    writes = []
    assert "not done (30/100)" in run_check(store, NOON, 30, make_write(writes))
    assert writes == [] and guard(store)["written"] is False
    assert guard(store)["progress"]["daily_mission_received_points"] == 30

def test_done_writes_once(store):
    writes = []
    assert "wrote 'Profile'!A5:AU5" in run_check(store, NOON, 100, make_write(writes))
    assert run_check(store, NOON, 100, make_write(writes)) == "game day 2026-11-20: already written"
    assert len(writes) == 1 and writes[0][1] == "2026-11-20"
    assert writes[0][0][PROFILE_HEADERS.index("dailyDone")] is True

def test_last_check_writes_unfinished_day(store):
    writes = []
    run_check(store, LAST, 30, make_write(writes))
    assert writes[0][0][PROFILE_HEADERS.index("dailyDone")] is False and guard(store)["written"] is True

def test_new_game_day_resets_guard(store):
    writes = []
    run_check(store, NOON, 100, make_write(writes))
    run_check(store, datetime(2026, 11, 20, 20, 0, tzinfo=UTC), 100, make_write(writes))  # 03:00 WIB
    assert [d for _, d in writes] == ["2026-11-20", "2026-11-21"]

def test_corrupt_guard_is_a_fresh_day(store):
    (store.root / "data" / "daily.json").write_text("{nope", encoding="utf-8")
    assert load_guard(store, "2026-11-20") == {"day": "2026-11-20", "written": False}

def test_duplicate_marks_written(store):
    run_check(store, NOON, 100, lambda row, day: None)
    assert guard(store)["written"] is True

@pytest.mark.parametrize("exc, text", [(SheetsError("Sheets API 403: nope"), "Sheets API 403"),
                                       (httpx.ConnectError("down"), "ConnectError")])
def test_write_failure_is_logged_and_retried_next_hour(store, exc, text):
    def boom(row, day): raise exc
    assert text in run_check(store, NOON, 100, boom)
    assert guard(store)["written"] is False

def test_rejected_cookie_is_logged(store):
    c = client_for({"GetUserDailyContentsProgress": {"code": 300001, "msg": "game not login"}})
    assert "cookie rejected" in asyncio.run(check_once(store, NOON, c, "42", make_write([])))
```

- [ ] **Step 2: Run to verify they fail**

Run: `uv run pytest tests/test_profile.py -v`
Expected: the new tests FAIL with `ImportError: check_once`

- [ ] **Step 3: Implement `load_guard` and `check_once`**

The flow is the spec's "One check".
- The guard path is `store.root / "data" / "daily.json"`, written with `atomic_write`.
- Catch `AuthError` → `"cookie rejected: <msg>"`; `ProfileError`, `SheetsError` → their message; `httpx.HTTPError` → its type name.
- Each message is prefixed with `game day <day>: `.
- The guard's progress is saved before profile fetching, so it survives a later failure.

- [ ] **Step 4: Run to verify they pass**

Run: `uv run pytest tests/test_profile.py -v`
Expected: all passed

- [ ] **Step 5: Commit**

```bash
git add src/shiniri_cli/profile.py tests/test_profile.py
git commit -m "feat: daily check with local guard file"
```

---

### Task 5: `shiniri-cli watch`, config and setup

**Files:**
- Modify: `src/shiniri_cli/profile.py` (add `watch`)
- Modify: `src/shiniri_cli/cli.py:591-593` (`run`)
- Modify: `.gitignore`, `README.md`
- Test: `tests/test_cli.py`

**Interfaces:**
- Consumes: `check_once`, `next_check`, `wib_timestamp`, `WIB` (Tasks 1 and 4); `HttpSheets`, `service_account_token`, `write_row`, `AUDIT_*` (Task 3); `load_cookie`, `make_client` (fetch).
- Produces:
  - `watch(store: Store, *, sleep=time.sleep, clock=lambda: datetime.now(WIB), once: bool = False) -> None`
  - `run()`, which dispatches `sys.argv[1:] == ["watch"]` to `watch(Store(root))`; otherwise it keeps calling `main(root)`

- [ ] **Step 1: Write the failing tests**

```python
def test_run_dispatches_watch(monkeypatch, tmp_path):
    called = []
    monkeypatch.setattr(sys, "argv", ["shiniri-cli", "watch"])
    monkeypatch.setattr("shiniri_cli.profile.watch", lambda store, **kw: called.append(store))
    monkeypatch.setattr("shiniri_cli.cli.main", lambda root: called.append("shell"))
    cli.run()
    assert len(called) == 1 and called[0] != "shell"

def test_watch_logs_missing_config_and_keeps_going(store, capsys):
    watch(store, once=True, clock=lambda: datetime(2026, 11, 20, 12, tzinfo=WIB))
    out = capsys.readouterr().out
    assert out.startswith("2026-11-20 12:00:00 ") and "cookie.txt" in out
```

- [ ] **Step 2: Run to verify they fail**

Run: `uv run pytest tests/test_cli.py -k "watch" -v`
Expected: FAIL with `ImportError: watch`

- [ ] **Step 3: Implement `watch` and update `run`**

- **Order:** one check on start, then forever: `sleep((next_check(clock()) - clock()).total_seconds())`, then check. `once=True` stops after the first check.
- **Each check:**
  - Re-read `config/cookie.txt` (`load_cookie`), `config/sheets.json` and `config/service-account.json`. Missing or invalid files are logged and don't stop the loop.
  - `write` = `write_row(HttpSheets(...), "Profile", PROFILE_HEADERS, row, form="cli-profile", timestamp=wib_timestamp(now), unless_last_a=day)`.
  - Run `check_once` with `asyncio.run` inside a `make_client(cookies)` context.
- **Logging:** catch every `Exception` around a check, print `f"{wib_timestamp(clock())} {msg}"` with `flush=True`, and continue. `KeyboardInterrupt` exits.

- [ ] **Step 4: Run to verify they pass**

Run: `uv run pytest`
Expected: all pass

- [ ] **Step 5: Add `config/service-account.json` and `config/sheets.json` to `.gitignore`. Add a "Daily profile row" section to `README.md`**

The section holds the spec's Setup steps 1–7, a one-line note that cookies come from `ambil`, and a warning to clear test rows from `Profile` and `AuditLog` before the real run.

- [ ] **Step 6: Live check against the test sheet (needs the user's service account)**

On the homeserver or the PC:
- Set `config/sheets.json` to the id from `../shiniri/.env.local`.
- Add the `Profile` tab with the 47 headers, and share the sheet with the service account.
- Run `uv run python -c "from pathlib import Path; from shiniri_cli.store import Store; from shiniri_cli.profile import watch; watch(Store(Path('.')), once=True)"`.

Expected: one log line that is either `not done (n/100)`, or `wrote 'Profile'!A2:AU2` with the matching `AuditLog` row in the sheet. If the daily isn't finished, there is no write; that line alone confirms auth, the cookie and the fetch. In that case, temporarily run with a `clock` returning 02:59 WIB to exercise the write. Then delete the test rows.

- [ ] **Step 7: Commit**

```bash
git add src/shiniri_cli/profile.py src/shiniri_cli/cli.py tests/test_cli.py .gitignore README.md
git commit -m "feat: shiniri-cli watch writes the daily profile row"
```
