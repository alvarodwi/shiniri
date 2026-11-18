import json

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
