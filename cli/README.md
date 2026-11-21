# shiniri cli

An interactive shell that fetches your NIKKE clear history from blablalink
(campaign and tower lineups, plus the CDN reference files) and lets you search it.

## Requirements

**[uv](https://docs.astral.sh/uv/) is required.** The project, its Python version
(`.python-version`) and its dependencies (`uv.lock`) are managed by uv only.
There is no `requirements.txt`, so don't use `pip` or a hand-made venv.

```sh
uv sync                 # installs Python 3.14 and the locked dependencies into .venv
uv run shiniri-cli      # starts the shell
uv run pytest           # runs the tests
```

Works the same on Windows, macOS and Linux, in any normal terminal.

Windows only: Git Bash's default terminal (mintty) isn't a Windows console, so the prompt
won't start there. Use PowerShell, cmd or Windows Terminal, or run it through `winpty`.

## Homeserver install

The homeserver needs only `cli/`, so clone the repo sparsely:

```sh
git clone --filter=blob:none --sparse https://github.com/alvarodwi/shiniri
cd shiniri && git sparse-checkout set cli && git checkout develop
cd cli
```

Update later with `git pull` from inside the clone.

## First run

```
> sync          download the reference files (no login needed)
> cookie        paste the Cookie header from blablalink (input is hidden)
> clear fetch all   fetch new campaign + tower clears
```

To get the cookie: open blablalink while logged in, open the browser devtools,
open the Network tab, and copy the `Cookie` request header from any `api.blablalink.com` request.

## Commands

The main prompt holds the groups plus a few shared commands:

| Command | What it does |
|---|---|
| `clear [cmd]` | campaign & tower clears (below) |
| `union [cmd]` | union raid (below) |
| `sync` | re-download the CDN reference files |
| `cookie` | save your Cookie header |

A group name alone switches to its prompt (`clear>`, `union>`) with its own `help`;
`back` or `q` returns. A group name plus a command runs it once and stays on main
(`clear progress`, `union s45`). `help clear` / `help union` list a group's commands,
`help clear nikke` shows one. Any unique prefix works (`cl`, `u`, `n`, `st`).

## Clears

| Command | What it shows |
|---|---|
| `fetch campaign\|tower\|all` | get new clears (needs cookie) |
| `nikke <name> [+ <name>]` | clears that used a Nikke (both, if two) |
| `stage <normal\|hard> <ch>[-<stage>]` | a campaign chapter, or one stage (`stage hard 50-36`) |
| `floor <tower> <n>` | one tower floor |
| `date <from>[..<to>]` | clears in a date range |
| `top [tower\|mode]` | most-used Nikkes |
| `synchro` | synchro level timeline |
| `spread [step]` | synchro levels in bands (default 5), first/last day at each |
| `progress` | highest chapter / floor per mode |

Every search prints a table and saves a CSV under `data/exports/`. Running the same
search again reuses that file. Prefix a search with `!` to rebuild it (`!synchro`, or `!clear synchro` from main).
A `fetch` or `sync` that changes the data clears the affected exports automatically.

## Union raid

`union` switches to a `union>` prompt; `union <cmd>` runs one command from main
(`union s45`, `union missed s44`).

```
union> fetch        download every season not stored yet (run sync first, needs cookie)
union> s46          season recap
```

| Command | What it shows |
|---|---|
| `fetch` | download seasons not stored yet |
| `live` | re-download the running season |
| `sN` / `season [sN]` | recap: normal clear day, hard result, damage, top hitters |
| `hits [sN] [normal|hard] [lv<n>] [d<n>] [boss] [member]` | every hit, filtered, biggest first (`"two words"` for names with spaces, `@name` for a name that looks like a filter) |\|hard] [lv<n>] [d<n>] [boss] [member]` | every hit, filtered, biggest first |
| `missed [sN]` | members under 3 hits on the hard-mode day |
| `normal [sN]` | who hit normal mode |
| `top [sN\|all] [member]` | most-used Nikkes in hits |
| `member [name]` | one member across seasons, with tendencies (no name = you) |
| `members` | first/last season per member, arrivals and departures |
| `growth [name [+ name]]` | per-season damage; with names, next to the union median |
| `boss <code>` | one boss (HSTA PSID ZEUS DMTR ANMI) across seasons |

No season means the running one, else the latest stored. A finished season that
downloaded cleanly is never downloaded again or overwritten, and a failed download never
replaces a stored file. The server only answers while you're in the union, so
`data/raw/json/union/` is the only copy once you leave. Back it up.

## Daily profile row

`uv run shiniri-cli watch` keeps running. It checks your daily once when it starts, then at
every :59 WIB. Once all 100 daily mission points are claimed, it appends one row of profile
data (level, power, nikkes, currencies, progress, synchro, recycle room, lost relics) to the
`Profile` tab of the Progression sheet. It writes that row and an `AuditLog` row in one
request, the same way the [shiniri web app](../ui/) does. If the daily isn't finished by the last check
of the game day (02:59 WIB, before the 03:00 reset), the row is written anyway with
`dailyDone` FALSE. `data/daily.json` holds today's progress and whether the row is written. It
never goes to the sheet. A failed check is logged and retried the next hour.

The cookie is read again on every check. When ambil runs on the same machine with
`cookieExportPath` pointing at `config/cookie.txt`, it keeps the cookie fresh.

One-time setup:

1. In <https://console.cloud.google.com>, pick or create a project. Then go to *APIs & Services*,
   *Library*, *Google Sheets API*, and click *Enable*.
2. Go to *IAM & Admin*, *Service Accounts*, *Create service account*. Name it (for example
   `shiniri-cli`) and grant no roles. Open it, then go to *Keys*, *Add key*, *Create new key*,
   *JSON*.
3. Save the downloaded file as `config/service-account.json` and run `chmod 600` on it.
4. Share the spreadsheet with the account's `client_email` (from the JSON) as an **Editor**.
5. Write `config/sheets.json`: `{"spreadsheet_id": "<progression sheet id>", "gacha_spreadsheet_id": "<gacha sheet id>"}`.
   The gacha key is optional (without it `watch` logs `NikkeDatabase: no gacha_spreadsheet_id` and goes on), and the service account needs edit access to that sheet too.
6. Add a `Profile` tab with this header row, in order:
   `date takenAt dailyDone level teamCombat nikkes costumes elysionNikkes missilisNikkes
   tetraNikkes pilgrimNikkes abnormalNikkes paidGems freeGems battleData credits coreDust
   recruitVouchers advRecruitVouchers silverMileage goldMileage easyCampaign normalCampaign
   hardCampaign tribeTower elysionTower missilisTower tetraTower pilgrimTower overclockCurrent
   overclockLatest synchroLevel synchroSlots outpostLevel recyclePersonal recycleAttacker
   recycleDefender recycleSupporter recycleElysion recycleMissilis recycleTetra recyclePilgrim
   recycleAbnormal memoirs callLogs bgm data` (47 columns, A to AU)
7. If you set `gacha_spreadsheet_id`, add two tabs to that sheet, each with this header row, in
   order: `NikkeDatabase` with `nameCode name rarity manufacturer class burst element weapon
   resourceId releaseDate` (10 columns, A to J), and `AuditLog` with `savedAt form ranges rows`.
8. Start it with `./start.sh`, which runs `watch` in the background and refuses to start a second
   copy. Stop it with `./stop.sh`. The log is `data/watch.log`, linked to the newest of the last
   5 session logs in `data/logs/`. After a reboot, run `./start.sh` again.

Test against a copy of the sheet first. Then clear the test rows from `Profile` and `AuditLog`.
Otherwise a test row dated today makes the real run think today is already written.

## Image assets (dev machine only)

`uv run python tools/assets.py` caches small Nikke icons (`si`, default skin) and the resource
icons listed in `tools/items.json` as webp files in `../ui/public/img/`. Commit what it writes. It needs `cwebp` on `PATH` (the `webp` package). Files that already exist are
skipped, so delete one to refetch it. What else the CDN holds is in `../docs/cdn-map.md`.

## Name sweep (dev machine only)

`uv run python tools/names.py` lists every name in the gacha tabs (`Social`, `Event`, `Ordinary`,
`Molds`, `SpareBody`, `Other`) that isn't a `name` in `NikkeDatabase`, one line per cell part, with
the closest known name. It only reads. It sweeps `gacha_spreadsheet_id` from `config/sheets.json`;
pass another spreadsheet id to sweep that one instead (e.g. prod). Fix the cells by hand and rerun.

## Where things live

```
config/sources.json      CDN paths of the reference files (committed)
config/cookie.txt        your cookie (git-ignored)
config/sheets.json       the Progression spreadsheet id (git-ignored)
config/service-account.json  the Google service account key (git-ignored)
data/daily.json          today's daily progress, the guard for the profile row
data/raw/json/           what the server sent: the source of truth (union/ holds one file per raid season)
data/parsed/csv/         campaign_clears.csv, tower_clears.csv, lineups.csv (rebuilt from raw)
data/exports/            one CSV per search, grouped into campaign/, tower/ and all/
src/shiniri_cli/         the code: store, queries, fetch, cli
tools/                   dev-only scripts (assets.py, items.json, names.py), never used by watch
```

`data/` and `config/cookie.txt` hold personal data and are never committed.
