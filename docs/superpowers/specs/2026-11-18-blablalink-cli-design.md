# blablalink CLI — design

Date: 2026-11-18

## Intent

Today the repo is three loose scripts (`campaign-fetcher.py`, `tower-fetcher.py`,
`process-synchro.py`) that each fetch or post-process clear data and write a CSV.
The two fetchers are ~90% copy-paste; cookies are hard-coded in two scripts and in
`blabla.yml` (and have already drifted apart). The owner wants one interactive
CLI that:

- fetches the data (campaign clears, tower clears, and the CDN reference files),
- keeps JSON as the source of truth and derives CSVs from it,
- answers a fixed set of questions about the records ("show me the clears that
  used Crown") without opening a spreadsheet,
- is easy to extend with more blablalink endpoints later (the Bruno collection
  `blabla.yml` already lists several unused ones: `GetUserCharacters`,
  `GetUserGamePlayerInfo`, `GetUnionRaidDataOfGuildSeason`,
  `GetUnionRaidLevelDataOfGuildSeason`, Union Raid Season).

Single user (the owner), run locally on Windows, Python 3.14.

## Goals

1. One entry point: `python main.py` opens an interactive shell.
2. Fetching for campaign and tower shares one code path.
3. Storage split into raw JSON → parsed CSV → per-search exports, with caching
   and scoped staleness.
4. Six fixed searches plus `help`.
5. Cookie pasted once through a command, stored outside the code.

## Non-goals

- A free-form query language or SQL. Six fixed searches are enough.
- Making the tool work for other accounts. (The owner is investigating whether
  CDN URLs are per-user; if so, auto-discovering them is a later project. This
  design only keeps the URLs in one file so that change stays local.)
- Implementing the extra Bruno endpoints now.
- A full-screen TUI. It is a prompt-style shell.

## Anti-goals

- Re-creating the muddle: duplicated fetch/translate code, or the same data in
  several places that must be kept in sync by hand.
- Secrets in source files.
- Showing stale export results without saying so, or silently reusing an export
  after the data under it changed.

## Constraints

- Lineup endpoints need the account's cookies (`game_token`, `game_openid`, …)
  plus the `x-common-params` / origin / referer headers the scripts use today.
  CDN files need no auth.
- Be gentle with the API: keep the current 1–2 s random delay between requests,
  3 retries, 10 s backoff on HTTP 429.
- `httpx` is not installed in the current Python; ship a `requirements.txt`.

## Approaches considered

- **A. Package + stdlib `cmd` shell.** Free `help`, minimal code; no tab
  completion or history on Windows without `pyreadline3`.
- **B. Package + `prompt_toolkit` shell. — chosen.** Tab completion (commands,
  Nikke names, tower/mode names), persistent history, a bottom status bar,
  works on Windows. Costs a dependency and hand-written help. Owner picked B
  ("let's dream big").
- Dropped: one big script (same muddle in one file); SQLite (a third copy of
  the data to sync; not needed for six fixed searches).

## Layout

```
main.py                    entry: starts the shell
blablalink/
  cli.py                   prompt_toolkit session, command parsing, help, completion
  fetch.py                 HTTP: cookie/headers, one stage fetcher, CDN sync
  store.py                 paths, raw read/write, raw → parsed CSV, export cache + wiping
  queries.py               the six searches; return rows, no printing
config/
  sources.json             the 4 CDN URLs (committed)
  cookie.txt               pasted Cookie header (git-ignored)
data/                      (git-ignored: personal data)
  raw/json/
    campaign_level.json  tower_level.json  nikke.json  historical_roster.json
    campaign_clears.json  tower_clears.json
  parsed/csv/
    campaign_clears.csv  tower_clears.csv  lineups.csv
  exports/
    campaign/  tower/  all/
requirements.txt           httpx, prompt_toolkit, rich
.gitignore                 data/, config/cookie.txt, blabla.yml, history file
```

`rich` (builder's-call addition) renders result tables and the fetch progress
bar; prompt_toolkit has no table renderer.

## Data model

### Raw clear files

`campaign_clears.json` / `tower_clears.json` store **what the server sent**, not
translated records: an object keyed by `stage_id` (string), value = the
response's `data` object as returned (`cleared_at`, `list` of
`{slot, tid, lv, combat, …}`). Only successful clears (`code == 0` with a
non-empty `list`) are stored.

Names, dupes, element, weapon, burst, manufacturer are **never stored** in raw;
they are joined in when parsed CSVs are built, from `nikke.json` (by
`resource_id` via `historical_roster.json`, falling back to `id == tid`) and
`historical_roster.json` (grade/core → `LB0–LB2 / MLB / C1–C7`). This removes
the old `repair_cached_records` step: refreshing `nikke.json` fixes every name.
Unresolved Nikkes show as `NIKKE_<tid>` (75 such units exist in today's tower
data).

Stage metadata (name, chapter, mode, tower type, floor, recommended CP) is also
joined in at parse time from `campaign_level.json` / `tower_level.json`.

### One-time migration

On first run, if `data/raw/json/*_clears.json` don't exist but
`test_campaign_clear_history.json` / `test_tower_clear_history.json` do,
convert them: per record → key `stage_id`, value
`{"cleared_at": cleared_at_timestamp, "list": [{slot, tid, lv: level,
combat: combat_power} …]}`. Also move the four reference JSONs from the repo
root into `data/raw/json/`. Leave the `test_*` files in place; the owner deletes
them. (Any extra fields the real API returned are lost for migrated records;
acceptable.) Current sizes: 3,674 campaign clears, 5,761 tower clears.

### Parsed CSVs (rebuilt from raw)

- `campaign_clears.csv` / `tower_clears.csv`: one row per clear — the columns
  of today's CSV exports (mode/tower, chapter, stage name or floor, date
  cleared, recommended CP, team CP, synchro level, slot 1–5 names) plus
  `stage_id`.
