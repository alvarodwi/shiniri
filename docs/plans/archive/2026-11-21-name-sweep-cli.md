# Name sweep (cli tool) Implementation Plan

> **For agentic workers:** Execute natively in this session (root `CLAUDE.md`, Development flow
> step 3). Steps use checkbox (`- [ ]`) syntax for tracking. Don't commit; the owner commits at
> merge. Stop after the checks pass; never start a review.

**Goal:** `uv run python tools/names.py [spreadsheet_id]` prints every name in the gacha tabs' name
columns that isn't a `name` in `NikkeDatabase`, with its cell, so the owner fixes cells by hand.

**Architecture:** One dev-only script `cli/tools/names.py`, like `tools/assets.py`. A pure
`sweep(database, tabs)` turns sheet values into report lines; `report(api)` does the reads through
`HttpSheets.get_values`; `main` loads the config and prints. Read-only: no `write_rows`, no
`AuditLog` row, no `batch_update`.

**Tech Stack:** Python 3.14, uv, pytest, httpx. Run everything from `cli/`.

**Spec:** `docs/superpowers/specs/2026-11-21-name-sweep-cli-design.md` (roadmap:
`docs/superpowers/specs/2026-11-21-gacha-tracker-design.md`).

## Global Constraints

- Tabs and headers, verbatim, in this order (tab order is the report order):
  - `Social`: `SSR Details`
  - `Event`: `Rate-Up Name`, `SSR Details`
  - `Ordinary`: `SSR Details`
  - `Molds`: `result`
  - `SpareBody`: `Target`
  - `Other`: `SSR Details`
- Database tab: `NikkeDatabase`; `nameCode` is column A, `name` is column B. Row 1 is the header.
- Config key: `gacha_spreadsheet_id` in `config/sheets.json`; key file
  `config/service-account.json`.
- Output strings, exactly (two spaces between fields):
  - unknown: `<Tab>!<col><row>  <part>` plus `  (closest: <name>)` when there is one
  - missing column: `<Tab>: no column "<header>"`
  - read failure of a tab: `<Tab>: <SheetsError text>`
  - duplicate database name: `NikkeDatabase: duplicate name <name> (<code>, <code>)`
  - summary, always last: `<N> unknown names in <M> cells`
  - no config: `no gacha_spreadsheet_id in config/sheets.json; pass a spreadsheet id`
- Header match is exact (case and spaces). Name match is exact (case included). Never guess new
  header names; a renamed header just prints the missing-column line.
- Never writes to any sheet. No new dependencies (`difflib` is stdlib).

## Review Focus

1. No write call anywhere in `names.py` (only `get_values`).
2. Cell refs are right: row numbers are 1-based sheet rows, column letters come from
   `column_letter` (`src/shiniri_cli/sheets.py`), not hardcoded.
3. A cell with two unknown parts counts 2 names, 1 cell.
4. One tab failing to read (missing on prod, API error) doesn't stop the other tabs.
5. Ragged rows (the API drops trailing blank cells) don't raise `IndexError`.

---

### Task 1: `tools/names.py` and its tests

**Files:**
- Create: `cli/tools/names.py`
- Test: `cli/tests/test_names.py`

**Interfaces:**
- Consumes: `HttpSheets`, `SheetsError`, `service_account_token`, `column_letter` from
  `shiniri_cli.sheets`. `pyproject.toml` already has `pythonpath = ["tools"]`, so tests
  `import names`.
- Produces: `COLUMNS: dict[str, tuple[str, ...]]`, `sweep(database, tabs) -> list[str]`,
  `report(api) -> list[str]`, `main(argv=None) -> int`.

- [ ] **Step 1: write the failing tests** in `cli/tests/test_names.py`:

