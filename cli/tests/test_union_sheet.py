import asyncio

import httpx
import pytest
from conftest import FakeSheets

from shiniri_cli import union_sheet
from shiniri_cli.union import build_union
from shiniri_cli.union_sheet import (
    HEADERS,
    append_seasons,
    locked,
    roster_rows,
    season_rows,
    sync_union,
    union_rows,
)

AUDIT = {
    "'AuditLog'!A1:D1": [["savedAt", "form", "ranges", "rows"]],
    "'AuditLog'!A:A": [["savedAt"]],
}
LAST = {"union": "P", "roster": "F", "season": "H"}


def sheet(kind, col_a, headers=None):
    tab = union_sheet.TABS[kind]
    return {
        f"'{tab}'!A1:{LAST[kind]}1": [headers or list(HEADERS[kind])],
        f"'{tab}'!A:A": col_a,
    }


@pytest.fixture
def u(union_store):
    return build_union(union_store, None, 0)


def _edit_s46(store, **changes):
    raw = store.load_raw("union/1000046")
    store.save_raw("union/1000046", {**raw, **changes})


def test_headers():
    assert HEADERS["union"] == (
        "season",
        "day",
        "mode",
        "level",
        "step",
        "boss",
        "bossElement",
        "memberId",
        "nickname",
        "damage",
        "finalHit",
        "slot1",
        "slot2",
        "slot3",
        "slot4",
        "slot5",
    )
    assert HEADERS["roster"] == (
        "season",
        "memberId",
        "nickname",
        "level",
        "synchroLevel",
        "source",
    )


def test_union_rows_s46(u):
    rows = union_rows(u, 46)
    assert len(rows) == 11
    assert rows[0][:11] == [
        46,
        1,
        "normal",
        10,
        4,
        "Obelisk Z.E.U.S.",
        "Electronic",
        "'a",
        "'ALPHA",
        2000000000,
        False,
    ]
    names = [s["name"] for s in u.hits[9]["squad"]]  # first s46 hit (s45 has 9)
    assert rows[0][11:] == [*names, *[""] * (5 - len(names))] and rows[1][10] is True


def test_roster_falls_back_to_hitters(u):
    assert roster_rows(u, 46) == [
        [46, "'a", "'ALPHA", "", "", "hits"],
        [46, "'b", "'BRAVO", "", "", "hits"],
        [46, "'d", "'DELTA", "", "", "hits"],
    ]


def test_roster_from_members(union_store):
    _edit_s46(
        union_store,
        members=[{"member_id": "x", "nickname": "X", "level": 1, "synchro_level": 2}],
    )
    assert roster_rows(build_union(union_store, None, 0), 46) == [
        [46, "'x", "'X", 1, 2, "api"]
    ]


def test_member_ids_and_names_are_text(union_store):
    raw = union_store.load_raw("union/1000046")
    hit = {
        **raw["raid"]["participate_data"][0],
        "openid": "18368950982244160630",
        "nickname": "=HYPERLINK(1)",
    }
    _edit_s46(
        union_store,
        raid={**raw["raid"], "participate_data": [hit]},
        members=[
            {
                "member_id": "18368950982244160630",
                "nickname": "+SUM(1)",
                "level": 1,
                "synchro_level": 2,
            }
        ],
    )
    u = build_union(union_store, None, 0)
    [row] = union_rows(u, 46)
    assert row[7] == "'18368950982244160630" and row[8] == "'=HYPERLINK(1)"
    assert roster_rows(u, 46)[0][1:3] == ["'18368950982244160630", "'+SUM(1)"]


def test_first_run_backfills_every_locked_season(u):
    api = FakeSheets({**AUDIT, **sheet("union", [["season"]])})
    assert append_seasons(
        api, "union", {n: union_rows(u, n) for n in locked(u)}, timestamp="ts"
    ) == (2, 0)
    assert [b[0][0] for b in api.batches] == [
        "'UnionRaid'!A2:P10",
        "'UnionRaid'!A2:P12",
    ]  # fake sheet never fills
    assert api.batches[0][1][1][0][1:] == ["cli-union", "''UnionRaid'!A2:P10", 9]
    assert [set(e) for e in api.ensured] == [{"UnionRaid", "AuditLog"}] * 2


def test_roster_writes_to_the_union_roster_tab(u):
    api = FakeSheets({**AUDIT, **sheet("roster", [["season"]])})
    append_seasons(api, "roster", {46: roster_rows(u, 46)}, timestamp="ts")
    assert api.batches[0][0][0].startswith("'UnionRoster'!")
    assert [set(e) for e in api.ensured] == [{"UnionRoster", "AuditLog"}]


def test_existing_seasons_any_form(u):
    api = FakeSheets(
        {**AUDIT, **sheet("union", [["season"], [45.0], ["46"], ["junk"]])}
    )
    assert append_seasons(
        api, "union", {n: union_rows(u, n) for n in locked(u)}, timestamp="ts"
    ) == (0, 0)
    assert api.batches == []


def test_season_without_rows_is_skipped(u):
    api = FakeSheets({**AUDIT, **sheet("roster", [["season"]])})
    assert append_seasons(
        api, "roster", {45: [], 46: roster_rows(u, 46)}, timestamp="ts"
    ) == (1, 0)


def test_unlocked_season_never_written(union_store):
    _edit_s46(union_store, fetched_ts=350)
    assert locked(build_union(union_store, None, 0)) == [45]


def _no_fetch(monkeypatch, error=None):
    async def fetch(*a, **k):
        if error:
            raise error
        return {}

    monkeypatch.setattr(union_sheet, "fetch_union", fetch)


