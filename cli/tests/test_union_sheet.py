import asyncio

import httpx
import pytest
from conftest import FakeSheets

from shiniri_cli import union_sheet
from shiniri_cli.union import build_union
from shiniri_cli.union_sheet import HEADERS, append_seasons, locked, roster_rows, sync_union, union_rows

AUDIT = {"'AuditLog'!A1:D1": [["savedAt", "form", "ranges", "rows"]], "'AuditLog'!A:A": [["savedAt"]]}
LAST = {"union": "P", "roster": "F"}


def sheet(kind, col_a, headers=None):
    tab = union_sheet.TABS[kind]
    return {f"'{tab}'!A1:{LAST[kind]}1": [headers or list(HEADERS[kind])], f"'{tab}'!A:A": col_a}


@pytest.fixture
def u(union_store):
    return build_union(union_store, None, 0)


def _edit_s46(store, **changes):
    raw = store.load_raw("union/1000046")
    store.save_raw("union/1000046", {**raw, **changes})


def test_headers():
    assert HEADERS["union"] == ("season", "day", "mode", "level", "step", "boss", "bossElement", "memberId",
                                "nickname", "damage", "finalHit", "slot1", "slot2", "slot3", "slot4", "slot5")
    assert HEADERS["roster"] == ("season", "memberId", "nickname", "level", "synchroLevel", "source")


def test_union_rows_s46(u):
    rows = union_rows(u, 46)
    assert len(rows) == 11
    assert rows[0][:11] == [46, 1, "normal", 10, 4, "Obelisk Z.E.U.S.", "Electronic", "'a", "'ALPHA",
                            2000000000, False]
    names = [s["name"] for s in u.hits[9]["squad"]]  # first s46 hit (s45 has 9)
    assert rows[0][11:] == [*names, *[""] * (5 - len(names))] and rows[1][10] is True


def test_roster_falls_back_to_hitters(u):
    assert roster_rows(u, 46) == [[46, "'a", "'ALPHA", "", "", "hits"], [46, "'b", "'BRAVO", "", "", "hits"],
                                  [46, "'d", "'DELTA", "", "", "hits"]]


def test_roster_from_members(union_store):
    _edit_s46(union_store, members=[{"member_id": "x", "nickname": "X", "level": 1, "synchro_level": 2}])
    assert roster_rows(build_union(union_store, None, 0), 46) == [[46, "'x", "'X", 1, 2, "api"]]


def test_member_ids_and_names_are_text(union_store):
    raw = union_store.load_raw("union/1000046")
    hit = {**raw["raid"]["participate_data"][0], "openid": "18368950982244160630", "nickname": "=HYPERLINK(1)"}
    _edit_s46(union_store, raid={**raw["raid"], "participate_data": [hit]},
              members=[{"member_id": "18368950982244160630", "nickname": "+SUM(1)", "level": 1,
                        "synchro_level": 2}])
    u = build_union(union_store, None, 0)
    [row] = union_rows(u, 46)
    assert row[7] == "'18368950982244160630" and row[8] == "'=HYPERLINK(1)"
    assert roster_rows(u, 46)[0][1:3] == ["'18368950982244160630", "'+SUM(1)"]


def test_first_run_backfills_every_locked_season(u):
    api = FakeSheets({**AUDIT, **sheet("union", [["season"]])})
    assert append_seasons(api, "union", {n: union_rows(u, n) for n in locked(u)}, timestamp="ts") == 2
    assert [b[0][0] for b in api.batches] == ["'Union'!A2:P10", "'Union'!A2:P12"]  # fake sheet never fills
    assert api.batches[0][1][1][0][1:] == ["cli-union", "''Union'!A2:P10", 9]


def test_existing_seasons_any_form(u):
    api = FakeSheets({**AUDIT, **sheet("union", [["season"], [45.0], ["46"], ["junk"]])})
    assert append_seasons(api, "union", {n: union_rows(u, n) for n in locked(u)}, timestamp="ts") == 0
    assert api.batches == []


def test_season_without_rows_is_skipped(u):
    api = FakeSheets({**AUDIT, **sheet("roster", [["season"]])})
    assert append_seasons(api, "roster", {45: [], 46: roster_rows(u, 46)}, timestamp="ts") == 1


def test_unlocked_season_never_written(union_store):
    _edit_s46(union_store, fetched_ts=350)
    assert locked(build_union(union_store, None, 0)) == [45]


def _no_fetch(monkeypatch, error=None):
    async def refresh(*a, **k):
        return {}

    async def fetch(*a, **k):
        if error:
            raise error
        return {}
    monkeypatch.setattr(union_sheet, "sync_reference", refresh)
    monkeypatch.setattr(union_sheet, "fetch_union", fetch)


def test_one_tab_error_keeps_the_other(union_store, monkeypatch):
    _no_fetch(monkeypatch)
    api = FakeSheets({**AUDIT, **sheet("union", [["season"]], ["season", "wrong"]), **sheet("roster", [["season"]])})
    text = asyncio.run(sync_union(union_store, None, api, timestamp="ts", now=99999))
    assert text.startswith("Union: Union headers changed") and text.endswith(" · Roster +2")


def test_fetch_error_still_writes_stored(union_store, monkeypatch):
    _no_fetch(monkeypatch, httpx.ConnectError("down"))
    api = FakeSheets({**AUDIT, **sheet("union", [["season"]]), **sheet("roster", [["season"]])})
    text = asyncio.run(sync_union(union_store, None, api, timestamp="ts", now=99999))
    assert text == "Union +2 (fetch: ConnectError) · Roster +2 (fetch: ConnectError)"


def test_season_missing_from_raid_list_is_not_locked(union_store):
    union_store.save_raw("raid_list", [])  # no end times known: nothing can be trusted as locked
    assert locked(build_union(union_store, None, 0)) == []
