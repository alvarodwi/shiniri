# Name sweep (cli tool)

Step 2 of `2026-11-21-gacha-tracker-design.md`. Small change.

## Why

The gacha pages (step 5) pick names from `NikkeDatabase`, and the dashboard will join logged rows on
those names. Old hand-typed rows must match first. The owner fixes cells by hand; the sweep only
says which cells, so nobody checks them one by one. It is rerun after each fix round.

## What

`uv run python tools/names.py [spreadsheet_id]`, run from `cli/` on the owner's machine. Read-only:
it never writes, not even an `AuditLog` row. Default spreadsheet is `gacha_spreadsheet_id` in
`config/sheets.json` (the test copy on the laptop); pass prod's id to sweep prod. (My call.)

Columns, found by their row-1 header text (verbatim, as both sheets have them today):

| tab | headers |
| --- | --- |
| `Social` | `SSR Details` |
| `Event` | `Rate-Up Name`, `SSR Details` |
| `Ordinary` | `SSR Details` |
| `Molds` | `result` |
| `SpareBody` | `Target` |
| `Other` | `SSR Details` |

- A cell is split on commas and newlines, each part trimmed; blank parts and blank cells are skipped.
  Rows 2 down are read (row 2 of the 2-row-header tabs is blank in these columns).
- A part is unknown when it is not exactly (case included) a `name` in `NikkeDatabase` (column B).
- Output, one line per unknown part, in tab order then row order:
  `Event!B7  Asuka Shikinami Langley  (closest: Asuka)`. `closest` comes from stdlib
  `difflib.get_close_matches` and is left off when there is none. (My call.)
- Then one line per name that appears on more than one `NikkeDatabase` row, with its `nameCode`s
  (today `Rei`: 5069, 5119), since the pickers and the dashboard can't tell those apart. (My call.)
- Last line: `<N> unknown names in <M> cells`.
- A header not found (e.g. after the owner renames it) prints `<tab>: no column "<header>"` and the
  sweep goes on. Headers get updated in the script when the owner renames them; exact new names are
  asked for then, never guessed.

## Approaches

- **A. `tools/` script (picked).** Same pattern as `tools/assets.py`: dev-only, never imported by
  `watch`. Reuses `HttpSheets` and `service_account_token` from `shiniri_cli.sheets`.
- B. Shell command: the shell has no sheet access today; wiring it costs more than the check.
- C. `watch` log line: details would land in the homeserver's `watch.log`, awkward to fix from.

## Known findings (test copy, 2026-11-21)

About 15 unknown cells, nearly all collab full names (`Asuka Shikinami Langley`,
`Rei Ayanami (Tentative Name)`, `Little Mermaid (Siren)`, `E.H`). `Eve` and `Belora: Pumpkin Witch`
are not in `nikke_list_en.json` at all, so renaming can't fix them; they stay in the report until the
source has them.

## Builder notes

- Split the logic into a pure function (database rows + tab values in, report lines out) tested in
  `tests/test_names.py` (pytest already has `pythonpath = ["tools"]`); `main` does the reads.
- Check: `uv run pytest` from `cli/`. Owner pre-merge check: run the script against the test copy.

## Not in scope

Fixing cells, adding missing Nikkes to `NikkeDatabase`, release dates, any ui change.
