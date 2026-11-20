"""Campaign and Tower tabs: one row per stage clear, appended when the sheet doesn't have it yet."""

import httpx

from .fetch import AuthError, fetch_clears
from .profile import WIB
from .sheets import SheetsApi, SheetsError, column_a, write_rows
from .store import SOURCES, Store

TABS = {"campaign": "Campaign", "tower": "Tower"}
FORM = "cli-clears"
_TAIL = ("stageName", "clearedAt", "recommendedCp", "teamCp", "synchroLevel",
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


def _ids(values: list) -> set[int]:
    out = set()
    for v in values[1:]:  # row 1 is the header
        try:
            out.add(int(float(v)))
        except (TypeError, ValueError, OverflowError):
            pass  # something typed by hand; not a stage id
    return out


def append_missing(api: SheetsApi, source: str, rows: list[list], *, timestamp: str) -> int:
    """Append the rows whose stageId isn't in the tab yet; the number written."""
    have = _ids(column_a(api, TABS[source]))
    new = [r for r in rows if r[0] not in have]
    if new:
        write_rows(api, TABS[source], HEADERS[source], new, form=FORM, timestamp=timestamp)
    return len(new)


async def sync_clears(store: Store, client: httpx.AsyncClient, api: SheetsApi, *, timestamp: str) -> str:
    """Fetch new clears, then append what each tab is missing. One tab's failure never stops the other, and
    a failed fetch still appends the clears already stored."""
    parts = []
    for source in SOURCES:
        tab = TABS[source]
        fetch_note = ""
        try:
            await fetch_clears(store, source, client)
        except AuthError as e:
            fetch_note = f" (fetch: cookie rejected: {e})"
        except httpx.HTTPError as e:
            fetch_note = f" (fetch: {type(e).__name__})"
        except Exception as e:  # a corrupt *_clears.json and the like: this tab only
            fetch_note = f" (fetch: {type(e).__name__}: {e})"
        try:
            rows = clear_rows(store.build_clears((source,)), source)
            parts.append(f"{tab} +{append_missing(api, source, rows, timestamp=timestamp)}{fetch_note}")
        except SheetsError as e:
            parts.append(f"{tab}: {e}{fetch_note}")
        except Exception as e:  # e.g. a corrupt *_clears.json: report it, keep the other tab going
            parts.append(f"{tab}: {type(e).__name__}: {e}{fetch_note}")
    return " · ".join(parts)
