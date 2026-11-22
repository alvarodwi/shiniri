"""Name sweep: every name in the gacha tabs that isn't a `nikke` in NikkeDatabase. Read-only.

uv run python tools/names.py [spreadsheet_id]   (default: gacha_spreadsheet_id in config/sheets.json)
"""

import difflib
import json
import re
import sys
from pathlib import Path

import httpx

from shiniri_cli.sheets import (
    HttpSheets,
    SheetsError,
    column_letter,
    service_account_token,
)

CONFIG = Path(__file__).resolve().parents[1] / "config"
DATABASE = "NikkeDatabase"
COLUMNS = {  # tab -> name columns, by row-1 header text; dict order is report order
    "Social": ("ssrDetails",),
    "Event": ("rateUpName", "ssrDetails"),
    "Ordinary": ("ssrDetails",),
    "Mold": ("ssrDetails",),
    "Exchange": ("nikke",),
    "Extra": ("rateUpName", "ssrDetails"),
}


def _cell(row: list, i: int) -> str:
    return str(row[i]) if i < len(row) else ""  # the API drops trailing blank cells


def sweep(database: list[list], tabs: dict[str, list[list]]) -> list[str]:
    """Report lines for the tabs given (missing ones are skipped), duplicates, then the summary."""
    codes: dict[str, list[str]] = {}
    for row in database[1:]:
        if name := _cell(row, 1).strip():
            codes.setdefault(name, []).append(_cell(row, 0))
    known = sorted(codes)
    lines, unknown, cells = [], 0, 0
    for tab, headers in COLUMNS.items():
        if tab not in tabs:
            continue
        values = tabs[tab]
        top = values[0] if values else []
        cols = []
        for h in headers:
            if h in top:
                cols.append(top.index(h))
            else:
                lines.append(f'{tab}: no column "{h}"')
        for r, row in enumerate(values[1:], start=2):
            for c in cols:
                bad = [
                    p
                    for p in (s.strip() for s in re.split(r"[,\n]", _cell(row, c)))
                    if p and p not in codes
                ]
                cells += bool(bad)
                unknown += len(bad)
                for p in bad:
                    near = (
                        difflib.get_close_matches(p, known, n=1)
                        or sorted(
                            (k for k in known if p.startswith(k + " ")),
                            key=len,
                            reverse=True,
                        )[:1]
                    )
                    hint = f"  (closest: {near[0]})" if near else ""
                    lines.append(f"{tab}!{column_letter(c + 1)}{r}  {p}{hint}")
    lines += [
        f"{DATABASE}: duplicate name {n} ({', '.join(c)})"
        for n, c in codes.items()
        if len(c) > 1
    ]
    return lines + [f"{unknown} unknown names in {cells} cells"]


def report(api) -> list[str]:
    try:
        database = api.get_values(f"'{DATABASE}'")
    except SheetsError as e:
        return [f"{DATABASE}: {e}"]
    tabs, errors = {}, []
    for tab in COLUMNS:
        try:
            tabs[tab] = api.get_values(f"'{tab}'")
        except SheetsError as e:
            errors.append(f"{tab}: {e}")
    return errors + sweep(database, tabs)  # errors first, so the summary stays last


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    try:
        sheet_id = (
            args[0]
            if args
            else json.loads((CONFIG / "sheets.json").read_text(encoding="utf-8"))[
                "gacha_spreadsheet_id"
            ]
        )
    except OSError, ValueError, KeyError:
        print("no gacha_spreadsheet_id in config/sheets.json; pass a spreadsheet id")
        return 1
    with httpx.Client() as http:
        lines = report(
            HttpSheets(
                sheet_id, service_account_token(CONFIG / "service-account.json"), http
            )
        )
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
