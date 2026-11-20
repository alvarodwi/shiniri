# Profile tracking: one row a day to the Progression sheet

> Replaces the shelved 2026-11-19 draft: the snapshot files, the `profile` shell group and the Telegram
> reminder are all dropped.

## Why

The server only reports "how the account stands right now", so growth over time (level, power, synchro,
currencies, progress) has to be sampled. The user already keeps a Progression spreadsheet that the `shiniri`
web app appends to. One automatic row a day, written once the daily is finished, gives a history in the place
they already look at it, without typing anything.

## Goals

- `shiniri-cli watch` is a long-running process on the Linux homeserver, started by hand in `tmux` or with
  `nohup` (the user's choice: "like a jar that stays active", no systemd, no cron).
- Every hour, at minute :59 WIB (UTC+7), it checks daily progress. The game day resets at 03:00 WIB, so the
  last check of a game day is 02:59.
- The first check that finds the daily finished appends one row of profile data to a `Profile` tab in the
  Progression spreadsheet. If the daily is still unfinished at the 02:59 check, the row is written anyway, so
  every day gets a row.
- **Atomic, the same way the web app writes:** the data row and its `AuditLog` row go in one
  `values:batchUpdate` request, so either both land or neither does.
- At most one row per game day, even across restarts.

## Non-goals

- Daily progress in the sheet. It lives only in `data/daily.json`, overwritten each game day, as the
  "already written today?" guard.
- Reminders, Telegram from this CLI, or a shell view of the data.
- Process supervision (systemd, auto-start on boot). After a reboot the user restarts it.
- Renewing the cookie. That's `ambil`'s job (see Cookies).
- `GetUserGamePlayerInfo`. The basic info already covers it.

## Anti-goals

- Two rows for one game day, or a data row with no `AuditLog` row.
- Overwriting anything already in the sheet.
- A failed check (expired cookie, network, Sheets error) that kills the loop.

## Constraints

- **Profile requests:** `POST https://api.blablalink.com/api/game/proxy/Game/<Name>`, with body
  `{"intl_open_id": <game_openid cookie>, "nikke_area_id": 85}` and the existing `HEADERS` and cookie client
  (`fetch.make_client`). The three names are `GetUserDailyContentsProgress`, `GetUserProfileBasicInfo` and
  `GetUserProfileOutpostInfo`. `code == 300001` (`AUTH_CODE`) means the cookie was rejected (`AuthError`).
  Sample responses are in `blabla.yml` under the `profile` folder.
- **Google auth:** the web app's sign-in happens in the browser and its token can't be renewed, so the CLI
  uses a **service account**. Its key goes in `config/service-account.json`, and the sheet is shared with the
  account's email as an editor. Scope: `https://www.googleapis.com/auth/spreadsheets`.
- **Spreadsheet id:** `config/sheets.json`, `{"spreadsheet_id": "..."}`. For testing, use the id in
  `../shiniri/.env.local` (`VITE_JOURNAL_SHEET_ID`). Following the web app's README, that id points at a
  **copy** of the journal, so test rows never land in the real Progression sheet. Clear test rows (`Profile`
  and `AuditLog`) by hand before the real run, because a test row dated today trips the duplicate guard.
- `config/service-account.json` must be added to `.gitignore`. Only `config/cookie.txt` is ignored today.
- Python ≥ 3.14, `httpx`, plus one new dependency for Google auth (see Approaches).

## Approaches

**Process** (user picked B):
- A. A systemd service with `Restart=always`. It starts on boot and restarts after a crash. Rejected by the
  user, who doesn't want systemd.
- **B. A plain long-running loop, run in `tmux` or with `nohup` (picked).** No setup. It stays down after a
  reboot or crash until restarted.

**Sheet writing** (user picked A):
- **A. A port of the web app's `writeTabsAtEnd` (picked).** It checks the headers, finds the next empty row
  from column A, confirms the target is empty, then sends one `batchUpdate` with the data row plus the
  `AuditLog` row. This is atomic, and it matches the existing sheet conventions.
- B. Google's `values.append`. Simpler, but the `AuditLog` row needs a second request, so it isn't atomic.
- C. `gspread`. A heavy dependency that still splits the two writes.

## Design

### The loop (`shiniri-cli watch`)

- **Entry point:** `run()` in `cli.py` starts the shell today. `watch` as the first argv runs the loop instead,
  and no argument still starts the shell.
- **Timing:** it checks once on start (so a fresh start doesn't wait up to an hour), then sleeps until the next
  :59 WIB and checks again, forever. WIB is a fixed UTC+7 offset with no daylight saving.
- **Game day:** the WIB date of (now − 3h). The 02:59 check is the last one for the game day that started at
  03:00 the previous calendar day.
- **One check:**
  1. Load `data/daily.json`. If its `day` isn't today's game day, start fresh: `{day, written: false}`.
  2. If `written` is already true, do nothing.
  3. Re-read `config/cookie.txt` with `load_cookie` (never cached, so a fresh cookie from `ambil` is picked
     up), then fetch `GetUserDailyContentsProgress`. Save `daily_progress[0]` into `daily.json` under
     `progress`.
  4. If `daily_mission_received_points >= 100`, or this is the 02:59 check, fetch basic and outpost info,
     build the row and write it (below). On success, set `written: true` and save.
- **Errors:** `AuthError`, `httpx` errors, a non-zero `code` and Sheets errors are logged, and that check ends.
  The loop carries on. The next hour retries, because `written` is still false. A failed 02:59 check means that
  day has no row. That is accepted and the error is logged.
- **Logging:** one timestamped line per check on stdout (for example `game day 2026-11-20: not done (30/100)`,
  `wrote Profile!A12:AU12`, `cookie rejected`). Under `nohup` the user redirects it to a file.
- `daily.json` is written with `store.atomic_write`.

### The row

The `Profile` tab, one row per game day. Headers (camelCase like the web app's tabs), checked word for word
before every write:

| Header | Source |
|---|---|
| `date` | game day, `YYYY-MM-DD` |
| `takenAt` | WIB `YYYY-MM-DD HH:MM:SS`, as the web app's `wibTimestamp` writes it |
| `dailyDone` | `TRUE` if the 100 points were claimed, `FALSE` if written by the 02:59 fallback |
| `level`, `teamCombat`, `nikkes`, `costumes` | basic `lv`, `team_combat`, `character_count`, `character_costume_count` |
| `elysionNikkes`, `missilisNikkes`, `tetraNikkes`, `pilgrimNikkes`, `abnormalNikkes` | `corporation_character_counts` by `corporation_type` 1, 2, 3, 4, 7 |
| `paidGems`, `freeGems`, `battleData`, `credits`, `coreDust`, `recruitVouchers`, `advRecruitVouchers`, `silverMileage`, `goldMileage` | `currencies` by `type` 98, 99, 1000, 2000, 3000, 5100, 5200, 11000, 12000, written as numbers |
| `easyCampaign`, `normalCampaign`, `hardCampaign` | `progress_*_campaign` stage ids, written as the stage name from `stage_list` (`6050044` → `50-36`, dropping the ` BOSS` / ` HARD BOSS` / ` STAGE` suffix). Falls back to the raw id if the stage isn't listed |
| `tribeTower`, `elysionTower`, `missilisTower`, `tetraTower`, `pilgrimTower` | `progress_tribe_tower`, `progress_<corp>_tower` |
| `overclockCurrent`, `overclockLatest` | `sim_room_overclock_current_sub_season_high_score`, `sim_room_overclock_latest_season_high_score` |
| `synchroLevel`, `synchroSlots`, `outpostLevel` | outpost `synchro_level`, `synchro_nonempty_slot_count`, `outpost_battle_level` |
| `recyclePersonal`, `recycleAttacker`, `recycleDefender`, `recycleSupporter`, `recycleElysion`, `recycleMissilis`, `recycleTetra`, `recyclePilgrim`, `recycleAbnormal` | `recycle_room_researches` `lv` by `tid` 1001, 1101, 1102, 1103, 1201–1205 |
| `memoirs`, `callLogs`, `bgm`, `data` | lost relics: `memorial_counts` `HandWriting`, `CallLog`, then outpost `jukebox_count`, then the sum of every other `memorial_counts` category |

That's 47 columns (A to AU). Left out: name, icon, ids, banned/maintenance flags, profile team, overclock
history by season, infra core, tactic academy.

A missing id (for example a new currency type the game adds) writes a blank cell, not an error. An unknown
extra id is ignored. The mapping tables live as constants in one place, so adding a column is one edit plus a
header in the sheet.

### Sheet writer (port of `shiniri/src/services/sheets/tabWriter.ts`)

Calls go through `httpx` to `https://sheets.googleapis.com/v4/spreadsheets/{id}/values/...`, with the bearer
token from the service account credentials.
1. Read row 1 of `Profile` and of `AuditLog`. Each must match its headers exactly
   (`AuditLog`: `savedAt | form | ranges | rows`), or the write fails with a "headers changed" error.
2. Read column A of each, unformatted, and take the row after the last non-blank cell.
3. **Duplicate guard:** if the last `date` in `Profile` is already today's game day, skip the write and mark
   `written: true`. This covers a lost or reset `daily.json`.
4. Read each target range. If any cell is non-blank, refuse.
5. One `values:batchUpdate` with `valueInputOption: USER_ENTERED` and both ranges. The `AuditLog` row is
   `['<wib timestamp>, 'cli-profile', '<Profile range>, 1`. The leading `'` keeps the timestamp and the range
   as text, the same as the web app.

**Accepted race (user's choice):** the web app and `watch` both write the next `AuditLog` row. If a web
save lands in the gap of a second or so between the CLI's empty check and its write (or the other way round),
one audit row overwrites the other. Only the CLI writes to `Profile`, so its data rows are safe. Keep the
single atomic write and mark the gap with a `shortcut:` comment, as `tabWriter.ts` does. Don't switch to
`values.append`.

### Cookies (contract with `ambil`, built in that repo, not here)

`ambil` keeps a logged-in Chrome profile (`~/.blablalink-profile`) and visits blablalink daily. The follow-up
in `ambil`: after each blablalink run, write that browser's `.blablalink.com` cookies as a Cookie header
string (`name=value; ...`, including `game_token` and `game_openid`) to shiniri-cli's `config/cookie.txt`.
Write it to a temp file in the same directory and rename it over the old one, so the CLI never reads half a
file. The path is set in `ambil`'s config. When the browser session itself expires, `ambil` already sends its
`SessionExpiredException` alert. The CLI needs nothing beyond re-reading the file on every check, which this
design already does.

**To verify once it runs:** that the browser's daily visit actually refreshes `game_token`. If it doesn't, the
cookie expires on its own schedule whatever `ambil` does, and this contract needs rethinking.

## Setup (homeserver, one time)

1. **Google Cloud project:** go to <https://console.cloud.google.com>, then create a project (or reuse the
   web app's), then *APIs & Services → Library → Google Sheets API → Enable*.
2. **Service account:** *IAM & Admin → Service Accounts → Create service account*. Give it a name such as
   `shiniri-cli` and grant no roles. Open it, go to *Keys → Add key → Create new key → JSON*, and a `.json`
   file downloads.
3. Copy that file to the homeserver as `shiniri-cli/config/service-account.json`, then run
   `chmod 600 config/service-account.json`.
4. **Share the sheet:** open the Progression spreadsheet, click *Share*, and add the service account's email
   (`...@<project>.iam.gserviceaccount.com`, also in the JSON as `client_email`) as an **Editor**, with
   "notify" turned off. Do the same for the test sheet.
5. Write `config/sheets.json` as `{"spreadsheet_id": "<id from the sheet URL>"}`.
6. Add a `Profile` tab whose row 1 holds the 47 headers above, in order. `AuditLog` already exists.
7. Run it: `tmux new -s shiniri`, then `cd shiniri-cli && uv run shiniri-cli watch`, then detach with
   `Ctrl-b d`. Or use `nohup uv run shiniri-cli watch >> data/watch.log 2>&1 &`.

## Left to the builder

- **Google auth library:** `google-auth` (`service_account.Credentials`, refreshed when it expires) is the
  expected pick. It needs `requests` as its token transport. Signing the JWT by hand with `cryptography` is
  also acceptable if that keeps the dependency set smaller.
- Module layout. A `profile.py` (fetch, row building, guard file) and a `sheets.py` (writer) are suggested,
  following the existing `union.py` style.
- Tests use fake HTTP, like the existing fetch and union tests. Cover the game-day rollover at 03:00, the
  02:59 fallback, the duplicate guard, the header mismatch, a non-empty target, and building the row from the
  `blabla.yml` samples.
