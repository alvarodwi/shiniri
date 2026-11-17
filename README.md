# Shiniri

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
   - the Netlify site URL (e.g. `https://<site>.netlify.app`)

## Local development

```sh
cp .env.example .env.local   # fill in both values
yarn install
yarn dev
```

Point `VITE_JOURNAL_SHEET_ID` in `.env.local` at a **copy** of the journal (File > Make a copy). The
real sheet is live data, so test writes should never land there. A stale copy is fine; it only
needs the same tab layout.

## Deploy (Netlify)

1. Connect the private GitHub repo in Netlify.
2. Production branch: `main`. Build command: `yarn build`. Publish directory: `dist`.
3. Environment variables: `VITE_GOOGLE_CLIENT_ID`, and `VITE_JOURNAL_SHEET_ID` set to the **real**
   sheet.
4. Add the Netlify URL to the OAuth client's JavaScript origins.

## Checks

```sh
yarn format && yarn lint && yarn check && yarn build && yarn test
```
