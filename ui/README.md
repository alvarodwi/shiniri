# shiniri ui

Live at <https://shiniri.varoa-dwi.workers.dev/>.

Personal input app for NIKKE farming logs. It writes straight into Google Sheets, and the sheet is
the only copy of the data. The app keeps no database of its own.

Current forms:

- **Anomaly Interception**: the day's runs, written to the `Anomaly` tab of _NIKKE Progression
  Journal_.

Stack: Vue 3, Vite, UnoCSS, Pinia, TypeScript. It's a static site with no backend. Google sign-in
in the browser is the only access control.

## Google Cloud setup (once)

1. Create a project in Google Cloud console and enable the **Google Sheets API**.
2. Set up the OAuth consent screen: user type **External**, publishing status **Testing**, with your
   own Google account as the only test user. Only test users can get a token, so nobody else can
   use the app even if they find the URL. Google shows an "unverified app" warning at sign-in;
   that's expected.
3. Under Credentials, create an **OAuth client ID** of type Web application. Add these
   authorized JavaScript origins:
   - `http://localhost:5173`
   - the Cloudflare site URL (`https://shiniri.varoa-dwi.workers.dev`)

## Local development

Needs Node 24 or newer (developed on 26.13.1); Vitest 5 does not run on Node 23 or 25. See `CLAUDE.md`.

Run from `ui/`:

```sh
cp .env.example .env.local   # fill in both values
yarn install
yarn dev
```

Point `VITE_JOURNAL_SHEET_ID` in `.env.local` at a **copy** of the journal (File > Make a copy). The
real sheet is live data, so test writes should never land there. A stale copy is fine; it only
needs the same tab layout.

## Audit log tab (once per spreadsheet)

Every save also appends a row to an `AuditLog` tab in the same spreadsheet, and the Log page reads
it. Create the tab by hand with this header row in A1:D1, in both the real sheet and the copy:

```
savedAt | form | ranges | rows
```

Without it, every save is refused: a missing tab shows `Sheets API 400: Unable to parse range: 'AuditLog'!A1:D1`, and a wrong header shows a header error. Timestamps are stored as text, `YYYY-MM-DD HH:mm:ss` in WIB.

## Deploy (Cloudflare)

1. Connect the GitHub repo in the Cloudflare dashboard (Workers & Pages). Production branch: `main`.
2. Build settings live in the dashboard: root directory `ui`, build command `yarn build`. The repo
   has no wrangler file.
3. Build variables (Settings, Build, Build variables and secrets; not the Worker's runtime
   "Variables and secrets", which a static-assets Worker can't have): `VITE_GOOGLE_CLIENT_ID`, and
   `VITE_JOURNAL_SHEET_ID` set to the **real** sheet. Vite bakes `VITE_*` values in at build time,
   so redeploy after changing them.
4. Add the Cloudflare URL to the OAuth client's JavaScript origins.

## Checks

Run from `ui/`:

```sh
yarn format && yarn lint && yarn check && yarn build && yarn test
```