```python
import names
from shiniri_cli.sheets import SheetsError

DB = [["nameCode", "name"], ["5118", "Asuka"], ["5069", "Rei"], ["5119", "Rei"], ["5001", "Anis"],
      ["5002", "Crown"]]


def test_unknown_part_with_cell_and_closest():
    tabs = {"Molds": [["date", "moldtype", "amount", "ssr", "result"],
                      ["2023-06-30", "Yellow Mold", "5", "2", "Anis, Crwn\nAsuka"],
                      ["2023-07-01", "Purple Mold", "3", "0", ""],
                      ["2023-07-02", "Purple Mold", "3", "0"]]}  # ragged: trailing blank dropped
    lines = names.sweep(DB, tabs)
    assert lines[0] == "Molds!E2  Crwn  (closest: Crown)"
    assert lines[-1] == "1 unknown names in 1 cells"


def test_no_closest_when_nothing_is_near():
    lines = names.sweep(DB, {"SpareBody": [["Date", "Target"], ["", ""], ["2023-03-09", "Zzzzzz"]]})
    assert lines[0] == "SpareBody!B3  Zzzzzz"


def test_event_row_order_then_column_order():
    tabs = {"Event": [["Date", "Rate-Up Name", "Rate-Up Type", "Resources Used", "", "Times", "Total \nSSR",
                       "SSR Details"],
                      ["", "", "", "Gems", "Tix"],
                      ["2023-06-30", "Asuka Shikinami Langley", "Collab", "", "10", "10", "2",
                       "Asuka Shikinami Langley, Eve"]]}
    lines = names.sweep(DB, tabs)
    assert [l.split("  ")[0] for l in lines[:3]] == ["Event!B3", "Event!H3", "Event!H3"]
    assert lines[-1] == "3 unknown names in 2 cells"


def test_missing_header_goes_on():
    tabs = {"Event": [["Date", "rateUpName", "SSR Details"], ["2023-06-30", "Nope", "Eve"]],
            "Other": [["Date", "SSR Details"], ["2022-11-08", "Anis"]]}
    lines = names.sweep(DB, tabs)
    assert lines[0] == 'Event: no column "Rate-Up Name"'
    assert lines[1].startswith("Event!C2  Eve")
    assert lines[-1] == "1 unknown names in 1 cells"


def test_duplicate_database_names():
    lines = names.sweep(DB, {})
    assert lines == ["NikkeDatabase: duplicate name Rei (5069, 5119)", "0 unknown names in 0 cells"]


class FakeApi:
    def __init__(self, values):
        self.values = values
        self.ranges = []

    def get_values(self, range_, unformatted=False):
        self.ranges.append(range_)
        v = self.values.get(range_)
        if v is None:
            raise SheetsError("Sheets API 400: Unable to parse range")
        return v


def test_report_reads_every_tab_and_keeps_going():
    api = FakeApi({"'NikkeDatabase'": DB, "'Social'": [["Date", "Times", "Total SSR", "SSR Details"],
                                                       ["2023-06-17", "1", "1", "Asuk"]]})
    lines = names.report(api)
    assert api.ranges == ["'NikkeDatabase'", "'Social'", "'Event'", "'Ordinary'", "'Molds'", "'SpareBody'",
                          "'Other'"]
    assert "Social!D2  Asuk  (closest: Asuka)" in lines
    assert "Event: Sheets API 400: Unable to parse range" in lines
    assert lines[-1] == "1 unknown names in 1 cells"


def test_report_stops_when_database_unreadable():
    assert names.report(FakeApi({})) == ["NikkeDatabase: Sheets API 400: Unable to parse range"]
```

- [ ] **Step 2: run them, expect failure** (`ModuleNotFoundError: No module named 'names'`):
  `uv run pytest tests/test_names.py`

- [ ] **Step 3: write `cli/tools/names.py`:**

```python
"""Name sweep: every name in the gacha tabs that isn't a `name` in NikkeDatabase. Read-only.

uv run python tools/names.py [spreadsheet_id]   (default: gacha_spreadsheet_id in config/sheets.json)
"""

import difflib
import json
import re
import sys
from pathlib import Path

import httpx

from shiniri_cli.sheets import HttpSheets, SheetsError, column_letter, service_account_token

CONFIG = Path(__file__).resolve().parents[1] / "config"
DATABASE = "NikkeDatabase"
COLUMNS = {  # tab -> name columns, by row-1 header text; dict order is report order
    "Social": ("SSR Details",),
    "Event": ("Rate-Up Name", "SSR Details"),
    "Ordinary": ("SSR Details",),
    "Molds": ("result",),
    "SpareBody": ("Target",),
    "Other": ("SSR Details",),
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
                bad = [p for p in (s.strip() for s in re.split(r"[,\n]", _cell(row, c))) if p and p not in codes]
                cells += bool(bad)
                unknown += len(bad)
                for p in bad:
                    near = difflib.get_close_matches(p, known, n=1)
                    hint = f"  (closest: {near[0]})" if near else ""
                    lines.append(f"{tab}!{column_letter(c + 1)}{r}  {p}{hint}")
    lines += [f"{DATABASE}: duplicate name {n} ({', '.join(c)})" for n, c in codes.items() if len(c) > 1]
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
        sheet_id = args[0] if args else json.loads((CONFIG / "sheets.json").read_text(encoding="utf-8"))[
            "gacha_spreadsheet_id"]
    except (OSError, ValueError, KeyError):
        print("no gacha_spreadsheet_id in config/sheets.json; pass a spreadsheet id")
        return 1
    with httpx.Client() as http:
        lines = report(HttpSheets(sheet_id, service_account_token(CONFIG / "service-account.json"), http))
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: run the tests, expect pass:** `uv run pytest tests/test_names.py`, then the full
  `uv run pytest`. Expected: all pass.

### Task 2: README

**Files:** Modify `cli/README.md`.

- [ ] After the `## Image assets (dev machine only)` section, add:

