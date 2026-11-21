# shiniri

Personal input app for NIKKE farming logs. Vue 3 + Vite + UnoCSS + Pinia SPA with hash routing and
no backend. It writes to Google Sheets via the Sheets REST API with a browser OAuth token (Google
Identity Services). Netlify deploys from `main`.

## Invariants

- The Google Sheet is the only source of truth. Never add a local or server-side copy of log data.
- Append-only: the app never updates, clears, inserts or deletes existing cells. Every write goes
  through `writeTabsAtEnd` in `src/services/sheets/tabWriter.ts`. For each tab it checks headers,
  finds the next empty row at call time and checks that the target is empty, then does one
  `values:batchUpdate` for all tabs, so a save lands everywhere or nowhere. That batch also appends
  one row to the spreadsheet's `AuditLog` tab (configured in `SPREADSHEETS`).
- Before that batch, a save may append blank rows at the bottom of a tab whose grid is too short
  (`SheetsApi.ensureRows`). Blank rows left by a failed save are harmless.
- Never hardcode row numbers. The sheet is live data and grows daily.
- In development, `.env.local` points at a copy of the journal, never the real sheet.

## Adding a form

Add a `TabSpec` in `src/config/sheets.ts` (exact headers), pure row logic in
`src/services/<form>/`, a store in `src/stores/`, a page in `src/pages/`, components in
`src/components/<form>/`, and a route. `services/google` and `services/sheets` should not need
changes.

## Before working

- Read `CONTRIBUTING.md`. Branch `feat/<name>` or `fix/<name>` from `develop`.
- Specs and plans live in `docs/superpowers/`.

## How the owner works

- Feature flow: brainstorm, short design doc in `docs/superpowers/specs/`, plan in
  `docs/superpowers/plans/`, then implement in this session ("natively"), not with a subagent per
  task. This is the default; don't ask which execution style. One fresh reviewer checks the whole
  branch at the end. Fix its findings on the branch, minor ones included. Anything found after the
  merge becomes a new `feat/` or `fix/` branch.
- Don't commit until the owner says so. On "commit and merge": one commit on the feature branch,
  then fast-forward `develop` and delete the merged branch. Don't push unless asked.
- Before a merge, give the owner the exact checks to run on the sheet copy. The owner runs them and
  reports back.
- The owner edits the sheet by hand: new tabs and header rows, and fixes to logged rows. The app
  never creates tabs or edits rows. Say plainly when a change needs a manual sheet step, and that
  the real sheet needs it before release.
- Sheet strings (headers, `sourceType`, slot names) must match the sheet verbatim. Ask for the exact
  text when unsure, never guess.
- Headers of tabs the app writes to are lowerCamelCase with no spaces (`newSynchroLevel`,
  `totalDmg`). A new form's tab follows this; the owner renames old headers by hand on both sheets.
- UI is phone-first. Keep pages uncluttered (no long lists of logged items; that belongs to a future
  dashboard), label every input, and hide sheet links on small screens.

## Release

1. Run the checks on `develop`.
2. Push `develop` first.
3. Fast-forward `main` to `develop`, bump `version` in `package.json` (minor for features), commit
   `chore: bump to version X.Y.Z` (semver: minor for features, patch for fixes only), push `main`.
   Netlify deploys from `main`.
4. Fast-forward `develop` to `main` and push it, so both carry the bump.
5. Prune merged branches, local and remote.

## Checks

- `yarn format && yarn lint && yarn check && yarn build && yarn test`.
- Pure logic and stores have Vitest tests next to the source (`*.test.ts`). UI and Google sign-in
  are verified by hand against a sheet copy.

## Reviewing the UI

- Run `yarn dev:mock` and open `http://localhost:5173/#/anomaly` (or the port Vite prints, if 5173 is
  taken). The app starts signed in on a fake
  in-memory sheet (`src/services/mock/`); nothing is sent to Google, and a banner says so.
- Saves land in the fake sheet, so follow-up screens update. Everything resets on reload.
- Use it to check how pages look and behave. Real sheet behaviour (formats, formulas, headers) is
  still the owner's manual check on the sheet copy. Known limits: formulas are stored as text, not
  computed, and sheet links open a dead page (the sheet ID is a placeholder).
- Mock mode exists only under `vite --mode mock` on the dev server (`__MOCK__` in
  `vite.config.ts`); builds never contain it. A new form adds its tab to
  `src/services/mock/fixtures.ts`.
- Headless check without a browser tool:
  `google-chrome --headless=new --virtual-time-budget=5000 --dump-dom http://localhost:5173/#/level`.
