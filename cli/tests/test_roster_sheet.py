import asyncio

import httpx
from conftest import FakeSheets

from shiniri_cli.fetch import AUTH_CODE
from shiniri_cli.roster_sheet import (
    HEADERS,
    database_names,
    logged_copies,
    roster_rows,
    sync_roster_log,
)

AUDIT = {
    "'AuditLog'!A1:D1": [["savedAt", "form", "ranges", "rows"]],
    "'AuditLog'!A:A": [["savedAt"]],
}
DB = {
    "'NikkeDatabase'!A:B": [["nameCode", "name"], [1023, "B"], [5075, "A"], [5136, "C"]]
}


def char(code, grade, core):
    return {
        "name_code": code,
        "grade": grade,
        "core": core,
        "lv": 1,
        "combat": 1,
        "costume_id": 0,
    }


def test_rows_copies_and_order():
    chars = [char(5075, 3, 7), char(1023, 0, 0), char(5136, 3, 0)]
    rows, notes = roster_rows(
        chars, {5075: "A", 1023: "B", 5136: "C"}, {}, "2026-11-21"
    )
    assert rows == [
        ["2026-11-21", 1023, "B", 1],
        ["2026-11-21", 5075, "A", 11],
        ["2026-11-21", 5136, "C", 4],
    ]
    assert notes == []


def test_unchanged_skipped_changed_written():
    rows, _ = roster_rows(
        [char(1, 3, 0), char(2, 3, 1)], {1: "A", 2: "B"}, {1: 4, 2: 4}, "d"
    )
    assert rows == [["d", 2, "B", 5]]


def test_bad_and_unknown_entries_noted():
    chars = [
        char(1, 4, 0),
        char(2, 3, 8),
        char(True, 0, 0),
        char(3, 1.0, 0),
        "junk",
        char(9, 0, 0),
        char(1, 0, 0),
    ]
    rows, notes = roster_rows(chars, {1: "A", 2: "B", 3: "C"}, {}, "d")
    assert rows == [
        ["d", 1, "A", 1]
    ]  # index 6 (valid, repeated name_code 1) is the one written
    assert notes == [
        "entry 0",
        "entry 1",
        "entry 2",
        "entry 3",
        "entry 4",
        "9 not in NikkeDatabase",
    ]


def test_repeated_name_code_first_wins():
    rows, _ = roster_rows([char(1, 1, 0), char(1, 2, 0)], {1: "A"}, {}, "d")
    assert rows == [["d", 1, "A", 2]]


def test_logged_copies_last_row_wins_and_junk_skipped():
    values = [
        ["date", "nameCode", "name", "copies"],
        [46000, 1, "A", 4],
        [],
        ["x", "typo", "A", 2],
        [46001, 1.0, "A", 5.0],
        [46001, 2, "B", ""],
    ]
    assert logged_copies(values) == {1: 5}


def test_logged_copies_rejects_fractions_and_bools():
    values = [
        list(HEADERS),
        [1, 1, "A", 4.7],
        [1, 5075.9, "A", 4],
        [1, True, "A", 4],
        [1, 2, "A", False],
    ]
    assert logged_copies(values) == {}


def test_database_names_skips_junk():
    assert database_names(
        [["nameCode", "name"], [5001, "Rapi"], ["", "x"], [5002, ""], ["5003", "Anis"]]
    ) == {5001: "Rapi", 5003: "Anis"}


def _client(answer):
    return httpx.AsyncClient(
        transport=httpx.MockTransport(lambda req: httpx.Response(200, json=answer))
    )


def _answer(*chars):
    return {"code": 0, "data": {"characters": list(chars)}}


def _sync(answer, values):
    api = FakeSheets({**AUDIT, **DB, **values})
    line = asyncio.run(
        sync_roster_log(_client(answer), "me", api, day="2026-11-21", timestamp="ts")
    )
    return line, api


ROSTER_HEAD = {"'RosterLog'!A1:D1": [list(HEADERS)]}
ROSTER = [char(5075, 3, 7), char(1023, 0, 0), char(5136, 3, 0)]


def test_sync_first_run_writes_all():
    line, api = _sync(
        _answer(*ROSTER),
        {
            **ROSTER_HEAD,
            "'RosterLog'!A:A": [["date"]],
            "'RosterLog'!A:D": [list(HEADERS)],
        },
    )
    assert line == "RosterLog +3"
    (_target, rows), (_, audit) = api.batches[0]
    assert len(api.batches) == 1 and audit[0][1] == "cli-roster-log"
    assert [r[1] for r in rows] == [1023, 5075, 5136]


def test_sync_rerun_writes_nothing():
    full = [
        list(HEADERS),
        ["d", 1023, "B", 1],
        ["d", 5075, "A", 11],
        ["d", 5136, "C", 4],
    ]
    line, api = _sync(
        _answer(*ROSTER),
        {**ROSTER_HEAD, "'RosterLog'!A:A": [["date"]], "'RosterLog'!A:D": full},
    )
    assert line == "RosterLog +0" and api.batches == []


def _failing(answer, values=None):
    values = values or {
        **ROSTER_HEAD,
        "'RosterLog'!A:A": [["date"]],
        "'RosterLog'!A:D": [list(HEADERS)],
    }
    return _sync(answer, values)


def test_sync_empty_characters_is_failure():
    line, api = _failing(_answer())
    assert line.startswith("RosterLog: ") and api.batches == []


def test_sync_code_not_zero():
    line, api = _failing({"code": 1, "msg": "nope"})
    assert line == "RosterLog: code 1: nope" and api.batches == []


def test_sync_auth_error():
    line, api = _failing({"code": AUTH_CODE, "msg": "game not login"})
    assert line.startswith("RosterLog: ") and api.batches == []


def test_sync_header_mismatch():
    line, api = _failing(
        _answer(*ROSTER),
        {"'RosterLog'!A1:D1": [["date", "x", "name", "copies"]], "'RosterLog'!A:D": []},
    )
    assert line.startswith("RosterLog: ") and api.batches == []


def test_sync_skipped_noted():
    line, _api = _failing(_answer(char(1023, 0, 0), char(9, 0, 0)))
    assert line == "RosterLog +1 (skipped 9 not in NikkeDatabase)"


def test_sync_code_not_zero_without_msg():
    line, _ = _failing({"code": 7})
    assert line == "RosterLog: code 7"


def test_sync_header_mismatch_even_when_nothing_changed():
    full = [
        list(HEADERS),
        ["d", 1023, "B", 1],
        ["d", 5075, "A", 11],
        ["d", 5136, "C", 4],
    ]
    line, api = _sync(
        _answer(*ROSTER),
        {
            "'RosterLog'!A1:D1": [["date", "x", "name", "copies"]],
            "'RosterLog'!A:A": [["date"]],
            "'RosterLog'!A:D": full,
        },
    )
    assert (
        line.startswith("RosterLog: ")
        and "headers changed" in line
        and api.batches == []
    )
