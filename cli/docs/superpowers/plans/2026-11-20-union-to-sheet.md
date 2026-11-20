# Union to Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `watch` writes every locked union season to Progression as a Union tab (one row per hit) and a Roster tab (one row per member per season).

**Architecture:** `fetch_union` also snapshots `GetGuildMembers` into each saved season file. A new `union_sheet.py` (shaped like `clear_sheet.py`) turns locked seasons into rows and appends the seasons each tab lacks, keyed on column A = season. `profile._check` runs it right after `sync_clears` in the same once-a-day callback.

**Tech Stack:** Python 3, httpx (MockTransport in tests), pytest, Google Sheets values API via the existing `write_rows`.

**Spec:** `docs/superpowers/specs/2026-11-20-union-to-sheet-design.md`

## Global Constraints

- Union headers, exactly: `season, day, mode, level, step, boss, bossElement, memberId, nickname, damage, finalHit, slot1, slot2, slot3, slot4, slot5` (16 columns, A–P).
- Roster headers, exactly: `season, memberId, nickname, level, synchroLevel, source` (6 columns, A–F); `source` is `api` or `hits`.
- AuditLog form: `cli-union`.
- Only seasons where `is_final` holds are written; one `write_rows` block per season per tab.
- `GetGuildMembers` body: `{"guild_id": <card guild_id as str>, "nikke_area_id": str(AREA_ID)}`; members are `data.items`.
- Recent-roster window: `SIZE_TRUST = 7 * 86400`.
- Sheets writes are `USER_ENTERED`: every `memberId` and `nickname` cell is written with a leading `'`.
- One tab's failure never stops the other; a failed fetch still writes what's stored.

## Correction to the spec

The spec says the hourly cost is "the current season's three calls". In fact `check_once` only runs its
`clears` callback once the game day's profile row is written, so it runs **once a day**, not every hour. A
locked season therefore reaches the sheet within a day of locking. That's fine for a record. Nothing in this
plan fetches union hourly.

## Review Focus

1. **Member IDs over 2^53** (e.g. `18368950982244160630`): written bare, Sheets turns them into a rounded number that no longer matches. Each one must land as text → Task 3 test `test_member_ids_and_names_are_text`.
2. **A nickname starting with `=`, `+`, `-` or `@`**: written under USER_ENTERED, it would run as a formula in your sheet (32 other people choose these names). It must land as literal text → same test.
3. **`GetGuildMembers` failing while the season saves**: the season still saves, and any roster already stored is kept rather than wiped → Task 1 test `test_members_failure_keeps_old_roster`.
4. **A season not locked yet** (live, or ended less than an hour ago) is never written, even when the tab is empty → Task 3 test `test_unlocked_season_never_written`.
5. **Season numbers typed into column A any way** (`46`, `46.0`, `"46"`, junk): already-written seasons are recognised and junk is ignored → Task 3 test `test_existing_seasons_any_form`.

---

### Task 1: Roster snapshot in `fetch_union`, carried through `build_union`

**Files:**
- Modify: `src/shiniri_cli/union.py` (`fetch_union`, `build_union`; add `SIZE_TRUST`)
- Modify: `src/shiniri_cli/union_queries.py:23` (import `SIZE_TRUST` from `.union` instead of defining it)
- Test: `tests/test_union.py`

