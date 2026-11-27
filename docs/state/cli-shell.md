# CLI shell, Store and Union Raid data

## Purpose

The interactive `shiniri-cli` shell on the owner's machine, the `Store` that keeps raw JSON and
derived files under `cli/data/`, and the Union Raid fetch and query code that both the shell and
`watch` use (`cli-watch.md` covers the sheet writes). Paths are under `cli/src/shiniri_cli/`.

## Public surface

- Shell: `main`, `App`, `COMMANDS`, `UNION_COMMANDS`, `GROUPS`, `parse_command` in `cli.py`. Main
  commands: `union`, `sync`, `news`, `cookie`, `help`, `quit`. The only group is `union`: alone it enters
  union mode, `union <cmd>` is a one-off, `back` leaves.
- Union mode commands: `fetch`, `live`, `sN` / `season`, `hits`, `missed`, `normal`, `top`, `member`,
  `members`, `growth`, `boss`, `help`, `back` (`union_queries.py`).
- Store: `Store` in `store.py` (`raw_dir`, `parsed_dir`, `exports_dir`, `config_dir`, `load_raw`,
  `save_raw`, `state`, `mark`, `migrate`, `wipe_exports`), plus `atomic_write`, `write_csv`.
- Union data: `fetch_union`, `build_union`, `is_final`, `write_union_parsed` in `union.py`;
  `UnionData`, `FINAL_GRACE`, `SIZE_TRUST`.
- Reference files: `sync_reference` and `cdn_url` in `fetch.py`, paths in `cli/config/sources.json`.
  Known CDN paths are in `docs/cdn-map.md`.
- News: `update`, `release_dates`, `stored_articles`, `stored_costumes`, `write_release_csv` in
  `news.py`. No cookie; its own HTTP client.
- Cookie: `parse_cookie`, `save_cookie`, `load_cookie` in `fetch.py`.

## Invariants and rules

- The `cookie` command takes the header only from a hidden prompt, never inline, so the token never
  reaches shell history. `test_cli.py` (`test_cookie_never_taken_inline`).
- A unique prefix runs a command (`parse_command`); several matches or none is a `QueryError` and
  the shell keeps running. `s\d+` is a season shortcut in union mode only. A leading `!` forces a
  rebuild of an export. `test_cli.py` (`test_completer_resolves_prefixes`, `test_bad_args_keep_running`).
- Each line clears the visible screen and echoes the prompt and line dimmed. The clear is in `main`,
  not `App.execute`, so tests that call `execute` are unaffected. An empty Enter leaves the screen.
- The cookie is never needed for queries over stored data, only for `fetch` and `live`.
- A season file is final once its `fetched_ts` is more than `FINAL_GRACE` (1 h) after `end_ts`, and
  a final file is never overwritten (`is_final`). A download with fewer hits than the stored one is
  rejected (`failed: fewer hits than stored`). A failed or "not in guild" answer (code 1303028) never
  replaces a file. `test_union.py`.
- The guild roster is fetched with each season (`members` key) and used for the season's roster only
  while it is within `SIZE_TRUST` (7 days) of the season's end, because the roster is today's.
  The newest stored season is never replaced by an older one.
- Hit fields: on level 4 `current_hp` is the damage dealt, on levels 1-3 it is HP left. `day` is
  0-based and shown 1-based. Difficulty other than 1 or 2 stays in the raw file and queries ignore it.
- Damage is shown in full with a short form beside it from 1M (`fmt_dmg`, `short_dmg` in
  `union_queries.py`). A mode with no hits shows `-`.
- At shell startup `union_hits.csv` is rebuilt, and union exports are wiped, when any raw season
  file or `nikke_list_en`, `character_id_map` or `raid_list` is newer than the CSV (`App.__init__`,
  `scopes_to_wipe`). `SCOPES` is `("union",)`. `test_cli.py` (`test_startup_rebuilds_union_after_background_name_sync`).
- `fetch` and `live` wipe union exports. `fetch all` is gone: campaign and tower clears are fetched
  by `watch` (`clear_sheet.py`).
- Raw reference files are named after the CDN files minus the version (`stage_list`, `tower_list`,
  `nikke_list_en`, `character_id_map`, `raid_list`). `Store.migrate` still renames the older names
  (`OLD_NAMES`).
- CDN URLs are computed, with no fallback to old hashed URLs, so a site change fails loudly:
  `sync_reference` adds `(site may have changed its URL scheme)` to HTTP errors.
- `campaign_targets` (`fetch.py`) skips stages before the last stored clear in a chapter, because a
  quick-cleared stage has no lineup to fetch. Code `300001` (`AUTH_CODE`) is an auth stop, never
  "uncleared".
- Store files are written through `atomic_write`.
- `news` downloads only ids it doesn't have (`--force`: all), once across the three labels, 0.3 s apart.
  Raw responses are the source of truth; the Markdown is rebuilt from them. Any failed article means no
  CSV, because a gap could make a rerun look like a first release. `test_news.py`.
- `releaseDate` is a costume's first release. The first article (by publish time) with the NIKKE's and the
  costume's names on one line decides. It must be an "Update on <Month Day>" note that names them
  together ("Nikke - Costume", "Nikke's costume, Costume"), else blank. A later start date stated in a
  numbered section naming them wins over the title date. Year comes from the publish time.
  `test_news.py`.

## Owns

`cli/data/` (gitignored): `raw/json/` (reference, `union/` seasons, clears, `roledata/`, `news/`), `parsed/`
(`union_hits.csv`, `news/*.md`), `exports/` (with `costume_release_dates.csv`), `state.json`, `.history` (shell history), plus the files in
`cli-watch.md`. `cli/config/cookie.txt` is shared with the separate `ambil` tool, which refreshes it.

## Gotchas

- The shell has no campaign or tower commands. Parsed campaign CSVs are no longer written.
- Old exports stay on screen until rebuilt, because a changed format does not wipe them.
- `CUBE_PATH` and `FAVORITE_PATH` in `fetch.py` have no caller yet. (unconfirmed whether still wanted)
- Whether the browser's daily visit refreshes `game_token` in the `ambil` cookie file is not
  verified. (external repo)

## Known gaps

- No `profile` or investment shell group exists. The plan for them is superseded by `watch`.
  (unconfirmed whether a shell `profile` group is still wanted)
