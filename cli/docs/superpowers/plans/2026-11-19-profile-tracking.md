# Profile Tracking Implementation Plan

> **Status: WORK IN PROGRESS. Do not execute.** The spec it argues from is still unapproved. Its open questions (at the top of the spec) come first. Then revise this outline into full TDD steps with superpowers:writing-plans.

**Goal:** A `shiniri-cli snapshot` command that saves profile snapshots and sends Telegram daily reminders, plus a `profile` shell group that reads the snapshots.

**Spec:** `docs/superpowers/specs/2026-11-19-profile-tracking-design.md`

**Tech Stack:** Python, httpx (already a dependency), rich, prompt_toolkit, pytest. No new dependencies.

## Draft task outline

1. **Profile fetch and storage** in a new `src/shiniri_cli/profile.py`:
   - `async fetch_snapshot(client, openid) -> dict` calls the three requests. It reuses the `union._call` pattern; lifting `_call` into `fetch.py` is probably worth it, since both would use it.
   - `save_snapshot(store, snap, now)` writes `profile/<YYYYMMDD-HHMM>.json`.
   - `build_profile(store) -> list[dict]` returns the snapshots, oldest first.
   - Tests use a fixture built from the `blabla.yml` sample responses.
2. **Daily check:** `undone(daily: dict) -> list[str]` uses the rules from the spec, and `reminder_text(items) -> str | None` builds the message. These are pure functions with table-driven tests.
3. **Telegram:** `async send(client, cfg, text)` posts to the Bot API, and `load_telegram(store) -> dict | None` reads `config/telegram.json`. Add `config/telegram.json` to `.gitignore`. Tests use an httpx `MockTransport`.
4. **The `snapshot` entry point:** a second script `shiniri-cli-snapshot`, or `shiniri-cli snapshot` dispatching on `argv`. It sends cookie/auth failures to Telegram and exits 1 when the snapshot failed. Tests cover the success, auth-failure and no-telegram-config paths.
5. **The `profile` group:**
   - `PROFILE_COMMANDS` (`now`, `history [field]`, `daily`, `help`, `back`), registered in `GROUPS` with the `p_` prefix.
   - Completer entries.
   - Add `"profile"` to `SCOPES`.
   - Rendering goes through `_show(..., force=True)`.
   - Tests mirror `test_clear_mode_and_back` and the one-shot tests.
6. **README:** cover the snapshot setup (cron line, `telegram.json`) and the profile commands.
