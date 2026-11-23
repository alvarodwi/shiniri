# shiniri

NIKKE progress, logged into one Google Sheet by two parts:

- `ui/`: the web app. Vue SPA, browser OAuth, deployed by Cloudflare. See `ui/CLAUDE.md`.
- `cli/`: the Python CLI. Its `watch` runs on the owner's homeserver with a service account. See
  `cli/CLAUDE.md`.

Both write to the same sheet under the same contract. Some logic is duplicated between them on
purpose (TypeScript vs Python), and that's expected.

## State docs

`docs/state/` describes the code as it is now, one file per module (`ui-navigation.md` covers
routing, the Pulls page and the Log; `sheet-writer.md` covers both writers, the Sheets clients and
mock mode). Decisions worth not undoing are in `docs/decisions/`. Finished specs and plans go to `docs/plans/archive/`; read
them only for history.

## Sheet contract

- The Google Sheet is the only source of truth for logged data. Never add a server-side copy of
  it.
- Every write goes through one writer per part: `writeTabsAtEnd` in
  `ui/src/services/sheets/tabWriter.ts` and `write_rows` in `cli/src/shiniri_cli/sheets.py`. They
  are ports of each other. Each one:
  - checks headers,
  - finds the next empty row at call time,
  - checks that the target is empty,
  - does one `values:batchUpdate` carrying the data and its `AuditLog` row, so the audit row
    exists only if the write landed.
- Append-only: never update, clear, insert or delete existing cells. The one structural change
  allowed is appending blank rows at the bottom of a tab whose grid is too short. Blank rows left
  by a failed write are harmless.
- Each writer skips what the sheet already has, keyed on column A. A rerun must never duplicate
  rows.
- Never hardcode row numbers. The sheet is live data and grows daily.
- The owner edits the sheet by hand: new tabs, header rows, and fixes to logged rows. Neither part
  ever creates tabs or edits rows.
- Sheet strings (tab names, headers, `source` values, slot names) must match the sheet
  verbatim. Ask for the exact text when unsure, never guess.
- Headers of tabs either part writes to are lowerCamelCase with no spaces (`bossElement`,
  `damage`). The owner renames old headers by hand, on both the real sheet and the copy.

## Contract changes and releases

A change to the sheet contract (write behaviour, headers, tab names) updates `ui/` and `cli/` on
the same branch, under one spec. Say plainly when a change needs a manual sheet step, and that the
real sheet needs it before release.

Releases are web-only; see `ui/CLAUDE.md`. The CLI ships by the homeserver pulling `develop`.

## Formatting

Prettier runs from `ui/` and covers only `ui/`. Root docs and Markdown aren't formatted.
