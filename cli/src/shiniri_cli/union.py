"""Union Raid: raw season files, fetching them, and the flat hit table built from them."""

import asyncio
import random
from dataclasses import dataclass

import httpx

from .fetch import AREA_ID, api_call
from .store import Store, write_csv

ELEMENTS = {"100001": "Fire", "200001": "Water", "300001": "Wind", "400001": "Electronic", "500001": "Iron"}
WEAK_TO = {"Fire": "Water", "Water": "Electronic", "Electronic": "Iron", "Iron": "Wind", "Wind": "Fire"}
CODES = ("HSTA", "PSID", "ZEUS", "DMTR", "ANMI")
MODES = {1: "normal", 2: "hard"}
FINAL_GRACE = 3600
SIZE_TRUST = 7 * 86400  # the guild card and roster are today's; past this they say nothing about that season


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
                      "fetched_ts": raw.get("fetched_ts"),
                      "guild": raw.get("guild") or {}, "level": raw.get("level") or {},
                      "members": raw.get("members")}
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
                         "openid": h["openid"], "nickname": h.get("nickname") or h["openid"], "damage": int(h.get("total_damage") or 0),
                         "final": bool(h.get("is_final_hit")), "squad": squad})
    return UnionData(seasons, hits, names, me, live if live in seasons else None)


def is_final(stored: dict | None, season: dict) -> bool:
    # an hour past the end, so the server's ~5 minute lag has caught up before the season locks
    return bool(stored) and stored.get("fetched_ts", 0) > season.get("end_ts", 0) + FINAL_GRACE


def _ok(resp: dict) -> bool:
    return resp.get("code") == 0 and isinstance(resp.get("data"), dict)


async def _members(client: httpx.AsyncClient, guild_id: str) -> list[dict] | None:
    """The union's current members, or None when the answer isn't a usable one."""
    resp = await api_call(client, "GetGuildMembers", {"guild_id": guild_id, "nikke_area_id": str(AREA_ID)})
    items = resp["data"].get("items") if _ok(resp) else None
    return items if isinstance(items, list) and items else None


async def fetch_union(store: Store, client: httpx.AsyncClient, now: float, live_only: bool = False,
                      delay: tuple[float, float] = (0.5, 1.0), results: dict | None = None) -> dict[int, str]:
    """Season number -> status. Pass `results` to keep the statuses of seasons done before an error."""
    guild = await api_call(client, "GetMyGuildInfo", {"ignore_toast": True})
    card = (guild.get("data") or {}).get("card") if isinstance(guild.get("data"), dict) else None
    if guild.get("code") == -1:  # api_call's transport failure, not a server answer
        raise UnionError(f"can't reach blablalink ({guild.get('msg')})")
    if guild.get("code") != 0 or not card:
        raise UnionError(f"union info refused: {guild.get('msg') or 'no union info'}")
    out = {} if results is None else results
    for season in store.load_raw("raid_list", []):
        if season.get("start_ts", 0) > now:
            continue
        if live_only and now > season.get("end_ts", 0):
            continue
        n, sid = season_number(season["id"]), str(season["id"])
        stored = store.load_raw(f"union/{sid}")
        other = stored and str((stored.get("guild") or {}).get("guild_id")) != str(card["guild_id"])
        if is_final(stored, season):
            out[n] = "kept"
            # locked before rosters were stored: today's roster still describes a season that just ended
            if not other and "members" not in stored and now <= season.get("end_ts", 0) + SIZE_TRUST:
                members = await _members(client, str(card["guild_id"]))
                if members:
                    store.save_raw(f"union/{sid}", {**stored, "members": members})
                    out[n] = "kept (+roster)"
            continue
        if other:
            out[n] = "kept (other union)"  # a past union's season can't be fetched again
            continue
        body = {"area_id": AREA_ID, "guild_id": str(card["guild_id"]), "season_id": sid}
        level = await api_call(client, "GetUnionRaidLevelDataOfGuildSeason", body)
        raid = await api_call(client, "GetUnionRaidDataOfGuildSeason", body) if _ok(level) else level
        old_hits = len(((stored or {}).get("raid") or {}).get("participate_data") or [])
        new_hits = len(raid["data"].get("participate_data") or []) if _ok(raid) else 0
        if _ok(level) and _ok(raid) and new_hits < old_hits:
            out[n] = f"failed: fewer hits than stored ({old_hits} → {new_hits})"
        elif _ok(level) and _ok(raid):
            fresh = {"guild": card, "level": level["data"], "raid": raid["data"], "fetched_ts": int(now)}
            members = await _members(client, str(card["guild_id"])) or (stored or {}).get("members")
            store.save_raw(f"union/{sid}", {**fresh, "members": members} if members else fresh)
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
