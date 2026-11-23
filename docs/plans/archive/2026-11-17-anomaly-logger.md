# Anomaly Interception Logger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A phone-friendly Vue SPA that logs a day's Anomaly Interception runs straight into the `Anomaly` tab of the owner's Google Sheet. It writes only to rows below the existing data and never modifies existing cells.

**Architecture:** A static Vue 3 SPA with no backend. Google Identity Services issues a browser-side OAuth token, and a thin `fetch` client calls the Sheets REST API v4. A generic, form-agnostic `tabWriter` owns every safety guard (header check, computing the next row at write time, checking the target is empty, writing everything in one update). Each form (Anomaly now; gacha and T9Manu later) adds only its own tab spec, row mapping, store and components.

**Tech Stack:** Vue 3, Vite, UnoCSS, Pinia, vue-router (hash), TypeScript, Vitest, Yarn 4 (`nodeLinker: node-modules`). Conventions are copied from `../ntrsv`.

**Spec:** `docs/superpowers/specs/2026-11-17-anomaly-logger-design.md`

## Global Constraints

- The app never updates, clears, inserts or deletes existing cells. The only write is `values.update` to rows that were just verified empty.
- Writes are confined to `Anomaly!A:I` (I = optional per-run note). Columns J–N are never read or written.
- Headers `A1:I1` must equal exactly `date | bossName | stage | dropped | modules | gear class | gear manu | dropType | ''` (after trimming; I1 is empty, and the API omits trailing empty cells, so pad `actual` to the expected length) or the write is refused.
- Daily limit: 5 normally, 10 when the "double day" toggle is on. The toggle isn't remembered between visits.
- Never hardcode a row number. The sheet is live data and grows daily, so the next row is computed at save time.
- Writes use `valueInputOption=USER_ENTERED`. Dates are written as `YYYY-MM-DD` strings and booleans as JS `true`/`false`.
- Default date = game day = `new Date(now + 4h).toISOString().slice(0, 10)` (reset at 03:00 WIB = 20:00 UTC).
- Spellings (verified against the sheet): bosses `Kraken`, `Ultra`, `Mirror Container`, `Indivilia`, `Harvester`; dropType `Modules`, `Helmet`, `Gloves`, `Torso`, `Boots`; class `Attacker`, `Defender`, `Supporter`; manufacturer `Elysion`, `Missilis`, `Tetra`, `Pilgrim`, `Abnormal`.
- OAuth scope is `https://www.googleapis.com/auth/spreadsheets` only. There's no password page and no secrets in the bundle.
- Config comes from env: `VITE_GOOGLE_CLIENT_ID`, `VITE_JOURNAL_SHEET_ID`. During development `.env.local` points at a **copy** of the journal.
- Never auto-retry a failed write. Keep the form contents on any error.
- Follow ntrsv conventions: prettier config, eslint config, `@` alias, `__APP_VERSION__`, folders `pages/ components/<feature>/ stores/ services/ types/ utils/`.
- Git: all work happens on `feat/anomaly-logger`, branched from `develop`. Use Conventional Commits. Never push. Never touch `main`.

## Review Focus

