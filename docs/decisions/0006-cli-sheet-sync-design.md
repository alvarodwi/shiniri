# 0006 CLI sheet sync: diff on column A, write after the day, hold unknown names

## Context
`watch` copies clears, union seasons and NIKKE data into the sheet, which the owner edits by hand.

## Decision
- Each tab appends what column A lacks. Nothing is rewritten, so the owner's filters and notes stay.
- Reference files refresh at the start of every check, because profile, clears and union all read them.
- Clears and union run only after the day's `Profile` row is written, so a slow step cannot cross the
  03:00 reset. `NikkeDatabase`, `RosterLog` and `CostumeDatabase` run on every check.
- A union season is written once, after it locks (end plus one hour), keyed on its season number.
  The roster is stored with it, because the API returns only current members.
- Rows with an unknown NIKKE or stage are held, never written with a fallback name. `Profile` is never
  held, as a point-in-time snapshot.
- `watch` stops at once on SIGTERM and does not finish the running check.

## Rejected
- Rewriting a tab, or a one-off backfill command plus append (a lost write is never recovered).
- Writing union hits live every hour (no stable row key), a summary row per season, a tab or a spreadsheet
  per season.
- Syncing reference files only once a day or only when missing (misses new NIKKEs).
- Finishing the running check before exit: checks are short and the day guard prevents a duplicate row.
- `systemd`: a plain loop under `nohup` (`start.sh`, `stop.sh`) is enough.
