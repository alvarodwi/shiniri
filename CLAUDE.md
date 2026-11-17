# shiniri

Personal input app for NIKKE farming logs. Vue 3 + Vite + UnoCSS + Pinia SPA with hash routing and
no backend. It writes to Google Sheets via the Sheets REST API with a browser OAuth token (Google
Identity Services). Netlify deploys from `main`.

## Invariants

- The Google Sheet is the only source of truth. Never add a local or server-side copy of log data.
- Append-only: the app never updates, clears, inserts or deletes existing cells. Every write goes
  through `writeRowsAtEnd` in `src/services/sheets/tabWriter.ts`. It checks headers, finds the
  next empty row at call time, checks that the target is empty, then does one `values.update`.
- Never hardcode row numbers. The sheet is live data and grows daily.
- In development, `.env.local` points at a copy of the journal, never the real sheet.

## Adding a form

Add a `TabSpec` in `src/config/sheets.ts` (exact headers), pure row logic in
`src/services/<form>/`, a store in `src/stores/`, a page in `src/pages/`, components in
`src/components/<form>/`, and a route. `services/google` and `services/sheets` should not need
changes.

## Before working

- Read `CONTRIBUTING.md`. Branch from `develop`.
- Specs and plans live in `docs/superpowers/`.

## Checks

- `yarn format && yarn lint && yarn check && yarn build && yarn test`.
- Pure logic and stores have Vitest tests next to the source (`*.test.ts`). UI and Google sign-in
  are verified by hand against a sheet copy.
