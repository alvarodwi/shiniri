# Gacha sheet wiring (ui) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this
> plan task-by-task, natively in one session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The ui knows the gacha spreadsheet (its `AuditLog` shows on the Log page) and has one
tested way to read `NikkeDatabase` and find a Nikke's icon.

**Architecture:** A second `SPREADSHEETS` entry under a new env var; `writeTabsAtEnd` and
`useLogStore` already handle several spreadsheets. The mock sheet becomes keyed by spreadsheet id
so the two `AuditLog` tabs no longer collide. A small `services/nikke/` module reads and parses
`NikkeDatabase`.

**Tech Stack:** Vue 3, Vite, Vitest (happy-dom), TypeScript, Pinia.

**Spec:** `docs/superpowers/specs/2026-11-21-gacha-sheet-ui-design.md`

## Global Constraints

- Paths below are relative to `ui/`. Checks: `yarn format && yarn lint && yarn check && yarn build && yarn test` from `ui/`.
- Env var name: `VITE_GACHA_SHEET_ID`. Mock value: `mock-gacha`.
- `SPREADSHEETS` entry name: `'Gacha'`. Its audit tab: `'AuditLog'`, headers `AUDIT_HEADERS`.
- Tab `'NikkeDatabase'`, headers verbatim: `['nameCode', 'name', 'rarity', 'manufacturer', 'class', 'burst', 'element', 'weapon', 'resourceId', 'releaseDate']`.
- Icon path: `img/nikke/si/c{resourceId zero-padded to 3}.webp` under `import.meta.env.BASE_URL`.
- The ui never writes `NikkeDatabase` and keeps no local copy of its rows.
- No commits during execution. The merge step makes the single commit.

## Review Focus

1. Both sheet ids unset or equal (fresh clone, copy-paste typo): the gacha entry must not read the
   journal's `AuditLog`. Task 1 pins distinct ids in tests and asserts they differ.
2. `releaseDate` typed by hand reads back as a serial number unformatted: it must come out as ISO
   text, and a blank one as `''`. Task 2 tests a serial and a blank.
3. Hand-edited rows: a blank row in the middle, a short row missing trailing cells, stray
   whitespace. Skipped or padded, never a crash. Task 2 tests all three.
4. Owner renames a `NikkeDatabase` header: the read must fail loud with `HeaderMismatchError`,
   not mis-map columns. Task 2 tests it.
5. `resourceId` blank, non-numeric, or over 3 digits: `null` for the first two, unpadded for the
   last. Task 2 tests all three.

---

### Task 1: Gacha spreadsheet entry, mock keyed by spreadsheet id

**Files:**
- Modify: `src/vite-env.d.ts`, `.env.example`, `.env.mock`, `vite.config.ts`
- Modify: `src/config/sheets.ts`
- Modify: `src/services/mock/mockSheetsApi.ts`, `src/services/mock/fixtures.ts`, `src/main.ts`
- Test: `src/services/mock/mockSheetsApi.test.ts`, `src/services/mock/mockFlow.test.ts`

**Interfaces:**
- Produces: `MOCK_SHEETS: Record<string, Record<string, Cell[][]>>` (spreadsheet id, then tab
  name), replacing `MOCK_TABS`. `createMockSheetsApi(sheets: Record<string, Record<string, Cell[][]>>): SheetsApi`.
  Task 2 adds its fixture through the same helper.

- [ ] **Step 1: Env and config.**
  - `vite-env.d.ts`: add `readonly VITE_GACHA_SHEET_ID: string`.
  - `.env.example`: add `# Spreadsheet ID of the Nikke Gacha Tracker. In development, point this at a COPY.` then `VITE_GACHA_SHEET_ID=`.
  - `.env.mock`: add `VITE_GACHA_SHEET_ID=mock-gacha`.
  - `vite.config.ts` `test`: add `env: { VITE_JOURNAL_SHEET_ID: 'test-journal', VITE_GACHA_SHEET_ID: 'test-gacha' }`, with a one-line comment that tests must not depend on `.env.local`.
  - `sheets.ts`: append to `SPREADSHEETS` `{ name: 'Gacha', audit: { spreadsheetId: import.meta.env.VITE_GACHA_SHEET_ID, tab: 'AuditLog', headers: AUDIT_HEADERS } }`.

- [ ] **Step 2: Write the failing tests.**
  - `mockSheetsApi.test.ts`: change every `createMockSheetsApi({ T: ... })` / `grid()` to the
    nested shape `{ id: { T: ... } }` (reads already pass `'id'`). Add:

