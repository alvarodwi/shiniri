"""Union and Roster tabs: each locked season written once, one block per season, keyed on column A."""

import httpx

from .fetch import AuthError, sync_reference
from .sheets import SheetsApi, SheetsError, column_a, int_ids, write_rows
from .store import Store
from .union import UnionData, build_union, fetch_union, is_final

TABS = {"union": "Union", "roster": "Roster"}
FORM = "cli-union"
HEADERS = {
    "union": ("season", "day", "mode", "level", "step", "boss", "bossElement", "memberId", "nickname", "damage",
              "finalHit", "slot1", "slot2", "slot3", "slot4", "slot5"),
    "roster": ("season", "memberId", "nickname", "level", "synchroLevel", "source"),
}


def _text(v) -> str:
    # writes are USER_ENTERED: the quote keeps 20-digit ids exact and a nickname like "=..." from running
    return f"'{v}"


def locked(u: UnionData) -> list[int]:
    return sorted(n for n, s in u.seasons.items()
                  if is_final({"fetched_ts": s["fetched_ts"] or 0}, {"end_ts": s["end_ts"] or 0}))


def union_rows(u: UnionData, n: int) -> list[list]:
    rows = []
    for h in (h for h in u.hits if h["season"] == n):
        slots = {s["slot"]: s["name"] for s in h["squad"]}
        rows.append([n, h["day"], h["mode"], h["level"], h["step"], h["boss"], h["boss_element"] or "",
                     _text(h["openid"]), _text(h["nickname"]), h["damage"], h["final"],
                     *(slots.get(i, "") for i in range(1, 6))])
    return rows


def roster_rows(u: UnionData, n: int) -> list[list]:
    members = u.seasons[n].get("members")
    if members:
        return [[n, _text(m["member_id"]), _text(m.get("nickname") or m["member_id"]), m.get("level", ""),
                 m.get("synchro_level", ""), "api"] for m in members]
    last = {}  # openid -> that season's last nickname, in first-hit order
    for h in u.hits:
        if h["season"] == n:
            last[h["openid"]] = h["nickname"]
    return [[n, _text(o), _text(name), "", "", "hits"] for o, name in last.items()]


def append_seasons(api: SheetsApi, kind: str, rows_by_season: dict[int, list[list]], *, timestamp: str) -> int:
    """Write each season the tab doesn't have yet, one block each; the number of seasons written."""
    have = int_ids(column_a(api, TABS[kind]))
    written = 0
    for n in sorted(rows_by_season):
        if n in have or not rows_by_season[n]:
            continue
        write_rows(api, TABS[kind], HEADERS[kind], rows_by_season[n], form=FORM, timestamp=timestamp)
        written += 1
    return written


async def sync_union(store: Store, client: httpx.AsyncClient, api: SheetsApi, *, timestamp: str, now: float) -> str:
    """Refresh raid_list and the stored seasons, then write the locked seasons each tab is missing. Never
    raises: a failed fetch still writes what's stored, and one tab's failure never stops the other."""
    note = ""
    try:
        async with httpx.AsyncClient() as cdn:  # its own client: the game cookies never go to the CDN host
            await sync_reference(store, cdn, names=("raid_list",))
        await fetch_union(store, client, now)
    except AuthError as e:
        note = f" (fetch: cookie rejected: {e})"
    except httpx.HTTPError as e:
        note = f" (fetch: {type(e).__name__})"
    except Exception as e:  # UnionError, a corrupt season file and the like
        note = f" (fetch: {type(e).__name__}: {e})"
    parts = []
    try:
        u = build_union(store, None, now)
        done = locked(u)
        rows = {"union": {n: union_rows(u, n) for n in done}, "roster": {n: roster_rows(u, n) for n in done}}
    except Exception as e:
        return f"Union: {type(e).__name__}: {e}{note}"
    for kind, tab in TABS.items():
        try:
            parts.append(f"{tab} +{append_seasons(api, kind, rows[kind], timestamp=timestamp)}{note}")
        except SheetsError as e:
            parts.append(f"{tab}: {e}{note}")
        except Exception as e:
            parts.append(f"{tab}: {type(e).__name__}: {e}{note}")
    return " · ".join(parts)
