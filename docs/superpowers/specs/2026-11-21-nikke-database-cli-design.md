# NikkeDatabase tab (cli)

Step 1 of `2026-11-21-gacha-tracker-design.md`. Small change.

## Why

The gacha pages need a Nikke list to pick from so logged names always match, and it replaces the
hand-kept `NikkeRoster` metadata. The cli already syncs the source file every `watch` check.

## What

`watch` appends every Nikke the `NikkeDatabase` tab of the gacha spreadsheet doesn't have yet,
right after its reference sync. Rows come from `data/raw/json/nikke_list_en.json` (synced from
`character/en/nikke_list_en_v2.json`, 207 entries today: SSR, SR and R, all included).

Headers, in order (the owner creates the tab and header row on both sheets):

| header | source field |
| --- | --- |
| `nameCode` | `name_code` (column A key, unique per Nikke) |
| `name` | `name_localkey.name` |
| `rarity` | `original_rare` |
| `manufacturer` | `corporation` |
| `class` | `class` |
| `burst` | `use_burst_skill` |
| `element` | `element_id.element.element` |
| `weapon` | `shot_id.element.weapon_type` |
| `resourceId` | `resource_id` |
| `releaseDate` | always written blank; the owner fills it |

- Values are written as the raw file has them (`ELYSION`, `Step1`), no translation. Display mapping
  belongs to the ui. (My call: one source of truth, nothing to keep in sync.)
- Rows are written in ascending `order`, all missing rows in one `write_rows` block with one
  `AuditLog` row. The first run fills all 207. (My call.)
- An entry without a usable `name_code` or name is skipped and named in the log line, never written.
- Append-only: a renamed or changed Nikke is never updated; that's a manual sheet fix.

## Config and failure handling

- `config/sheets.json` gains `gacha_spreadsheet_id`. Missing key: the check logs
  `NikkeDatabase: no gacha_spreadsheet_id` and goes on; progression writes are unaffected.
- The gacha sheet has its own `AuditLog` tab (headers `savedAt`, `form`, `ranges`, `rows`, as on
  progression). Form value: `cli-nikke-database`.
- It runs every hourly check, right after the `sync:` line, and logs its own line:
  `NikkeDatabase +N`. It is not tied to the daily profile write (clears and union only run once the
  day is written, which would delay the first fill by up to a day).
- Any failure on the gacha sheet (header mismatch, missing tab, API error) is that line's text
  (`NikkeDatabase: <error>`) and never stops the progression writes.

## Approaches

- **A. `watch` appends after each reference sync (picked).** New Nikkes land without the owner
  doing anything; same pattern as the clears and union writers.
- B. A shell command only: the owner must remember it on every release.
- C. A `tools/` script: ties live sheet data to the owner's laptop.

No separate shell command: `watch` checks on start, so restarting it does the first fill. (My call.)

## Manual sheet steps (test copy first, prod before the homeserver pulls)

1. Create tab `NikkeDatabase` with the header row above.
2. Create tab `AuditLog` with `savedAt`, `form`, `ranges`, `rows`.
3. Share the sheet with the service account (test copy).
4. Add `gacha_spreadsheet_id` to the homeserver's `config/sheets.json`.

## Not in scope

The name sweep, release dates, ui wiring (steps 2 to 5 of the roadmap).
