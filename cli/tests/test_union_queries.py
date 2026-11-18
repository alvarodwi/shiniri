import pytest

from shiniri_cli.queries import QueryError
from shiniri_cli.union_queries import fmt_dmg, short_dmg, hits, missed, normal, pick_season, recap, resolve_member


def test_fmt_dmg():
    assert [fmt_dmg(x) for x in (1027483050281, 9051890653, 100e9, 812_300_000, 812_300, 40e9 + 0.5)] == [
        "1.027.483.050.281 (1.03T)", "9.051.890.653 (9.05B)", "100.000.000.000 (100.0B)",
        "812.300.000 (812.3M)", "812.300", "40.000.000.000 (40.0B)"]
    assert short_dmg(160433126788) == "160.4B"


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
    assert "cleared · 1.027.483.050.281 (1.03T) on Black Smith H.S.T.A." in text and "D1" in text
    s45 = str(recap(union, 45).rows)
    assert "stopped at hard lv2" in s45 and "ZEUS 39.0B/226.3B" in s45 and "PSID" not in s45


def test_hits_filters(union):
    r = hits(union, 46, ["hard", "hsta"])
    assert [row[5] for row in r.rows] == ["100.000.000.000 (100.0B)", "50.000.000.000 (50.0B)"]
    assert r.rows[0][7] == "Crown, Anis: Star"
    assert len(hits(union, 46, ["d1"]).rows) == 3 and len(hits(union, 46, ["delta"]).rows) == 3
    assert len(hits(union, 46, ["normal", "lv10"]).rows) == 2
    assert len(hits(union, 46, []).rows) == 11


def test_missed(union):
    r = missed(union, 46)
    assert r.rows == [["BRAVO", 2]]


def test_missed_before_hard(union):
    union.hits = [h for h in union.hits if not (h["season"] == 46 and h["mode"] == "hard")]
    r = missed(union, 46)
    assert r.rows == [] and r.summary == "hard mode not reached yet"


def test_normal(union):
    r = normal(union, 46)
    assert [row[0] for row in r.rows] == ["ALPHA", "BRAVO"]
    assert r.summary == "2 members · 3 hits · 6.000.000.000 (6.00B)"


def test_resolve_member(union):
    assert resolve_member(union, "delta") == "d" and resolve_member(union, "CHAR") == "c"
    with pytest.raises(QueryError, match="ALPHA"):
        resolve_member(union, "a")
    with pytest.raises(QueryError, match="no member"):
        resolve_member(union, "zzz")


from shiniri_cli.union_queries import boss, growth, member, members, top


def test_top(union):
    assert top(union, None, None).rows == [["Anis: Star", 20], ["Crown", 20]]
    assert top(union, 46, "d").rows == [["Anis: Star", 3], ["Crown", 3]]


def test_member_tendencies(union):
    r = member(union, "a")
    assert [row[0] for row in r.rows] == ["s45", "s46"]
    assert r.columns[4:] == ["normal dmg", "hard dmg"]
    assert r.rows[1] == ["s46", 5, 2, 3, "4.000.000.000 (4.00B)", "180.000.000.000 (180.0B)"]
    assert r.rows[0][4] == "-"  # no normal hits in s45
    assert "bosses: HSTA 5, ZEUS 1" in r.summary
    assert "same boss twice in a day: 2" in r.summary
    assert "weakness Nikkes per squad: 0.2" in r.summary
    assert "favourites: Anis: Star 8, Crown 8" in r.summary


def test_members_arrivals(union):
    r = members(union)
    assert "s46: +DELTA −CHARLIE" in r.summary
    assert r.rows[-1] == ["CHARLIE", "s45", "s45", 1]


def test_growth(union):
    assert growth(union, []).rows[1][2] == "250.000.000.000 (250.0B)"
    r = growth(union, ["a", "b"])
    assert r.columns == ["season", "union median", "ALPHA", "BRAVO"]
    assert r.rows[1] == ["s46", "40.000.000.000 (40.0B)", "180.000.000.000 (180.0B)", "40.000.000.000 (40.0B)"]


def test_boss(union):
    r = boss(union, "hsta")
    assert [row[0] for row in r.rows] == ["s45", "s46"]
    assert r.columns[2:] == ["union hard", "union normal", "me hard", "me normal"]
    assert r.rows[0][2:] == ["360.000.000.000 (360.0B)", "-", "120.000.000.000 (120.0B)", "-"]
    assert r.rows[1][2:] == ["150.000.000.000 (150.0B)", "-", "150.000.000.000 (150.0B)", "-"]
    zeus = boss(union, "zeus").rows[-1]
    assert zeus[0] == "s46" and zeus[3] == "6.000.000.000 (6.00B)" and zeus[5] == "4.000.000.000 (4.00B)"
    union.me = None
    assert boss(union, "zeus").rows[-1][4:] == ["-", "-"]
    with pytest.raises(QueryError, match="HSTA, PSID"):
        boss(union, "xyz")


def test_size_trusted_near_season_end(union):
    assert "D2 · 3 of 4 hit · 4 missed" in str(recap(union, 46).rows)  # BRAVO 1 + one never-hitter's 3
    assert "TEST · 4 members" in str(recap(union, 46).rows)
    union.seasons[45]["fetched_ts"] = 400 + 10**6  # downloaded long after: today's union size says nothing
    rows = str(recap(union, 45).rows)
    assert "3 seen" in rows and "D3 · 3 hit · 0 missed" in rows
    assert missed(union, 45).summary == "3 members hit on hard day D3"


def test_missed_counts_never_hit(union):
    assert missed(union, 46).summary == "3 of 4 members hit on hard day D2 · 1 never hit"


def test_members_live_season_has_no_departures(union):
    union.live = 46
    assert "s46: +DELTA (live: departures not known yet)" in members(union).summary
