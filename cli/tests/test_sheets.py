import json

import httpx
import pytest

from conftest import FakeSheets

from shiniri_cli.sheets import HttpSheets, SheetsError, column_letter, serial_to_iso, write_row, write_rows

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
    api = fake([["date"], [46345]])
    api.values["'Profile'!A1:C1"] = [["date", "x", "z"]]
    with pytest.raises(SheetsError, match="headers"):
        write_row(api, "Profile", H, ["d", 1, 2], form="f", timestamp="t")
    assert api.batches == []


def test_non_empty_target_refuses():
    api = fake([["date"], [46345]], target_profile=("", "junk"))
    with pytest.raises(SheetsError, match="not empty"):
        write_row(api, "Profile", H, ["d", 1, 2], form="f", timestamp="t")
    assert api.batches == []


def test_blank_cells_inside_column_a_use_last_filled_row():
    api = fake([["date"], [46345], [""]])
    assert write_row(api, "Profile", H, ["d", 1, 2], form="f", timestamp="t") == "'Profile'!A3:C3"


def test_serial_and_column_letter():
    assert serial_to_iso(46346) == "2026-11-20" and serial_to_iso(" 2026-11-20 ") == "2026-11-20"
    assert column_letter(47) == "AU" and column_letter(26) == "Z"


def test_http_sheets_error_carries_google_message():
    def handler(req):
        return httpx.Response(403, json={"error": {"message": "The caller does not have permission"}})
    api = HttpSheets("sid", lambda: "tok", httpx.Client(transport=httpx.MockTransport(handler)))
    with pytest.raises(SheetsError, match="403.*permission"):
        api.get_values("'Profile'!A:A")


def test_write_rows_block_and_audit_count():
    api = fake([["date"], [46345]])
    api.values["'Profile'!A3:C4"] = []
    rng = write_rows(api, "Profile", H, [["a", 1, 2], ["b", 3, 4]], form="cli-clears", timestamp="ts")
    assert rng == "'Profile'!A3:C4"
    assert api.batches == [[("'Profile'!A3:C4", [["a", 1, 2], ["b", 3, 4]]),
                            ("'AuditLog'!A2:D2", [["'ts", "cli-clears", "''Profile'!A3:C4", 2]])]]


def test_write_rows_rejects_empty_and_bad_rows():
    api = fake([["date"], [46345]])
    for rows in ([], [["a", 1]], [["a", 1, 2], ["", 1, 2]]):
        with pytest.raises(SheetsError):
            write_rows(api, "Profile", H, rows, form="f", timestamp="t")
    assert api.batches == []


def test_write_rows_grows_tab_and_audit_before_checking():
    api = fake([["date"], [46345]])
    api.values["'Profile'!A3:C4"] = []
    write_rows(api, "Profile", H, [["a", 1, 2], ["b", 3, 4]], form="f", timestamp="t")
    assert api.ensured == [{"Profile": 4, "AuditLog": 2}]


def _grid_api(row_counts):
    calls = []

    def handler(req):
        calls.append(req)
        if req.method == "GET":
            return httpx.Response(200, json={"sheets": [
                {"properties": {"sheetId": i, "title": t, "gridProperties": {"rowCount": n}}}
                for i, (t, n) in enumerate(row_counts.items())]})
        return httpx.Response(200, json={})
    return HttpSheets("sid", lambda: "tok", httpx.Client(transport=httpx.MockTransport(handler))), calls


def test_ensure_rows_appends_only_the_shortfall_once():
    api, calls = _grid_api({"Union": 1023, "AuditLog": 1000})
    api.ensure_rows({"Union": 1169, "AuditLog": 40})
    api.ensure_rows({"Union": 1169, "AuditLog": 41})
    gets = [c for c in calls if c.method == "GET"]
    posts = [c for c in calls if c.method == "POST"]
    assert len(gets) == 1 and len(posts) == 1
    assert posts[0].url.path.endswith(":batchUpdate")
    assert json.loads(posts[0].content) == {"requests": [
        {"appendDimension": {"sheetId": 0, "dimension": "ROWS", "length": 146}}]}


def test_ensure_rows_long_enough_sends_nothing():
    api, calls = _grid_api({"Profile": 1000})
    api.ensure_rows({"Profile": 1000})
    assert [c.method for c in calls] == ["GET"]


def test_ensure_rows_missing_tab_refuses():
    api, calls = _grid_api({"Profile": 1000})
    with pytest.raises(SheetsError, match="Roster"):
        api.ensure_rows({"Roster": 5})
    assert [c.method for c in calls] == ["GET"]


def _seq_api(statuses):
    it, slept = iter(statuses), []

    def handler(req):
        s = next(it)
        return httpx.Response(s, json={"values": [["ok"]]} if s == 200 else {"error": {"message": f"e{s}"}})
    api = HttpSheets("sid", lambda: "tok", httpx.Client(transport=httpx.MockTransport(handler)), sleep=slept.append)
    return api, slept


def test_429_is_waited_out_and_retried():
    api, slept = _seq_api([429, 200])
    assert api.get_values("'Roster'!A:A") == [["ok"]]
    assert slept == [60.0]


def test_429_gives_up_after_three_retries():
    api, slept = _seq_api([429] * 4)
    with pytest.raises(SheetsError, match="429"):
        api.get_values("'Roster'!A:A")
    assert slept == [60.0] * 3


def test_other_errors_are_not_retried():
    api, slept = _seq_api([403])
    with pytest.raises(SheetsError, match="403"):
        api.get_values("'Roster'!A:A")
    assert slept == []
