# CLI dev tools

## Purpose

Scripts in `cli/tools/` that the owner runs by hand on their own machine. They are not part of the
`shiniri_cli` package and `watch` never imports them (`cli/CLAUDE.md`).

## Public surface

- `cli/tools/assets.py`: `uv run python tools/assets.py`, run from `cli/`. Downloads images into
  `ui/public/img/` and encodes them to WebP with `cwebp -q 82 -m 6`, four downloads at a time. Jobs:
  `nikke_jobs` (the small `si` icon per NIKKE), `item_jobs` (8 resource icons from
  `cli/tools/items.json`), `costume_jobs` (the `mi` costume image, from roledata).
- `cli/tools/names.py`: read-only sweep of the gacha sheet. Reports names in the data tabs that are
  not in `NikkeDatabase`, and suggests the closest one. `COLUMNS` maps each tab to its name columns by
  header text.
- `cli/tools/summarize.py`: `uv run python tools/summarize.py [--limit N] [--force]`. One `claude -p` call
  per patch note, using `tools/summary_prompt.md` as the system prompt.
- `cli/tools/cdn.py`: prints the CDN URL for each path given, using `cdn_url` from `fetch.py`.

## Invariants and rules

- `assets.py` skips files that already exist. Re-downloading changed art is a non-goal: delete the
  file by hand. It stops at once if `cwebp` is not on PATH. `tests/test_assets.py`.
- A download counts only when the response has an `image/*` content type: an unknown resource icon
  returns HTTP 200 with an HTML page.
- Only the small `si` icon is cached for NIKKEs. Resource icons are not on the CDN; they come from 8
  site files.
- The costume job needs every roledata file. If any is missing it exits before any request, and
  `tools/` never fetches roledata (`watch` does).
- `names.py` never writes, not even an `AuditLog` row. It asks for header text it needs when a header
  was renamed and never guesses one. Config errors exit with code 1. `tests/test_names.py`.
- Duplicate names are reported as `NikkeDatabase: duplicate name X (codes)`. They are fixed by hand
  in the sheet, because `watch` keys on `nameCode` and never re-appends a renamed row.
- The closest-match fallback tries a longest-prefix match (`name + " "`) before `difflib`, so a collab
  full name suggests the base name. Tabs missing from the sheet are skipped.
- `summarize.py` takes patch notes newest first, only the later published note of two for one update date,
  and never developer's notes. It runs `claude` in `--safe-mode` with no tools, in an empty directory,
  because a note is web text. An existing summary is skipped unless `--force`; a failed or non-Markdown
  answer writes nothing. `tests/test_summarize.py`.
- `cdn.py` with no paths prints usage to stderr and exits 2. It makes no network call and checks no URL.

## Owns

`cli/data/summaries/` (gitignored; the owner propagates them). Images go to `ui/public/img/` and are committed to git (about 8 KB per NIKKE).

## Gotchas

- Committing the images is deliberate (see `docs/decisions/0007-images-in-git-urls-computed.md`).
- `git status` shows `ui/public/img/item/*.webp` as modified when the tool re-encodes them.

## Known gaps

- None found in code.
