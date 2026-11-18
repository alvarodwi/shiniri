import asyncio
import json

import httpx
import pytest

from shiniri_cli.fetch import (ROLEDATA_PATH, AuthError, campaign_targets, cdn_url, fetch_clears,
                              load_cookie, parse_cookie, save_cookie, sync_reference)

KNOWN = {
    "character/en/nikke_list_en_v2.json": "yl-57/hd-03/1bf030193826e243c2e195f951a4be00.json",
    "character/character_id_map.json": "kx-19/bc64a706accd3c7ec1f9a9f2afd8f1bc.json",
    "stage/stage_list.json": "xx-97/b32816a11f83865b09bcf95e67ca83ae.json",
    "tower/tower_list.json": "mx-85/3aa6da781d62528da15bd138504c3955.json",
    "roledata/511-v2-en.json": "oz-20/72fa6824d2d0e69adc7aace692678372.json",
}


@pytest.mark.parametrize("path,hashed", KNOWN.items())
def test_cdn_url_matches_site(path, hashed):
    assert cdn_url(path) == "https://sg-tools-cdn.blablalink.com/" + hashed
    assert cdn_url("/" + path) == cdn_url(path)


def test_cdn_url_keeps_multi_dot_extension():
    assert cdn_url("x/a.atlas.txt").endswith(".atlas.txt")


def test_cdn_url_no_extension_matches_js():
    import hashlib
    assert cdn_url("a/noext").endswith("/" + hashlib.md5(b"a/noext").hexdigest() + ".")


def test_roledata_template():
    assert cdn_url(ROLEDATA_PATH.format(resource_id=511)).endswith(
        "oz-20/72fa6824d2d0e69adc7aace692678372.json")


def ok(sid_list):
    return httpx.Response(200, json={"code": 0, "data": {"cleared_at": "1", "list": [
        {"slot": 1, "tid": 433004, "lv": 1, "combat": 1}]}})


def test_parse_cookie():
    c = parse_cookie("Cookie: a=1; game_token=t; game_openid=o; x=y=z")
    assert c["game_token"] == "t" and c["x"] == "y=z"
    with pytest.raises(ValueError, match="game_token"):
        parse_cookie("game_openid=o")


def test_cookie_file_roundtrip(store):
    with pytest.raises(FileNotFoundError):
        load_cookie(store)
    save_cookie(store, "game_token=t; game_openid=o")
    assert load_cookie(store) == {"game_token": "t", "game_openid": "o"}


def test_campaign_targets_skips_gaps_and_tutorial(store):
    levels = store.load_raw("stage_list")
    assert [s["id"] for s in campaign_targets(levels, {6002003})] == [7002001]


def test_tower_stops_at_uncleared_and_saves_each(store):
    seen = []

    def handler(req):
        sid = json.loads(req.content)["stage_id"]
        seen.append(sid)
        if sid == 50002:
            return ok(sid)
        return httpx.Response(200, json={"code": 1300017, "data": None})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    assert asyncio.run(fetch_clears(store, "tower", client, delay=(0, 0))) == 1
    assert seen == [50002, 50003, 51001] and "50002" in store.load_clears("tower")
    assert "50001" in store.load_clears("tower")


def test_campaign_does_not_stop_at_uncleared(store):
    store.save_clears("campaign", {})
    seen = []

    def handler(req):
        seen.append(json.loads(req.content)["stage_id"])
        return httpx.Response(200, json={"code": 1, "data": None})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    assert asyncio.run(fetch_clears(store, "campaign", client, delay=(0, 0))) == 0
    assert seen == [6002001, 6002002, 6002003, 7002001]


def test_auth_error_keeps_earlier_clears(store):
    def handler(req):
        sid = json.loads(req.content)["stage_id"]
        if sid == 50002:
            return ok(sid)
        return httpx.Response(200, json={"code": 300001, "msg": "game not login", "data": None})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    with pytest.raises(AuthError):
        asyncio.run(fetch_clears(store, "tower", client, delay=(0, 0)))
    assert "50002" in store.load_clears("tower")


def test_sync_reference(store):
    store.config_dir.mkdir(parents=True, exist_ok=True)
    (store.config_dir / "sources.json").write_text(json.dumps(
        {"nikke": "n/n.json", "tower_list": "t/t.json", "slow": "s/s.json", "html": "h/h.json"}))
    old_tower = store.load_raw("tower_list")

    def handler(req):
        if str(req.url) == cdn_url("n/n.json"):
            return httpx.Response(200, json=[{"id": 1}])
        if str(req.url) == cdn_url("t/t.json"):
            return httpx.Response(404)
        if str(req.url) == cdn_url("h/h.json"):
            return httpx.Response(200, text="<html>")
        raise httpx.ConnectTimeout("x")

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    res = asyncio.run(sync_reference(store, client))
    assert res["nikke"] == "changed"
    assert res["tower_list"] == "failed: HTTPStatusError (site may have changed its URL scheme)"
    assert res["slow"] == "failed: ConnectTimeout"
    assert res["html"] == "failed: JSONDecodeError"
    assert store.load_raw("tower_list") == old_tower
    assert asyncio.run(sync_reference(store, httpx.AsyncClient(transport=httpx.MockTransport(handler))))["nikke"] == "unchanged"
