# Profile tracking: snapshots, daily reminders, profile menu

> **Status: WORK IN PROGRESS, not approved.** The brainstorm paused 2026-11-19 so the user can continue on their home PC, which holds the Kotlin automation. Next session, ask the questions below one at a time before planning or building anything. Everything marked "my call" is a proposal the user hasn't confirmed.
>
> **Open questions, most important first:**
> 1. Where does the shell run day to day: the homeserver (SSH) or the Windows PC? Snapshots live in the homeserver's `data/`, so this decides whether we need syncing.
> 2. How does the Kotlin automation store and use the Telegram bot (token and chat id format, any message style to match)?
> 3. Is the "undone dailies" list right? What's missing, and what's noise (counsel, outpost storage)?
> 4. Should the reminder stay quiet at certain hours (night), or send every 3h whenever something is left?
> 5. Is the tracked-fields list for `history` right? Should anything else be tracked (currencies, sim room overclock, recycle room)?
> 6. Approach A (a one-shot `snapshot` command plus cron/systemd) is my pick. Confirm, or prefer another.
> 7. Cookie renewal through the Kotlin Chrome-profile login check: in scope now, or later?

## Why

Clear and union work as live query tools because the server keeps their history: every clear and every raid hit. Profile data is different. The server only answers "how things stand right now". To see account growth over time (level, team power, synchro, outpost, campaign and tower progress), something has to snapshot the profile on a schedule and keep every snapshot. The same scheduled run can check daily progress and send a Telegram nudge when dailies are still undone, so a forgotten daily gets caught within 3 hours.

## Goals

- **One run** (`shiniri-cli snapshot`) does three things in order:
  1. It calls the three profile requests.
  2. It saves them together as one timestamped snapshot.
  3. If dailies are undone, it sends a Telegram message listing what's left.
- The homeserver runs it every 3 hours with its own scheduler.
- **Cookie failures are never silent.** A rejected cookie (`code 300001`) or a transport failure sends a Telegram message saying so.
- **A `profile` group in the shell**, built on the shared `GROUPS` mechanism, reads stored snapshots and never calls the server:
  - `profile now`: the latest snapshot, as a summary of key fields.
  - `profile history [field]`: one row per day (that day's last snapshot) for the tracked fields, or for one field.
  - `profile daily`: the latest daily progress, the same list the reminder sends.
- **The bot is the same one the Kotlin quest automation uses**, so no new bot is created.

## Non-goals

- `GetUserGamePlayerInfo` (the user said basic info covers it).
- Renewing the cookie automatically from the Kotlin automation's Chrome-profile login check. This is a likely follow-up and has its own design.
- Telegram commands or replies. The bot only sends.
- A long-running daemon inside this project.

## Anti-goals

- A reminder setup that fails quietly. An expired cookie that stops reminders without telling the user is worse than no reminders at all.
- Spamming. One message per run, and none when everything is done.

## Constraints

- **History starts on the first snapshot.** The server has no past values.
- **Request shape:** `POST https://api.blablalink.com/api/game/proxy/Game/<Name>` with body `{"intl_open_id": <game_openid cookie>, "nikke_area_id": 85}`. The names are `GetUserProfileBasicInfo`, `GetUserProfileOutpostInfo` and `GetUserDailyContentsProgress`. The cookie comes from `config/cookie.txt` (via `load_cookie`). `AREA_ID` and `AUTH_CODE` are already in `fetch.py`, and the retry/auth pattern is `union._call`.
- **Sample responses** are in `blabla.yml`, under the `profile` folder.
- **Where it runs:** the homeserver, which is up about 97% of the time, alongside the Kotlin automation.
- **Secrets:** the Telegram bot token and chat id go in `config/telegram.json`, which is gitignored like `config/cookie.txt`.

## Approaches

- **A. One-shot command plus the homeserver's scheduler (chosen, my call).** `shiniri-cli snapshot` runs once and exits, and cron or a systemd timer runs it every 3 hours. Nothing has to stay alive, a crash only loses one run, and it reuses the existing `Store`, cookie and httpx code.
- **B. A long-running daemon with its own timer loop.** It still needs something to keep it alive (systemd), so it adds a process to supervise and gains nothing over A.
- **C. Have the Kotlin jar call the profile APIs and send the reminders.** It would keep everything in one place, but it splits profile logic across two languages. The shell's profile menu needs this project's stored snapshots anyway.

The user handed over the how ("let's just create the plan"), so A is my call.

## Design

- **Storage:** each run saves `data/raw/json/profile/<YYYYMMDD-HHMM>.json` (local time). The file holds `{"taken_at": <epoch>, "basic": <data.basic_info>, "outpost": <data.outpost_info>, "daily": <data.daily_progress[0]>}`. Only answers with `code == 0` are kept. If any of the three fails, nothing is saved for that run and the failure is reported.
- **Tracked fields for `history`** (my call, so they're easy to change in one tuple):
  - `lv`, `team_combat`, `character_count`, `character_costume_count` (from basic)
  - `synchro_level`, `outpost_battle_level` (from outpost)
  - `progress_normal_campaign`, `progress_hard_campaign`, `progress_tribe_tower` (from basic)
- **Undone dailies** (my call). An item counts as left when it is non-zero:
  - `daily_mission_receivable_points > 0` (points earned but not claimed)
  - `daily_mission_received_points < 100`
  - `rookie_arena_remaining_count`
  - `special_arena_remaining_count`
  - `intercept_remaining_tickets`
  - `counsel_remaining_count`
  - any `tower_daily_info_list` entry with `is_opened` and `remaining_count > 0`

  Outpost storage fullness of 0.9 or more is also listed, as "outpost storage almost full".
- **Telegram:** a `POST https://api.telegram.org/bot<token>/sendMessage` with `{"chat_id", "text"}` through httpx. If `config/telegram.json` is missing, `snapshot` prints the message instead and exits 0, which helps with testing on the PC.
- **Exit code:** 0 on success, including "reminder sent". It is 1 when the snapshot failed, so the scheduler's logs show it.
- **The profile group** reads snapshots through a `build_profile(store)` loader, in the same style as `build_union`. Its commands render a `Result` through the existing `_show` path with scope `"profile"`, which is added to `SCOPES`. They are always rebuilt (`force=True`), because snapshots arrive from another process and a cached export would go stale.

## Left to the builder (decide at home)

- **Where the shell runs** (the user decides). Snapshots live in `data/` on the homeserver. If the user runs the shell on the Windows PC, the profile menu there is empty unless `data/raw/json/profile/` is synced or the shell is used over SSH.
- **The Telegram token and chat id format** in the Kotlin project. Copy them into `config/telegram.json` as `{"token": "...", "chat_id": "..."}`.
- **The daily reset time.** The reminder doesn't need it, because it reads live remaining counts. But `history` "one row per day" uses local midnight; that's my call, and you can change it if reset-aligned days read better.
- **What `progress_normal_campaign: 6050044` means.** It looks like mode/chapter/stage digits. Show it raw until it's decoded.
- **The scheduler line** (cron or systemd timer) on the homeserver, for example `0 */3 * * * cd /path/shiniri-cli && uv run shiniri-cli snapshot`.
