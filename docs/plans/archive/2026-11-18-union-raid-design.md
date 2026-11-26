# Union Raid

## Why

The user has been a loyal union member and wants a permanent record of their union's raids
(seasons 35 to 46 so far). The goals are their own growth, the union's growth, who hit what, and
remembering how each season went. The server only answers while the user is in the union
(`code 1303028 "user not in guild"`), so whatever gets downloaded must be kept forever. A second
use is following a **live** raid. The site's raid page is frustrating, and the server data is at
most ~5 minutes behind.

## Raid rules the tool relies on (from the user)

- A season lasts one week. Each member gets 3 attempts a day.
- **Normal mode**: levels 1–10, 5 bosses each (`difficulty 1`). Easy for this union. Clearing it
  opens hard mode the next day.
- **Hard mode** (`difficulty 2`): the same 5 bosses, levels 1–3. After level 3 comes an
  unlimited-HP boss (shown as level 4, the 5th boss). Hard mode **always ends in one day**.
- In the level response, `current_hp` on level 4 is **damage dealt** to the unlimited boss. On
  levels 1–3 it is HP left (hard mode not cleared).
- Boss codes (the last word of the boss name), element and weakness:

  | code | goddess | element | weak to |
  |---|---|---|---|
  | HSTA | Hestia | fire | water |
  | PSID | Poseidon | water | electric |
  | ZEUS | Zeus | electric | iron |
  | DMTR | Demeter | iron | wind |
  | ANMI | Anemoi | wind | fire |

  The raid data already carries the boss `element_id` (`100001` = fire, and so on, the same ids
  as `nikke_list_en`). Only the weakness mapping and the codes are new constants.
- `day` in the hit data is 0-based from season start. Display it 1-based (`D1`, `D2`).
- `step` is the boss index (1–5) within a level.

## Data sources

| what | where | auth |
|---|---|---|
| season list (id, start/end/calc dates and ts) | CDN path `raid/raid_list.json` (→ `rm-58/a7f993363fe3e2df8a4a7e579decc872.json`, checked with `cdn_url`) | none |
| my guild (`guild_id`, name, member count) | `POST Game/GetMyGuildInfo` | cookie |
| season final state (`level_info`, `manager_info`) | `POST Game/GetUnionRaidLevelDataOfGuildSeason` | cookie |
| every hit (`participate_data`) | `POST Game/GetUnionRaidDataOfGuildSeason` | cookie |

The bodies of the two raid calls are `{"area_id": 85, "guild_id": "<id>", "season_id": "<id as string>"}`.
GetMyGuildInfo's body is in `blabla.yml`. The same headers and `make_client` as the clear fetch.
Example responses are in `blabla.yml` (lines ~545, ~685, ~825, ~903).

The season list is one more `sources.json` entry, `"raid_list": "raid/raid_list.json"`, synced by
`sync` and stored as `raid_list.json` (raw names follow CDN file names).

Hit fields used: `openid`, `nickname`, `day`, `difficulty`, `level`, `step`, `boss_id`,
`name_localvalues.en`, `element_id`, `total_damage` (string → int), `is_final_hit`,
`squad[] {slot, tid, lv, combat, costume_id}`. `tid` resolves to a Nikke (name, element) through
the same lookup `build_tables` uses for clear lineups.

## Goals

### Storage
- `data/raw/json/union/<season_id>.json` = `{"guild": <GetMyGuildInfo data.card>, "level": <level data>,
  "raid": <raid data>, "fetched_ts": <int epoch>}`. This is the source of truth.
- A season file is **final** when it was fetched more than an hour after the season's `end_ts`
  (the server lags ~5 minutes). A final file is **never overwritten**, by any command.
- A stored season from another union (different `guild_id`) is never overwritten, and neither is
  a stored season whose new download has fewer hits.
- A failed or "not in guild" answer never replaces a stored file. It is reported per season.
- The parsed flat table `data/parsed/csv/union_hits.csv` (one row per hit, squad flattened with
  Nikke names) is rebuilt from raw, like the clear csvs.
- Exports go to `data/exports/union/`. They use the existing export cache, `!` rebuild and
  `export_name`. A `fetch` or `live` that changes a season wipes the union exports. A `sync` that
  changes the Nikke list wipes them too, as it already does for everything.

### Shell
- Typing `union` in the main shell enters **union mode**. The prompt becomes `union> `. It has its
  own command list, prefix matching, tab completion and `help`. `back` (or `quit`) returns.
