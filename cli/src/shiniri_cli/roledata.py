"""Roledata: the per-Nikke detail files, stored raw under data/raw/json/roledata/."""

import asyncio

import httpx

from .fetch import CDN_HEADERS, ROLEDATA_PATH, cdn_url
from .store import Store


def raw_name(rid: int) -> str:
    return f"roledata/{rid}"


def resource_ids(store: Store) -> list[int]:
    seen: dict[int, None] = {}
    for n in store.load_raw("nikke_list_en", []):
        rid = n.get("resource_id") if isinstance(n, dict) else None
        if isinstance(rid, int):
            seen.setdefault(rid)
    return list(seen)


def missing_ids(store: Store) -> list[int]:
    return [r for r in resource_ids(store) if store.load_raw(raw_name(r)) is None]


def costume_entries(data: dict) -> list[dict]:
    if not isinstance(data, dict):  # a body that parsed but is not a roledata object
        return []
    return [
        c
        for c in data.get("character_costume_list") or []
        if isinstance(c, dict)
        and not c.get("is_hidden")
        and all(isinstance(c.get(k), int) for k in ("id", "resource_id", "costume_index"))
    ]


def image_path(costume: dict) -> str:
    return f"character/mi/mi_c{costume['resource_id']:03}_{costume['costume_index']:02}_s.webp"


async def fetch_roledata(
    store: Store, client: httpx.AsyncClient, *, force: bool, limit: int = 4
) -> str:
    """Fetch the roledata files that are missing (all when `force`). Never raises."""
    ids = resource_ids(store) if force else missing_ids(store)
    gate = asyncio.Semaphore(limit)

    async def one(rid: int) -> bool:
        async with gate:
            try:
                resp = await client.get(
                    cdn_url(ROLEDATA_PATH.format(resource_id=rid)),
                    headers=CDN_HEADERS,
                    timeout=30.0,
                )
                resp.raise_for_status()
                data = resp.json()
                if not isinstance(data, dict):
                    raise ValueError("not an object")
                store.save_raw(raw_name(rid), data)
                return True
            except (httpx.HTTPError, ValueError, OSError):
                return False

    done = await asyncio.gather(*(one(r) for r in ids))
    failed = done.count(False)
    # Marked even when some failed: a missing file is retried as missing, and a failure that never clears
    # must not make every hourly check a full re-download.
    store.mark("roledata")
    line = f"roledata new {done.count(True)}"
    return f"{line} · failed {failed}" if failed else line


def needs_full_refresh(store: Store, day: str) -> bool:
    return store.state().get("roledata", "")[:10] != day
