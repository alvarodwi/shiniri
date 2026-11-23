# Level Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/level` page that appends one `LevelLogs` row per 5-level step up to the level just
reached, each with a self-filling `daysElapsed` formula.

**Architecture:** `writeTabsAtEnd` learns to resolve cells that are functions of their own sheet
row, after it has found the start row. Level rows are pure functions in `src/services/level/`, a
`levelStore` reads the last level and saves, and a small page drives it.

**Tech Stack:** Vue 3, Pinia, UnoCSS, Vitest, Sheets REST API v4.

**Spec:** `docs/superpowers/specs/2026-11-19-level-logs-design.md`

## Global Constraints

- Append-only. Every write goes through `writeTabsAtEnd`. No updates, clears, inserts or deletes.
- `LevelLogs` headers, exact: `newSynchroLevel | achievedAt | daysElapsed | note`.
- `daysElapsed` formula for sheet row `n`, exact: `=IF(B{n+1}="","",B{n+1}-B{n})`.
- AuditLog form name: `Level`.
- Owner rule: no commits until the owner says "commit and merge" (then one commit on the branch).
- Checks: `yarn format && yarn lint && yarn check && yarn build && yarn test`.

## Review Focus

- A function cell in column A must be refused like an empty A (nextEmptyRow can't see it before
  resolution). Test in Task 1.
- Last logged level not a multiple of 5 (a hand edit like `213`): steps start at the next multiple
  of 5 (`215`), never `218`. Test in Task 2.
- Column A with trailing blank or non-numeric cells (header only, stray text): `lastLevel` returns
  the last numeric value, or null for header-only. Test in Task 2.
- Another device logged a level since the page loaded: save re-reads and the preview/rows use the
  fresh last level; a target no longer above it is refused. Test in Task 3.
- Note on a jump goes on the last row only; step rows get `''`. Test in Task 2.

---

### Task 1: Row-dependent cells in the writer

**Files:**

- Modify: `src/services/sheets/tabWriter.ts`, `src/services/sheets/tabWriter.test.ts`

**Interfaces:**

- Produces: `export type RowCell = Cell | ((sheetRow: number) => Cell)` and
  `WriteTarget = { tab: TabSpec; rows: RowCell[][] }`. Existing callers pass `Cell[][]` unchanged.
- `checkedRange` returns `{ range: string; start: number }` (internal).
- The batch receives only plain `Cell[][]`; the AuditLog `rows` count is unchanged.

- [ ] **Step 1: Failing tests** in `describe('writeTabsAtEnd')`:
  - `'resolves function cells with their own sheet row'`: colA has 5 rows (next row 6); rows
    `[['a', (n) => `=B${n + 1}`, '', ''], ['b', (n) => `=B${n + 1}`, '', '']]` → the batch data for
    the tab is `[['a', '=B7', '', ''], ['b', '=B8', '', '']]` and its range is `'Anomaly'!A6:D7`.
  - `'refuses a function cell in column A before reading'`: row `[() => 'x', '', '', '']` rejects
    with `Every Anomaly row needs a value in column A.` and `getValues` is not called.
- [ ] **Step 2:** `yarn test src/services/sheets` → both FAIL.
- [ ] **Step 3:** Implement. Column-A guard treats `typeof r[0] === 'function'` as empty. After the
      checks, map each row `i` to `cells.map((c) => (typeof c === 'function' ? c(start + i) : c))`.
- [ ] **Step 4:** `yarn test src/services/sheets` → PASS; `yarn check` clean (existing callers still
      type-check).

### Task 2: Config and level row logic

**Files:**

- Modify: `src/config/sheets.ts`
- Create: `src/services/level/levelRows.ts`, `src/services/level/levelRows.test.ts`

**Interfaces:**

- Produces: `LEVEL_TAB: TabSpec` (`tab: 'LevelLogs'`, journal spreadsheet, headers above).
- Produces: `lastLevel(colA: string[]): number | null`: last cell in column A (excluding row 1)
  that parses as a finite number.
- Produces: `levelSteps(last: number | null, target: number): number[]`: `[]` when `target` is not
  a positive integer multiple of 5 or `target <= last`; `[target]` when `last` is null; otherwise
  every multiple of 5 in `(last, target]`.
- Produces: `toRows(steps: number[], date: string, note: string): RowCell[][]`: one row per step
  `[level, date, (n) => formula, note-or-'']`. The trimmed note, apostrophe-prefixed when non-empty
  (same guard as `asText` in `anomalyRows.ts`), only on the last row.