- From the main shell, `union <anything>` runs that one union command without entering the mode
  (`union s45`, `union missed s44`, `union hits hsta`).
- In the main shell, `help union` prints the same command list as `help` inside union mode.
- The parser, renderer, export cache and error handling are **shared** with the main shell. Only
  the command table differs.

### Season argument
- Every query takes an optional `sN` (`s45`, season id `1000045`). Without it, a query uses the live
  season if one is running, otherwise the latest stored one. `all` means every stored season
  (where that makes sense).
- `sN` on its own (`s45`) is the recap command.

### Commands (inside union mode)

| command | shows |
|---|---|
| `fetch` | downloads the guild info and every season in the season list that isn't stored yet (needs cookie, and the season list from `sync`) |
| `live` | re-downloads the running season, replacing its file. Says so plainly when no season is running |
| `sN` / `season [sN]` | recap: dates, the day normal was cleared, hard result (levels cleared, then damage on the unlimited boss, or HP left at the level it stopped), total damage per mode, top 5 hitters, missed-hit count |
| `hits [sN] [filters]` | every hit. Filters can be combined in any order: `normal`/`hard`, `lv<n>`, `d<n>`, a boss code (`hsta`), a member name. Sorted by damage, highest first |
| `missed [sN]` | members with fewer than 3 hits on the hard-mode day, with how many they made. Also "N of <union size> members seen", so members who never hit are counted but not named. On a live season this is the reminder of who still has attempts left |
| `normal [sN]` | who hit normal mode, how many hits and damage each, and the total |
| `top [sN\|all] [member]` | most-used Nikkes in hits (like `top` for clears), optionally for one member |
| `member [name]` | one member across seasons: hits and damage per season, then tendencies: hits per boss code, same-boss-twice-in-a-day count, average number of weakness-element Nikkes per squad, favourite Nikkes. No name = you |
| `members` | roster history: each member's first and last season seen and seasons played. Per season, who arrived and who left |
| `growth [name [+ name]]` | per season: union total hard damage and hard result. With names: each member's total next to the union median |
| `boss <code>` | the same boss across seasons: union damage and your damage on it each season |
| `help [cmd]`, `back` | as in the main shell |

- Members are keyed by `openid`. Tables show their latest `nickname`. A member name argument
  matches the nickname, exact first, then unique substring (like `resolve_nikke`).
- "You" = the `game_openid` from the saved cookie.

## Non-goals

- Auto-refresh or polling during a live raid. The user re-runs `live`.
- Other unions (the server refuses).
- Fetching per-member data beyond what the two raid calls return (e.g. a full roster with
  members who never hit).
- Charts, an HTML view, a database.
- Normal-mode "missed hits" (normal mode needs only a few members).

## Approaches

1. **Union mode inside the same shell** (picked). A second command table on the shared parser,
   `union <cmd>` from the main shell routes into it, a new `union` module for fetch/parse/queries.
   It fits the user's "separate menu with its own help" and reuses almost everything.
2. Flat `union <query>` commands only. Cheaper, but the union queries would share help and
   completion with the clear commands. The user asked for B-style calls to route into A, which
   approach 1 covers.
3. SQLite for hits. Easy ad-hoc filtering, but ~12 seasons × ~150 hits is tiny, and it would be
   a second source of truth next to raw JSON. Dropped.

## Calls made without asking (check these)

- Test fixtures built from `blabla.yml` are **anonymized**: nicknames and openids replaced. Real
  member names never get committed, the same as `data/`.
- `fetch all` in the main shell does **not** fetch union data. Union fetching lives only in union mode.
- If the user ever moves to another union, stored seasons stay as they are (finished ones are
  locked). Each file keeps the `guild` it came from.
- Edge cases print a plain line instead of an empty table: `missed` before hard mode has started
  ("hard mode not reached yet"), or a season where hard mode was never reached.
- Hits with `difficulty` other than 1 or 2 are kept in raw but ignored by queries.

## Left to the builder

- Module split (one `union.py` vs fetch/queries split) and how `parse_command` takes a command
  table. Keep the structure of `cli.py`/`queries.py`.
- Exact column choices and number formatting (damage in B/T is fine).
- How the recap figures out the "day normal was cleared" (the last normal hit's day, or the day
  of the level-10 step-5 final hit).
- Tests: storage lock rule (finished season not overwritten, error never replaces), hit filters,
  missed-hits, recap from the `blabla.yml` examples (copy the trimmed responses into a test fixture,
  without cookies or real tokens), `union <cmd>` routing from the main shell.
- README: the union section.
