# shiniri-cli

Interactive shell that fetches NIKKE clear history and union raid data from blablalink, plus a
`watch` mode that writes it to the same Google Sheet the shiniri web app uses. Python 3.14,
managed by uv only (no pip, no hand-made venv). Sheets access is a service account
(`config/service-account.json`, sheet id in `config/sheets.json`, both gitignored). `watch` runs on
the owner's homeserver via `start.sh` / `stop.sh` and logs to `data/watch.log`.

## Invariants

- Every sheet write goes through `write_rows` in `src/shiniri_cli/sheets.py`, a port of the web
  app's `tabWriter.ts`. It checks headers, finds the next empty row at call time, checks that the
  target is empty, and does one `values:batchUpdate` carrying the data and its `AuditLog` row, so
  the audit row exists only if the write landed.
- Append-only: never update, clear, insert or delete existing cells. The one structural change
  allowed is appending blank rows at the bottom of a tab whose grid is too short.
- Each tab writer skips what the sheet already has, keyed on column A (date, stage id, season).
  A rerun must never duplicate rows.
- Never hardcode row numbers. The sheet is live data and grows daily.

## Before working

- Branch `feat/<name>` or `fix/<name>` from `develop`.
- Specs and plans live in `docs/superpowers/`.

## How the owner works

- Feature flow: brainstorm, short design doc in `docs/superpowers/specs/`, plan in
  `docs/superpowers/plans/`, then implement in this session ("natively"), not with a subagent per
  task. This is the default; don't ask which execution style. One fresh reviewer checks the whole
  branch at the end. Fix its findings on the branch, minor ones included. Anything found after the
  merge becomes a new `feat/` or `fix/` branch.
- Don't commit until the owner says so. On "commit and merge": one commit on the feature branch,
  then fast-forward `develop` and delete the merged branch. Don't push unless asked.
- Before a merge, give the owner the exact checks to run (a `watch` run on the homeserver, or
  commands in the shell). The owner runs them and reports back.
- The owner edits the sheet by hand: new tabs and header rows, and fixes to logged rows. The CLI
  never creates tabs or edits rows. Say plainly when a change needs a manual sheet step.
- Sheet strings (tab names, headers, `source` values) must match the sheet verbatim. Ask for the
  exact text when unsure, never guess.
- Headers of tabs the CLI writes to are lowerCamelCase with no spaces (`bossElement`, `memberId`).
- A change to the shared sheet contract (`write_rows` behaviour, headers) usually needs the same
  change in the web app next door (`../shiniri`). Say so; it is a separate branch in that repo.

## Checks

- `uv run pytest`. Sheets and blablalink calls are tested against fakes (`tests/conftest.py`
  `FakeSheets`, `httpx.MockTransport`); real API behaviour is the owner's check on the homeserver.
