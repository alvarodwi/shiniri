"""NikkeDatabase tab of the gacha sheet: every NIKKE the tab doesn't have yet, keyed on column A (nameCode)."""

from collections.abc import Callable

from .roledata import raw_name
from .sheets import SheetsApi, SheetsError, column_a, int_ids, write_rows
from .store import Store

TAB = "NikkeDatabase"
FORM = "cli-nikke-database"
HEADERS = (
    "nameCode",
    "nikke",
    "rarity",
    "manufacturer",
    "class",
    "burst",
    "element",
    "weapon",
    "resourceId",
    "releaseDate",
    "limited",
    "overspec",
)


def _int(v) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


def _overspec(data) -> bool | None:
    """None when there is no roledata to tell."""
    if not isinstance(data, dict):
        return None
    return data.get("corporation_sub_type") == "OVERSPEC"


def nikke_rows(
    nikkes: list, roledata: Callable[[int], object]
) -> tuple[list[list], list[str]]:
    """Rows in ascending `order` (no int `order` sorts last), the first of a repeated name_code winning, plus
    one `entry <index>` note per skipped entry (no usable name_code or name). `roledata` maps a resource_id to
    its file; the last cell is None where that file is missing."""
    kept, notes, seen = [], [], set()
    for i, n in enumerate(nikkes):
        n = n if isinstance(n, dict) else {}
        name = (n.get("name_localkey") or {}).get("name")
        if (
            not _int(n.get("name_code"))
            or not isinstance(name, str)
            or not name.strip()
        ):
            notes.append(f"entry {i}")
        elif n["name_code"] not in seen:
            seen.add(n["name_code"])
            kept.append(n)
    kept.sort(key=lambda n: (0, n["order"]) if _int(n.get("order")) else (1, 0))
    rows = [
        [
            n["name_code"],
            n["name_localkey"]["name"],
            n.get("original_rare", ""),
            n.get("corporation", ""),
            n.get("class", ""),
            n.get("use_burst_skill", ""),
            ((n.get("element_id") or {}).get("element") or {}).get("element", ""),
            ((n.get("shot_id") or {}).get("element") or {}).get("weapon_type", ""),
            n.get("resource_id", ""),
            "",
            n.get("corporation") == "ABNORMAL",  # seasonal limited is fixed by hand
            _overspec(roledata(n.get("resource_id"))),
        ]
        for n in kept
    ]
    return rows, notes


def sync_nikke_database(store: Store, api: SheetsApi, *, timestamp: str) -> str:
    """Append the NIKKEs the tab is missing in one block; the log line. Never raises."""
    try:
        rows, notes = nikke_rows(
            store.load_raw("nikke_list_en", []),
            lambda rid: store.load_raw(raw_name(rid)),
        )
        have = int_ids(column_a(api, TAB))
        rows = [r for r in rows if r[0] not in have]
        # Held, not written FALSE: an existing row is never edited. A later run adds it.
        held = [r[1] for r in rows if r[-1] is None]
        rows = [r for r in rows if r[-1] is not None]
        if rows:
            write_rows(api, TAB, HEADERS, rows, form=FORM, timestamp=timestamp)
        line = f"{TAB} +{len(rows)}"
        if held:
            line += f" (held {', '.join(held)}: no roledata)"
        return line + (f" (skipped {', '.join(notes)})" if notes else "")
    except SheetsError as e:
        return f"{TAB}: {e}"
    except Exception as e:
        return f"{TAB}: {type(e).__name__}: {e}"
