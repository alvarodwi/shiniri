import json

from conftest import UNION_FIXTURE

from blablalink.union import boss_code, build_union, season_number, write_union_parsed


def test_boss_code_and_season_number():
    assert boss_code("Black Smith H.S.T.A.") == "HSTA"
    assert boss_code("Obelisk Z.E.U.S.") == "ZEUS"
    assert season_number("1000046") == 46 and season_number(1000035) == 35


def test_build_union_hits(union):
    assert sorted(union.seasons) == [45, 46]
    s46 = [h for h in union.hits if h["season"] == 46]
    assert len(s46) == 11
    zeus = next(h for h in s46 if h["code"] == "ZEUS" and h["mode"] == "hard")
    assert (zeus["day"], zeus["mode"], zeus["boss_element"], zeus["damage"]) == (2, "hard", "Electronic", 30_000_000_000)
    assert zeus["squad"][0]["name"] == "Crown" and zeus["squad"][0]["element"] == "Iron"
    assert union.me == "a" and union.live is None


def test_member_keeps_latest_nickname(union):
    assert union.names["b"] == "BRAVO"


def test_live_season_from_raid_list(union_store):
    u = build_union(union_store, me=None, now=350)
    assert u.live == 46


def test_unknown_difficulty_ignored(union_store):
    path = union_store.raw_dir / "union" / "1000046.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    raw["raid"]["participate_data"].append({**raw["raid"]["participate_data"][0], "difficulty": 3})
    path.write_text(json.dumps(raw), encoding="utf-8")
    u = build_union(union_store, me="a", now=1000)
    assert len([h for h in u.hits if h["season"] == 46]) == 11


def test_write_union_parsed(union_store, union):
    write_union_parsed(union_store, union)
    text = (union_store.parsed_dir / "union_hits.csv").read_text(encoding="utf-8-sig")
    assert text.splitlines()[0].startswith("season,day,mode,level,step,code,boss,member,damage,final,slot1")
    assert text.count("\n") == 21


import asyncio

import httpx
import pytest

from blablalink.fetch import AuthError
from blablalink.union import UnionError, fetch_union, is_final

GUILD_OK = {"code": 0, "data": {"card": {"guild_id": "1", "guild_name": "TEST", "guild_member_cnt": 4}}}


def _stored_hits(body):  # the server answering with what's already stored, so the hit count never drops
    return {"code": 0, "data": {"participate_data": UNION_FIXTURE.get(f"union/{body['season_id']}", {}).get(
        "raid", {}).get("participate_data", [])}}


def _client(seen, raid=_stored_hits, guild=GUILD_OK):
    def handler(req):
        name = req.url.path.rsplit("/", 1)[-1]
        body = json.loads(req.content)
        seen.append((name, body.get("season_id")))
        if name == "GetMyGuildInfo":
            return httpx.Response(200, json=guild)
        if name == "GetUnionRaidLevelDataOfGuildSeason":
            return httpx.Response(200, json={"code": 0, "data": {"level_info": []}})
        return httpx.Response(200, json=raid(body))
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def _run(store, client, now, **kw):
    return asyncio.run(fetch_union(store, client, now, delay=(0, 0), **kw))


def _add_season(store, sid, start, end):
    seasons = store.load_raw("raid_list")
    store.save_raw("raid_list", seasons + [{"id": sid, "start_ts": start, "end_ts": end}])


def test_fetch_saves_missing_and_keeps_final(union_store):
    _add_season(union_store, 1000047, 900, 1100)
    seen = []
    assert _run(union_store, _client(seen), 1200) == {45: "kept", 46: "kept", 47: "saved"}
    assert {s for _, s in seen if s} == {"1000047"}
    saved = union_store.load_raw("union/1000047")
    assert saved["fetched_ts"] == 1200 and saved["guild"]["guild_member_cnt"] == 4


def test_fetch_body(union_store):
    _add_season(union_store, 1000047, 900, 1100)
    bodies = []
    def handler(req):
        bodies.append(json.loads(req.content))
        return httpx.Response(200, json=GUILD_OK if "GetMyGuild" in req.url.path else {"code": 0, "data": {}})
    _run(union_store, httpx.AsyncClient(transport=httpx.MockTransport(handler)), 1200)
    assert bodies[0] == {"ignore_toast": True}
    assert bodies[1] == {"area_id": 85, "guild_id": "1", "season_id": "1000047"}


