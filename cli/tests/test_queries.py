from datetime import date

import pytest

from blablalink.queries import (QueryError, compress_synchro, date_range, floor, nikke, progress,
                                resolve_nikke, stage, synchro, top)


def test_resolve_nikke(tables):
    assert resolve_nikke(tables, "CROWN") == "Crown"
    assert resolve_nikke(tables, "anis") == "Anis"
    with pytest.raises(QueryError, match="Anis: Star"):
        resolve_nikke(tables, "ani")
    with pytest.raises(QueryError):
        resolve_nikke(tables, "zzz")


def test_nikke_pair(tables):
    r = nikke(tables, ["crown", "anis: star"])
    assert r.scope == "all" and len(r.rows) == 1 and r.summary.startswith("1 clears")
    assert len(nikke(tables, ["anis: star"]).rows) == 2


def test_stage_floor_scopes(tables):
    assert stage(tables, "normal", 2).scope == "campaign" and len(stage(tables, "normal", 2).rows) == 1
    assert floor(tables, "TRIBE", 1).rows[0][-1].startswith("NIKKE_999999 (N/A 801)")
    with pytest.raises(QueryError):
        floor(tables, "moon", 1)
    with pytest.raises(QueryError):
        stage(tables, "easy", 2)


def test_date_range(tables):
    r = date_range(tables, date(2026, 10, 1), date(2026, 12, 31))
    assert r.scope == "all" and [row[1] for row in r.rows] == ["campaign", "tower"]
    assert date_range(tables, date(2020, 1, 1), date(2020, 1, 2)).rows == []


def test_top_scope(tables):
    assert top(tables, "tribe").scope == "tower" and top(tables, "hard").scope == "campaign" and top(tables, None).scope == "all"
    assert top(tables, None).rows[0] == ["Anis: Star", 2]
    with pytest.raises(QueryError):
        top(tables, "moon")


def test_compress_synchro():
    d = {date(2026, 1, 1): 200, date(2026, 1, 2): 200, date(2026, 1, 3): 200, date(2026, 1, 4): 201}
    assert compress_synchro(d) == [(date(2026, 1, 1), 200), (date(2026, 1, 3), 200), (date(2026, 1, 4), 201)]


def test_synchro_uses_single_levels_over_200(tables):
    r = synchro(tables)
    assert r.scope == "all" and [row[1] for row in r.rows] == [740, 801]


def test_progress(tables):
    rows = progress(tables).rows
    assert ["Normal", "2 · 2-3 STAGE"] in rows and ["Tribe", "1F"] in rows


def test_stage_single_entry(tables):
    r = stage(tables, "normal", 2, "2-3")
    assert len(r.rows) == 1 and r.rows[0][0] == "2 · 2-3 STAGE"
    with pytest.raises(QueryError, match="try: stage normal 2"):
        stage(tables, "normal", 2, "2-9")


def test_spread_buckets_with_gaps(tables):
    from blablalink.queries import spread
    r = spread(tables, 5)
    assert r.scope == "all" and r.columns == ["level", "from", "to", "clears"]
    assert r.rows[0] == ["740–744", "2026-10-31", "2026-10-31", 1]
    assert r.rows[1] == ["745–749", "N/A", "", 0]
    assert r.rows[-1][0] == "800–804" and r.rows[-1][3] == 1 and len(r.rows) == 13
    assert spread(tables, 100).rows[0][0] == "700–799"


def test_synchro_ignores_fixed_level_ex_stages(store):
    from blablalink.queries import spread
    levels = store.load_raw("campaign_level") + [
        {"id": 6002099, "chapter_id": 3, "chapter_mod": "Normal", "standard_battle_power": 0, "name_localkey": {"name": "EX STAGE"}}]
    store.save_raw("campaign_level", levels)
    clears = store.load_clears("campaign")
    clears["6002099"] = {"cleared_at": "1794364999", "list": [{"slot": 1, "tid": 433004, "lv": 300, "combat": 1}]}
    store.save_clears("campaign", clears)
    t = store.build_tables()
    assert [row[1] for row in synchro(t).rows] == [740, 801]
    assert spread(t, 5).rows[0][0] == "740–744"