- `lineups.csv`: one row per Nikke per clear — source (campaign/tower), stage
  id, mode/tower, chapter/floor, cleared_at, slot, tid, name, dupe status,
  level, CP, element, weapon, burst, manufacturer.

Searches read from the parsed CSVs (or the same in-memory tables built
alongside them), never from raw directly.

Synchro level per clear keeps today's rule: one number if all units share a
level, else comma-separated levels.

## Fetching

One generic routine fetches a list of stages from a lineup endpoint, given:
the endpoint, the stage-id field, a grouping key for "stop at first uncleared",
and a skip predicate. Campaign and tower are two configurations of it:

| | campaign | tower |
|---|---|---|
| endpoint | `GetMainQuestClearLineup` | `GetCampaignStageCharacterInfo` |
| stage list | `campaign_level.json`, id field `id` | `tower_level.json`, id field `stage_id` |
| skip | Normal ch. 1–2; modes other than Normal/Hard; quick-clear gaps (stages before a cached higher stage in the same chapter) | — |
| stop early | never | per `tower_type`, at the first uncleared floor (`code != 0`) |

Both skip stage ids already in raw. Request body `{"stage_id": …, "area_id": 85}`.

Campaign deliberately does **not** stop at an uncleared stage (keeps today's
behaviour; the unused `SKIPPED_MODS` in the old script is dead code, not a
missing feature). Reason: quick-cleared stages sit *before* a cleared stage in
the same chapter, and are only recognised as gaps once that later stage is
stored, so stopping early would miss clears. Today's data: 4,160 eligible
stages, 3,674 stored, 485 gaps, 1 stage past the frontier — so a routine run
makes only a handful of requests. A new chapter costs one pass over its
stages; the next run skips its gaps.

Auth check: any response with `code == 300001` (`"msg": "game not login"`,
observed by the owner when sending no cookies; expected to be the same on every
cookie-gated endpoint) stops the whole fetch and tells the user to run
`cookie`. It is never treated as "uncleared". Tower's uncleared floor answers
with `code 1300017`. Other non-zero codes count as uncleared for that stage.

Progress is shown with a progress bar per group; new clears are written to raw
as they arrive (or at least on Ctrl+C), so an interrupted fetch keeps its work.

## Commands

```
fetch campaign|tower|all     get new clears (needs cookie)
sync                         re-download CDN reference files
cookie                       paste your Cookie header
nikke <name> [+ <name>]      clears that used a Nikke (both, if two)
stage <normal|hard> <ch>     campaign chapter clears
floor <tower> <n>            tower floor clear
date <from>[..<to>]          clears in a date range
top [tower|mode]             most-used Nikkes
synchro                      synchro level timeline
progress                     highest chapter / floor per mode
help [cmd]    quit
```

