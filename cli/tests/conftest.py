import json

import pytest

from shiniri_cli.store import Store


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


class FakeSheets:
    def __init__(self, values: dict[str, list[list]]):
        self.values = values
        self.batches = []
        self.ensured = []

    def get_values(self, range_: str, unformatted: bool = False) -> list[list]:
        return self.values.get(range_, [])

    def batch_update(self, data):
        self.batches.append(data)
        return [r for r, _ in data]

    def ensure_rows(self, rows):
        self.ensured.append(dict(rows))


@pytest.fixture
def store(tmp_path):
    raw = tmp_path / "data" / "raw" / "json"
    raw.mkdir(parents=True)
    for name, obj in FIXTURE.items():
        (raw / f"{name}.json").write_text(json.dumps(obj), encoding="utf-8")
    return Store(tmp_path)


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
            "raid": {"manager_info": manager, "participate_data": hits}, "fetched_ts": 10000}


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
    from shiniri_cli.union import build_union
    return build_union(union_store, me="a", now=1000)


# Profile responses copied verbatim from blabla.yml (folder "profile").
PROFILE_FIXTURE = {'basic': {'code': 0,
           'code_type': 0,
           'msg': 'ok',
           'data': {'basic_info': {'area_id': '85',
                                   'character_costume_count': 99,
                                   'character_count': 200,
                                   'corporation_character_counts': [{'corporation_type': 3, 'count': 56},
                                                                    {'corporation_type': 7, 'count': 28},
                                                                    {'corporation_type': 2, 'count': 41},
                                                                    {'corporation_type': 4, 'count': 26},
                                                                    {'corporation_type': 1, 'count': 49}],
                                   'created_at': '1667975253',
                                   'currencies': [{'type': 98, 'value': '5565'},
                                                  {'type': 99, 'value': '17500'},
                                                  {'type': 1000, 'value': '443078442'},
                                                  {'type': 2000, 'value': '49450668'},
                                                  {'type': 3000, 'value': '76359'},
                                                  {'type': 5100, 'value': '59'},
                                                  {'type': 5200, 'value': '0'},
                                                  {'type': 11000, 'value': '630'},
                                                  {'type': 12000, 'value': '1810'}],
                                   'gsn': '2190',
                                   'has_saved_role_info': 1,
                                   'icon_id': 509902,
                                   'is_banned': 0,
                                   'is_icon_prism': 1,
                                   'is_maintenance': 0,
                                   'last_action_at': '1795070063',
                                   'lv': 934,
                                   'nickname': 'VAROA',
                                   'profile_team': [{'name_code': 5011, 'slot': 4},
                                                    {'name_code': 5075, 'slot': 5},
                                                    {'name_code': 5027, 'slot': 1},
                                                    {'name_code': 5035, 'slot': 3},
                                                    {'name_code': 5010, 'slot': 2},
                                                    {'name_code': 0, 'slot': 0}],
                                   'progress_easy_campaign': 8050044,
                                   'progress_elysion_tower': 1036,
                                   'progress_hard_campaign': 7050044,
                                   'progress_missilis_tower': 1036,
                                   'progress_normal_campaign': 6050044,
                                   'progress_pilgrim_tower': 1036,
                                   'progress_tetra_tower': 1036,
                                   'progress_tribe_tower': 1650,
                                   'role_name': 'VAROA',
                                   'sim_room_overclock_current_sub_season_high_score': 25,
                                   'sim_room_overclock_high_score_history': [{'option_level': 25,
                                                                              'option_list': [201,
                                                                                              204,
                                                                                              207,
                                                                                              210,
                                                                                              215,
                                                                                              216,
                                                                                              230,
                                                                                              211,
                                                                                              228],
                                                                              'season': 3},
                                                                             {'option_level': 25,
                                                                              'option_list': [301,
                                                                                              304,
                                                                                              307,
                                                                                              310,
                                                                                              311,
                                                                                              315,
                                                                                              326,
                                                                                              334,
                                                                                              327],
                                                                              'season': 4},
                                                                             {'option_level': 50,
                                                                              'option_list': [401,
                                                                                              404,
                                                                                              407,
                                                                                              410,
                                                                                              411,
                                                                                              415,
                                                                                              431,
                                                                                              430,
                                                                                              412,
                                                                                              418,
                                                                                              421,
                                                                                              425,
                                                                                              423,
                                                                                              427,
                                                                                              429],
                                                                              'season': 5},
                                                                             {'option_level': 50,
                                                                              'option_list': [501,
                                                                                              504,
                                                                                              507,
                                                                                              510,
                                                                                              511,
                                                                                              529,
                                                                                              530,
                                                                                              512,
                                                                                              523,
                                                                                              525,
                                                                                              521,
                                                                                              527,
                                                                                              531,
                                                                                              518,
                                                                                              515],
                                                                              'season': 6},
                                                                             {'option_level': 51,
                                                                              'option_list': [601,
                                                                                              604,
                                                                                              607,
                                                                                              610,
                                                                                              611,
                                                                                              612,
                                                                                              615,
                                                                                              631,
                                                                                              618,
                                                                                              621,
                                                                                              623,
                                                                                              625,
                                                                                              627,
                                                                                              629,
                                                                                              630,
                                                                                              632],
                                                                              'season': 7},
                                                                             {'option_level': 50,
                                                                              'option_list': [701,
                                                                                              704,
                                                                                              707,
                                                                                              710,
                                                                                              711,
                                                                                              712,
                                                                                              715,
                                                                                              731,
                                                                                              718,
                                                                                              720,
                                                                                              723,
                                                                                              725,
                                                                                              727,
                                                                                              729,
                                                                                              730],
                                                                              'season': 8},
                                                                             {'option_level': 51,
                                                                              'option_list': [801,
                                                                                              804,
                                                                                              807,
                                                                                              810,
                                                                                              811,
                                                                                              812,
                                                                                              830,
                                                                                              831,
                                                                                              815,
                                                                                              818,
                                                                                              820,
                                                                                              823,
                                                                                              825,
                                                                                              827,
                                                                                              829,
                                                                                              832],
                                                                              'season': 9},
                                                                             {'option_level': 50,
                                                                              'option_list': [901,
                                                                                              904,
                                                                                              907,
                                                                                              910,
                                                                                              911,
                                                                                              915,
                                                                                              918,
                                                                                              919,
                                                                                              912,
                                                                                              925,
                                                                                              927,
                                                                                              929,
                                                                                              930,
                                                                                              931,
                                                                                              923],
                                                                              'season': 10},
                                                                             {'option_level': 25,
                                                                              'option_list': [1001,
                                                                                              1004,
                                                                                              1007,
                                                                                              1010,
                                                                                              1011,
                                                                                              1018,
                                                                                              1031,
                                                                                              1025],
                                                                              'season': 11},
                                                                             {'option_level': 25,
                                                                              'option_list': [1101,
                                                                                              1107,
                                                                                              1104,
                                                                                              1110,
                                                                                              1111,
                                                                                              1115,
                                                                                              1123,
                                                                                              1125,
                                                                                              1128],
                                                                              'season': 12}],
                                   'sim_room_overclock_latest_season_high_score': 25,
                                   'team_combat': 3399441}},
           'seq': '8bd73af9-e4ba-492c-bf6d-fce6c3bc7a77'},
 'outpost': {'code': 0,
             'code_type': 0,
             'msg': 'ok',
             'data': {'outpost_info': {'infra_core_level': 20,
                                       'is_hide': False,
                                       'jukebox_count': 952,
                                       'memorial_counts': [{'category': 'HandWriting', 'count': 109},
                                                           {'category': 'CallLog', 'count': 39},
                                                           {'category': 'Data', 'count': 84},
                                                           {'category': 'RedAsh', 'count': 21},
                                                           {'category': 'OldTales', 'count': 15},
                                                           {'category': 'UnbreakableSphere', 'count': 4}],
                                       'outpost_battle_level': 747,
                                       'recycle_room_researches': [{'exp': 0, 'lv': 380, 'tid': 1001},
                                                                   {'exp': 0, 'lv': 280, 'tid': 1101},
                                                                   {'exp': 0, 'lv': 255, 'tid': 1102},
                                                                   {'exp': 0, 'lv': 255, 'tid': 1103},
                                                                   {'exp': 0, 'lv': 250, 'tid': 1201},
                                                                   {'exp': 0, 'lv': 251, 'tid': 1202},
                                                                   {'exp': 0, 'lv': 250, 'tid': 1203},
                                                                   {'exp': 0, 'lv': 245, 'tid': 1204},
                                                                   {'exp': 0, 'lv': 247, 'tid': 1205}],
                                       'synchro_level': 801,
                                       'synchro_nonempty_slot_count': 172,
                                       'tactic_academy_class': 13000,
                                       'tactic_academy_lesson': 13003}},
             'seq': '5bdc8ccf-ce1f-4cbe-961d-36240063d08a'},
 'daily': {'code': 0,
           'code_type': 0,
           'msg': 'ok',
           'data': {'daily_progress': [{'counsel_remaining_count': 10,
                                        'daily_mission_receivable_points': 10,
                                        'daily_mission_received_points': 30,
                                        'daily_mission_received_rewards': [20],
                                        'dispatch_completed_count': 15,
                                        'dispatch_in_progress_count': 0,
                                        'intercept_remaining_tickets': 5,
                                        'outpost_battle_efficiency': 1,
                                        'outpost_battle_storage_excess': 0,
                                        'outpost_battle_storage_fullness': 0.26651073407407405,
                                        'rookie_arena_remaining_count': 5,
                                        'sim_room_daily_best_record': {'chapter': 0, 'difficulty': 0},
                                        'special_arena_remaining_count': 2,
                                        'tower_daily_info_list': [{'is_opened': False,
                                                                   'remaining_count': 3,
                                                                   'type': 1},
                                                                  {'is_opened': False,
                                                                   'remaining_count': 3,
                                                                   'type': 2},
                                                                  {'is_opened': True,
                                                                   'remaining_count': 3,
                                                                   'type': 3},
                                                                  {'is_opened': False,
                                                                   'remaining_count': 3,
                                                                   'type': 4}],
                                        'weekly_mission_receivable_points': 0,
                                        'weekly_mission_received_points': 90,
                                        'weekly_mission_received_rewards': [20]}]},
           'seq': 'b04536b8-4a41-46cb-95b6-bebc1a994857'}}
