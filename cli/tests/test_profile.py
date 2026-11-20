from datetime import datetime, timezone

from conftest import PROFILE_FIXTURE

from shiniri_cli.profile import (PROFILE_HEADERS, WIB, build_row, game_day, is_last_check, next_check,
                                 stage_names, wib_timestamp)

UTC = timezone.utc
BASIC = PROFILE_FIXTURE["basic"]["data"]["basic_info"]
OUTPOST = PROFILE_FIXTURE["outpost"]["data"]["outpost_info"]
STAGES = {6050044: "50-36", 7050044: "50-36", 8050044: "50-36"}


def test_game_day_rolls_at_3am_wib():
    assert game_day(datetime(2026, 11, 20, 19, 59, tzinfo=UTC)) == "2026-11-20"  # 02:59 WIB on the 21st
    assert game_day(datetime(2026, 11, 20, 20, 0, tzinfo=UTC)) == "2026-11-21"   # 03:00 WIB


def test_last_check_and_next_check():
    assert is_last_check(datetime(2026, 11, 20, 19, 59, 30, tzinfo=UTC))
    assert not is_last_check(datetime(2026, 11, 20, 20, 59, tzinfo=UTC))
    assert next_check(datetime(2026, 11, 20, 19, 59, 40, tzinfo=UTC)) == datetime(2026, 11, 21, 3, 59, tzinfo=WIB)
    assert next_check(datetime(2026, 11, 20, 19, 10, tzinfo=UTC)) == datetime(2026, 11, 21, 2, 59, tzinfo=WIB)


def test_wib_timestamp():
    assert wib_timestamp(datetime(2026, 11, 19, 7, 8, 32, tzinfo=UTC)) == "2026-11-19 14:08:32"


def test_build_row_from_samples():
    row = build_row(BASIC, OUTPOST, day="2026-11-19", taken_at="2026-11-19 14:08:32",
                    daily_done=False, stages=STAGES)
    assert len(PROFILE_HEADERS) == len(row) == 47
    assert dict(zip(PROFILE_HEADERS, row)) == {
        "date": "2026-11-19", "takenAt": "'2026-11-19 14:08:32", "dailyDone": False,
        "level": 934, "teamCombat": 3399441, "nikkes": 200, "costumes": 99,
        "elysionNikkes": 49, "missilisNikkes": 41, "tetraNikkes": 56, "pilgrimNikkes": 26, "abnormalNikkes": 28,
        "paidGems": 5565, "freeGems": 17500, "battleData": 443078442, "credits": 49450668, "coreDust": 76359,
        "recruitVouchers": 59, "advRecruitVouchers": 0, "silverMileage": 630, "goldMileage": 1810,
        "easyCampaign": "50-36", "normalCampaign": "50-36", "hardCampaign": "50-36",
        "tribeTower": 1650, "elysionTower": 1036, "missilisTower": 1036, "tetraTower": 1036, "pilgrimTower": 1036,
        "overclockCurrent": 25, "overclockLatest": 25,
        "synchroLevel": 801, "synchroSlots": 172, "outpostLevel": 747,
        "recyclePersonal": 380, "recycleAttacker": 280, "recycleDefender": 255, "recycleSupporter": 255,
        "recycleElysion": 250, "recycleMissilis": 251, "recycleTetra": 250, "recyclePilgrim": 245,
        "recycleAbnormal": 247,
        "memoirs": 109, "callLogs": 39, "bgm": 952, "data": 124,
    }


def test_missing_and_unknown_ids():
    basic = {**BASIC, "currencies": [{"type": 99, "value": "1"}, {"type": 424242, "value": "9"}],
             "progress_hard_campaign": 123}
    row = dict(zip(PROFILE_HEADERS, build_row(basic, {**OUTPOST, "memorial_counts": []}, day="d",
                                              taken_at="t", daily_done=True, stages=STAGES)))
    assert row["paidGems"] == "" and row["freeGems"] == 1
    assert row["hardCampaign"] == 123          # not in stage_list: raw id
    assert row["memoirs"] == "" and row["data"] == 0


def test_stage_names_strip_suffix(store):
    store.save_raw("stage_list", [{"id": 6050044, "name_localkey": {"name": "50-36 BOSS"}},
                                  {"id": 7050044, "name_localkey": {"name": "50-36 HARD BOSS"}},
                                  {"id": 6000001, "name_localkey": {"name": "0-1 STAGE"}}])
    assert stage_names(store) == {6050044: "50-36", 7050044: "50-36", 6000001: "0-1"}
