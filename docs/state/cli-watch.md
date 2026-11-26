# CLI watch

## Purpose

`shiniri-cli watch` is the unattended loop on the owner's homeserver. It checks at once, then at
every :59 WIB, and logs one result per check. It refreshes reference files, writes the daily
`Profile` row, and appends clears, union seasons and gacha-sheet databases. It never creates tabs or
edits rows (see `../../CLAUDE.md`).

## Public surface

- Entry: `run` in `cli/src/shiniri_cli/cli.py` (script `shiniri-cli`, `cli/pyproject.toml`). The
  argument `watch` installs a SIGTERM handler that raises `KeyboardInterrupt`, then calls
  `profile.watch(Store(root))`. Any other argument opens the interactive shell (`main`).
- `watch` in `cli/src/shiniri_cli/profile.py`. Loop, `log` and `stopped` line. Takes `sleep`, `clock`
  and `once` for tests.
- `_check`, one pass: `refresh_reference`, then the Sheets and Blablalink clients, then `check_once`,
  then the gacha-sheet steps.
- `check_once`: the daily guard, fetch, `build_row`, write, then the clears hook.
- Daily row: `build_row`, `PROFILE_HEADERS`, `PROFILE_TAB`, `FORM` (all `profile.py`).
- Day and time: `game_day`, `is_last_check`, `next_check`, `wib_timestamp`, `WIB`, `RESET`.
- Sheet steps (each returns a log line):
  - `sync_clears` in `clear_sheet.py`: `Campaign` and `Tower`.
  - `sync_union` in `union_sheet.py`: `UnionRaid` and `UnionRoster`.
  - `sync_nikke_database` in `nikke_sheet.py`: `NikkeDatabase`.
  - `sync_roster_log` in `roster_sheet.py`: `RosterLog`.
  - `sync_costume_database` in `costume_sheet.py`: `CostumeDatabase`.
- Reference files: `sync_reference` (`fetch.py`) and `fetch_roledata` (`roledata.py`), called by
  `refresh_reference`.
- Run scripts: `cli/start.sh` and `cli/stop.sh`.

## Invariants and rules

- One check order, every hour: `refresh_reference`; `check_once` (daily row, then clears and union
  only after the day is written); then `NikkeDatabase`, `RosterLog`, `CostumeDatabase`. Profile,
  clears and union all read the reference files, so refresh comes first. `test_profile.py`
  (`test_check_joins_clears_and_union`, `test_check_logs_roster_after_nikke_database`).
- A check never kills the loop. `watch` catches `Exception` per check and logs
  `check failed: <Type>: <msg>`. Each sheet step catches its own errors and returns a log line.
  `test_cli.py` (`test_watch_logs_missing_config_and_keeps_going`).
- Ctrl+C and SIGTERM both log `stopped` and return. `test_watch_stops_cleanly_on_interrupt`.
- The game day starts at 03:00 WIB. All times use the fixed `WIB` offset, never the machine zone.
  `test_game_day_rolls_at_3am_wib`.
- Daily row timing: written when `daily_mission_received_points >= 100`, or at the 02:59 check
  regardless, with `dailyDone` false. `test_last_check_writes_unfinished_day`.
- Daily guard `data/daily.json` holds `{day, written, progress?}`. Once `written` is true the rest of
  that day's checks return `already written` and run no sheet step except the gacha-sheet ones. A
  missing, corrupt or old-day file is a fresh day. `test_corrupt_guard_is_a_fresh_day`.
- `write` goes through `write_row` with `unless_last_a=day`, so a day the sheet already has is
  marked written and not duplicated. `test_duplicate_marks_written`. A write failure leaves the guard
  unset, so the next hour retries. `test_write_failure_is_logged_and_retried_next_hour`.
- Clears and union errors are a log suffix and never undo the profile row (`_run_clears`).
  `test_clears_error_keeps_profile_result`.
- Held rows: `Campaign`, `Tower` and `UnionRaid` hold new rows with an unknown NIKKE or stage
  rather than write a fallback name. The log shows `+N (held M)`.
- `RosterLog` appends only when a NIKKE's copy count differs from its last logged row.
  `CostumeDatabase` writes nothing when the roster call fails, because `owned` can never be
  corrected afterwards.
- Cookies never reach the CDN: `refresh_reference` uses its own `httpx.AsyncClient()`.
- Config files are re-read every check (`cookie.txt`, `sheets.json`, `service-account.json`), so a
  fixed config or refreshed cookie needs no restart.