```ts
it('keeps same-named tabs of different spreadsheets apart', async () => {
  const api = createMockSheetsApi({ a: { AuditLog: [['savedAt'], ['x']] }, b: { AuditLog: [['savedAt']] } })
  await api.batchUpdateValues('b', [{ range: "'AuditLog'!A2:A2", rows: [['y']] }])
  expect(await api.getValues('a', "'AuditLog'!A:A")).toEqual([['savedAt'], ['x']])
  expect(await api.getValues('b', "'AuditLog'!A:A")).toEqual([['savedAt'], ['y']])
})
```

  - `MOCK_TABS` describe block → `MOCK_SHEETS`: look up `MOCK_SHEETS[spec.spreadsheetId]?.[spec.tab]`.
    Add `it('gives every spreadsheet its own id', ...)`:
    `expect(new Set(SPREADSHEETS.map((s) => s.audit.spreadsheetId)).size).toBe(SPREADSHEETS.length)`.
  - `mockFlow.test.ts`: use `MOCK_SHEETS`. In the level test, assert
    `log.sections.map((s) => s.name)` is `['Progression', 'Gacha']` and
    `log.sections[1].entries[0]` matches `{ form: 'cli-nikke-database' }` (the journal save didn't
    land in the gacha log).

- [ ] **Step 3: Run to verify failure.** `yarn test src/services/mock` — FAIL (`MOCK_SHEETS` not exported).

- [ ] **Step 4: Implement.**
  - `createMockSheetsApi`: grid is `Map<spreadsheetId, Map<tab, string[][]>>`; reads of an unknown
    id or tab return `[]`; a write to one throws
    `` `Mock sheet ${id} has no tab ${tab}. Add it to services/mock/fixtures.ts.` ``. Update the
    file's top comment.
  - `fixtures.ts`: export `MOCK_SHEETS`, built by a helper that puts `[[...spec.headers], ...rows]`
    under `spec.spreadsheetId` / `spec.tab`. Journal tabs and the Progression `AuditLog` keep
    their rows. The Gacha `AuditLog` gets
    `['2026-11-21 06:00:05', 'cli-nikke-database', "'NikkeDatabase'!A2:J4", 3]` and
    `['2026-11-21 07:00:05', 'cli-nikke-database', "'NikkeDatabase'!A5:J5", 1]`.
    Seed each `AuditLog` by its own `SPREADSHEETS` entry, not by mapping all of them to the same rows.
  - `main.ts`: import and pass `MOCK_SHEETS`.

- [ ] **Step 5: Run to verify pass.** `yarn test` — PASS, all files.

### Task 2: NikkeDatabase reader and icon helper

**Files:**
- Modify: `src/config/sheets.ts`, `src/services/sheets/tabWriter.ts`, `src/services/mock/fixtures.ts`
- Create: `src/services/nikke/nikkeDatabase.ts`
- Test: `src/services/nikke/nikkeDatabase.test.ts`, `src/services/sheets/tabWriter.test.ts` (existing header tests must still pass)

**Interfaces:**
- Consumes: `MOCK_SHEETS`, `createMockSheetsApi` (Task 1); `HeaderMismatchError`;
  `cellToIsoDate(value: string): string` from `src/services/anomaly/anomalyRows.ts`.
- Produces (for step 5 pages):
  - `NIKKE_DATABASE_TAB: TabSpec` (spreadsheetId `import.meta.env.VITE_GACHA_SHEET_ID`, tab and headers per Global Constraints; comment: read-only, the cli writes it).
  - `checkHeaders(tab: TabSpec, row: string[]): void` exported from `tabWriter.ts`, throwing `HeaderMismatchError`; `startRow` uses it.
  - `type Nikke = { nameCode: string; name: string; rarity: string; manufacturer: string; class: string; burst: string; element: string; weapon: string; resourceId: string; releaseDate: string }`
  - `toNikkes(rows: string[][]): Nikke[]`: data rows only (no header).
  - `readNikkes(api: SheetsApi): Promise<Nikke[]>`
  - `nikkeIcon(resourceId: string): string | null`

