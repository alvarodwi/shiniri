import pytest

from blablalink.queries import QueryError
from blablalink.union_queries import fmt_dmg, hits, missed, normal, pick_season, recap, resolve_member


def test_fmt_dmg():
    assert [fmt_dmg(x) for x in (1027483050281, 160433126788, 9051890653, 100e9, 812_300_000)] == [
        "1.03T", "160.4B", "9.05B", "100.0B", "812.3M"]


def test_pick_season(union):
    assert pick_season(union, "s45") == 45 and pick_season(union, "45") == 45 and pick_season(union, None) == 46
    with pytest.raises(QueryError, match="stored: s45, s46"):
        pick_season(union, "s44")


def test_pick_season_prefers_live(union):
    union.live = 45
    assert pick_season(union, None) == 45


def test_pick_season_empty(union):
    union.seasons.clear()
    with pytest.raises(QueryError, match="run sync, then fetch"):
        pick_season(union, None)


def test_recap(union):
    text = str(recap(union, 46).rows)
    assert "cleared · 1.03T on Black Smith H.S.T.A." in text and "D1" in text
    s45 = str(recap(union, 45).rows)
    assert "stopped at hard lv2" in s45 and "ZEUS 39.0B/226.3B" in s45 and "PSID" not in s45


def test_hits_filters(union):
    r = hits(union, 46, ["hard", "hsta"])
    assert [row[5] for row in r.rows] == ["100.0B", "50.0B"]
    assert r.rows[0][7] == "Crown, Anis: Star"
    assert len(hits(union, 46, ["d1"]).rows) == 3 and len(hits(union, 46, ["delta"]).rows) == 3
    assert len(hits(union, 46, ["normal", "lv10"]).rows) == 2
    assert len(hits(union, 46, []).rows) == 11


def test_missed(union):
    r = missed(union, 46)
    assert r.rows == [["BRAVO", 2]] and r.summary == "3 of 4 members hit on hard day D2"


def test_missed_before_hard(union):
    union.hits = [h for h in union.hits if not (h["season"] == 46 and h["mode"] == "hard")]
    r = missed(union, 46)
    assert r.rows == [] and r.summary == "hard mode not reached yet"


def test_normal(union):
    r = normal(union, 46)
    assert [row[0] for row in r.rows] == ["ALPHA", "BRAVO"]
    assert r.summary == "2 members · 3 hits · 6.00B"


def test_resolve_member(union):
    assert resolve_member(union, "delta") == "d" and resolve_member(union, "CHAR") == "c"
    with pytest.raises(QueryError, match="ALPHA"):
        resolve_member(union, "a")
    with pytest.raises(QueryError, match="no member"):
        resolve_member(union, "zzz")
