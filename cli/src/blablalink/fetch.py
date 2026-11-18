"""HTTP: cookie handling, the lineup fetcher for campaign and tower, CDN sync."""

import asyncio
import hashlib
import json
import random
from typing import Callable

import httpx

from .store import Store, atomic_write

AREA_ID = 85
AUTH_CODE = 300001  # {"code": 300001, "msg": "game not login"}
URLS = {
    "campaign": "https://api.blablalink.com/api/game/proxy/Game/GetMainQuestClearLineup",
    "tower": "https://api.blablalink.com/api/game/proxy/Game/GetCampaignStageCharacterInfo",
}
USER_AGENT = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
              "Chrome/154.0.0.0 Safari/537.36 Edg/154.0.0.0")
HEADERS = {
    "accept": "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/json",
    "origin": "https://www.blablalink.com",
    "referer": "https://www.blablalink.com/",
    "user-agent": USER_AGENT,
    "x-channel-type": "2",
    "x-language": "en",
    "x-common-params": json.dumps({
        "game_id": "16", "area_id": "global", "source": "pc_web", "intl_game_id": "29080",
        "language": "en", "env": "prod", "data_statistics_scene": "outer",
        "data_statistics_page_id": "https://www.blablalink.com/shiftyspad",
        "data_statistics_client_type": "pc_web", "data_statistics_lang": "en",
    }),
}
CDN_HEADERS = {"Referer": "https://www.blablalink.com/", "User-Agent": USER_AGENT}
CDN_HOST = "https://sg-tools-cdn.blablalink.com/"
# From the site's obfuscatedPath: one seed per folder depth.
PRIMES = (224737, 1000639, 2654435761, 2654435769, 1000621, 4294967291)
# Per-item paths for the investment feature (not synced yet).
ROLEDATA_PATH = "roledata/{resource_id}-v2-en.json"
CUBE_PATH = "equip/en/cube_{cube_id}.json"
FAVORITE_PATH = "equip/en/favorite_{favorite_id}.json"
REQUIRED_COOKIES = ("game_token", "game_openid")


class AuthError(Exception):
    pass


def parse_cookie(header: str) -> dict[str, str]:
    header = header.strip()
    if header.lower().startswith("cookie:"):
        header = header[len("cookie:"):]
    cookies = {}
    for part in header.split(";"):
        if "=" in part:
            k, v = part.split("=", 1)
            cookies[k.strip()] = v.strip()
    for key in REQUIRED_COOKIES:
        if not cookies.get(key):
            raise ValueError(f"cookie is missing {key}")
    return cookies


def save_cookie(store: Store, header: str) -> None:
    parse_cookie(header)
    atomic_write(store.config_dir / "cookie.txt", header.strip())


def load_cookie(store: Store) -> dict[str, str]:
    return parse_cookie((store.config_dir / "cookie.txt").read_text(encoding="utf-8"))


def make_client(cookies: dict[str, str]) -> httpx.AsyncClient:
    return httpx.AsyncClient(headers=HEADERS, cookies=cookies, timeout=12.0)


def campaign_targets(levels: list[dict], stored: set[int]) -> list[dict]:
    eligible = [s for s in levels if s.get("chapter_mod") in ("Normal", "Hard")
                and not (s.get("chapter_mod") == "Normal" and s.get("chapter_id") in (1, 2))]
    chapters: dict[tuple, list[dict]] = {}
    for s in eligible:
        chapters.setdefault((s.get("chapter_mod"), s.get("chapter_id")), []).append(s)
    gaps = set()
    for stages in chapters.values():
        idx = [i for i, s in enumerate(stages) if s["id"] in stored]
        if idx:
            # quick-cleared stages before a stored clear have no lineup to fetch
            gaps.update(s["id"] for s in stages[:max(idx)])
    return [s for s in eligible if s["id"] not in stored and s["id"] not in gaps]


def tower_targets(levels: list[dict], stored: set[int]) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for s in levels:
        if s["stage_id"] not in stored:
            out.setdefault(str(s.get("tower_type", "")).lower(), []).append(s)
    return {t: sorted(stages, key=lambda s: s.get("floor", 0)) for t, stages in out.items()}


async def fetch_lineup(client: httpx.AsyncClient, url: str, stage_id: int) -> tuple[str, dict | None]:
    for _ in range(3):
        try:
            resp = await client.post(url, json={"stage_id": stage_id, "area_id": AREA_ID}, timeout=12.0)
        except httpx.HTTPError:
            await asyncio.sleep(1.5)
            continue
        if resp.status_code == 429:
            await asyncio.sleep(10.0)
            continue
        if resp.status_code != 200:
            await asyncio.sleep(2.0)
            continue
        body = resp.json()
        if body.get("code") == AUTH_CODE:
            raise AuthError(body.get("msg", "game not login"))
        data = body.get("data")
        if body.get("code") != 0 or not isinstance(data, dict) or not data.get("list"):
            return "uncleared", None
        return "ok", data
    return "failed", None


async def fetch_clears(store: Store, source: str, client: httpx.AsyncClient,
                       on_progress: Callable[[str, int, int], None] = lambda *a: None,
                       delay: tuple[float, float] = (1.0, 2.0)) -> int:
    clears = store.load_clears(source)
    stored = {int(k) for k in clears}
    if source == "campaign":
        groups = {"campaign": campaign_targets(store.load_raw("campaign_level", []), stored)}
        stop_early = False
    else:
        groups = tower_targets(store.load_raw("tower_level", []), stored)
        stop_early = True
    id_key = "id" if source == "campaign" else "stage_id"
    total, done, new = sum(map(len, groups.values())), 0, 0
    for label, stages in groups.items():
        for s in stages:
            status, data = await fetch_lineup(client, URLS[source], s[id_key])
            done += 1
            on_progress(label, done, total)
            if status == "ok":
                clears[str(s[id_key])] = data
                store.save_clears(source, clears)  # save each clear so an interrupted run keeps its work
                new += 1
            elif status == "uncleared" and stop_early:
                done += len(stages) - stages.index(s) - 1
                on_progress(label, done, total)
                break
            await asyncio.sleep(random.uniform(*delay))
    return new


def _djb2(s: str, seed: int) -> int:
    h = seed
    for c in s:
        h = (h * 33 + ord(c)) & 0xFFFFFFFF
    return h - (1 << 32) if h >= 1 << 31 else h  # JS & yields a signed int32


def cdn_url(path: str) -> str:
    """The hashed CDN URL the site builds for a plain path like `stage/stage_list.json`."""
    path = path.lstrip("/")
    *folders, name = path.split("/")
    segs = []
    for p in PRIMES[:len(folders)]:
        r = (_djb2(path, p) % p + p) % p
        segs.append(f"{chr(97 + r // 26 % 26)}{chr(97 + r % 26)}-{r % 99:02d}")
    ext = name.split(".", 1)[1]
    return CDN_HOST + "/".join(segs + [f"{hashlib.md5(path.encode()).hexdigest()}.{ext}"])


async def sync_reference(store: Store, client: httpx.AsyncClient) -> dict[str, str]:
    sources = json.loads((store.config_dir / "sources.json").read_text(encoding="utf-8"))
    out = {}
    for name, url in sources.items():
        try:
            resp = await client.get(url, headers=CDN_HEADERS, timeout=30.0)
            resp.raise_for_status()
            fresh = resp.json()
        except (httpx.HTTPError, ValueError) as e:
            out[name] = f"failed: {type(e).__name__}"
            continue
        if fresh == store.load_raw(name):
            out[name] = "unchanged"
        else:
            store.save_raw(name, fresh)
            out[name] = "changed"
    return out
