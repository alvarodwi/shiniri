import asyncio

import httpx

from shiniri_cli import roledata


def _costume(**over):
    return {"id": 130007, "resource_id": 19, "costume_index": 1, "is_hidden": False, **over}


def _client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def _with_list(store, rids):
    store.save_raw("nikke_list_en", [{"resource_id": r} for r in rids])


def _run(store, handler, **kw):
    async def go():
        async with _client(handler) as c:
            return await roledata.fetch_roledata(store, c, **kw)

    return asyncio.run(go())


def test_costume_entries_drops_hidden_and_malformed():
    good = _costume()
    data = {
        "character_costume_list": [
            good,
            _costume(is_hidden=True),
            _costume(id="x"),
            None,
        ]
    }
    assert roledata.costume_entries(data) == [good]


def test_image_path():
    assert (
        roledata.image_path({"resource_id": 19, "costume_index": 1})
        == "character/mi/mi_c019_01_s.webp"
    )


def test_resource_ids_unique_in_order(store):
    store.save_raw(
        "nikke_list_en",
        [{"resource_id": 20}, {"resource_id": 19}, {"resource_id": 20}, {"resource_id": "x"}],
    )
    assert roledata.resource_ids(store) == [20, 19]


def test_fetch_saves_missing_only(store):
    _with_list(store, [19, 20])
    store.save_raw(roledata.raw_name(19), {"have": 1})
    seen = []

    def handler(req):
        seen.append(str(req.url))
        return httpx.Response(200, json={"new": 1})

    line = _run(store, handler, force=False)
    assert len(seen) == 1
    assert line == "roledata new 1"
    assert store.load_raw("roledata/20") == {"new": 1}


def test_fetch_force_refetches_all(store):
    _with_list(store, [19, 20])
    store.save_raw(roledata.raw_name(19), {"have": 1})
    seen = []

    def handler(req):
        seen.append(req)
        return httpx.Response(200, json={"new": 1})

    _run(store, handler, force=True)
    assert len(seen) == 2


def test_fetch_one_failure_does_not_abort(store):
    _with_list(store, [19, 20])

    def handler(req):
        # 19 is the one that 404s; its CDN path is obfuscated, so key on call order
        handler.n += 1
        return httpx.Response(404) if handler.n == 1 else httpx.Response(200, json={"ok": 1})

    handler.n = 0
    line = _run(store, handler, force=False, limit=1)
    assert "failed 1" in line
    assert store.load_raw("roledata/19") is None
    assert store.load_raw("roledata/20") == {"ok": 1}


def test_needs_full_refresh(store):
    assert roledata.needs_full_refresh(store, "2026-11-23")
    store.mark("roledata")
    today = store.state()["roledata"][:10]
    assert not roledata.needs_full_refresh(store, today)
    assert roledata.needs_full_refresh(store, "1999-01-01")


def test_failure_still_marks_the_day(store):
    # a file that keeps failing must not turn every hourly check into a full re-download
    _with_list(store, [19, 20])
    _run(store, lambda req: httpx.Response(404), force=True)
    assert not roledata.needs_full_refresh(store, store.state()["roledata"][:10])


def test_non_object_body_is_a_failure(store):
    _with_list(store, [19])
    line = _run(store, lambda req: httpx.Response(200, json=[]), force=False)
    assert "failed 1" in line and store.load_raw("roledata/19") is None


def test_costume_entries_ignores_a_non_object_file():
    assert roledata.costume_entries([]) == []
    assert roledata.costume_entries("x") == []
