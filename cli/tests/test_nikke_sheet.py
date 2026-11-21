from conftest import FakeSheets

from shiniri_cli.nikke_sheet import HEADERS, nikke_rows, sync_nikke_database

AUDIT = {"'AuditLog'!A1:D1": [["savedAt", "form", "ranges", "rows"]], "'AuditLog'!A:A": [["savedAt"]]}


def entry(code, name, order):
    return {"name_code": code, "order": order, "name_localkey": {"name": name}, "original_rare": "SSR",
            "corporation": "ELYSION", "class": "Supporter", "use_burst_skill": "Step1",
            "element_id": {"element": {"element": "Fire"}}, "shot_id": {"element": {"weapon_type": "MG"}},
            "resource_id": 90}


def test_row_shape():
    rows, notes = nikke_rows([entry(5005, "Emma", 10001)])
    assert rows == [[5005, "Emma", "SSR", "ELYSION", "Supporter", "Step1", "Fire", "MG", 90, ""]]
    assert notes == []


def test_sorted_by_order_missing_order_last():
    rows, _ = nikke_rows([entry(2, "B", 30), entry(3, "C", None), entry(1, "A", 10)])
    assert [r[0] for r in rows] == [1, 2, 3]


def test_repeated_name_code_written_once():
    rows, _ = nikke_rows([entry(1, "A", 10), entry(1, "A again", 20)])
    assert [r[1] for r in rows] == ["A"]


def test_bad_entries_skipped_and_named():
    rows, notes = nikke_rows([entry(1, "A", 10), entry(None, "X", 11), entry(True, "Y", 12),
                              entry(4, "", 13), "junk"])
    assert [r[0] for r in rows] == [1] and notes == ["entry 1", "entry 2", "entry 3", "entry 4"]


def test_sync_writes_only_missing(store):
    store.save_raw("nikke_list_en", [entry(1, "A", 10), entry(2, "B", 20)])
    api = FakeSheets({**AUDIT, "'NikkeDatabase'!A1:J1": [list(HEADERS)],
                      "'NikkeDatabase'!A:A": [["nameCode"], [1]]})
    assert sync_nikke_database(store, api, timestamp="ts") == "NikkeDatabase +1"
    [[(target, rows), (_, [audit])]] = api.batches
    assert target == "'NikkeDatabase'!A3:J3" and rows[0][0] == 2 and audit[1] == "cli-nikke-database"


def test_sync_nothing_missing_no_write(store):  # also covers a missing raw file
    (store.raw_dir / "nikke_list_en.json").unlink()
    api = FakeSheets({**AUDIT, "'NikkeDatabase'!A1:J1": [list(HEADERS)],
                      "'NikkeDatabase'!A:A": [["nameCode"]]})
    assert sync_nikke_database(store, api, timestamp="ts") == "NikkeDatabase +0" and api.batches == []


def test_sync_notes_skipped(store):
    store.save_raw("nikke_list_en", [entry(1, "A", 10), entry(None, "X", 11)])
    api = FakeSheets({**AUDIT, "'NikkeDatabase'!A1:J1": [list(HEADERS)],
                      "'NikkeDatabase'!A:A": [["nameCode"]]})
    assert sync_nikke_database(store, api, timestamp="ts") == "NikkeDatabase +1 (skipped entry 1)"


def test_sync_header_mismatch_is_the_line(store):
    store.save_raw("nikke_list_en", [entry(1, "A", 10)])
    api = FakeSheets({**AUDIT, "'NikkeDatabase'!A1:J1": [["Name"]], "'NikkeDatabase'!A:A": [["Name"]]})
    line = sync_nikke_database(store, api, timestamp="ts")
    assert line.startswith("NikkeDatabase: NikkeDatabase headers changed") and api.batches == []