def test_one_tab_error_keeps_the_other(union_store, monkeypatch):
    _no_fetch(monkeypatch)
    api = FakeSheets(
        {
            **AUDIT,
            **sheet("union", [["season"]], ["season", "wrong"]),
            **sheet("roster", [["season"]]),
            **sheet("season", [["season"]]),
        }
    )
    text = asyncio.run(sync_union(union_store, None, api, timestamp="ts", now=99999))
    assert text.startswith("UnionRaid: UnionRaid headers changed") and text.endswith(
        " · UnionRoster +2 · UnionSeason +2"
    )


def test_fetch_error_still_writes_stored(union_store, monkeypatch):
    _no_fetch(monkeypatch, httpx.ConnectError("down"))
    api = FakeSheets(
        {
            **AUDIT,
            **sheet("union", [["season"]]),
            **sheet("roster", [["season"]]),
            **sheet("season", [["season"]]),
        }
    )
    text = asyncio.run(sync_union(union_store, None, api, timestamp="ts", now=99999))
    assert text == " · ".join(
        f"{tab} +2 (fetch: ConnectError)" for tab in union_sheet.TABS.values()
    )


def test_season_missing_from_raid_list_is_not_locked(union_store):
    union_store.save_raw(
        "raid_list", []
    )  # no end times known: nothing can be trusted as locked
    assert locked(build_union(union_store, None, 0)) == []


def test_seasons_written_are_logged(u):
    lines = []
    api = FakeSheets({**AUDIT, **sheet("union", [["season"]])})
    append_seasons(
        api,
        "union",
        {n: union_rows(u, n) for n in locked(u)},
        timestamp="ts",
        log=lines.append,
    )
    assert lines == [
        "UnionRaid: wrote season 45, 9 rows, 'UnionRaid'!A2:P10",
        "UnionRaid: wrote season 46, 11 rows, 'UnionRaid'!A2:P12",
    ]  # fake sheet never fills


def test_unknown_nikke_holds_only_that_season(union_store):
    raw = union_store.load_raw("union/1000045")
    hits = [
        {**h, "squad": [{"slot": 1, "tid": 999999, "lv": 1, "combat": 1}]}
        for h in raw["raid"]["participate_data"]
    ]
    union_store.save_raw(
        "union/1000045", {**raw, "raid": {**raw["raid"], "participate_data": hits}}
    )
    u = build_union(union_store, None, 0)
    lines = []
    api = FakeSheets({**AUDIT, **sheet("union", [["season"]])})
    assert append_seasons(
        api,
        "union",
        {n: union_rows(u, n) for n in locked(u)},
        timestamp="ts",
        log=lines.append,
    ) == (1, 1)
    assert lines == [
        "UnionRaid: held season 45, 1 unknown NIKKE (NIKKE_999999)",
        "UnionRaid: wrote season 46, 11 rows, 'UnionRaid'!A2:P12",
    ]


def test_no_reference_files_holds_every_union_season(union_store):
    for name in ("nikke_list_en", "character_id_map"):
        (union_store.raw_dir / f"{name}.json").unlink()
    u = build_union(union_store, None, 0)
    api = FakeSheets(
        {
            **AUDIT,
            **sheet("union", [["season"]]),
            **sheet("roster", [["season"]]),
            **sheet("season", [["season"]]),
        }
    )
    assert append_seasons(
        api, "union", {n: union_rows(u, n) for n in locked(u)}, timestamp="ts"
    ) == (0, 2)
    assert append_seasons(
        api, "roster", {n: roster_rows(u, n) for n in locked(u)}, timestamp="ts"
    ) == (2, 0)


def test_held_count_in_summary(union_store, monkeypatch):
    _no_fetch(monkeypatch)
    (union_store.raw_dir / "nikke_list_en.json").unlink()
    api = FakeSheets(
        {
            **AUDIT,
            **sheet("union", [["season"]]),
            **sheet("roster", [["season"]]),
            **sheet("season", [["season"]]),
        }
    )
    text = asyncio.run(sync_union(union_store, None, api, timestamp="ts", now=99999))
    assert text == "UnionRaid +0 (held 2) · UnionRoster +2 · UnionSeason +2"


def _season_row(store, level_info):
    _edit_s46(store, level={"level_info": level_info})
    [row] = season_rows(build_union(store, None, 0), 46)
    return row


def test_season_rows(union_store):
    assert HEADERS["season"] == (
        "season",
        "startDate",
        "endDate",
        "mode",
        "level",
        "bossesDown",
        "hpLeft",
        "damageDealt",
    )
    # season 46's real window: 03:00 WIB 30 Oct to 02:59:59 WIB 5 Nov
    union_store.save_raw(
        "raid_list", [{"id": 1000046, "start_ts": 1793304000, "end_ts": 1793822399}]
    )
    dates = [46, "2026-10-30", "2026-11-04"]
    boss = lambda hp: {"current_hp": str(hp)}
    left = [boss(0), boss(5), boss(0), boss(7), boss(1)]
    for difficulty, level, bosses, want in (
        (2, 3, left, ["hard", 3, 2, 13, ""]),
        (1, 4, left, ["normal", 4, 2, 13, ""]),
        (2, 4, [boss(1027483050281)], ["hard", 4, "", "", 1027483050281]),
        (2, 2, [], ["hard", 2, "", "", ""]),
    ):
        info = {"difficulty": difficulty, "level": level, "boss_info": bosses}
        assert _season_row(union_store, [info]) == dates + want
    assert _season_row(union_store, []) == dates + [""] * 5
