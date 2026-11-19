# Solo Raid (short design)

## Why

`SoloRaid` holds one row per Solo Raid season: boss, weakness, the day the owner attempted it, total
damage, the final rank and an optional comment. The owner used to log it in two steps (attempt,
then the rank once the raid ended). To keep the app append-only, they now log the whole row once,
after the raid ends.

## Sheet shape (verbatim, both sheets)

`SoloRaid` columns: `season | month | boss | weakness | totalDmg | rank | comments`.

- `month` holds the attempt date (for example 2026-11-14). The sheet formats it as "November 2026".
- `rank` is a top-% (`7.95%`, always two decimals) or, if ever reached, a top-500 placement (`#123`).
  The owner is switching the column to plain text so both forms fit.

## Goals

- A `/solo-raid` page that appends one complete `SoloRaid` row per save.

## Non-goals

- Updating a row later, for example to add the rank after the raid. Owner's call: log once, after
  it ends.
- A list of past seasons (dashboard territory).

## Approaches

- **One finished row per save, through `writeTabsAtEnd` (picked).** It is the same pattern as
  Anomaly and Gear, with no writer changes.
- Write at attempt time and fill in `rank` later. Rejected: it breaks append-only, and the owner
  chose to log after the raid ends.

## Design

- **Config:** `SOLO_RAID_TAB` with the headers above. `WEAKNESSES = ['Fire', 'Water', 'Wind',
'Electric', 'Iron']` in `src/types/soloRaid.ts`.
- **Row logic (`src/services/soloRaid/`), pure:**
  - Next season is the last filled column-A value + 1, or 1 for a tab with only the header. If that
    cell isn't a number, the field starts blank and the owner types the season.
  - Boss suggestions: the distinct non-empty column-C values, most recent first.
  - Damage parses plain digits, or digits split into groups of three by one consistent `,` `.` `_`
    or space separator, into a positive integer. `12.5` is refused rather than read as 125.
  - Rank, % mode (the default): a number above 0 and up to 100 with at most two decimals (`.` or
    `,`, since an Indonesian keyboard types a comma), written as text `'7.95%`. # mode: an integer from 1 to 500, written as text `'#123`. The leading apostrophe
    keeps both as text whatever the cell format.
  - Comments are written with the same text guard as Anomaly notes (`asText`).
- **Store:** `load()` reads columns A and C. `save()` re-reads column A and refuses a season
  that's already logged (another device, or a double save), then writes through
  `writeTabsAtEnd(..., 'SoloRaid')`.
- **Page `/solo-raid` + nav "Solo Raid":** labelled inputs:
  - season (number, prefilled)
  - date (default `gameDay()`)
  - boss (text with a datalist of past bosses)
  - weakness (5 tap buttons)
  - total damage (text, `inputmode="numeric"`, with a formatted echo such as "12,345,678,901")
  - rank (a %/# toggle next to one number input)
  - comments (optional)

  Save is disabled until season, date, boss, weakness, damage and a valid rank are all set.

## Claude's calls (check these)

- The season is editable even though it's prefilled.
- A % rank is always written with two decimals (7.9 is written as `7.90%`).
- The AuditLog form name is `SoloRaid`. Page and nav are "Solo Raid" (owner: Union Raid comes later).

## Manual sheet steps (both sheets, before release)

- Set `SoloRaid` column F (`rank`) to plain text. Existing numeric ranks (7.95 shown through a `%`
  suffix format) then display as `7.95`. Retype them, or convert them to `7.95%` text so old and
  new rows match.
