# shiniri

Live at <https://shiniri.varoa-dwi.workers.dev/>.

shiniri logs NIKKE progress into one Google Sheet, the _NIKKE Progression Journal_. The sheet is
the only copy of the data. Two parts write to it, append-only:

- [`ui/`](ui/README.md): the web app for logging farming runs by hand (Vue, deployed on Cloudflare).
- [`cli/`](cli/README.md): a shell for blablalink clear history and union raids, plus a `watch`
  mode that logs the daily profile, clears and union raids to the sheet (Python, runs on a
  homeserver).

## Layout

```
CLAUDE.md          shared sheet contract and development flow
CONTRIBUTING.md    branches, commits, checks, release
docs/state/        how each module works now
docs/decisions/    decisions worth not undoing
docs/plans/archive/ finished specs and plans, for history
ui/                the web app
cli/               the CLI
```
