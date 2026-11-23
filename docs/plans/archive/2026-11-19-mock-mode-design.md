# Mock mode for UI review (short design)

## Why

Every page sits behind Google sign-in, so an agent (or the owner, without a token) can't open the
app in a browser to review the UI. A dev-only mode runs the app on fake sheet data with no sign-in.
It's for UI work and review, not for checking real sheet behaviour (that stays a manual check on
the sheet copy).

## Goals

- `yarn dev:mock` opens the app signed in, with every page working against in-memory data.
- Saves land in that data, so follow-up screens (next season, last level, the Log page) react as
  they would for real.
- `CLAUDE.md` tells agents how to use it.

## Non-goals and anti-goals

- No real data, no network calls to Google, no Google sign-in script.
- Never reachable in a production build. Mock mode on Netlify would be a failure even if it
  worked.
- Not a replacement for the owner's checks on the sheet copy.

## Approaches

- **An in-memory `SheetsApi` behind a dev-only mode (picked).** Every store already talks to the
  sheet only through `SheetsApi`, and the tests already swap in fakes, so pages and stores don't
  change.
- Intercepting the Google network calls in the browser. Rejected: it needs a new dependency and
  still needs a way past sign-in.
- Scripted browser tests only. Rejected: agents need to click around freely, not just replay
  scripts.

## Design

- **Switch:** `yarn dev:mock` runs `vite --mode mock`. `vite.config.ts` defines `__MOCK__` as
  `command === 'serve' && mode === 'mock'`, a literal `false` in every build. (An exported
  `import.meta.env` constant didn't work: Rollup kept the mock chunks.) A committed `.env.mock`
  holds placeholder IDs that outrank `.env.local`.
- **Wiring:** `sheetsApi` in `authStore.ts` forwards to a swappable implementation. `main.ts`, when
  `__MOCK__` is on, dynamically imports the mock and installs it before mounting. The import sits
  inside the `__MOCK__` branch, so the mock isn't in the production bundle. In mock mode the auth store
  starts signed in. Sign in and out only flip the flag and never load the Google script.
- **Fake sheet (`src/services/mock/`):** a grid per tab, seeded with each `TabSpec`'s headers
  (imported, never retyped) plus a few believable rows for Anomaly, T9Manu, Furnace, LevelLogs
  (including a jump), SoloRaid and AuditLog. Past dates only, so today's forms are open.
  `getValues` reads the A1 ranges the app uses (`'Tab'!A1:G1`, `'Tab'!A:A`, `'Tab'!C:C`,
  `'Tab'!B12`) and, like the real API, drops trailing empty cells and rows. `batchUpdateValues`
  writes into the grid. A leading `'` is stripped, as USER_ENTERED does; formulas are stored as
  text. Everything resets on reload.
- **Banner:** in mock mode, `src/components/MockBanner.vue` shows a strip under the header reading
  "Mock data: nothing is sent to Google." It's loaded as an async component only when `__MOCK__` is
  on, so builds don't carry it. `vite build --mode mock` refuses to run.
- **`CLAUDE.md`:** a "Reviewing the UI" section with the command, the URL
  (`http://localhost:5173/#/anomaly`), what's faked, and the reset-on-reload rule.

## Left to the builder

- The fixture rows' exact content, as long as each page has a sensible last row to build on.