```
## Name sweep (dev machine only)

`uv run python tools/names.py` lists every name in the gacha tabs (`Social`, `Event`, `Ordinary`,
`Molds`, `SpareBody`, `Other`) that isn't a `name` in `NikkeDatabase`, one line per cell part, with
the closest known name. It only reads. It sweeps `gacha_spreadsheet_id` from `config/sheets.json`;
pass another spreadsheet id to sweep that one instead (e.g. prod). Fix the cells by hand and rerun.
```

- [ ] In `## Where things live`, change the `tools/` line to:
  `tools/                   dev-only scripts (assets.py, items.json, names.py), never used by watch`

### Checks

- [ ] `uv run pytest` from `cli/`: all pass.
- Owner pre-merge check: `uv run python tools/names.py` from `cli/` against the test copy. Expected:
  about 15 unknown cells (collab full names, `E.H`, `Eve`, `Belora: Pumpkin Witch`), the
  `Rei` and `Sakura` duplicate lines, and a summary line last.

## Review 1

Reviewed the uncommitted `feat/name-sweep` working tree against the spec and plan. Matches the plan,
read-only (only `get_values`), `uv run pytest` passes (222). One finding.

1. **Important: `closest:` is blank for the collab full names, the main real case.**
   `difflib.get_close_matches` with its default cutoff 0.6 returns nothing for
   `Asuka Shikinami Langley` (ratio to `Asuka` ≈ 0.36) or `Rei Ayanami (Tentative Name)`. The spec's
   own example `Event!B7  Asuka Shikinami Langley  (closest: Asuka)` can't happen. The plan's test
   used `Asuk`, so it never caught this (plan gap).
   - [ ] In `sweep` (`cli/tools/names.py`), replace the `near = ...` line with a fallback to the
     longest known name that is the part's leading word(s):
     ```python
     near = difflib.get_close_matches(p, known, n=1) or sorted(
         (k for k in known if p.startswith(k + " ")), key=len, reverse=True)[:1]
     ```
   - [ ] Add to `cli/tests/test_names.py`:
     ```python
     def test_closest_falls_back_to_leading_name():
         lines = names.sweep(DB, {"SpareBody": [["Date", "Target"], ["2023-03-09", "Asuka Shikinami Langley"],
                                                ["2023-03-10", "Rei Ayanami (Tentative Name)"]]})
         assert lines[:2] == ["SpareBody!B2  Asuka Shikinami Langley  (closest: Asuka)",
                              "SpareBody!B3  Rei Ayanami (Tentative Name)  (closest: Rei)"]
     ```
   - [ ] `uv run pytest` from `cli/`. Expected: all pass (223).

Declined (no change):
- `main` returns 0 when `NikkeDatabase` can't be read: the error line is printed, the owner reads the
  output, and nothing wraps the script.
- Raw traceback on a missing `config/service-account.json` or network error: dev tool, same as
  `tools/assets.py`.
- `Rate-Up Name` values with ` and ` or parentheses show as unknown: intended, the owner fixes them.
- `Eve`, `Belora: Pumpkin Witch` stay unknown: per spec, out of scope.

## Review 2

Reviewed the whole uncommitted `feat/name-sweep` tree again. Review 1's fix is in as written;
`uv run pytest` passes (223). Hints checked on the real unknowns: `Asuka Shikinami Langley` → `Asuka`,
`Rei Ayanami (Tentative Name)` → `Rei (Tentative Name)`, `Rei Ayanami` → `Rei`,
`Mari Makinami Illustrious` → `Mari`, `Little Mermaid (Siren)` → `Little Mermaid`, `E.H` → `E.H.`,
`Belora: Pumpkin Witch` → none. Still read-only, no hardcoded rows.

No findings to fix. Ready to merge once the owner's pre-merge run looks right.

Declined (no change):
- `Asuka Shikinami Langley: Wille` hints `Asuka`, not `Asuka: WILLE`: the hint is advisory, the owner
  sees the full text, and handling the `:` suffix is more code for one cell.
- Possible false close match against the full ~200-name database: advisory only; the pre-merge run
  shows it if it happens.
