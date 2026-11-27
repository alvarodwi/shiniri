import asyncio

import httpx
import pytest
from conftest import FakeSheets

from shiniri_cli import news
from shiniri_cli.costume_sheet import (
    HEADERS,
    costume_rows,
    source_for,
    sync_costume_database,
)

AUDIT = {
    "'AuditLog'!A1:D1": [["savedAt", "form", "ranges", "rows"]],
    "'AuditLog'!A:A": [["savedAt"]],
}
NAMES = {5185: "Marian: Queen"}
DESC = "Marian: Queen costume.\nObtained from the Costume Gacha."


@pytest.fixture(autouse=True)
def archive(monkeypatch):
    """No network: `news.update` answers with `calls["result"]`."""
    calls = {"updates": 0, "result": (0, 0)}

    async def update(store, client, **kw):
        calls["updates"] += 1
        if isinstance(calls["result"], Exception):
            raise calls["result"]
        return calls["result"]

    monkeypatch.setattr(news, "update", update)
    return calls


def seed_note(store):
    store.save_raw(
        "news/a1",
        {
            "title": "Update on March 19",
            "pub_timestamp": "1773619200",
            "content": "<p>Marian: Queen - Last Affection</p>",
        },
    )


def costume(id_=130007, rid=19, index=1, desc=DESC, **over):
    return {
        "id": id_,
        "resource_id": rid,
        "costume_index": index,
        "costume_grade_id": "Unique",
        "costume_name_locale": "Last Affection",
        "costume_description_locale": desc,
        "costume_shop_type": "None",
        "is_hidden": False,
        **over,
    }


def seed(store, costumes, rid=19, code=5185):
    store.save_raw("nikke_list_en", [{"resource_id": rid, "name_code": code}])
    store.save_raw(f"roledata/{rid}", {"character_costume_list": costumes})


def test_row_shape(store):
    seed(store, [costume()])
    rows, notes = costume_rows(store, NAMES, {130007})
    assert rows == [
        [
            130007,
            "Marian: Queen",
            "Last Affection",
            "Unique",
            "Costume Gacha",
            "character/mi/mi_c019_01_s.webp",
            True,
            "",
        ]
    ]
    assert notes == [] and len(rows[0]) == len(HEADERS)


def test_owned_false_when_not_equipped(store):
    seed(store, [costume()])
    rows, _ = costume_rows(store, NAMES, set())
    assert rows[0][6] is False


def test_unmapped_description_gives_blank_source(store):
    seed(store, [costume(desc="Obtained from somewhere new.")])
    rows, _ = costume_rows(store, NAMES, set())
    assert rows[0][4] == ""


def test_source_for_table():
    assert source_for(DESC) == "Costume Gacha"
    assert source_for("x\nObtained from a Mission Pass.") == "Mission Pass"
    assert source_for("x\nObtained from the Costume Shop.") == "Cash Shop"
    assert source_for("x\nObtained from a login event.") == "Login Reward"
    assert source_for("x\nObtained from an event.") == ""
    assert source_for("no phrase here") == ""
    assert source_for("") == ""


def test_nikke_missing_from_database_is_skipped_and_noted(store):
    seed(store, [costume(), costume(id_=130008, index=2)])
    rows, notes = costume_rows(store, {}, set())
    assert rows == [] and notes == ["5185 not in NikkeDatabase"]


def test_no_roledata_is_noted(store):
    store.save_raw("nikke_list_en", [{"resource_id": 19, "name_code": 5185}])
    rows, notes = costume_rows(store, NAMES, set())
    assert rows == [] and notes == ["no roledata for 19"]


def test_sorted_by_costume_id_and_first_repeat_wins(store):
    seed(store, [costume(id_=9), costume(id_=3), costume(id_=9, costume_name_locale="Dup")])
    rows, _ = costume_rows(store, NAMES, set())
    assert [(r[0], r[2]) for r in rows] == [(3, "Last Affection"), (9, "Last Affection")]


def _client(answer):
    return httpx.AsyncClient(
        transport=httpx.MockTransport(lambda req: httpx.Response(200, json=answer))
    )


ROSTER = {"code": 0, "data": {"characters": [{"name_code": 5185, "costume_id": 130007}]}}


def _sheet(*col_a, header=None):
    return FakeSheets(
        {
            **AUDIT,
            "'CostumeDatabase'!A1:H1": [header or list(HEADERS)],
            "'CostumeDatabase'!A:A": [["costumeId"], *[[v] for v in col_a]],
            "'NikkeDatabase'!A:B": [["nameCode", "nikke"], [5185, "Marian: Queen"]],
        }
    )


def _sync(store, answer, api):
    async def go():
        async with _client(answer) as c:
            return await sync_costume_database(store, c, "me", api, timestamp="ts")

    return asyncio.run(go())


def seed_marian(store):
    seed(store, [costume()])
    store.save_raw(
        "nikke_list_en",
        [
            {
                "resource_id": 19,
                "name_code": 5185,
                "name_localkey": {"name": "Marian: Queen"},
            }
        ],
    )
    seed_note(store)


def test_sync_writes_the_release_date(store, archive):
    seed_marian(store)
    api = _sheet()
    assert _sync(store, ROSTER, api) == "CostumeDatabase +1"
    assert api.batches[0][0][1][0][-1] == "2026-03-19"
    assert archive["updates"] == 1


@pytest.mark.parametrize("result", [(3, 1), httpx.ConnectError("down")])
def test_sync_writes_a_blank_date_when_the_news_fetch_fails(store, archive, result):
    seed_marian(store)
    archive["result"] = result
    api = _sheet()
    line = _sync(store, ROSTER, api)
    assert line.startswith("CostumeDatabase +1 (no release dates:")
    assert api.batches[0][0][1][0][-1] == ""


def test_sync_appends_only_missing_ids(store, archive):
    seed(store, [costume()])
    api = _sheet("130007")  # typed by hand as text
    assert _sync(store, ROSTER, api) == "CostumeDatabase +0"
    assert api.batches == [] and archive["updates"] == 0


def test_sync_writes_one_block_with_audit(store):
    seed(store, [costume()])
    api = _sheet()
    assert _sync(store, ROSTER, api) == "CostumeDatabase +1"
    [[(target, rows), (_, [audit])]] = api.batches
    assert target == "'CostumeDatabase'!A2:H2"
    assert rows[0][0] == 130007 and rows[0][6] is True
    assert audit[1] == "cli-costume-database"


def test_sync_writes_nothing_when_roster_call_fails(store):
    seed(store, [costume()])
    api = _sheet()
    line = _sync(store, {"code": 1, "msg": "nope"}, api)
    assert line.startswith("CostumeDatabase:") and api.batches == []


def test_sync_writes_nothing_when_no_characters(store):
    seed(store, [costume()])
    api = _sheet()
    line = _sync(store, {"code": 0, "data": {"characters": []}}, api)
    assert line.startswith("CostumeDatabase:") and api.batches == []


def test_sync_never_raises_on_header_mismatch(store):
    seed(store, [costume()])
    api = _sheet(header=["Wrong"])
    assert _sync(store, ROSTER, api).startswith("CostumeDatabase:")
    assert api.batches == []


def test_sync_notes_skipped(store):
    seed(store, [costume()])
    api = _sheet()
    api.values["'NikkeDatabase'!A:B"] = [["nameCode", "nikke"]]
    assert (
        _sync(store, ROSTER, api)
        == "CostumeDatabase +0 (skipped 5185 not in NikkeDatabase)"
    )
