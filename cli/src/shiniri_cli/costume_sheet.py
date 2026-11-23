"""CostumeDatabase tab of the gacha sheet: every costume the tab doesn't have yet, keyed on column A
(costumeId). `owned` is written once, at append time, from the costumes equipped on the account."""

import httpx

from .roledata import costume_entries, image_path, raw_name, resource_ids
from .roster_sheet import database_names, fetch_characters
from .sheets import SheetsApi, SheetsError, _checked, column_a, int_ids, write_rows
from .store import Store

TAB = "CostumeDatabase"
FORM = "cli-costume-database"
HEADERS = ("costumeId", "nikke", "costumeName", "grade", "source", "image", "owned")

# The text after "Obtained from " (lowercase, no trailing "."), confirmed by the owner. Anything not
# listed stays blank for the owner to fill in by hand.
SOURCE_BY_PHRASE = {
    "the costume gacha": "Costume Gacha",
    "costume gacha": "Costume Gacha",
    "a mission pass": "Mission Pass",
    "mission pass": "Mission Pass",
    "an event pass": "Event Pass",
    "the costume shop": "Cash Shop",
    "a login event": "Login Reward",
    "login event": "Login Reward",
    "login event in memories of spring": "Login Reward",
}
PREFIX = "obtained from "


def source_for(description: str) -> str:
    last = description.rsplit("\n", 1)[-1].strip().lower()
    if not last.startswith(PREFIX):
        return ""
    return SOURCE_BY_PHRASE.get(last[len(PREFIX) :].rstrip("."), "")


def costume_rows(
    store: Store, names: dict[int, str], equipped: set[int]
) -> tuple[list[list], list[str]]:
    """Rows sorted by costumeId, the first of a repeated id winning, plus a note per Nikke missing from
    `names` (once) and per resource id without roledata."""
    code_of = {}
    for n in store.load_raw("nikke_list_en", []):
        if isinstance(n, dict):
            code_of.setdefault(n.get("resource_id"), n.get("name_code"))
    found, notes = {}, []
    for rid in resource_ids(store):
        data = store.load_raw(raw_name(rid))
        if data is None:
            notes.append(f"no roledata for {rid}")
            continue
        entries = costume_entries(data)
        code = code_of.get(rid)
        if code not in names:
            if entries:
                notes.append(f"{code} not in NikkeDatabase")
            continue
        for c in entries:
            found.setdefault(
                c["id"],
                [
                    c["id"],
                    names[code],
                    c.get("costume_name_locale", ""),
                    c.get("costume_grade_id", ""),
                    source_for(c.get("costume_description_locale") or ""),
                    image_path(c),
                    c["id"] in equipped,
                ],
            )
    return [found[i] for i in sorted(found)], notes


async def sync_costume_database(
    store: Store,
    client: httpx.AsyncClient,
    openid: str,
    api: SheetsApi,
    *,
    timestamp: str,
) -> str:
    """Append the costumes the tab is missing in one block; the log line. Never raises. Writes nothing when
    the roster call fails: a row written FALSE can never be corrected by the CLI."""
    try:
        characters = await fetch_characters(client, openid)
        equipped = {
            c["costume_id"]
            for c in characters
            if isinstance(c, dict)
            and isinstance(c.get("costume_id"), int)
            and not isinstance(c["costume_id"], bool)
            and c["costume_id"] > 0
        }
        _checked(api, TAB, HEADERS)
        names = database_names(api.get_values("'NikkeDatabase'!A:B", unformatted=True))
        rows, notes = costume_rows(store, names, equipped)
        have = int_ids(column_a(api, TAB))
        rows = [r for r in rows if r[0] not in have]
        if rows:
            write_rows(api, TAB, HEADERS, rows, form=FORM, timestamp=timestamp)
        return f"{TAB} +{len(rows)}" + (
            f" (skipped {', '.join(notes)})" if notes else ""
        )
    except SheetsError as e:
        return f"{TAB}: {e}"
    except Exception as e:
        return f"{TAB}: {type(e).__name__}: {e}"
