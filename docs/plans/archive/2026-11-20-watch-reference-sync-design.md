# watch: refresh reference files every check, hold unknown names, per-tab log lines

## Why

After `data/` was wiped, `watch` ran with no reference JSON: `sync` is an interactive command and `watch`
only refreshed `raid_list`. Union squads came out as `NIKKE_<tid>`. The sheet is append-only and keyed on
column A, so a bad row stays bad until fixed by hand. The log didn't show it either: one summary line per
check, with union and roster counted in seasons, not rows.

## Goals

- Every `watch` check refreshes all five reference files (`config/sources.json`) before doing anything
  else. Covers a wiped `data/` and a NIKKE released since the last sync.
- Never append a row carrying a name the reference files don't know. Hold it and log why.
- The log says what each write put in the sheet, one line per write, before the existing summary line.

## Non-goals

- No change to the interactive `sync` command or `union fetch`.
- No repair of rows already in the sheet (manual, see below).
- No change to `write_rows` or any header: the shared sheet contract and the web app (`../shiniri`) are
  untouched.

## Approaches

- **Chosen: `_check` calls `sync_reference` once per check**, with its own CDN client (game cookies never go
  to the CDN host), before `check_once`. `sync_union` drops its own `raid_list` refresh.
- Sync only inside the once-a-day sheet step: rejected, the profile row also needs `stage_list`.
- Sync only when files are missing: rejected by the owner, misses newly released NIKKEs.
- A new helper around `sync_reference`: rejected, nothing to add.

## Design

**Sync.** Every check, before the profile step, refresh all five files and log one line:
`sync: nikke_list_en changed · character_id_map unchanged · …`. A failed file (or a bad `sources.json`) is
logged on that line and the check carries on with what's on disk.

**Hold (owner's choice).** Before appending, a tab drops the blocks that hold unknown names, logs them, and
writes the rest. Rows are never lost: each tab writes whatever it's missing, so held rows go in on the first
sheet-writing check after the names resolve (normally the next day, since clears and union run only on the
day's profile-writing check).
- Union: per season. A season with any `NIKKE_` squad slot is held:
  `Union: held season 46, 2 unknown NIKKE (NIKKE_5123, NIKKE_5124)`.
- Roster: carries no NIKKE names, never held.
- Campaign / Tower: the whole tab is held when any new row has a `NIKKE_` slot or an empty `stageName`
  (stage missing from `stage_list`/`tower_list`). Whole tab, not single rows, so rows stay in clear order.
  (My call.)
- Profile row: not held (my call). It's a snapshot of that moment and can't be taken later. With
  `stage_list` missing it already falls back to the raw stage id; the summary line notes
  `(stage_list missing)` when that happens.

**Log.** On the sheet-writing check, one timestamped line per `write_rows` call, then the existing summary
line last:

```
2026-11-20 21:59:00 sync: nikke_list_en changed · character_id_map unchanged · stage_list unchanged · tower_list unchanged · raid_list unchanged
2026-11-20 21:59:00 Campaign: wrote 3 rows, Campaign!A120:M122 (50-36 … 50-38)
2026-11-20 21:59:00 Union: wrote season 46, 87 rows, Union!A900:P986
2026-11-20 21:59:00 Union: held season 47, 1 unknown NIKKE (NIKKE_5123)
2026-11-20 21:59:00 Roster: wrote season 46, 32 rows, Roster!A400:F431
2026-11-20 21:59:00 game day 2026-11-20: wrote Profile!A12:AU12 · Campaign +3 · Tower +0 · Union +1 · Roster +1
```

- Range is what `write_rows` returns. Clears show first … last stage name; union and roster show the season.
- Tabs with nothing new get no line; errors stay in the summary line as today.
- A tab that held anything shows it in the summary too, in the same unit as its `+N` (rows for
  Campaign/Tower, seasons for Union): `Tower +0 (held 2)`, `Union +1 (held 1)`. Added after the
  review, at the owner's request.
- The sync line is logged every check; the tab lines only on the check that writes.
- A long clear fetch (the first run after a wipe) logs `Campaign: fetching 50/480` each time the count
  passes a multiple of 50, so a slow run is told apart from a hung one. A normal hourly run fetches a
  few stages and logs none. Added after the homeserver check, at the owner's request.

## Left to the builder

- How lines reach the log (e.g. a `log` callable passed down from `watch`, defaulting to a no-op so the
  interactive paths are unchanged).
- Exact wording beyond the examples above.

## Manual sheet step

Rows already written with `NIKKE_` names (or blank stage names) stay as they are. Fix them by hand, or
delete them so the next run rewrites them.
