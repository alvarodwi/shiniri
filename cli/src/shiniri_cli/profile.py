"""Daily profile row: game-day timing, the profile requests, the row for the Progression sheet."""

from datetime import datetime, timedelta, timezone

import httpx

from .fetch import AREA_ID, api_call
from .store import Store

WIB = timezone(timedelta(hours=7))  # fixed offset, no DST; never the machine's zone
RESET = timedelta(hours=3)          # the game day starts at 03:00 WIB

CORPS = {1: "elysion", 2: "missilis", 3: "tetra", 4: "pilgrim", 7: "abnormal"}
CURRENCIES = {98: "paidGems", 99: "freeGems", 1000: "battleData", 2000: "credits", 3000: "coreDust",
              5100: "recruitVouchers", 5200: "advRecruitVouchers", 11000: "silverMileage",
              12000: "goldMileage"}
RECYCLE = {1001: "recyclePersonal", 1101: "recycleAttacker", 1102: "recycleDefender",
           1103: "recycleSupporter", 1201: "recycleElysion", 1202: "recycleMissilis", 1203: "recycleTetra",
           1204: "recyclePilgrim", 1205: "recycleAbnormal"}
BASIC_FIELDS = {"level": "lv", "teamCombat": "team_combat", "nikkes": "character_count",
                "costumes": "character_costume_count"}
CAMPAIGNS = {"easyCampaign": "progress_easy_campaign", "normalCampaign": "progress_normal_campaign",
             "hardCampaign": "progress_hard_campaign"}
TOWERS = {"tribeTower": "progress_tribe_tower", **{f"{c}Tower": f"progress_{c}_tower"
                                                     for c in ("elysion", "missilis", "tetra", "pilgrim")}}
OVERCLOCK = {"overclockCurrent": "sim_room_overclock_current_sub_season_high_score",
             "overclockLatest": "sim_room_overclock_latest_season_high_score"}
OUTPOST_FIELDS = {"synchroLevel": "synchro_level", "synchroSlots": "synchro_nonempty_slot_count",
                  "outpostLevel": "outpost_battle_level"}

PROFILE_HEADERS = ("date", "takenAt", "dailyDone", *BASIC_FIELDS, *(f"{c}Nikkes" for c in CORPS.values()),
                   *CURRENCIES.values(), *CAMPAIGNS, *TOWERS, *OVERCLOCK, *OUTPOST_FIELDS, *RECYCLE.values(),
                   "memoirs", "callLogs", "bgm", "data")


class ProfileError(Exception):
    pass


async def _get(client: httpx.AsyncClient, openid: str, name: str, key: str):
    """data[key] of one profile request; ProfileError when the answer isn't a usable one."""
    resp = await api_call(client, name, {"intl_open_id": openid, "nikke_area_id": AREA_ID})
    value = (resp.get("data") or {}).get(key) if resp.get("code") == 0 else None
    if not value:
        raise ProfileError(f"{name}: {resp.get('msg') or 'no ' + key}")
    return value


async def fetch_daily(client: httpx.AsyncClient, openid: str) -> dict:
    return (await _get(client, openid, "GetUserDailyContentsProgress", "daily_progress"))[0]


async def fetch_profile(client: httpx.AsyncClient, openid: str) -> tuple[dict, dict]:
    basic = await _get(client, openid, "GetUserProfileBasicInfo", "basic_info")
    outpost = await _get(client, openid, "GetUserProfileOutpostInfo", "outpost_info")
    return basic, outpost


def game_day(now: datetime) -> str:
    return (now.astimezone(WIB) - RESET).date().isoformat()


def is_last_check(now: datetime) -> bool:
    return now.astimezone(WIB).strftime("%H:%M") == "02:59"


def next_check(now: datetime) -> datetime:
    """The next :59:00 WIB strictly after `now`."""
    at = now.astimezone(WIB).replace(minute=59, second=0, microsecond=0)
    return at if at > now else at + timedelta(hours=1)


def wib_timestamp(now: datetime) -> str:
    return now.astimezone(WIB).strftime("%Y-%m-%d %H:%M:%S")


def stage_names(store: Store) -> dict[int, str]:
    """Stage id -> "50-36", the stage name without its " BOSS" / " HARD BOSS" / " STAGE" suffix."""
    return {s["id"]: s["name_localkey"]["name"].split(" ")[0]
            for s in store.load_raw("stage_list", []) if s.get("name_localkey", {}).get("name")}


def _by(items: list[dict], key: str, value: str) -> dict:
    return {i.get(key): i.get(value) for i in items or []}


def build_row(basic: dict, outpost: dict, *, day: str, taken_at: str, daily_done: bool,
              stages: dict[int, str]) -> list:
    # A missing id writes "" so the row keeps its 47 cells; ids the game adds later are ignored.
    corps = _by(basic.get("corporation_character_counts"), "corporation_type", "count")
    money = _by(basic.get("currencies"), "type", "value")
    rooms = _by(outpost.get("recycle_room_researches"), "tid", "lv")
    relics = _by(outpost.get("memorial_counts"), "category", "count")
    return [
        day, f"'{taken_at}", daily_done,
        *(basic.get(k, "") for k in BASIC_FIELDS.values()),
        *(corps.get(t, "") for t in CORPS),
        *(int(money[t]) if t in money else "" for t in CURRENCIES),
        *(stages.get(basic.get(k), basic.get(k, "")) for k in CAMPAIGNS.values()),
        *(basic.get(k, "") for k in TOWERS.values()),
        *(basic.get(k, "") for k in OVERCLOCK.values()),
        *(outpost.get(k, "") for k in OUTPOST_FIELDS.values()),
        *(rooms.get(t, "") for t in RECYCLE),
        relics.get("HandWriting", ""), relics.get("CallLog", ""), outpost.get("jukebox_count", ""),
        sum(n for c, n in relics.items() if c not in ("HandWriting", "CallLog")),
    ]
