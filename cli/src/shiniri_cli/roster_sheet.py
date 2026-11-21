"""RosterLog tab of the gacha sheet: a row whenever a Nikke's copy count (1 + grade + core) differs from its
last logged row. The current roster is the last row per nameCode."""

import httpx

from .fetch import AREA_ID, api_call
from .sheets import SheetsApi, SheetsError, _checked, write_rows

TAB = "RosterLog"
FORM = "cli-roster-log"
HEADERS = ("date", "nameCode", "name", "copies")


def _int(v) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


def _whole(v) -> int | None:
    """A whole number however it was typed or read back (`5075.0`, `"5075"`); None for anything else."""
    if isinstance(v, bool):
        return None
    try:
        f = float(v)
        return int(f) if f.is_integer() else None
    except (TypeError, ValueError, OverflowError):
        return None  # something typed by hand


def logged_copies(values: list[list]) -> dict[int, int]:
    """nameCode -> copies of its last row below the header; rows without both as whole numbers are skipped."""
    out = {}
    for row in values[1:]:
        code, copies = (_whole(row[i]) if i < len(row) else None for i in (1, 3))
        if code is not None and copies is not None:
            out[code] = copies
    return out


def database_names(values: list[list]) -> dict[int, str]:
    """nameCode -> name from NikkeDatabase A:B; rows with a bad code or a blank name are skipped."""
    out = {}
    for row in values[1:]:
        code = _whole(row[0]) if row else None
        name = str(row[1]).strip() if len(row) > 1 else ""
        if code is not None and name:
            out[code] = name
    return out


def roster_rows(characters: list, names: dict[int, str], logged: dict[int, int],
                day: str) -> tuple[list[list], list[str]]:
    """Rows [day, nameCode, name, copies] sorted by nameCode, only where copies differs from `logged`, the
    first of a repeated name_code winning, plus a note per skipped entry (invalid, or not in `names`)."""
    found, notes = {}, []
    for i, c in enumerate(characters):
        c = c if isinstance(c, dict) else {}
        code, grade, core = c.get("name_code"), c.get("grade"), c.get("core")
        if not (_int(code) and _int(grade) and 0 <= grade <= 3 and _int(core) and 0 <= core <= 7):
            notes.append(f"entry {i}")
        elif code in found:
            continue
        elif code not in names:
            found[code] = None
            notes.append(f"{code} not in NikkeDatabase")
        else:
            found[code] = 1 + grade + core
    rows = [[day, code, names[code], copies] for code, copies in sorted(found.items())
            if copies is not None and copies != logged.get(code)]
    return rows, notes


async def sync_roster_log(client: httpx.AsyncClient, openid: str, api: SheetsApi, *, day: str,
                          timestamp: str) -> str:
    """Append the Nikkes whose copy count changed in one block; the log line. Never raises."""
    try:
        resp = await api_call(client, "GetUserCharacters", {"intl_open_id": openid, "nikke_area_id": AREA_ID})
        if resp.get("code") != 0:
            raise SheetsError(f"code {resp.get('code')}" + (f": {resp['msg']}" if resp.get("msg") else ""))
        characters = (resp.get("data") or {}).get("characters")
        if not characters or not isinstance(characters, list):
            raise SheetsError("no characters")
        _checked(api, TAB, HEADERS)  # a renamed header shows up even on a run that writes nothing
        names = database_names(api.get_values("'NikkeDatabase'!A:B", unformatted=True))
        logged = logged_copies(api.get_values(f"'{TAB}'!A:D", unformatted=True))
        rows, notes = roster_rows(characters, names, logged, day)
        if rows:
            write_rows(api, TAB, HEADERS, rows, form=FORM, timestamp=timestamp)
        return f"{TAB} +{len(rows)}" + (f" (skipped {', '.join(notes)})" if notes else "")
    except SheetsError as e:
        return f"{TAB}: {e}"
    except Exception as e:
        return f"{TAB}: {type(e).__name__}: {e}"
