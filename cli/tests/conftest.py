import json

import pytest

from blablalink.store import Store


def _nikke(id_, rid, name, corp=None, element=None, weapon=None, burst=None):
    return {
        "id": id_,
        "resource_id": rid,
        "original_rare": "SSR",
        "class": "Attacker",
        "use_burst_skill": burst,
        "corporation": corp,
        "name_localkey": {"name": name},
        "element_id": {"element": {"element": element}},
        "shot_id": {"element": {"weapon_type": weapon}},
    }


def _stage(id_, chap, mod, name):
    return {"id": id_, "chapter_id": chap, "chapter_mod": mod,
            "standard_battle_power": 1000, "name_localkey": {"name": name}}


FIXTURE = {
    "nikke": [
        _nikke(433004, 330, "Crown", "PILGRIM", "Iron", "MG", "Step2"),
        _nikke(301706, 17, "Anis: Star", "TETRA", "Electronic", "RL", "Step1"),
        _nikke(5001, 50, "Anis"),
    ],
    "historical_roster": [
        {"id": 433004, "resource_id": 330, "grade": 3, "core": 0},
        {"id": 301706, "resource_id": 17, "grade": 3, "core": 2},
    ],
    "campaign_level": [
        _stage(6000001, 1, "Normal", "0-1 STAGE"),
        _stage(6002001, 3, "Normal", "2-1 STAGE"),
        _stage(6002002, 3, "Normal", "2-2 STAGE"),
        _stage(6002003, 3, "Normal", "2-3 STAGE"),
        _stage(7002001, 3, "Hard", "2-1 HARD STAGE"),
    ],
    "tower_level": [
        {"tower_type": "tribe", "floor": f, "stage_id": 50000 + f, "standard_battle_power": 5000}
        for f in (1, 2, 3)
    ] + [{"tower_type": "pilgrim", "floor": 1, "stage_id": 51001, "standard_battle_power": 5000}],
    "campaign_clears": {"6002003": {"cleared_at": "1793443017", "list": [
        {"slot": 1, "tid": 433004, "lv": 740, "combat": 509195},
        {"slot": 2, "tid": 301706, "lv": 740, "combat": 400000}]}},
    "tower_clears": {"50001": {"cleared_at": "1794364831", "list": [
        {"slot": 2, "tid": 301706, "lv": 801, "combat": 776595},
        {"slot": 1, "tid": 999999, "lv": 801, "combat": 1}]}},
}


@pytest.fixture
def store(tmp_path):
    raw = tmp_path / "data" / "raw" / "json"
    raw.mkdir(parents=True)
    for name, obj in FIXTURE.items():
        (raw / f"{name}.json").write_text(json.dumps(obj), encoding="utf-8")
    return Store(tmp_path)


@pytest.fixture
def tables(store):
    return store.build_tables()