def test_fetch_refreshes_unfinal_then_locks(union_store):
    raw = union_store.load_raw("union/1000046")
    union_store.save_raw("union/1000046", {**raw, "fetched_ts": 350})
    assert _run(union_store, _client([]), 1000)[46] == "saved"  # ended, but inside the grace hour
    assert _run(union_store, _client([]), 5000)[46] == "saved"
    seen = []
    assert _run(union_store, _client(seen), 6000)[46] == "kept"
    assert [s for _, s in seen if s] == []


def test_failed_call_never_replaces(union_store):
    raw = union_store.load_raw("union/1000046")
    union_store.save_raw("union/1000046", {**raw, "fetched_ts": 350})
    before = (union_store.raw_dir / "union" / "1000046.json").read_bytes()
    res = _run(union_store, _client([], raid=lambda b: {"code": 1, "msg": "boom", "data": None}), 1000)
    assert res[46] == "failed: boom"
    assert (union_store.raw_dir / "union" / "1000046.json").read_bytes() == before


def test_guild_error_touches_nothing(union_store):
    seen = []
    with pytest.raises(UnionError, match="user not in guild"):
        _run(union_store, _client(seen, guild={"code": 1303028, "msg": "user not in guild", "data": None}), 1000)
    assert len(seen) == 1
    with pytest.raises(AuthError):
        _run(union_store, _client([], guild={"code": 300001, "msg": "game not login"}), 1000)


def test_live_only(union_store):
    raw = union_store.load_raw("union/1000046")
    union_store.save_raw("union/1000046", {**raw, "fetched_ts": 320})  # stored earlier in the live week
    seen = []
    assert _run(union_store, _client(seen), 350, live_only=True) == {46: "saved"}
    assert _run(union_store, _client([]), 1000, live_only=True) == {}


def test_other_union_never_overwrites(union_store):
    raw = union_store.load_raw("union/1000046")
    union_store.save_raw("union/1000046", {**raw, "fetched_ts": 350})
    other = {"code": 0, "data": {"card": {"guild_id": "999", "guild_name": "NEW", "guild_member_cnt": 30}}}
    assert _run(union_store, _client([], guild=other), 1000)[46] == "kept (other union)"
    assert union_store.load_raw("union/1000046")["guild"]["guild_id"] == "1"


def test_fewer_hits_never_replace(union_store):
    raw = union_store.load_raw("union/1000046")
    union_store.save_raw("union/1000046", {**raw, "fetched_ts": 350})
    empty = _client([], raid=lambda b: {"code": 0, "data": {"participate_data": []}})
    assert _run(union_store, empty, 1000)[46] == "failed: fewer hits than stored (11 → 0)"
    assert len(union_store.load_raw("union/1000046")["raid"]["participate_data"]) == 11


def test_not_final_right_after_end(union_store):
    season = {"end_ts": 400}
    assert not is_final({"fetched_ts": 401}, season) and is_final({"fetched_ts": 400 + 3601}, season)


def test_partial_results_survive_auth_error(union_store):
    _add_season(union_store, 1000047, 900, 1100)
    _add_season(union_store, 1000048, 900, 1100)
    calls = []
    def handler(req):
        name = req.url.path.rsplit("/", 1)[-1]
        if name == "GetMyGuildInfo":
            return httpx.Response(200, json=GUILD_OK)
        sid = json.loads(req.content)["season_id"]
        calls.append(sid)
        if sid == "1000048":
            return httpx.Response(200, json={"code": 300001, "msg": "game not login"})
        return httpx.Response(200, json={"code": 0, "data": {"participate_data": []}})
    results = {}
    with pytest.raises(AuthError):
        asyncio.run(fetch_union(union_store, httpx.AsyncClient(transport=httpx.MockTransport(handler)), 99999,
                                delay=(0, 0), results=results))
    assert results[47] == "saved"
