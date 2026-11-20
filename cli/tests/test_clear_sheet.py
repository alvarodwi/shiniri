import asyncio

from conftest import FakeSheets

from shiniri_cli import clear_sheet
from shiniri_cli.clear_sheet import HEADERS, append_missing, clear_rows, sync_clears
from shiniri_cli.store import unknown_nikkes

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
    assert row[4] == "'2026-11-11 09:40:31" and row[8:10] == ["Anis", "Anis: Star"]


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
    assert append_missing(api, "tower", clear_rows(store.build_clears(), "tower"), timestamp="ts") == (2, 0)
    [[(rng, rows), (_, [audit])]] = api.batches
    assert rng == "'Tower'!A2:M3" and [r[0] for r in rows] == [50001, 50002]
    assert audit[1:] == ["cli-clears", "''Tower'!A2:M3", 2]


def test_existing_ids_any_form(store):
    clears = store.load_clears("tower")
    clears["50002"] = {"cleared_at": "1794364900", "list": []}
    store.save_clears("tower", clears)
    api = FakeSheets({**AUDIT, **sheet("Tower", [["stageId"], [50001.0], ["50002"], ["junk"]])})
    assert append_missing(api, "tower", clear_rows(store.build_clears(), "tower"), timestamp="ts") == (0, 0)
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
    assert append_missing(api, "tower", clear_rows(store.build_clears(), "tower"), timestamp="ts") == (1, 0)


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
    async def bad(store_, source, client, **k):
        if source == "campaign":
            raise ValueError("Expecting value")
        return 0
    monkeypatch.setattr(clear_sheet, "fetch_clears", bad)
    api = FakeSheets({**AUDIT, **sheet("Campaign", [["stageId"]]), **sheet("Tower", [["stageId"]])})
    text = asyncio.run(sync_clears(store, None, api, timestamp="ts"))
    assert text == "Campaign +1 (fetch: ValueError: Expecting value) · Tower +1"


def _tower_clear(store, sid, tid):
    clears = store.load_clears("tower")
    clears[sid] = {"cleared_at": "1794364900", "list": [{"slot": 1, "tid": tid, "lv": 1, "combat": 1}]}
    store.save_clears("tower", clears)


def test_unknown_nikkes():
    assert unknown_nikkes([[1, "x", "NIKKE_9", "Anis"], [2, "NIKKE_9", "NIKKE_1", ""]], 1) == ["NIKKE_1", "NIKKE_9"]
    assert unknown_nikkes([[1, "NIKKE_ fan art", "NIKKE_"]], 1) == []  # only the NIKKE_<tid> fallback


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
                          log=lines.append) == (0, 2)
    assert api.batches == [] and lines == ["Tower: held 2 rows, 1 unknown NIKKE (NIKKE_999999)"]


def test_unknown_row_already_in_sheet_does_not_hold(store):
    _tower_clear(store, "50002", 999999)
    _tower_clear(store, "50003", 433004)
    api = FakeSheets({**AUDIT, **sheet("Tower", [["stageId"], [50001], [50002]])})
    assert append_missing(api, "tower", clear_rows(store.build_clears(), "tower"), timestamp="ts") == (1, 0)


def test_missing_stage_list_holds_campaign(store):
    (store.raw_dir / "stage_list.json").unlink()
    lines = []
    api = FakeSheets({**AUDIT, **sheet("Campaign", [["stageId"]])})
    assert append_missing(api, "campaign", clear_rows(store.build_clears(), "campaign"), timestamp="ts",
                          log=lines.append) == (0, 1)
    assert lines == ["Campaign: held 1 rows, 1 unknown stages (6002003)"]


def test_sync_clears_passes_log(store, monkeypatch):
    async def none(*a, **k):
        return 0
    monkeypatch.setattr(clear_sheet, "fetch_clears", none)
    lines = []
    api = FakeSheets({**AUDIT, **sheet("Campaign", [["stageId"]]), **sheet("Tower", [["stageId"]])})
    asyncio.run(sync_clears(store, None, api, timestamp="ts", log=lines.append))
    assert lines == ["Campaign: wrote 1 rows, 'Campaign'!A2:M2 (2-3 STAGE)", "Tower: wrote 1 rows, 'Tower'!A2:M2 (1F)"]


def test_held_count_in_summary(store, monkeypatch):
    async def none(*a, **k):
        return 0
    monkeypatch.setattr(clear_sheet, "fetch_clears", none)
    _tower_clear(store, "50002", 999999)
    api = FakeSheets({**AUDIT, **sheet("Campaign", [["stageId"]]), **sheet("Tower", [["stageId"]])})
    assert asyncio.run(sync_clears(store, None, api, timestamp="ts")) == "Campaign +1 · Tower +0 (held 2)"


def test_long_fetch_logs_progress_every_50(store, monkeypatch):
    async def fetch(store_, source, client, on_progress):
        if source == "tower":
            for done in (*range(1, 98), 120):  # 120: stop_early skipping the rest of a tower
                on_progress("tribe", done, 120)
        return 0
    monkeypatch.setattr(clear_sheet, "fetch_clears", fetch)
    lines = []
    api = FakeSheets({**AUDIT, **sheet("Campaign", [["stageId"], [6002003]]), **sheet("Tower", [["stageId"], [50001]])})
    asyncio.run(sync_clears(store, None, api, timestamp="ts", log=lines.append))
    assert lines == ["Tower: fetching 50/120", "Tower: fetching 120/120"]
