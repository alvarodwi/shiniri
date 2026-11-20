import asyncio

from conftest import FakeSheets

from shiniri_cli import clear_sheet
from shiniri_cli.clear_sheet import HEADERS, append_missing, clear_rows, sync_clears

AUDIT = {"'AuditLog'!A1:D1": [["savedAt", "form", "ranges", "rows"]], "'AuditLog'!A:A": [["savedAt"]]}


def sheet(tab, col_a, headers=None):
    head = headers or list(HEADERS[tab.lower()])
    return {f"'{tab}'!A1:M1": [head], f"'{tab}'!A:A": col_a}


def test_clear_rows_campaign(store):
    assert clear_rows(store.build_clears(), "campaign") == [
        [6002003, "Normal", 2, "2-3 STAGE", "'2026-10-31 17:36:57", 1000, 909195, "740",
         "Crown", "Anis: Star", "", "", ""]]


def test_clear_rows_tower_slots_by_slot(store):
    [row] = clear_rows(store.build_clears(), "tower")
    assert row[4] == "'2026-11-11 09:40:31" and row[8:10] == ["NIKKE_999999", "Anis: Star"]


def test_missing_time_sorts_last(store):
    clears = store.load_clears("tower")
    clears["50002"] = {"cleared_at": "0", "list": [{"slot": 1, "tid": 433004, "lv": 5, "combat": 1}]}
    clears["50003"] = {"cleared_at": "1700000000", "list": []}
    store.save_clears("tower", clears)
    rows = clear_rows(store.build_clears(), "tower")
    assert [r[0] for r in rows] == [50003, 50001, 50002] and rows[-1][4] == ""


def test_first_run_backfills_from_row_2(store):
    clears = store.load_clears("tower")
    clears["50002"] = {"cleared_at": "1794364900", "list": []}
    store.save_clears("tower", clears)
    api = FakeSheets({**AUDIT, **sheet("Tower", [["stageId"]])})
    assert append_missing(api, "tower", clear_rows(store.build_clears(), "tower"), timestamp="ts") == 2
    [[(rng, rows), (_, [audit])]] = api.batches
    assert rng == "'Tower'!A2:M3" and [r[0] for r in rows] == [50001, 50002]
    assert audit[1:] == ["cli-clears", "''Tower'!A2:M3", 2]


def test_existing_ids_any_form(store):
    clears = store.load_clears("tower")
    clears["50002"] = {"cleared_at": "1794364900", "list": []}
    store.save_clears("tower", clears)
    api = FakeSheets({**AUDIT, **sheet("Tower", [["stageId"], [50001.0], ["50002"], ["junk"]])})
    assert append_missing(api, "tower", clear_rows(store.build_clears(), "tower"), timestamp="ts") == 0
    assert api.batches == []


def test_one_tab_error_keeps_the_other(store, monkeypatch):
    async def none(*a, **k):
        return 0
    monkeypatch.setattr(clear_sheet, "fetch_clears", none)
    api = FakeSheets({**AUDIT, **sheet("Campaign", [["stageId"]], ["stageId", "wrong"]),
                      **sheet("Tower", [["stageId"]])})
    text = asyncio.run(sync_clears(store, None, api, timestamp="ts"))
    assert text.startswith("Campaign: Campaign headers changed") and text.endswith(" · Tower +1")
    assert [rng for rng, _ in api.batches[0]][0] == "'Tower'!A2:M2"


def test_overflow_ids_are_ignored(store):
    api = FakeSheets({**AUDIT, **sheet("Tower", [["stageId"], ["inf"], ["1e400"]])})
    assert append_missing(api, "tower", clear_rows(store.build_clears(), "tower"), timestamp="ts") == 1


def test_corrupt_campaign_file_keeps_tower(store, monkeypatch):
    async def none(*a, **k):
        return 0
    monkeypatch.setattr(clear_sheet, "fetch_clears", none)
    (store.raw_dir / "campaign_clears.json").write_text("{nope", encoding="utf-8")
    api = FakeSheets({**AUDIT, **sheet("Campaign", [["stageId"]]), **sheet("Tower", [["stageId"]])})
    text = asyncio.run(sync_clears(store, None, api, timestamp="ts"))
    assert text.startswith("Campaign: JSONDecodeError") and text.endswith(" · Tower +1")


def test_fetch_error_still_appends_stored_clears(store, monkeypatch):
    import httpx

    async def down(*a, **k):
        raise httpx.ConnectError("down")
    monkeypatch.setattr(clear_sheet, "fetch_clears", down)
    api = FakeSheets({**AUDIT, **sheet("Campaign", [["stageId"]]), **sheet("Tower", [["stageId"]])})
    text = asyncio.run(sync_clears(store, None, api, timestamp="ts"))
    assert text == "Campaign +1 (fetch: ConnectError) · Tower +1 (fetch: ConnectError)"


def test_unexpected_fetch_error_keeps_both_tabs(store, monkeypatch):
    async def bad(store_, source, client):
        if source == "campaign":
            raise ValueError("Expecting value")
        return 0
    monkeypatch.setattr(clear_sheet, "fetch_clears", bad)
    api = FakeSheets({**AUDIT, **sheet("Campaign", [["stageId"]]), **sheet("Tower", [["stageId"]])})
    text = asyncio.run(sync_clears(store, None, api, timestamp="ts"))
    assert text == "Campaign +1 (fetch: ValueError: Expecting value) · Tower +1"
