# shiniri

NIKKE progress, logged into one Google Sheet by two parts:

- `ui/`: the web app. Vue SPA, browser OAuth, deployed by Netlify. See `ui/CLAUDE.md`.
- `cli/`: the Python CLI. Its `watch` runs on the owner's homeserver with a service account. See
  `cli/CLAUDE.md`.

Both write to the same sheet under the same contract. Some logic is duplicated between them on
purpose (TypeScript vs Python), and that's expected.

## Sheet contract

- The Google Sheet is the only source of truth for logged data. Never add a server-side copy of
  it.
- Every write goes through one writer per part: `writeTabsAtEnd` in
  `ui/src/services/sheets/tabWriter.ts` and `write_rows` in `cli/src/shiniri_cli/sheets.py`. They
  are ports of each other. Each one:
  - checks headers,
  - finds the next empty row at call time,
  - checks that the target is empty,
  - does one `values:batchUpdate` carrying the data and its `AuditLog` row, so the audit row
    exists only if the write landed.
- Append-only: never update, clear, insert or delete existing cells. The one structural change
  allowed is appending blank rows at the bottom of a tab whose grid is too short. Blank rows left
  by a failed write are harmless.
- Each writer skips what the sheet already has, keyed on column A. A rerun must never duplicate
  rows.
- Never hardcode row numbers. The sheet is live data and grows daily.
- The owner edits the sheet by hand: new tabs, header rows, and fixes to logged rows. Neither part
  ever creates tabs or edits rows.
- Sheet strings (tab names, headers, `source`/`sourceType` values, slot names) must match the sheet
  verbatim. Ask for the exact text when unsure, never guess.
- Headers of tabs either part writes to are lowerCamelCase with no spaces (`bossElement`,
  `totalDmg`). The owner renames old headers by hand, on both the real sheet and the copy.

## Development flow

Each step runs in its own session and stops when it is done; the owner starts the next one. Opus
runs brainstorm, plan and review. A cheaper model (Sonnet or lower) runs execute and merge.

On the `opusplan` model (Opus in plan mode, Sonnet outside it): start brainstorm, plan and review in
plan mode (shift+tab), so Opus does the thinking. Write the spec, plan or `## Review N` only after
the plan is approved, and copy its content, sheet strings included, verbatim. Execute and merge
stay out of plan mode.

1. **Brainstorm (Opus).** Branch `feat/<name>` or `fix/<name>` from `develop` (branch and commit
   rules are in `CONTRIBUTING.md`). Write a short design doc in `docs/superpowers/specs/`. Doc
   names say which part they touch.
2. **Plan (Opus).** Write the plan in `docs/superpowers/plans/`. Write every sheet string (tab
   names, headers, values) verbatim, so execution never guesses. Stop.
3. **Execute (cheaper model).** Implement the plan in this session ("natively"), not with a
   subagent per task; don't ask which execution style. On later rounds, fix every finding of the
   latest `## Review N` section of the plan instead, minor ones included. Run the checks of each
   part the change touches, as named in that part's `CLAUDE.md`. Stop; never start a review.
4. **Review (Opus).** One fresh reviewer checks the whole branch against the spec and plan, and
   appends its findings to the plan as `## Review N` (N counts up from 1). Then give the owner the
   exact pre-merge checks for each touched part; the owner runs them and reports back. Stop.

   Steps 3 and 4 repeat until the owner says "merge" or "release".
5. **Merge/release (cheaper model).** Don't commit until the owner says so. On "commit and merge":
   one commit on the feature branch, then fast-forward `develop` and delete the merged branch.
   Release steps are in `ui/CLAUDE.md`. Don't push unless asked.

Anything found after the merge becomes a new `feat/` or `fix/` branch.

A change to the sheet contract (write behaviour, headers, tab names) updates `ui/` and `cli/` on
the same branch, under one spec. Say plainly when a change needs a manual sheet step, and that the
real sheet needs it before release.

Releases are web-only; see `ui/CLAUDE.md`. The CLI ships by the homeserver pulling `develop`.

## Formatting

Prettier runs from `ui/` and covers only `ui/`. Root docs and Markdown aren't formatted.