- Every write goes through `write_row` / `write_rows` (`cli/src/shiniri_cli/sheets.py`, see
  `sheet-writer.md`).

## Owns

- `cli/data/` (gitignored): `daily.json` (guard), `state.json` (last sync marks), `watch.pid`,
  `logs/watch-<stamp>.log` (newest 5 kept, `watch.log` links the latest), `raw/json/` reference and
  clear files.
- `cli/config/` (gitignored): `cookie.txt`, `sheets.json` (`spreadsheet_id`, optional
  `gacha_spreadsheet_id`), `service-account.json`. Tracked: `config/sources.json` (reference file
  paths on the CDN).
- Deployment: the homeserver sparse-clones `cli/` and tracks `develop` (see `cli/CLAUDE.md`).

## Gotchas

- `start.sh` runs `.venv/bin/shiniri-cli` directly, not `uv run`, so the saved PID is the Python
  process and SIGTERM reaches it. `stop.sh` waits 10 s, then tells you to `kill -9`.
- Without `gacha_spreadsheet_id` the check logs three `no gacha_spreadsheet_id` lines and skips
  `NikkeDatabase`, `RosterLog` and `CostumeDatabase`.
- Clears and union run only in the check that writes (or finds) the day's profile row. While the daily
  is under 100 points, no check runs them, so Campaign and Tower stay behind until the daily is done
  or the 02:59 check.
- `store.mark` stamps machine local time, but `needs_full_refresh` compares that stamp's date with
  the WIB game day. The homeserver's zone is WIB, so they agree; on any other zone the full
  roledata refresh would run on the wrong day boundary.
- `fetch_roledata` marks `roledata` even when some files failed. Missing files retry as missing on
  the next check; a permanent failure does not force a full re-download each hour.
- The `Profile` row keeps 47 cells even when an id is missing (the cell is `""`). Ids the game adds
  later are ignored. The timestamp cell is written with a leading `'` to stay text.
- `watch` runs every step with blocking `asyncio.run` calls, one after another. A slow step delays
  the rest of the check, but the next check still lands on :59.
- Holds differ by tab. `Campaign` and `Tower` hold the whole tab when any new row has an unknown
  NIKKE or an empty `stageName`, to keep clear order. `UnionRaid` and `UnionRoster` hold per season.
  `Profile` is never held. Held rows are written on a later check once the names resolve
  (`clear_sheet.py`, `union_sheet.py`).
- `Campaign` and `Tower` write `date` as a WIB timestamp text (`'YYYY-MM-DD HH:MM:SS`, `clear_sheet.py`),
  not the in-game day. This is intended and an exception to `decisions/0004-sheet-names-one-cutover.md`.
- A union season is written once, after `locked()` (its end plus an hour). A season missing from
  `raid_list` has no end time and is never written. `UnionRoster` `source` is `api` when the season file
  has `members`, else `hits` with blank level and synchro level.
- `NikkeDatabase` is written on every check, not tied to the daily row, so a restarted `watch` fills it
  at once. Rows go in `order`; a missing or non-integer `order` sorts last; the first of a repeated
  `name_code` wins; skipped entries are logged as `entry <index>`.
- `limited` is written `TRUE` for `ABNORMAL`, else `FALSE`. The owner flips seasonal limited NIKKEs by hand.
- `overspec` is `TRUE` when the NIKKE's roledata has `corporation_sub_type` `OVERSPEC`. A new NIKKE
  with no stored roledata is held (`held <names>: no roledata`) and a later check appends it.
- `RosterLog` names come from the sheet's `NikkeDatabase`, because the owner renames collab names there.
  An empty `characters` list is a failure, not "owns nothing". Do not pull gacha between the first check
  of a game day and the day's end, or `DupeTracker` shows a missed log.
- The first run on an empty sheet backfills thousands of clears (about 3,700 Campaign and 5,800 Tower) in
  one request. Later clears that arrive late land at the bottom; rows are never reordered.
- Extra log lines: `fetching N/total` every 50 clears, one `sync:` line per check, `(stage_list
  missing)`, and a `wrote` or `held` line per tab.
- Stopping does not wait for a running check: checks are short and re-runnable, and the day guard stops
  a second `Profile` row.

## Known gaps

- None found in code.
