# shiniri cli

Interactive shell that fetches NIKKE clear history and union raid data from blablalink, plus a
`watch` mode that writes it to the sheet. Python 3.14, managed by uv only (no pip, no hand-made
venv). Sheets access is a service account (`config/service-account.json`, sheet id in
`config/sheets.json`, both gitignored). `watch` runs on the owner's homeserver via `start.sh` /
`stop.sh` and logs to `data/watch.log`. The homeserver checks out only `cli/` (sparse clone) and
tracks `develop`.

The sheet contract and development flow are in `../CLAUDE.md`. Paths here are relative to `cli/`.

## Specifics

- The writer is `write_rows` in `src/shiniri_cli/sheets.py`, a port of
  `../ui/src/services/sheets/tabWriter.ts`. Each tab writer keys on column A (date, stage id,
  season).
- `tools/` holds dev-only scripts run from the owner's machine (`tools/assets.py` fills
  `../ui/public/img/`). They are not part of the `shiniri_cli` package and `watch` never imports
  them.

## Checks

- `uv run pytest`, run from `cli/`. Sheets and blablalink calls are tested against fakes
  (`tests/conftest.py` `FakeSheets`, `httpx.MockTransport`).
- Pre-merge check for the owner: a `watch` run on the homeserver, or commands in the shell. Real
  API behaviour is only checked there.
