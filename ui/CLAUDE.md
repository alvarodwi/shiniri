# shiniri ui

The web app: a personal input app for NIKKE farming logs. Vue 3 + Vite + UnoCSS + Pinia SPA with
hash routing and no backend. It writes to Google Sheets via the Sheets REST API with a browser OAuth
token (Google Identity Services). Cloudflare deploys from `main`, with build settings in the Cloudflare dashboard (root
directory `ui`, build command `yarn build`). There is no wrangler file in the repo.

The sheet contract and development flow are in `../CLAUDE.md`. Paths here are relative to `ui/`.

## Specifics

- The writer is `writeTabsAtEnd` in `src/services/sheets/tabWriter.ts`. It does one
  `values:batchUpdate` for all tabs of a save, so a save lands everywhere or nowhere. The
  `AuditLog` tab is configured in `SPREADSHEETS`. Growing a short grid is `SheetsApi.ensureRows`.
- The web app never keeps a local copy of log data either (no localStorage or IndexedDB cache of
  rows).
- In development, `.env.local` points at a copy of the journal, never the real sheet.

## Adding a form

Add a `TabSpec` in `src/config/sheets.ts` (exact headers), pure row logic in
`src/services/<form>/`, a store in `src/stores/`, a page in `src/pages/`, components in
`src/components/<form>/`, and a route. A pull form (a gacha tab) has no route of its own: add it
to `PULL_FORMS` in `src/services/gacha/pullForms.ts` and to the `pages` and `stores` maps in
`src/pages/Pulls.vue`, and give its store `isDirty` and `discard`. `services/google` and `services/sheets` should not need
changes.

## UI

UI is phone-first. Keep pages uncluttered (no long lists of logged items; that belongs to a future
dashboard), label every input, and hide sheet links on small screens.

## Node

- Developed and tested on Node 26.13.1 (Yarn 4.18.1 via `packageManager`).
- Vitest 5.1 requires `^22.12.0 || ^24.0.0 || >=26.0.0`, so odd or old lines (20, 21, 23, 25) cannot run
  the tests. Vite 8.3 alone needs `^20.19.0 || >=22.12.0`. Use Node 24 or newer.
- No `engines` field or `.nvmrc` pins this. After bumping `vitest` or `vite`, re-check
  `node_modules/vitest/package.json` `engines` and update this section.

## Checks

- `yarn format && yarn lint && yarn check && yarn build && yarn test`, run from `ui/`.
- Pure logic and stores have Vitest tests next to the source (`*.test.ts`). UI and Google sign-in
  are verified by hand against a sheet copy.
- Pre-merge check for the owner: log a few runs against the sheet copy and confirm the rows land
  directly below the existing data, with nothing else changed.

## Release

1. Run the checks on `develop`.
2. Push `develop` first.
3. Fast-forward `main` to `develop`, bump `version` in `package.json` (minor for features), commit
   `chore: bump to version X.Y.Z` (semver: minor for features, patch for fixes only), push `main`.
   Cloudflare deploys from `main`.
4. Fast-forward `develop` to `main` and push it, so both carry the bump.
5. Prune merged branches, local and remote.

## Reviewing the UI

- Run `yarn dev:mock` and open `http://localhost:5173/#/journal/anomaly` (or the port Vite prints, if 5173 is
  taken). The app starts signed in on a fake
  in-memory sheet (`src/services/mock/`); nothing is sent to Google, and a banner says so.
- Saves land in the fake sheet, so follow-up screens update. Everything resets on reload.
- Use it to check how pages look and behave. Real sheet behaviour (formats, formulas, headers) is
  still the owner's manual check on the sheet copy. Known limits: formulas are stored as text, not
  computed, and sheet links open a dead page (the sheet ID is a placeholder).
- Mock mode exists only under `vite --mode mock` on the dev server (`__MOCK__` in
  `vite.config.ts`); builds never contain it. A new form adds its tab to
  `MOCK_SHEETS` in `src/services/mock/fixtures.ts`.
- Overcore scenarios (the mock AllPulls and RosterLog put Rapi and Noah at copy 11):
  1. `#/exchange` (opens Pulls on Exchange): source Gold Mileage, target Rapi, copies 1, Save. Expect the "Saved to ..." line
     plus a remark containing `Rapi C8`.
  2. `#/mold` (opens Pulls on Mold): Pilgrim Perfect Mold, Amount opened 1, pick Noah, Save session. Expect a remark containing
     `Noah C8` and ending `And she's a Pilgrim.`
  3. The mock AllPulls is static, so repeats show C8 again; reload to reset.
- Headless check without a browser tool:
  `google-chrome --headless=new --virtual-time-budget=5000 --dump-dom http://localhost:5173/#/journal/level`.
