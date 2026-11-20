# Union to sheet

## Why

Clears now live in the Progression spreadsheet. Union is the last piece. The only reader is me: I check who
missed hard-day hits and track damage across seasons. The shell stays for live, same-day union queries; the
sheet becomes the permanent record.

## Goals

- `watch` writes every locked union season to Progression: one **Union** tab (one row per hit) and one
  **Roster** tab (one row per member per season).
- Backfill: the first run writes every stored season that is already locked (s35–s46 today).
- Missed hard-day hits can be worked out in the sheet: Roster rows for a season vs that season's hard-day hits.

## Non-goals

- No live or partial seasons in the sheet. A season goes in once, after `is_final` (end + 1h).
- No computed "missed" or summary tab written by the CLI; views (pivot / QUERY) are built in the sheet by hand.
- Normal-day misses aren't tracked; only the hard day (3 hits per member) matters.
- The shell's union queries stay as they are. Trimming them to live-only is a separate change if ever wanted.
- No separate spreadsheet: same Progression sheet, same sheet id.

## Approaches

1. **Write each season once, after it locks (picked).** Column A = season; a tab that already has that
   season number skips it, same pattern as clears skipping by `stageId`. Reuses `write_rows` unchanged, no
   synthetic hit key, can't double-write. Cost: the sheet only shows a season after it ends.
2. Write hits live every hour. Lets the sheet chase people on the hard day, but needs a synthetic key
   (season+day+member+boss+damage) that collides on equal damage, plus a snapshot rule for the roster.
   Rejected: more code and failure modes for a job the shell already does.
3. Summary rows only (member × day). Rejected: loses per-hit boss/squad detail for good.

Also rejected: a tab per season (no cross-season filters/pivots, endless tabs) and a separate spreadsheet
(size is a non-issue: ~146 hits a season, ~0.7M cells after 10 years against Sheets' 10M; slowness comes from
formulas, not plain values).

## Design

**Roster source.** `GetGuildMembers` (body `{"guild_id", "nikke_area_id"}`) returns the *current* members:
`member_id, nickname, level, synchro_level`. `member_id` equals the hits' `openid` (verified on s46: all 32
match). It has no history, so it is snapshotted:

- `fetch_union` calls it every time it saves a season and stores the list in that season's raw file
  (`members`). The final fetch (past end + 1h) therefore holds the roster as the season closed.
- A season already locked without `members` (s35–s45, and s46 if locked before this ships) never gets
  refetched. Its Roster rows come from the members who hit that season, marked `source = hits`.
  Exception (my call): the newest locked season, if it ended within `SIZE_TRUST` (7 days, the same trust
  window `_size` uses), takes the current roster as `source = api`.

**Union tab** headers:
`season, day, mode, level, step, boss, bossElement, memberId, nickname, damage, finalHit, slot1..slot5`.
Damage is a plain number (sheet formats it). Nickname is the one on that hit. Rows in stored order.

**Roster tab** headers: `season, memberId, nickname, level, synchroLevel, source` (`api` or `hits`).

**Writing.** A new `union_sheet.py` beside `clear_sheet.py`, same shape: per tab, read column A, append the
locked seasons it doesn't have, one `write_rows` block per season (AuditLog form `cli-union`). Each tab is
independent: a failure in one never stops the other, and the fetch failing still writes what's stored.
Seasons stored from a past union are written too (my call: they're still my history).

**When.** `watch` runs it right after `sync_clears`, joining its text to the log line. Before
`fetch_union`, it refreshes `raid_list` from the CDN (otherwise a new season is never known, since only the
manual `sync` updates it today). `fetch_union` already skips locked seasons, so the hourly cost is the
current season's three calls.

## Left to the builder

- How the single `raid_list` refresh reuses the existing CDN sync code.
- Exact log text (`Union +N seasons · Roster +N`).
- Tests mirroring `test_clear_sheet.py`: skip already-written season, independent tabs, `hits` fallback
  roster, unlocked season never written.
