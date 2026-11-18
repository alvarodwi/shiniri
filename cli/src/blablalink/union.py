"""Union Raid: raw season files, fetching them, and the flat hit table built from them."""

import asyncio
import random
from dataclasses import dataclass

import httpx

from .fetch import AREA_ID, AUTH_CODE, AuthError
from .store import Store, write_csv

API = "https://api.blablalink.com/api/game/proxy/Game/"
ELEMENTS = {"100001": "Fire", "200001": "Water", "300001": "Wind", "400001": "Electronic", "500001": "Iron"}
WEAK_TO = {"Fire": "Water", "Water": "Electronic", "Electronic": "Iron", "Iron": "Wind", "Wind": "Fire"}
CODES = ("HSTA", "PSID", "ZEUS", "DMTR", "ANMI")
MODES = {1: "normal", 2: "hard"}


class UnionError(Exception):
    pass


def boss_code(name: str) -> str:
    return name.split()[-1].replace(".", "").upper() if name.strip() else ""


def season_number(season_id) -> int:
    return int(season_id) - 1000000


@dataclass
class UnionData:
    seasons: dict[int, dict]
    hits: list[dict]
    names: dict[str, str]
    me: str | None
    live: int | None


def _season_files(store: Store) -> list[tuple[int, dict]]:
    out = []
    for path in sorted((store.raw_dir / "union").glob("*.json")):
        raw = store.load_raw(f"union/{path.stem}")
        if isinstance(raw, dict):
            out.append((season_number(path.stem), raw))
    return sorted(out, key=lambda x: x[0])


def build_union(store: Store, me: str | None, now: float) -> UnionData:
    nikke = store.nikke_lookup()
    raid_list = {season_number(s["id"]): s for s in store.load_raw("raid_list", []) if "id" in s}
    live = next((n for n, s in raid_list.items() if s.get("start_ts", 0) <= now <= s.get("end_ts", 0)), None)
    seasons, hits, names = {}, [], {}
    for n, raw in _season_files(store):
        meta = raid_list.get(n, {})
        seasons[n] = {"id": n + 1000000, "start_ts": meta.get("start_ts"), "end_ts": meta.get("end_ts"),
                      "guild": raw.get("guild") or {}, "level": raw.get("level") or {}}
        for h in (raw.get("raid") or {}).get("participate_data") or []:
            mode = MODES.get(h.get("difficulty"))
            if not mode:
                continue
            boss = (h.get("name_localvalues") or {}).get("en", "")
            squad = []
            for u in sorted(h.get("squad") or [], key=lambda u: u.get("slot", 0)):
                squad.append({"slot": u.get("slot"), "tid": u.get("tid"), **nikke(u.get("tid")),
                              "level": u.get("lv"), "cp": u.get("combat") or 0})
            names[h["openid"]] = h.get("nickname") or h["openid"]  # season order: the newest name wins
            hits.append({"season": n, "day": h.get("day", 0) + 1, "mode": mode, "level": h.get("level"),
                         "step": h.get("step"), "boss": boss, "code": boss_code(boss),
                         "boss_element": ELEMENTS.get(str((h.get("element_id") or [""])[0])),
                         "openid": h["openid"], "damage": int(h.get("total_damage") or 0),
                         "final": bool(h.get("is_final_hit")), "squad": squad})
    return UnionData(seasons, hits, names, me, live if live in seasons else None)


def is_final(stored: dict | None, season: dict) -> bool:
    return bool(stored) and stored.get("fetched_ts", 0) > season.get("end_ts", 0)


async def _call(client: httpx.AsyncClient, name: str, body: dict) -> dict:
    """The response body; AuthError on a rejected cookie, a {"msg"} dict on transport errors."""
    for attempt in range(2):
        try:
            resp = await client.post(API + name, json=body, timeout=20.0)
        except httpx.HTTPError as e:
            err = {"code": -1, "msg": type(e).__name__}
        else:
            if resp.status_code == 200:
                try:
                    data = resp.json()
                except ValueError:
                    data = {"code": -1, "msg": "not json"}
                if data.get("code") == AUTH_CODE:
                    raise AuthError(data.get("msg", "game not login"))
                return data
            err = {"code": -1, "msg": f"HTTP {resp.status_code}"}
        if attempt == 0:
            await asyncio.sleep(1.5)
    return err


def _ok(resp: dict) -> bool:
    return resp.get("code") == 0 and isinstance(resp.get("data"), dict)


async def fetch_union(store: Store, client: httpx.AsyncClient, now: float, live_only: bool = False,
                      delay: tuple[float, float] = (0.5, 1.0)) -> dict[int, str]:
    guild = await _call(client, "GetMyGuildInfo", {"ignore_toast": True})
    card = (guild.get("data") or {}).get("card") if isinstance(guild.get("data"), dict) else None
    if guild.get("code") != 0 or not card:
        raise UnionError(guild.get("msg") or "no union info")
    out = {}
    for season in store.load_raw("raid_list", []):
        if season.get("start_ts", 0) > now:
            continue
        if live_only and now > season.get("end_ts", 0):
            continue
        n, sid = season_number(season["id"]), str(season["id"])
        if is_final(store.load_raw(f"union/{sid}"), season):
            out[n] = "kept"
            continue
        body = {"area_id": AREA_ID, "guild_id": str(card["guild_id"]), "season_id": sid}
        level = await _call(client, "GetUnionRaidLevelDataOfGuildSeason", body)
        raid = await _call(client, "GetUnionRaidDataOfGuildSeason", body) if _ok(level) else level
        if _ok(level) and _ok(raid):
            store.save_raw(f"union/{sid}", {"guild": card, "level": level["data"], "raid": raid["data"],
                                           "fetched_ts": int(now)})
            out[n] = "saved"
        else:
            out[n] = f"failed: {raid.get('msg') or level.get('msg') or 'no data'}"
        await asyncio.sleep(random.uniform(*delay))
    return out


def write_union_parsed(store: Store, u: UnionData) -> None:
    header = ["season", "day", "mode", "level", "step", "code", "boss", "member", "damage", "final",
              "slot1", "slot2", "slot3", "slot4", "slot5"]
    rows = []
    for h in u.hits:
        slots = {s["slot"]: s["name"] for s in h["squad"]}
        rows.append([h["season"], h["day"], h["mode"], h["level"], h["step"], h["code"], h["boss"],
                     u.names[h["openid"]], h["damage"], h["final"], *(slots.get(i, "") for i in range(1, 6))])
    write_csv(store.parsed_dir / "union_hits.csv", header, rows)
