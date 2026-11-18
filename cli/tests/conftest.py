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
    "nikke_list_en": [
        _nikke(433004, 330, "Crown", "PILGRIM", "Iron", "MG", "Step2"),
        _nikke(301706, 17, "Anis: Star", "TETRA", "Electronic", "RL", "Step1"),
        _nikke(5001, 50, "Anis"),
    ],
    "character_id_map": [
        {"id": 433004, "resource_id": 330, "grade": 3, "core": 0},
        {"id": 301706, "resource_id": 17, "grade": 3, "core": 2},
    ],
    "stage_list": [
        _stage(6000001, 1, "Normal", "0-1 STAGE"),
        _stage(6002001, 3, "Normal", "2-1 STAGE"),
        _stage(6002002, 3, "Normal", "2-2 STAGE"),
        _stage(6002003, 3, "Normal", "2-3 STAGE"),
        _stage(7002001, 3, "Hard", "2-1 HARD STAGE"),
    ],
    "tower_list": [
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


SQUAD = [{"slot": 1, "tid": 433004, "lv": 800, "combat": 900000, "costume_id": 0},
         {"slot": 2, "tid": 301706, "lv": 800, "combat": 800000, "costume_id": 0}]
BOSSES = {"HSTA": ("Black Smith H.S.T.A.", "100001"), "ZEUS": ("Storm Bringer Z.E.U.S.", "400001"),
          "OZEUS": ("Obelisk Z.E.U.S.", "400001"), "PSID": ("Spread P.S.I.D.", "200001"),
          "DMTR": ("Material H D.M.T.R.", "500001")}


def _hit(openid, nick, day, diff, level, step, boss, dmg, final=False):
    name, element = BOSSES[boss]
    return {"openid": openid, "nickname": nick, "day": day, "difficulty": diff, "level": level, "step": step,
            "boss_id": "1", "name_localvalues": {"en": name}, "element_id": [element], "icon_id": "x",
            "monster_model_id": "1", "total_damage": str(int(dmg)), "is_final_hit": final, "squad": SQUAD}


def _boss_hp(boss, hp, max_hp):
    name, element = BOSSES[boss]
    return {"name_localvalues": {"en": name}, "element_id": [element], "current_hp": str(int(hp)),
            "max_hp": str(int(max_hp))}


def _season_file(sid, member_cnt, hits, level_info):
    manager = {"id": str(sid)}
    return {"guild": {"guild_id": "1", "guild_name": "TEST", "guild_member_cnt": member_cnt},
            "level": {"level_info": level_info, "manager_info": manager},
            "raid": {"manager_info": manager, "participate_data": hits}, "fetched_ts": 1000}


UNION_FIXTURE = {
    "raid_list": [
        {"id": 1000045, "season_start_date": "x", "season_end_date": "x", "start_ts": 100, "end_ts": 200,
         "caculate_ts": 250},
        {"id": 1000046, "season_start_date": "x", "season_end_date": "x", "start_ts": 300, "end_ts": 400,
         "caculate_ts": 450},
    ],
    "union/1000045": _season_file(1000045, 3, [
        _hit(o, n, 2, 2, 1, 1, "HSTA", 40e9)
        for o, n in (("a", "ALPHA"), ("b", "BRAVO_OLD"), ("c", "CHARLIE")) for _ in range(3)
    ], [{"difficulty": 2, "level": 2, "boss_info": [
        _boss_hp("ZEUS", 38966437525, 226262720400), _boss_hp("HSTA", 7911253430, 149784418800),
        _boss_hp("PSID", 0, 149784418800), _boss_hp("DMTR", 0, 226262720400),
        _boss_hp("OZEUS", 9646624706, 149784418800)]}]),
    "union/1000046": _season_file(1000046, 4, [
        _hit("a", "ALPHA", 0, 1, 10, 4, "OZEUS", 2e9),
        _hit("a", "ALPHA", 0, 1, 10, 5, "OZEUS", 2e9, final=True),
        _hit("b", "BRAVO", 0, 1, 9, 5, "OZEUS", 2e9),
        _hit("a", "ALPHA", 1, 2, 4, 5, "HSTA", 100e9),
        _hit("a", "ALPHA", 1, 2, 4, 5, "HSTA", 50e9),
        _hit("a", "ALPHA", 1, 2, 3, 2, "ZEUS", 30e9),
        _hit("b", "BRAVO", 1, 2, 2, 3, "PSID", 20e9),
        _hit("b", "BRAVO", 1, 2, 2, 3, "PSID", 20e9),
        *(_hit("d", "DELTA", 1, 2, 1, 4, "DMTR", 10e9) for _ in range(3)),
    ], [{"difficulty": 2, "level": 4, "boss_info": [_boss_hp("HSTA", 1027483050281, 0)]}]),
}


@pytest.fixture
def union_store(store):
    for name, obj in UNION_FIXTURE.items():
        path = store.raw_dir / f"{name}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(obj), encoding="utf-8")
    return store


@pytest.fixture
def union(union_store):
    from blablalink.union import build_union
    return build_union(union_store, me="a", now=1000)