First letter works as an alias (`n crown`). A leading `!` on a search forces
the export to be rebuilt. On start the shell prints this command list as the
menu, plus data status (clear counts, last fetch/sync time). The bottom
toolbar keeps that status visible.

Search details:

- **nikke** — name match is case-insensitive, exact first, then unique
  substring; ambiguous → list candidates. Output: every clear that used the
  Nikke(s) (source, stage/floor, date, dupe, level, CP), plus count and
  first/last date. Reads both sources → `exports/all/`.
- **stage** — all stages of that chapter/mode with team, dupes, levels, CP,
  date, team CP vs recommended CP. → `exports/campaign/`.
- **floor** — that floor's clear, same columns. → `exports/tower/`.
- **date** — clears in the range, both sources, sorted by time. →
  `exports/all/`.
- **top** — Nikke usage counts; optional filter to one tower or one campaign
  mode. Folder follows the filter (`tower/`, `campaign/`, or `all/`).
- **synchro** — today's `process-synchro.py` logic (levels ≥ 200, single
  value only, max per day, compressed to level-change boundaries). →
  `exports/all/`.
- **progress** — highest Normal and Hard chapter cleared, top floor per tower.
  → `exports/all/`.

Every search prints a rich table and writes its CSV export.

Completion: command names, Nikke names (from `nikke.json`), tower names,
`normal`/`hard`. History persists in a git-ignored file.

## Export cache and staleness

- Export filename = command + normalised args, e.g. `exports/all/nikke_crown.csv`,
  `exports/tower/floor_tribe_1030.csv`.
- Running a search: if its export file exists and no `!`, show it from the file;
  otherwise compute, write, show.
- Stale exports are **deleted**, not flagged, so "exists" means "fresh":

| Event | Rebuild parsed CSV | Delete exports |
|---|---|---|
| `fetch tower` added ≥1 clear | tower + lineups | `tower/`, `all/` |
| `fetch campaign` added ≥1 clear | campaign + lineups | `campaign/`, `all/` |
| `sync` changed `nikke.json` or `historical_roster.json` | all | all |
| `sync` changed only a level list | campaign/tower whose list changed | that source's folder + `all/` (recommended CP / names can change); also report how many new stages exist to fetch |
| fetch added nothing / sync changed nothing | — | — |

## CDN sync

`config/sources.json` maps each reference file to its CDN URL (values from
`blabla.yml`: CharacterList → `nikke.json`, ClearLevel →
`historical_roster.json`, GetCampaignList → `campaign_level.json`,
GetTowerList → `tower_level.json`). `sync` downloads each with the CDN headers
from the yml (Referer `https://www.blablalink.com/`, a browser User-Agent),
validates it parses as JSON, compares to the stored file, writes only if
different, and reports changed/unchanged per file. A failed or non-JSON
download never overwrites the stored file.

## Cookie

`cookie` prompts for the raw `Cookie:` header value (as copied from the browser
or Bruno), parses it into name/value pairs, checks that `game_token` and
`game_openid` are present, and saves to `config/cookie.txt`. Fetch reads it
from there; missing file → "run `cookie` first".

## Chapter numbers

The user types and reads chapters **as the game shows them**: displayed chapter
= `chapter_id - 1` (`chapter_id` 1 is the "0-x" stages, 3 is "2-1"). This
applies to `stage normal 5`, `progress`, export names, and the parsed CSV's
chapter column. The "skip Normal ch. 1–2" rule above is in `chapter_id` terms
(displayed chapters 0 and 1).

## Builder's calls

- Times are shown in the machine's local timezone; `date` ranges and synchro
  day-grouping use local dates (today's synchro script uses UTC).
- Old scripts are deleted once the CLI covers them; `blabla.yml` stays but is
  git-ignored because it contains the token.
- Internal function shapes, table styling, and toolbar contents beyond the
  status line above.
- Tests: unit tests for raw→parsed join, dupe formatting, quick-clear skips,
  stop-at-uncleared, synchro compression, staleness table, cookie parsing,
  migration — using small fixtures, no network.
