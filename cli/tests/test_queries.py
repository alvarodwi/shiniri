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