1. **The token expires mid-session** (about 1 h, e.g. the phone was left open overnight). Save must request a fresh token and still save. If that fails, show the error with the form intact. Test in Task 4, `sheetsApi.test.ts`: on a 401 it calls `getToken({ forceRefresh: true })` once and retries the request.
2. **The sheet changed between page load and save** (the owner logged from the PC while the phone tab was open). The next row and the duplicate-day count must be recomputed at save time, not taken from load time. Tests in Task 3 (`writeRowsAtEnd` reads column A at call time) and Task 5 (the store's save re-reads the count).
3. **Stale gear after changing boss or stage.** Picking gear on Ultra and then switching the run to Kraken, or to `dropped = false`, must not write gear. Test in Task 2: `toRow` ignores `gear` when `needsGear` is false.
4. **Row 1 has text past I, or whitespace in headers, or the API returns row 1 without the trailing empty I1.** Only `A1:I1` is compared, trimmed and padded. Test in Task 3.
5. **Blank cells inside column A**, e.g. a deleted row in the history. The next row = the last non-empty row + 1, never the count of non-empty cells. Test in Task 3.

---

## File Structure

```
.env.example                      VITE_GOOGLE_CLIENT_ID, VITE_JOURNAL_SHEET_ID placeholders
index.html, vite.config.ts, uno.config.ts, eslint.config.js, .prettierrc, .prettierignore,
tsconfig*.json, .gitignore, .yarnrc.yml, package.json   ← copied and adapted from ../ntrsv
src/main.ts, src/App.vue          app shell: header (title, version, sign-in), <RouterView>
src/router/index.ts               '/' → redirect '/anomaly'; '/anomaly' → pages/Anomaly.vue
src/config/sheets.ts              TabSpec type + ANOMALY_TAB (one entry per future form)
src/utils/gameDay.ts              gameDay()
src/types/anomaly.ts              domain constants + AnomalyRun
src/services/anomaly/anomalyRows.ts  pure anomaly logic (row mapping, defaults, carry-forward)
src/services/google/auth.ts       GIS token client wrapper
src/services/google/sheetsApi.ts  fetch client for values.get / values.update
src/services/sheets/tabWriter.ts  generic safe writer (all guards live here)
src/stores/authStore.ts           signed-in state
src/stores/anomalyStore.ts        form state, load, save
src/pages/Anomaly.vue             page
src/components/anomaly/RunCard.vue, ModuleTaps.vue, GearGrid.vue
tests mirror src: src/**/*.test.ts (Vitest, colocated)
README.md, CLAUDE.md, CONTRIBUTING.md
```

Future forms add `src/config/sheets.ts` entries, `services/<form>/`, `stores/<form>Store.ts`, `pages/<Form>.vue`, `components/<form>/` and a route. Nothing in `services/google` or `services/sheets` changes.

---

### Task 1: Scaffold + game day

**Files:**

- Create: everything in the scaffold row of File Structure, plus `src/utils/gameDay.ts`, `src/utils/gameDay.test.ts`
- Test: `src/utils/gameDay.test.ts`

**Interfaces:**

- Produces: `gameDay(now?: Date): string` (YYYY-MM-DD); `__APP_VERSION__: string` global; `@` alias; `yarn test` (= `vitest run`).

- [ ] **Step 1: Initial commit on `develop`.** The repo has no commits yet. Commit `docs/` as `docs: add anomaly logger spec and plan`, then `git switch -c feat/anomaly-logger`.
- [ ] **Step 2: Scaffold.** Copy these from `../ntrsv`, adapted: `package.json` (name `shiniri`, version `0.1.0`, same scripts plus `"test": "vitest run"`; deps `vue pinia vue-router @vueuse/core @unocss/reset`; devDeps the same as ntrsv minus `motion-v`, plus `vitest` and `happy-dom`), `.yarnrc.yml`, `.prettierrc`, `.prettierignore`, `eslint.config.js`, `tsconfig*.json` (add `"vitest/globals"` only if globals are used; prefer explicit imports), `vite.config.ts` (add `test: { environment: 'happy-dom' }`), `uno.config.ts` (keep the presets and the `paper/ink/rule/focus/press` shortcuts; drop the ntrsv-specific colors), `.gitignore` (plus `.env.local`), `index.html` (title `Shiniri`), `src/main.ts`, `src/vite-env.d.ts` (declare `__APP_VERSION__` and the `ImportMetaEnv` keys). Add a placeholder `src/App.vue` with `<RouterView/>` and a router with `/anomaly` pointing to a stub page. Run `yarn install`.
- [ ] **Step 3: Write the failing test** `src/utils/gameDay.test.ts`:
  ```ts
  expect(gameDay(new Date('2026-11-17T19:59:59Z'))).toBe('2026-11-17') // 02:59 WIB 18th → still 17th
  expect(gameDay(new Date('2026-11-17T20:00:00Z'))).toBe('2026-11-18') // 03:00 WIB reset
  expect(gameDay(new Date('2026-12-31T21:00:00Z'))).toBe('2027-01-01')
  ```
- [ ] **Step 4:** Run `yarn test`. Expected: FAIL (module not found).
- [ ] **Step 5:** Implement `gameDay(now = new Date())` in `src/utils/gameDay.ts`, with a one-line comment explaining the 20:00 UTC reset.
- [ ] **Step 6:** Run `yarn test && yarn format && yarn lint && yarn check && yarn build`. Expected: all pass.
- [ ] **Step 7: Commit** `chore: scaffold vue vite unocss app` (scaffold), then `feat: add game day helper`.

### Task 2: Anomaly domain

**Files:**

- Create: `src/types/anomaly.ts`, `src/services/anomaly/anomalyRows.ts`
- Test: `src/services/anomaly/anomalyRows.test.ts`

**Interfaces:**

- Consumes: `Cell` from Task 3 is defined here instead, to avoid a dependency cycle: `export type Cell = string | number | boolean` in `src/types/sheet.ts`.
- Produces:
  ```ts
  // src/types/anomaly.ts
  export const BOSSES = ['Kraken', 'Ultra', 'Mirror Container', 'Indivilia', 'Harvester'] as const
  export type Boss = (typeof BOSSES)[number]
  export const DROP_TYPE: Record<Boss, 'Modules' | 'Helmet' | 'Gloves' | 'Torso' | 'Boots'>
  export const CLASS_TYPES = ['Attacker', 'Defender', 'Supporter'] as const
  export const MANUFACTURERS = ['Elysion', 'Missilis', 'Tetra', 'Pilgrim', 'Abnormal'] as const
  export type Gear = {
    classType: (typeof CLASS_TYPES)[number]
    manufacturer: (typeof MANUFACTURERS)[number]
  }
  export type AnomalyRun = {
    boss: Boss
    stage: number /*1-9*/
    dropped: boolean
    modules: 0 | 1 | 2 | 3 | null
    gear: Gear | null
    note: string
  }
  // src/services/anomaly/anomalyRows.ts
  export function isDropped(run: AnomalyRun): boolean // stage 9 → true, else run.dropped
  export function needsGear(run: AnomalyRun): boolean // boss !== 'Kraken' && isDropped
  export function isRunComplete(run: AnomalyRun): boolean // modules !== null && (!needsGear || gear !== null)
  export function toRow(date: string, run: AnomalyRun): Cell[] // 9 cells, A–I order; I = note.trim()
  export function lastRunDefaults(row: string[] | undefined): Pick<AnomalyRun, 'boss' | 'stage'> // fallback {boss:'Kraken', stage:9}
  export function newRun(d: Pick<AnomalyRun, 'boss' | 'stage'>): AnomalyRun // dropped true, modules null, gear null, note ''
  export function applyToRun(
    runs: AnomalyRun[],
    touched: boolean[],
    index: number,
    patch: Partial<Pick<AnomalyRun, 'boss' | 'stage'>>,
  ): AnomalyRun[]
  export function countRowsForDate(colA: string[], date: string): number
  ```
- `applyToRun`: patches `runs[index]`, then copies the same patch to every later run whose `touched[j]` is false. It returns a new array and doesn't mutate its input. The caller marks `touched[index] = true`.

- [ ] **Step 1: Write the failing tests:**
  ```ts
  const kraken = { boss: 'Kraken', stage: 9, dropped: true, modules: 2, gear: null, note: '' }
  expect(toRow('2026-11-17', kraken)).toEqual([
    '2026-11-17',
    'Kraken',
    9,
    true,
    2,
    '',
    '',
    'Modules',
    '',
  ])
  expect(toRow('d', { ...kraken, note: '  double drop day  ' })[8]).toBe('double drop day')
  const ultraFail = {
    boss: 'Ultra',
    stage: 7,
    dropped: false,
    modules: 0,
    gear: { classType: 'Attacker', manufacturer: 'Tetra' },
    note: '',
  }
  expect(toRow('2026-11-17', ultraFail)).toEqual([
    '2026-11-17',
    'Ultra',
    7,
    false,
    0,
    '',
    '',
    'Helmet',
    '',
  ]) // stale gear dropped
  const indi = {
    boss: 'Indivilia',
    stage: 9,
    dropped: false,
    modules: 1,
    gear: { classType: 'Supporter', manufacturer: 'Pilgrim' },
    note: '',
  }
  expect(toRow('2026-11-17', indi)).toEqual([
    '2026-11-17',
    'Indivilia',
    9,
    true,
    1,
    'Supporter',
    'Pilgrim',
    'Torso',
    '',
  ]) // stage 9 forces dropped
  expect(
    toRow('d', { ...kraken, gear: { classType: 'Defender', manufacturer: 'Elysion' } })[5],
  ).toBe('') // Kraken never writes gear
  expect(isRunComplete({ ...kraken, modules: null })).toBe(false)
  expect(isRunComplete({ ...indi, gear: null })).toBe(false)
  expect(
    lastRunDefaults(['2026-11-16', 'Mirror Container', '8', 'TRUE', '1', '', '', 'Gloves']),
  ).toEqual({ boss: 'Mirror Container', stage: 8 })
  expect(lastRunDefaults(undefined)).toEqual({ boss: 'Kraken', stage: 9 })
  expect(lastRunDefaults(['x', 'Unknown', 'abc'])).toEqual({ boss: 'Kraken', stage: 9 })
  // carry-forward: change run 1 boss; run 2 touched keeps its own; runs 3-5 follow
  const runs = Array.from({ length: 5 }, () => newRun({ boss: 'Kraken', stage: 9 }))
  const out = applyToRun(runs, [false, true, false, false, false], 0, { boss: 'Ultra' })
  expect(out.map((r) => r.boss)).toEqual(['Ultra', 'Kraken', 'Ultra', 'Ultra', 'Ultra'])
  expect(runs[0].boss).toBe('Kraken') // input not mutated
  expect(
    countRowsForDate(['date', '2026-11-17', '', '2026-11-17', '2026-11-16'], '2026-11-17'),
  ).toBe(2)
  ```
- [ ] **Step 2:** Run `yarn test`. Expected: FAIL.
- [ ] **Step 3:** Implement `src/types/sheet.ts`, `src/types/anomaly.ts` and `anomalyRows.ts` per the Interfaces block.
- [ ] **Step 4:** Run `yarn test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: add anomaly run model and row mapping`.

### Task 3: Sheets client + safe tab writer

**Files:**

- Create: `src/config/sheets.ts`, `src/services/google/sheetsApi.ts`, `src/services/sheets/tabWriter.ts`
- Test: `src/services/google/sheetsApi.test.ts`, `src/services/sheets/tabWriter.test.ts`

**Interfaces:**

- Consumes: `Cell` (`src/types/sheet.ts`).
- Produces:
  ```ts
  // src/config/sheets.ts
  export type TabSpec = { spreadsheetId: string; tab: string; headers: readonly string[] }
  export const ANOMALY_TAB: TabSpec // spreadsheetId = import.meta.env.VITE_JOURNAL_SHEET_ID, tab 'Anomaly', the 8 headers + '' (column I)
  // src/services/google/sheetsApi.ts
  export type TokenGetter = (opts?: { forceRefresh?: boolean }) => Promise<string>
  export interface SheetsApi {
    getValues(spreadsheetId: string, range: string): Promise<string[][]> // FORMATTED_VALUE; [] when empty
    updateValues(
      spreadsheetId: string,
      range: string,
      rows: Cell[][],
    ): Promise<{ updatedRange: string }>
  }
  export function createSheetsApi(getToken: TokenGetter, fetchFn?: typeof fetch): SheetsApi
  export class SheetsApiError extends Error {
    status: number
  }
  // src/services/sheets/tabWriter.ts
  export function columnLetter(n: number): string // 1→'A', 8→'H', 27→'AA'
  export async function readColumnA(api: SheetsApi, tab: TabSpec): Promise<string[]> // index 0 = row 1
  export async function readRows(
    api: SheetsApi,
    tab: TabSpec,
    fromRow: number,
    toRow: number,
  ): Promise<string[][]>
  export function nextEmptyRow(colA: string[]): number // last non-empty index + 2
  export async function writeRowsAtEnd(
    api: SheetsApi,
    tab: TabSpec,
    rows: Cell[][],
  ): Promise<{ updatedRange: string }>
  export class HeaderMismatchError extends Error {
    expected: readonly string[]
    actual: string[]
  }
  export class TargetNotEmptyError extends Error {
    range: string
  }
  ```
- Range strings quote the tab: `'Anomaly'!A1:H1`. Encode them with `encodeURIComponent`. The base URL is `https://sheets.googleapis.com/v4/spreadsheets/{id}/values/{range}`. `updateValues` uses `PUT` with `?valueInputOption=USER_ENTERED` and body `{ values: rows }`.
- `writeRowsAtEnd` order: (1) get `A1:{lastCol}1`, trim, pad with '' to `headers.length`, and compare to `tab.headers`, else throw `HeaderMismatchError`; (2) `readColumnA` → `n = nextEmptyRow`; (3) get `A{n}:{lastCol}{n+k-1}` and throw `TargetNotEmptyError` if any cell is non-empty after trim; (4) one `updateValues` to exactly that range. It throws if `rows` is empty or any row length ≠ `headers.length`.

- [ ] **Step 1: Write failing tests.** Use a fake `SheetsApi` (an object of `vi.fn`s keyed by range) for `tabWriter`, and a `vi.fn` fetch for `sheetsApi`:
  ```ts
  // sheetsApi
  // 401 then 200: getToken called twice, second with { forceRefresh: true }; result returned
  // 401 twice: throws SheetsApiError status 401, fetch called exactly 2 times
  // 500: throws SheetsApiError status 500, no retry (fetch called once)
  // getValues on response without `values` → []
  // updateValues: method PUT, URL contains valueInputOption=USER_ENTERED and %27Anomaly%27, body {values}
  // tabWriter
  expect(columnLetter(9)).toBe('I')
  expect(columnLetter(27)).toBe('AA')
  expect(nextEmptyRow(['date', 'a', '', 'b'])).toBe(5) // blank inside column A
  expect(nextEmptyRow(['date'])).toBe(2)
  // headers ' date ', ... returned as 8 cells (API drops empty I1) → passes (trimmed + padded)
  // I1 contains 'notes' → HeaderMismatchError
  // headers mismatch ('gear c' vs 'gear class') → HeaderMismatchError, updateValues not called
  // target row has 'x' in column F → TargetNotEmptyError, updateValues not called
  // happy path, colA length 2990 → updateValues called once with "'Anomaly'!A2991:I2995" and the 5 rows
  // colA read at call time: two consecutive calls with colA growing between them target different rows
  // rows [] or wrong length → throws, no API calls
  ```
- [ ] **Step 2:** Run `yarn test`. Expected: FAIL.
- [ ] **Step 3:** Implement the three files per the Interfaces block. The 401 retry lives only in `sheetsApi`'s request helper, and only once.
- [ ] **Step 4:** Run `yarn test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: add sheets client and append-only tab writer`.

### Task 4: Google sign-in + app shell

**Files:**

- Create: `src/services/google/auth.ts`, `src/stores/authStore.ts`
- Modify: `src/App.vue`, `src/main.ts`, `src/vite-env.d.ts`
- Test: manual (GIS needs a real browser and Google account)

**Interfaces:**

- Consumes: `TokenGetter` (Task 3).
- Produces:
  ```ts
  // auth.ts
  export function getToken(opts?: { forceRefresh?: boolean }): Promise<string> // satisfies TokenGetter
  export function signOut(): void
  // authStore (pinia 'auth'): state { signedIn: boolean, error: string|null }; actions signIn(), signOut()
  export const sheetsApi: SheetsApi // exported from authStore module: createSheetsApi(getToken)
  ```
- `auth.ts` loads `https://accounts.google.com/gsi/client` once (a script tag, awaited) and uses `google.accounts.oauth2.initTokenClient({ client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID, scope: 'https://www.googleapis.com/auth/spreadsheets', callback })`. It caches `{ token, expiresAt }` in memory only (never localStorage). It returns the cached token while it has more than 60 s left; otherwise, or on `forceRefresh`, it calls `requestAccessToken({ prompt: '' })`. Calls made at the same time share one in-flight request. Add the `google` types by hand in `vite-env.d.ts` (minimal), or as the `@types/google.accounts` devDep.
- `App.vue`: a header with the title "Shiniri", `v{{ __APP_VERSION__ }}`, and a Sign in / Sign out button. Below it, `<RouterView>` renders only when `signedIn`; otherwise show a centered sign-in prompt. `signIn` must be triggered by a click, because browsers block popups otherwise.

- [ ] **Step 1:** Implement per Interfaces.
- [ ] **Step 2:** Run `yarn format && yarn lint && yarn check && yarn build && yarn test`. Expected: pass.
- [ ] **Step 3: Manual.** With `.env.local` holding a real client ID, run `yarn dev`, click Sign in, approve, and confirm the routed page shows. In devtools, set the cached `expiresAt` to the past and trigger a request: a new token is obtained without a full consent screen.
- [ ] **Step 4: Commit** `feat: add google sign-in and app shell`.

### Task 5: Anomaly store + page

**Files:**

- Create: `src/stores/anomalyStore.ts`, `src/pages/Anomaly.vue`, `src/components/anomaly/RunCard.vue`, `src/components/anomaly/ModuleTaps.vue`, `src/components/anomaly/GearGrid.vue`
- Modify: `src/router/index.ts` (replace the stub)
- Test: `src/stores/anomalyStore.test.ts`

**Interfaces:**

- Consumes: Task 2 (all of `anomalyRows`, types), Task 3 (`ANOMALY_TAB`, `readColumnA`, `readRows`, `nextEmptyRow`, `writeRowsAtEnd`, error classes), Task 4 (`sheetsApi`), Task 1 (`gameDay`).
- Produces (pinia `'anomaly'`, setup or options style per ntrsv):
  ```ts
  state: { date: string; doubleDay: boolean; runCount: number /*1..dailyLimit, default 5*/; runs: AnomalyRun[] /*length 10*/; touched: boolean[];
           status: 'idle'|'loading'|'saving'|'saved'|'error'; error: string|null;
           existingForDate: number; lastSaved: { updatedRange: string; count: number } | null }
  getters: dailyLimit (doubleDay ? 10 : 5); activeRuns (runs.slice(0, runCount)); canSave (every active run isRunComplete && status !== 'saving')
  actions:
    load(api = sheetsApi): Promise<void>      // colA → existingForDate; last data row via readRows → lastRunDefaults → reset runs
    setBossOrStage(index: number, patch: Partial<Pick<AnomalyRun,'boss'|'stage'>>): void // applyToRun + touched[index]=true
    setRun(index: number, patch: Partial<AnomalyRun>): void   // dropped / modules / gear / note
    setDoubleDay(on: boolean): void   // limit 5↔10; runCount = new limit (clamped)
    save(api = sheetsApi, confirm: (existing: number, after: number) => boolean | Promise<boolean>): Promise<void>
  ```
- `save` order: re-read column A and recompute the count for `date`. If the count is greater than 0, call `confirm(existing, existing + runCount)` and return without writing if it's false. Then `writeRowsAtEnd(api, ANOMALY_TAB, activeRuns.map(r => toRow(date, r)))`. On success, set `lastSaved`, set `status 'saved'`, and reset the runs via `load()`. On any error, set `status 'error'` and `error = message` and leave `runs` untouched. The page's `confirm` uses `window.confirm` and adds a louder line when `after > dailyLimit`.
- UI per the spec mockup: date input in the header (default `gameDay()`); a "double day" toggle; a 1..dailyLimit run-count stepper; a `RunCard` per active run with a boss `<select>`, a stage `<select>` 1–9, a `dropped` checkbox hidden when stage is 9, `ModuleTaps` (4 buttons 0–3 using `aria-pressed`), and `GearGrid` (3 rows × 5 columns of buttons, `aria-label="Attacker Elysion"` and so on) shown only when `needsGear`; a collapsed "add note" link per run that reveals a text input bound to `note`. A Save button labelled `Save {n} rows`, disabled unless `canSave`. After success, show `lastSaved.updatedRange`. On error, show the message in a `role="alert"` box. Mobile-first single column with touch targets ≥ 44px.

- [ ] **Step 1: Write failing store tests** using a fake `SheetsApi` and `setActivePinia(createPinia())`:
  ```ts
  // load: colA ['date', ...,'2026-11-17'×2], last row Ultra/7 → runs all {boss:'Ultra',stage:7}, existingForDate 2 (date pinned '2026-11-17')
  // save with existing 0: confirm not called, updateValues called once with 5 rows
  // save when another device added rows after load: colA re-read in save → confirm called with (5, 10)
  // confirm returns false → updateValues not called, runs unchanged
  // updateValues rejects → status 'error', error message set, runs unchanged (same modules values)
  // canSave false while any active run has modules null; true once all set
  // runCount 3 → only 3 rows written
  // setDoubleDay(true) → dailyLimit 10, runCount 10; 10 rows written; setDoubleDay(false) → runCount 5
  ```
- [ ] **Step 2:** Run `yarn test`. Expected: FAIL.
- [ ] **Step 3:** Implement the store.
- [ ] **Step 4:** Run `yarn test`. Expected: PASS.
- [ ] **Step 5:** Build the page and components. Run `yarn format && yarn lint && yarn check && yarn build`.
- [ ] **Step 6: Manual on the sheet copy** (spec Acceptance): 5× Kraken stage 9 with mixed modules → 5 rows directly under the last row, with J–N and prior rows unchanged; one run with a note → note lands in column I; one Ultra stage-7 failed run plus one Indivilia run with gear → values match the existing row conventions; rename the `gear class` header on the copy → save refused with both header lists shown, then restore it; a phone browser via `yarn dev --host` loads and saves (the LAN origin must be added to the OAuth client, or test this after deploying).
- [ ] **Step 7: Commit** `feat: add anomaly interception logger page`.

### Task 6: Docs + deploy setup

**Files:**

- Create: `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`

- [ ] **Step 1:** `README.md` should cover: what the app is; Google Cloud setup (create a project, enable the Google Sheets API, set the OAuth consent screen to External in **Testing** with the owner's account as the only test user, create a Web OAuth client with JS origins `http://localhost:5173` and the Netlify URL); `.env.local` from `.env.example`, with the dev sheet ID pointing at a **copy**; Netlify setup (connect the private GitHub repo, production branch `main`, build `yarn build`, publish `dist`, env vars `VITE_GOOGLE_CLIENT_ID` and `VITE_JOURNAL_SHEET_ID` = the real sheet). Expect the "unverified app" warning.
- [ ] **Step 2:** `CLAUDE.md` should be short, in the ntrsv style: stack; the append-only invariant and "never hardcode row numbers, the sheet is live data"; where the guards live (`services/sheets/tabWriter.ts`); how to add a form (the File Structure note); the checks `yarn format && yarn lint && yarn check && yarn build && yarn test`.
- [ ] **Step 3:** `CONTRIBUTING.md` should describe the branch flow: `feat/*` or `fix/*` → `develop`; release = merge `develop` → `main` plus bump `version` in `package.json`, committed as `chore: bump to version X.Y.Z`; Netlify deploys from `main`; Conventional Commits.
- [ ] **Step 4:** Run `yarn format && yarn check`. Commit `docs: add readme, contributing and agent notes`.