- [ ] **Step 1: Failing tests** in `levelRows.test.ts`:
  - `lastLevel(['newSynchroLevel', '200', '205', '210'])` → `210`;
    `lastLevel(['newSynchroLevel', '210', '', 'x'])` → `210`; `lastLevel(['newSynchroLevel'])` →
    `null`.
  - `levelSteps(210, 225)` → `[215, 220, 225]`; `levelSteps(210, 215)` → `[215]`;
    `levelSteps(213, 225)` → `[215, 220, 225]`; `levelSteps(null, 230)` → `[230]`;
    `levelSteps(210, 210)`, `levelSteps(210, 200)`, `levelSteps(210, 222)`, `levelSteps(210, 0)` →
    `[]`.
  - `toRows([215, 220], '2026-11-19', ' hi ')`: rows `[215, '2026-11-19', fn, '']` and
    `[220, '2026-11-19', fn, "'hi"]`; `fn(231)` → `=IF(B232="","",B232-B231)`.
    `toRows([215], d, '')` note → `''`.
- [ ] **Step 2:** `yarn test src/services/level` → FAIL.
- [ ] **Step 3:** Add `LEVEL_TAB`; implement the three functions.
- [ ] **Step 4:** `yarn test src/services/level` → PASS.

### Task 3: Level store

**Files:**

- Create: `src/stores/levelStore.ts`, `src/stores/levelStore.test.ts`

**Interfaces:**

- Consumes: Task 2 functions, `readColumnA`, `writeTabsAtEnd`, `gameDay`, `sheetsApi`.
- Produces: `useLevelStore` with state `date: string` (default `gameDay()`), `last: number | null`,
  `target: number | null`, `note: string`, `status: 'idle' | 'loading' | 'saving' | 'saved' |
'error'`, `error: string | null`, `lastSaved: { updatedRange: string; count: number } | null`;
  getters `steps: number[]` (`levelSteps(last, target ?? 0)`), `canSave: boolean` (steps non-empty
  and not loading/saving); actions `load(api = sheetsApi): Promise<boolean>`,
  `save(api = sheetsApi): Promise<void>`.

- [ ] **Step 1: Failing tests** (fake API in the style of `gearStore.test.ts`, LevelLogs header
      `'LevelLogs'!A1:D1` and column A `'LevelLogs'!A:A`):
  - `load` with column A `[newSynchroLevel, 200, 210]` → `last` 210, `target` 215.
  - `load` with header only → `last` null, `target` null, `canSave` false.
  - `save` with target 225 → one `batchUpdateValues` call whose LevelLogs data is three rows
    (215, 220, 225), C cells resolved to the guarded formula for rows 4, 5, 6; AuditLog row form
    `Level`, count 3; afterwards `status` `'saved'`, `note` `''`, `last` reloaded.
  - `save` when column A changed to end at 225 since load (target 225) → no write, `status`
    `'error'`, error mentions `225`.
- [ ] **Step 2:** `yarn test src/stores/levelStore` → FAIL.
- [ ] **Step 3:** Implement. `save` re-reads column A first; if `levelSteps` on the fresh last is
      empty, error `Level ${target} is not above the last logged level (${last}).` Then
      `writeTabsAtEnd(api, [{ tab: LEVEL_TAB, rows: toRows(steps, date, note) }], 'Level')`, clear
      `note`, reload, set `'saved'`.
- [ ] **Step 4:** `yarn test src/stores/levelStore` → PASS.

### Task 4: Page, route and nav

**Files:**

- Create: `src/pages/Level.vue`
- Modify: `src/router/index.ts` (route `/level`), `src/App.vue` (`{ to: '/level', label: 'Level' }`
  after Gear)

**Interfaces:**

- Consumes: `useLevelStore` (Task 3).

- [ ] **Step 1:** Page in the layout and classes of `Gear.vue`: heading "Level", labelled date input,
      labelled number input "Level reached" (`step="5"`, `inputmode="numeric"`), labelled note input,
      a preview line, Save button (disabled unless `canSave`), error and saved messages like Gear.
      Calls `store.load()` on mount. Sheet link, if any, hidden on small screens like other pages.
      Preview copy, exact:
  - valid: `Last logged: {last}. Writes {n} row(s): {steps joined by ', '}` (`Last logged: none.`
    when `last` is null).
  - invalid target: `Enter a multiple of 5 above {last}.`
- [ ] **Step 2:** Run the checks: `yarn format && yarn lint && yarn check && yarn build && yarn test`
      → all pass.
- [ ] **Step 3: Owner checks on the sheet copy** (hand these over before merge):
  1. Open `/level`: preview shows the copy's last level and `Writes 1 row(s): last+5`.
  2. Enter last+15 with a note, save. LevelLogs gets 3 rows with the same date, note only on the
     last; the previous last row's `daysElapsed` now shows a number; the 2 step rows show `0`; the
     new last row's C is blank. AuditLog has one `Level` row with count 3.
  3. Enter a non-multiple of 5 and a level at or below last: Save is disabled with the hint.
  4. Anomaly and Gear still save (writer change).