**Interfaces:**
- Produces: `union.SIZE_TRUST: int`. Each `UnionData.seasons[n]` gains `"members": list[dict] | None` (raw `items`). Each hit dict gains `"nickname": str` (that hit's own nickname, falling back to the openid).
- Produces: a stored season file gains `"members"`. `fetch_union` status for a locked season that just got a roster is `"kept (+roster)"`.

- [ ] **Step 1: Write the failing tests** in `tests/test_union.py`. Extend `_client` with a `members` parameter (default `MEMBERS_OK = {"code": 0, "data": {"items": [{"member_id": "a", "nickname": "ALPHA", "level": 900, "synchro_level": 800}]}}`) answered when `name == "GetGuildMembers"`.

```python
def test_saved_season_stores_members(union_store):
    _add_season(union_store, 1000047, 900, 1100)
    seen = []
    _run(union_store, _client(seen), 1200)
    assert union_store.load_raw("union/1000047")["members"] == MEMBERS_OK["data"]["items"]
    assert ("GetGuildMembers", None) in seen

def test_members_failure_keeps_old_roster(union_store):
    raw = union_store.load_raw("union/1000046")
    union_store.save_raw("union/1000046", {**raw, "fetched_ts": 350, "members": [{"member_id": "old"}]})
    _run(union_store, _client([], members={"code": 1, "msg": "boom", "data": None}), 1000)
    saved = union_store.load_raw("union/1000046")
    assert saved["members"] == [{"member_id": "old"}] and saved["fetched_ts"] == 1000

def test_recent_locked_season_gets_current_roster(union_store):
    # s46 ended at 400 and is locked (fetched 10000); 400 + SIZE_TRUST is still ahead
    assert _run(union_store, _client([]), 5000)[46] == "kept (+roster)"
    assert union_store.load_raw("union/1000046")["members"] == MEMBERS_OK["data"]["items"]
    assert union_store.load_raw("union/1000046")["fetched_ts"] == 10000  # lock untouched

def test_old_locked_season_gets_no_roster(union_store):
    seen = []
    assert _run(union_store, _client(seen), 400 + SIZE_TRUST + 1)[46] == "kept"
    assert "members" not in union_store.load_raw("union/1000046")

def test_build_union_carries_members_and_hit_nickname(union_store):
    u = build_union(union_store, None, 0)
    assert u.seasons[46]["members"] is None
    assert {h["nickname"] for h in u.hits if h["season"] == 45 and h["openid"] == "b"} == {"BRAVO_OLD"}
```

- [ ] **Step 2: Run and see them fail**

Run: `uv run pytest tests/test_union.py -q`
Expected: the 5 new tests FAIL (KeyError `members` / `SIZE_TRUST` import error); the old ones still pass.

- [ ] **Step 3: Implement**

- Move `SIZE_TRUST = 7 * 86400` to `union.py`; in `union_queries.py`, replace the definition with `from .union import SIZE_TRUST` (keep its comment).
- `fetch_union`: add `async def _members(client, guild_id: str) -> list[dict] | None` returning `data.items` when `_ok(resp)` and it's a non-empty list, else `None`. When saving a season, call it after the raid call and store `"members": fresh or (stored or {}).get("members")` (omit the key when both are None). For a locked season (`is_final`) whose file has no `members`, and where `now <= season["end_ts"] + SIZE_TRUST`, fetch members, save the stored file back with only `members` added (`fetched_ts` unchanged), and set the status to `"kept (+roster)"`. Skip this for `"kept (other union)"`.
- `build_union`: add `"members": raw.get("members")` to each season dict and `"nickname": h.get("nickname") or h["openid"]` to each hit.

- [ ] **Step 4: Run the whole suite**

Run: `uv run pytest -q`
Expected: all pass. `test_fetch_body` still sees the level body at index 1 because the members call comes after the raid call.

- [ ] **Step 5: Commit**

```bash
git add src/shiniri_cli/union.py src/shiniri_cli/union_queries.py tests/test_union.py
git commit -m "feat: snapshot the union roster with each saved season"
```

---

### Task 2: `sync_reference` can refresh only some files

**Files:**
- Modify: `src/shiniri_cli/fetch.py:198` (`sync_reference`)
- Test: `tests/test_fetch.py`

**Interfaces:**
- Produces: `async sync_reference(store: Store, client: httpx.AsyncClient, names: Collection[str] | None = None) -> dict[str, str]`. `None` keeps today's "all sources" behaviour.

- [ ] **Step 1: Write the failing test** `test_sync_reference_only_named`, modelled on `test_sync_reference`: call it with `names=("raid_list",)`, then assert the result's keys are `{"raid_list"}` and the mock saw exactly one request.
- [ ] **Step 2: Run it** with `uv run pytest tests/test_fetch.py -q`. It fails with `TypeError: unexpected keyword 'names'`.
- [ ] **Step 3: Implement** by filtering `sources.items()` on `names` when it's given.
- [ ] **Step 4: Run** `uv run pytest tests/test_fetch.py -q` and expect all to pass.
- [ ] **Step 5: Commit** with `feat: sync_reference can refresh named files only`.

---

### Task 3: `union_sheet.py`: rows, append per season, `sync_union`

**Files:**
- Create: `src/shiniri_cli/union_sheet.py`
- Modify: `src/shiniri_cli/sheets.py` (gains `int_ids`), `src/shiniri_cli/clear_sheet.py` (uses `int_ids`, drops `_ids`)
- Test: `tests/test_union_sheet.py` (new); `tests/test_clear_sheet.py` stays green unchanged

**Interfaces:**
- Consumes: `fetch_union`, `build_union`, `is_final`, `UnionError` (`union.py`); `sync_reference(..., names=("raid_list",))` (Task 2); `AuthError` (`fetch.py`); `write_rows`, `column_a`, `SheetsError` (`sheets.py`).
- Produces:
  - `sheets.int_ids(values: list) -> set[int]`, which is `clear_sheet._ids` moved verbatim (row 1 is skipped; junk, inf and overflow are ignored).
  - `union_sheet.TABS = {"union": "Union", "roster": "Roster"}`, `HEADERS = {"union": (...16...), "roster": (...6...)}`, `FORM = "cli-union"`.
  - `locked(u: UnionData) -> list[int]`: ascending season numbers where `is_final({"fetched_ts": s["fetched_ts"] or 0}, {"end_ts": s["end_ts"] or 0})`.
  - `union_rows(u: UnionData, n: int) -> list[list]` gives one row per hit in stored order, `[n, day, mode, level, step, boss, boss_element or "", "'"+openid, "'"+nickname, damage, final, slot1..5 names]`.
  - `roster_rows(u: UnionData, n: int) -> list[list]` uses members when present, `[n, "'"+member_id, "'"+nickname, level, synchro_level, "api"]`. Otherwise it gives one row per distinct hitter in first-hit order, `[n, "'"+openid, "'"+that season's last nickname, "", "", "hits"]`.
  - `append_seasons(api, kind: str, rows_by_season: dict[int, list[list]], *, timestamp: str) -> int` returns the number of seasons written. It skips seasons already in column A and seasons with no rows.
  - `async sync_union(store: Store, client: httpx.AsyncClient, api: SheetsApi, *, timestamp: str, now: float) -> str` returns e.g. `"Union +12 · Roster +12"`, with ` (fetch: …)` appended to both parts when the refresh or fetch failed. It never raises.

- [ ] **Step 1: Write the failing tests** in `tests/test_union_sheet.py`, using the `union_store` fixture and `FakeSheets`. Give a `sheet(tab, col_a)` helper the ranges `'Union'!A1:P1` and `'Roster'!A1:F1`. In `union_store`, s45 and s46 are locked (fetched 10000, ends 200 and 400).

```python
# every test: u = build_union(union_store, None, 0)
def test_union_rows_s46():
    rows = union_rows(u, 46)
    assert len(rows) == 11 and rows[0][:11] == [46, 1, "normal", 10, 4, "Obelisk Z.E.U.S.", "Electronic", "'a", "'ALPHA", 2000000000, False]

def test_roster_falls_back_to_hitters():
    assert roster_rows(u, 46) == [[46, "'a", "'ALPHA", "", "", "hits"], [46, "'b", "'BRAVO", "", "", "hits"], [46, "'d", "'DELTA", "", "", "hits"]]

def test_roster_from_members(): # members [{"member_id": "x", "nickname": "X", "level": 1, "synchro_level": 2}] on s46
    assert roster_rows(u, 46) == [[46, "'x", "'X", 1, 2, "api"]]

def test_member_ids_and_names_are_text(): # hit nickname "=HYPERLINK(1)", openid "18368950982244160630"
    row = union_rows(u, 46)[0]; assert row[7] == "'18368950982244160630" and row[8] == "'=HYPERLINK(1)"

def test_first_run_backfills_every_locked_season():  # empty tabs → 2 batches per tab, ranges 'Union'!A2:P10 then A11:P21
    assert append_seasons(api, "union", {n: union_rows(u, n) for n in locked(u)}, timestamp="ts") == 2

def test_existing_seasons_any_form():  # col A [["season"], [45.0], ["46"], ["junk"]] → 0 written, no batches

def test_unlocked_season_never_written():  # s46 fetched_ts 350 → locked(u) == [45]

def test_one_tab_error_keeps_the_other(monkeypatch):  # fetch_union / sync_reference monkeypatched to no-ops
    # Union headers wrong → text starts "Union: Union headers changed" and ends " · Roster +2"

def test_fetch_error_still_writes_stored(monkeypatch):  # fetch_union raises httpx.ConnectError
    assert text == "Union +2 (fetch: ConnectError) · Roster +2 (fetch: ConnectError)"
```

- [ ] **Step 2: Run them** with `uv run pytest tests/test_union_sheet.py -q`. Expect them to fail with `ModuleNotFoundError: shiniri_cli.union_sheet`.

- [ ] **Step 3: Implement.** Move `_ids` to `sheets.int_ids` and switch `clear_sheet.append_missing` to it. Write `union_sheet.py` to the interfaces above. `sync_union` order: refresh `raid_list` through a **separate** plain `httpx.AsyncClient()` (never the cookie client, so game cookies don't go to the CDN host), then `fetch_union(store, client, now)` (refresh and fetch failures each become the fetch note, as `sync_clears` does: AuthError → `cookie rejected: …`, httpx.HTTPError → type name, UnionError and the rest → `Type: msg`), then `u = build_union(store, None, now)`. Then for each kind, `append_seasons` inside its own `try`: SheetsError → `"{Tab}: {e}"`, any other Exception → `"{Tab}: {Type}: {e}"`.

- [ ] **Step 4: Run the whole suite** with `uv run pytest -q`. Expect all to pass, `test_clear_sheet.py` included.

- [ ] **Step 5: Commit** with `feat: union and roster tabs, one block per locked season`.

---

### Task 4: `watch` runs `sync_union` after `sync_clears`

**Files:**
- Modify: `src/shiniri_cli/profile.py:179-197` (`_check`)
- Test: `tests/test_profile.py`

**Interfaces:**
- Consumes: `sync_union(store, client, api, *, timestamp, now)` (Task 3), `sync_clears` (existing).

- [ ] **Step 1: Write the failing test** `test_check_joins_clears_and_union`. Monkeypatch `profile.load_cookie`, `profile.service_account_token`, `profile.HttpSheets` and `profile.check_once`, and have the fake `check_once` `await clears()` and return the result. Also monkeypatch `clear_sheet.sync_clears` to return `"Campaign +0 · Tower +0"` and `union_sheet.sync_union` to return `"Union +1 · Roster +1"`. Write `config/sheets.json` into the tmp store. Assert `_check(store, now) == "Campaign +0 · Tower +0 · Union +1 · Roster +1"`.
- [ ] **Step 2: Run it** with `uv run pytest tests/test_profile.py -q`. The new test fails because there's no Union part.
- [ ] **Step 3: Implement.** Inside `_check`, import `sync_union` locally next to `sync_clears`, and replace the `clears=` lambda with an inner `async def sheet_sync() -> str` that awaits both and joins them with `" · "`. Pass `now=now.timestamp()` to `sync_union`. `_run_clears` stays as the safety net.
- [ ] **Step 4: Run the whole suite** with `uv run pytest -q`. Expect all to pass.
- [ ] **Step 5: Manual check** with `uv run shiniri-cli watch` against the real sheet, after creating the `Union` and `Roster` tabs with the exact header rows. Once the day's row is written, the log line ends with `Union +12 · Roster +12`. A second run on the same day shows `already written`. Stop it with Ctrl+C.
- [ ] **Step 6: Commit** with `feat: watch writes locked union seasons after clears`.
