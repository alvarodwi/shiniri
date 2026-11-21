# RosterLog tab (cli)

First step of the remaining-tabs work in `2026-11-21-gacha-tracker-design.md`. Small change.
Decided with the owner on 2026-11-21.

## Why

DupeTracker, overcore detection and AcquisitionLog all need to know how many copies of each Nikke
the owner has applied in game. The sheet is append-only, so the roster can't be a "current state"
table. It is a change log instead: a row only when a Nikke's copy count changes. The current roster
is the last row per Nikke.

The first run is the baseline every later count starts from. It must be taken while the owner holds
no unused dupes. That is true today (2026-11-21): every dupe has been applied and the 4th
anniversary pulls are over.

## What

`watch` calls `GetUserCharacters` every hourly check and appends, to the gacha sheet's `RosterLog`
tab, one row for each Nikke whose copy count differs from its last logged row.

Headers, in order (the owner creates the tab on both sheets):

| header | value |
| --- | --- |
| `date` | the game day of the check, as `game_day` gives it (my call: same day rule as the gacha forms, so later formulas compare like with like) |
| `nameCode` | `name_code` |
| `name` | the `name` for that `nameCode` in the `NikkeDatabase` tab |
| `copies` | 1 + `grade` + `core` (MLB = 4, C7 = 11) |

- Request: `api_call(client, "GetUserCharacters", {"intl_open_id": openid, "nikke_area_id": AREA_ID})`,
  rows in `data.characters`. Each entry has `name_code`, `grade` (0 to 3), `core` (0 to 7), `lv`,
  `combat` and `costume_id`. Only `name_code`, `grade` and `core` are used. The owner confirmed
  that `grade=3 core=0` is MLB, `grade=3 core=7` is C7, and that unowned Nikkes are not returned.
- `name` comes from the sheet's `NikkeDatabase`, not the local `nikke_list_en.json`. The owner
  renames collab names there by hand, and the gacha forms write those names, so later formulas can
  match RosterLog to AllPulls by name. A `name_code` that isn't in `NikkeDatabase` yet is skipped
  and named in the log line. It is written on a later check, once the database has it.
- Skip check: read `RosterLog` A:D. The last row for a `nameCode` (lowest on the sheet) is its
  logged count. Any entry whose `copies` differs is appended. This is keyed on `nameCode` plus
  `copies`, not on column A as the other writers are. Column A is always filled (the date), so
  `write_rows` works unchanged.
- An entry with a `grade` or `core` that isn't an int in range is skipped and noted in the log line.
- A Nikke missing from the response is never logged. Copies only go up in game, and an unowned
  Nikke isn't returned.
- All new rows go in one `write_rows` block, sorted by `nameCode`, with one `AuditLog` row.
  Form value: `cli-roster-log`. The first run writes the whole owned roster.
- Costume changes are ignored. `costume_id` may matter to CostumeGallery later, but logging it here
  would add rows with no change in copies.

## Placement and failure handling

- It runs in `_check` right after the `NikkeDatabase` sync, so a Nikke released this hour already
  has its name. Log line: `RosterLog +N`, plus any skipped entries.
- It needs the game cookies (blablalink) and the gacha spreadsheet. With no
  `gacha_spreadsheet_id`, the line is `RosterLog: no gacha_spreadsheet_id`.
- Any failure (auth, API answer without `characters`, an empty `characters` list, header mismatch,
  missing tab, sheet API error) becomes the line `RosterLog: <error>` and writes nothing. It never
  stops the progression writes. An empty list counts as a failure rather than "owns nothing".

## Approaches

- **A. Change log, append on change (picked).** Append-only, and safe to rerun: an unchanged roster
  writes nothing. The current state is the last row per Nikke, which a formula reads easily.
- B. A full dated snapshot every day: about 190 rows a day, mostly repeats.
- C. One row per Nikke, updated in place: breaks the append-only rule.

## Checks

`uv run pytest` against `FakeSheets` and `httpx.MockTransport`. Cases: the first run writes every
owned Nikke, a rerun writes nothing, one changed count writes one row, an unknown `nameCode` is
skipped, a bad entry is skipped, an empty `characters` list writes nothing. The real check is a
`watch` run on the homeserver.

## Manual sheet steps (test copy first, real sheet before the homeserver pulls `develop`)

1. Create tab `RosterLog` with headers `date`, `nameCode`, `name`, `copies`.
2. Don't pull any gacha between the first `watch` check and the end of that game day. AllPulls has
   no times, so a pull on the baseline day would show as a missed log in DupeTracker.

## Not in scope

The ui reading RosterLog (overcore on save), the AllPulls and DupeTracker formulas, AcquisitionLog.
Each gets its own spec.
