"""Campaign and Tower tabs: one row per stage clear, appended when the sheet doesn't have it yet."""

from typing import Callable

import httpx

from .fetch import AuthError, fetch_clears
from .profile import WIB
from .sheets import SheetsApi, SheetsError, column_a, int_ids, write_rows
from .store import SOURCES, Store, unknown_nikkes

TABS = {"campaign": "Campaign", "tower": "Tower"}
FORM = "cli-clears"
_TAIL = ("stageName", "dateCleared", "recommendedCp", "teamCp", "synchroLevel",
         "slot1", "slot2", "slot3", "slot4", "slot5")
HEADERS = {"campaign": ("stageId", "mode", "chapter", *_TAIL), "tower": ("stageId", "mode", "floor", *_TAIL)}


def clear_rows(clears: list[dict], source: str) -> list[list]:
    """That source's rows in header order, oldest clear first, clears without a time last."""
    picked = sorted((c for c in clears if c["source"] == source),
                    key=lambda c: (c["cleared_at"] is None, c["cleared_at"] and c["cleared_at"].timestamp()))
    place = "chapter" if source == "campaign" else "floor"
    rows = []
    for c in picked:
        at = c["cleared_at"]
        slots = {u["slot"]: u["name"] for u in c["team"]}
        rows.append([c["stage_id"], c["mode"], c[place], c["stage_name"],
                     f"'{at.astimezone(WIB):%Y-%m-%d %H:%M:%S}" if at else "",
                     c["recommended_cp"], c["team_cp"], c["synchro_level"],
                     *(slots.get(i, "") for i in range(1, 6))])
    return rows


def append_missing(api: SheetsApi, source: str, rows: list[list], *, timestamp: str,
                   log: Callable[[str], None] = lambda _: None) -> tuple[int, int]:
    """Append the rows whose stageId isn't in the tab yet; (rows written, rows held). New rows with an unknown
    NIKKE or stage are all held so the tab stays in clear order and never gets a fallback name."""
    tab = TABS[source]
    have = int_ids(column_a(api, tab))
    new = [r for r in rows if r[0] not in have]
    if not new:
        return 0, 0
    nikkes, stages = unknown_nikkes(new, 8), [r[0] for r in new if not r[3]]
    if nikkes or stages:
        reasons = ([f"{len(nikkes)} unknown NIKKE ({', '.join(nikkes)})"] if nikkes else []) + \
                  ([f"{len(stages)} unknown stages ({', '.join(map(str, stages))})"] if stages else [])
        log(f"{tab}: held {len(new)} rows, {', '.join(reasons)}")
        return 0, len(new)
    target = write_rows(api, tab, HEADERS[source], new, form=FORM, timestamp=timestamp)
    span = new[0][3] if len(new) == 1 else f"{new[0][3]} … {new[-1][3]}"
    log(f"{tab}: wrote {len(new)} rows, {target} ({span})")
    return len(new), 0


PROGRESS_EVERY = 50  # stages per progress line: only a first run after a wipe fetches that many


def _progress(tab: str, log: Callable[[str], None]) -> Callable[[str, int, int], None]:
    """fetch_clears' on_progress: a log line each time the count passes a multiple of PROGRESS_EVERY."""
    last = 0

    def report(_label: str, done: int, total: int) -> None:
        nonlocal last
        if done // PROGRESS_EVERY > last // PROGRESS_EVERY:
            log(f"{tab}: fetching {done}/{total}")
        last = done
    return report


async def sync_clears(store: Store, client: httpx.AsyncClient, api: SheetsApi, *, timestamp: str,
                      log: Callable[[str], None] = lambda _: None) -> str:
    """Fetch new clears, then append what each tab is missing. One tab's failure never stops the other, and
    a failed fetch still appends the clears already stored."""
    parts = []
    for source in SOURCES:
        tab = TABS[source]
        fetch_note = ""
        try:
            await fetch_clears(store, source, client, on_progress=_progress(tab, log))
        except AuthError as e:
            fetch_note = f" (fetch: cookie rejected: {e})"
        except httpx.HTTPError as e:
            fetch_note = f" (fetch: {type(e).__name__})"
        except Exception as e:  # a corrupt *_clears.json and the like: this tab only
            fetch_note = f" (fetch: {type(e).__name__}: {e})"
        try:
            rows = clear_rows(store.build_clears((source,)), source)
            written, held = append_missing(api, source, rows, timestamp=timestamp, log=log)
            parts.append(f"{tab} +{written}{f' (held {held})' if held else ''}{fetch_note}")
        except SheetsError as e:
            parts.append(f"{tab}: {e}{fetch_note}")
        except Exception as e:  # e.g. a corrupt *_clears.json: report it, keep the other tab going
            parts.append(f"{tab}: {type(e).__name__}: {e}{fetch_note}")
    return " · ".join(parts)