- [ ] **Step 1: Write the failing tests** in `nikkeDatabase.test.ts`:
  - `toNikkes maps every column in header order`: a row `['5001', 'Rapi', 'SSR', 'ELYSION', 'Attacker', 'Step3', 'Fire', 'AR', '10', '45000']` gives `{ nameCode: '5001', name: 'Rapi', ..., resourceId: '10', releaseDate: '2023-03-15' }`.
  - `toNikkes keeps a blank releaseDate blank`: `releaseDate` is `''`, also for a row whose trailing cells are missing (`['5002', 'Anis', 'SSR']` gives `weapon: ''` and `releaseDate: ''`).
  - `toNikkes trims cells and skips rows with a blank nameCode or name`: input with `['', 'X', ...]`, `['5003', '  ', ...]`, `[]`, and `[' 5004 ', ' Neon ']` returns only the `5004`/`Neon` row, trimmed.
  - `readNikkes reads the mock NikkeDatabase`: against `createMockSheetsApi(MOCK_SHEETS)` returns 4 Nikkes, the first named `Rapi`.
  - `readNikkes rejects a renamed header`: a mock sheet whose `NikkeDatabase` row 1 has `'Name'` for `'name'` rejects with `HeaderMismatchError`.
  - `readNikkes returns [] for a header-only tab`.
  - `nikkeIcon`: `'10'` gives `'/img/nikke/si/c010.webp'`, `'1234'` gives `'/img/nikke/si/c1234.webp'`, and `''`, `' '`, `'abc'` give `null`.

- [ ] **Step 2: Run to verify failure.** `yarn test src/services/nikke` — FAIL (module not found).

- [ ] **Step 3: Implement.**
  - `sheets.ts`: add `NIKKE_DATABASE_TAB`.
  - `tabWriter.ts`: export `checkHeaders` holding the comparison now inside `startRow`; `startRow` calls it.
  - `nikkeDatabase.ts`: `readNikkes` does one `api.getValues(id, "'NikkeDatabase'!A1:J", 'UNFORMATTED_VALUE')`,
    builds the range from `NIKKE_DATABASE_TAB` (quote it the way `tabWriter` does), runs
    `checkHeaders` on row 1, and returns `toNikkes` of the rest. Unformatted, so ids carry no
    number formatting, and `releaseDate` goes through `cellToIsoDate`. Cells arrive as numbers
    when unformatted, so `String()` them before trimming. Rows keep sheet order and nothing
    is deduped: the cli keeps `nameCode` unique, and two collab entries can share a `name`.
  - `nikkeIcon`: `/^\d+$/` on the trimmed id, else `null`.
  - `fixtures.ts`: add `NIKKE_DATABASE_TAB` with 4 rows, so the Gacha audit's `A2:J5` matches:
    `[5001, 'Rapi', 'SSR', 'ELYSION', 'Attacker', 'Step3', 'Fire', 'AR', 10, 45000]`,
    `[5002, 'Anis', 'SR', 'TETRA', 'Supporter', 'Step1', 'Electronic', 'SG', 11, 45000]`,
    `[5003, 'Asuka Shikinami Langley', 'SSR', 'ABNORMAL', 'Attacker', 'Step3', 'Fire', 'AR', 312, '']`,
    `[5004, 'New Nikke', 'SSR', 'MISSILIS', 'Defender', 'Step2', 'Water', 'MG', 999, '']`
    (the last has no icon file).

- [ ] **Step 4: Run to verify pass.** `yarn test` — PASS, all files.

### Task 3: Checks and docs

**Files:**
- Modify: `docs/superpowers/specs/2026-11-21-gacha-sheet-ui-design.md`, `ui/CLAUDE.md`

- [ ] **Step 1: Docs.** Spec "Goals" item 5: add that the mock sheet is keyed by spreadsheet id so the two `AuditLog` tabs stay apart. `ui/CLAUDE.md` "Reviewing the UI": replace "A new form adds its tab to `src/services/mock/fixtures.ts`" with "A new form adds its tab to `MOCK_SHEETS` in `src/services/mock/fixtures.ts`."
- [ ] **Step 2: Checks.** `yarn format && yarn lint && yarn check && yarn build && yarn test` from `ui/`: all exit 0.
- [ ] **Step 3: Mock check.** `yarn dev:mock`, then
  `google-chrome --headless=new --virtual-time-budget=5000 --dump-dom http://localhost:5173/#/log`:
  the DOM has a `Progression` section and a `Gacha` section, and the Gacha one shows `cli-nikke-database`.
- [ ] **Step 4: Stop.** Don't commit; don't start a review.

## Manual steps (owner)

- Set `VITE_GACHA_SHEET_ID` in `ui/.env.local` to the test copy id before trying it in dev.
- Add `VITE_GACHA_SHEET_ID` (prod gacha sheet id) in Netlify before release.
- Pre-merge: `yarn dev` against the copies, open `#/log`. The Gacha section lists the cli's
  `cli-nikke-database` audit rows, and Progression is unchanged.
