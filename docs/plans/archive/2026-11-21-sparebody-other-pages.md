# SpareBody and Other Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `SpareBody` and `Other` pages that log to the restructured gacha tabs, one row per copy
(or one row per Guaranteed SSR save).

**Architecture:** Same shape as Molds: a `TabSpec`, pure row logic in `services/<form>/`, a Pinia
store saving through `writeTabsAtEnd`, a page using `NikkePicker`. Unlike Molds, row logic returns
`Cell[][]` (several rows per save). The cli name sweep learns Other's `rateUpName`.

**Tech Stack:** Vue 3, Pinia, Vitest, TypeScript; Python/pytest for the cli sweep.

**Spec:** `docs/superpowers/specs/2026-11-21-sparebody-other-design.md`

## Global Constraints

- `SpareBody` headers, verbatim: `date, target, source, notes`.
- `Other` headers, verbatim:
  `date, sourceType, sourceInfo, rateUpName, gems, times, totalSsr, ssrDetails, notes`.
- SpareBody form sources, verbatim, in order: `Gold Mileage`, `Silver Mileage`, `Union Chip`.
  `Liberation` and `Bonus Recruit` appear nowhere in code.
- Other types, verbatim, in order: `Welfare Unit`, `Welfare Pass`, `Free Pulls`, `Guaranteed SSR`.
- Union Chip pool: exact names `Sin`, `Quency`, `Guilty`, `Nihilister` (never a prefix match).
- `MAX_COPIES = 11` in `ui/src/config/limits.ts`.
- Pools: Gold Mileage `ssrPool(n, { pilgrim: true, abnormal: true })`; Silver Mileage and every
  Other type (both pickers) `ssrPool(n, { pilgrim: true, abnormal: false })`.
- Writer form names: `SpareBody`, `Other`.
- Free-text and name cells go through `asText` (`services/anomaly/anomalyRows`); `source` and
  `sourceType` are written raw, as Event writes `rateUpType`. Numbers are written as numbers.
- With `copies` > 1, only the last row carries `notes`; earlier rows get `''`.
- Checks from `ui/`: `yarn format && yarn lint && yarn check && yarn build && yarn test`.
- No commits unless the owner asks (owner rule overrides; stage only).

## Review Focus

- `copies` typed as `0`, `12`, `2.5`, ` 3 `: only whole numbers 1-11 save; spaces trimmed (Tasks 1, 4).
- Union Chip pool with `Sin: Swift Bunny` / `Quency: Escape Queen` in the db: only the plain names
  are offered (Task 1).
- Switching Other's type from Guaranteed SSR (3 names, gems, times) to Welfare Unit: the row has no
  gems/times and one name only; the store keeps at most the first name (Tasks 4, 5).
- Free Pulls with a stale `sourceInfo` typed earlier: the row's `sourceInfo` is `''` (Task 4).
- A multi-row save lands as one contiguous range below existing data, with one AuditLog row
  (Tasks 2, 5).

---

### Task 1: SpareBody types, tab spec, limit, row logic

**Files:**
- Create: `ui/src/types/spareBody.ts`, `ui/src/services/spareBody/spareBodyRows.ts`
- Modify: `ui/src/config/sheets.ts` (after `MOLDS_TAB`), `ui/src/config/limits.ts`
- Test: `ui/src/services/spareBody/spareBodyRows.test.ts`

**Interfaces:**
- Produces:
  - `SPARE_SOURCES` (the 3 strings, `as const`), `type SpareSource = (typeof SPARE_SOURCES)[number]`
  - `type SpareBodyEntry = { date: string; source: string; target: string; copies: string; notes: string }`
  - `SPARE_BODY_TAB: TabSpec` (gacha spreadsheet, tab `SpareBody`)
  - `MAX_COPIES = 11` (comment: one copy, 3 spare bodies to MLB, 7 more to C7; past that is overcore)
  - `LIBERATION_UNITS = ['Sin', 'Quency', 'Guilty', 'Nihilister'] as const` (in `types/spareBody.ts`)
  - `parseCopies(s: string): number | null` in `spareBodyRows.ts` (trim, `/^\d+$/`, 1..`MAX_COPIES`);
    Task 4 reuses it
  - `spareBodyPool(nikkes: Nikke[], source: string): Nikke[]` (`[]` when not a source)
  - `toRows(e: SpareBodyEntry): Cell[][] | null`

- [ ] **Step 1: Write failing tests:**
  - `spareBodyPool` with SSR `Modernia`/`Pilgrim`, SSR `Asuka`/`ABNORMAL`, SSR `Maxwell`/`Missilis`,
    SSR `Sin`/`Pilgrim`, SSR `Sin: Swift Bunny`/`Pilgrim`, SSR `Quency`/`Missilis`, SR `Soda`/`Tetra`:
    - `'Gold Mileage'`: all SSRs (Asuka included, Soda not)
    - `'Silver Mileage'`: all SSRs but Asuka
    - `'Union Chip'`: `['Sin', 'Quency']`
    - `'Liberation'` and `''`: `[]`
  - `parseCopies`: `' 3 '` -> 3, `'11'` -> 11; null for `''`, `'0'`, `'12'`, `'2.5'`, `'x'`
  - `toRows({ date: '2026-11-18', source: 'Gold Mileage', target: 'Marian: Queen', copies: '3', notes: ' c7 ' })`
    equals three rows: two `['2026-11-18', "'Marian: Queen", 'Gold Mileage', '']`, last with `"'c7"`
  - `copies: '1'` gives one row carrying the note
  - null when: date `''`; source `''` or `'Liberation'`; target `''`; copies invalid
- [ ] **Step 2:** `yarn test spareBodyRows` from `ui/`. Expected: FAIL (module missing).
- [ ] **Step 3:** Add types, `SPARE_BODY_TAB` (one-line comment: one row per copy; see
  `services/spareBody/spareBodyRows.ts`), `MAX_COPIES`, and `spareBodyRows.ts`.
- [ ] **Step 4:** `yarn test spareBodyRows`. Expected: PASS.
- [ ] **Step 5:** Stage files.

### Task 2: SpareBody store

**Files:**
- Create: `ui/src/stores/spareBodyStore.ts`
- Test: `ui/src/stores/spareBodyStore.test.ts` (copy `moldsStore.test.ts`'s `fakeApi`; ranges
  `'SpareBody'!A1:D1` = headers, `'SpareBody'!A:A` = header plus one row, so a write lands on A3;
  db rows `Modernia`/`Pilgrim`, `Asuka`/`ABNORMAL`, `Sin`/`Pilgrim`)

**Interfaces:**
- Consumes: Task 1 exports.
- Produces: `useSpareBodyStore` with state `entry, nikkes, status, error, lastSaved`; getters `rows`,
  `pool`, `canSave`; actions `load(api?)`, `setSource(s: string)`, `save(api?)`. `load`/`save` as
  `moldsStore` but writing `rows` (all of them) with form name `'SpareBody'`. `newEntry()`:
  `{ date: gameDay(), source: '', target: '', copies: '1', notes: '' }`.

- [ ] **Step 1: Write failing tests:**
  - `pool` is `[]` before a source is set
  - target `Asuka` under `Gold Mileage`, then `setSource('Silver Mileage')`: target becomes `''`
  - target `Sin` under `Gold Mileage`, then `setSource('Union Chip')`: target stays `Sin`
  - `save` with copies `'2'` writes `'SpareBody'!A3:D4` with both rows and one AuditLog row with form
    `'SpareBody'`, then resets the entry and sets `lastSaved`
  - `canSave` false while `rows` is null
- [ ] **Step 2:** `yarn test spareBodyStore`. Expected: FAIL.
- [ ] **Step 3:** Implement, mirroring `moldsStore.ts`. `setSource` sets the source, then clears
  `target` if it isn't a name in the new pool.
- [ ] **Step 4:** `yarn test spareBodyStore`. Expected: PASS.
- [ ] **Step 5:** Stage files.

### Task 3: SpareBody page, route, nav, mock

**Files:**
- Create: `ui/src/pages/SpareBody.vue`
- Modify: `ui/src/router/index.ts` (`/sparebody`), `ui/src/App.vue` (nav
  `{ to: '/sparebody', label: 'SpareBody' }` after Molds), `ui/src/services/mock/fixtures.ts`
  (`tab(SPARE_BODY_TAB, [...])` with two rows in the new shape, e.g.
  `2026-11-18, Marian: Queen, Gold Mileage, ''` and `2026-07-23, Flora, Silver Mileage, ''`)

- [ ] **Step 1:** Write `SpareBody.vue` from `Molds.vue`: Date input; labelled group of three source
  buttons (`aria-pressed`, `@click="store.setSource(s)"`); `NikkePicker single` with
  `:nikkes="store.pool"`, bound to `target` as Event binds `rateUpName`, shown once a source is
  picked (else `Pick a source first.`); Copies text input (`inputmode="numeric"`, id
  `sparebody-copies`) with hint `1 to 11 copies, one row each.`; Notes; Save bar as Molds.
- [ ] **Step 2:** From `ui/`: all checks. Expected: pass.
- [ ] **Step 3:** `yarn dev:mock`, open `#/sparebody`, save Gold Mileage x3 and Union Chip x1; rows
  land under the fixture rows, note only on the last of the three.
- [ ] **Step 4:** Stage files.

### Task 4: Other types, tab spec, row logic

**Files:**
- Create: `ui/src/types/other.ts`, `ui/src/services/other/otherRows.ts`
- Modify: `ui/src/config/sheets.ts` (after `SPARE_BODY_TAB`)
- Test: `ui/src/services/other/otherRows.test.ts`

**Interfaces:**
- Consumes: `parseCopies` (Task 1).
- Produces:
  - `OTHER_TYPES` (the 4 strings, `as const`), `type OtherType`, `GUARANTEED = 'Guaranteed SSR'`,
    `FREE_PULLS = 'Free Pulls'`
  - `type OtherEntry = { date: string; sourceType: string; sourceInfo: string; rateUpName: string; gems: string; times: string; copies: string; names: string[]; notes: string }`
  - `OTHER_TAB: TabSpec` (gacha spreadsheet, tab `Other`)
  - `otherPool(nikkes: Nikke[]): Nikke[]` (`ssrPool` pilgrim yes, abnormal no)
  - `toRows(e: OtherEntry): Cell[][] | null`

Row rules (columns A-I). Write only fields the type uses, so stale state never reaches the sheet:
- `Welfare Unit` / `Welfare Pass` / `Free Pulls`: exactly one name, `parseCopies(copies)` rows of
  `[date, type, info, rateUp, '', 1, 1, asText(name), notesOnLast]`. `info` is
  `asText(sourceInfo.trim())`, required, except Free Pulls where it is `''`. `rateUp` is
  `asText(rateUpName)`, required, for Free Pulls only, else `''`.
- `Guaranteed SSR`: one row `[date, type, asText(info), '', gems, times, names.length, asText(names.join(', ')), asText(notes)]`.
  `sourceInfo` required; at least one name; `times` whole >= 1; `gems` `''` when blank, else a whole
  number >= 0 (no multiple-of-300 rule).

- [ ] **Step 1: Write failing tests:**
  - Welfare Unit, info `' 3.5 Anniv '`, names `['Avistar']`, copies `'4'`, notes `'mlb'`: four rows
    `['2026-04-23', 'Welfare Unit', "'3.5 Anniv", '', '', 1, 1, "'Avistar", '']`, last with `"'mlb"`
  - Free Pulls, rateUpName `'Scarlet: Goddeath'`, sourceInfo `'stale'`, names `['Arcana']`, copies
    `'1'`: one row with `sourceInfo` `''` and `rateUpName` `"'Scarlet: Goddeath"`
  - Guaranteed SSR, info `'Step Up 2025'`, gems `'6600'`, times `'31'`, names `['Yan', 'Grave']`,
    copies `'9'`: one row `[..., "'Step Up 2025", '', 6600, 31, 2, "'Yan, Grave", ...]`
  - Guaranteed SSR, info `'Tutorial'`, gems `''`, times `'10'`, names `['Liter']`: gems `''`
  - Welfare Pass with stale gems `'300'` and times `'5'`: row has `''`, 1
  - null when: date `''`; type `''` or `'Freebie'`; Welfare Unit with info `' '`, with 0 or 2 names,
    or copies `'12'`; Free Pulls without rateUpName; Guaranteed with 0 names, times `''`/`'0'`/`'1.5'`,
    or gems `'x'`/`'-300'`
- [ ] **Step 2:** `yarn test otherRows`. Expected: FAIL.
- [ ] **Step 3:** Add types, `OTHER_TAB` (one-line comment: totalSsr is the count of ssrDetails; see
  `services/other/otherRows.ts`), and `otherRows.ts`.
- [ ] **Step 4:** `yarn test otherRows`. Expected: PASS.
- [ ] **Step 5:** Stage files.

### Task 5: Other store

**Files:**
- Create: `ui/src/stores/otherStore.ts`
- Test: `ui/src/stores/otherStore.test.ts` (same `fakeApi`; ranges `'Other'!A1:I1`, `'Other'!A:A`
  header plus one row)

**Interfaces:**
- Consumes: Task 4 exports.
- Produces: `useOtherStore` with state `entry, nikkes, status, error, lastSaved`; getters `rows`,
  `pool` (`otherPool(nikkes)`), `canSave`; actions `load(api?)`, `setSourceType(t: string)`,
  `save(api?)` (form name `'Other'`). `newEntry()`: date `gameDay()`, `copies: '1'`, the rest `''`/`[]`.

- [ ] **Step 1: Write failing tests:**
  - from Guaranteed SSR with names `['Yan', 'Grave']`, gems `'6600'`, times `'31'`,
    `setSourceType('Welfare Unit')`: names `['Yan']`, gems `''`, times `''`
  - from Free Pulls with rateUpName set, `setSourceType('Welfare Pass')`: rateUpName `''`
  - `setSourceType('Free Pulls')` clears `sourceInfo`
  - `save` Welfare Unit x2 writes `'Other'!A3:I4` and one AuditLog row with form `'Other'`, then
    resets the entry
  - `canSave` false while `rows` is null
- [ ] **Step 2:** `yarn test otherStore`. Expected: FAIL.
- [ ] **Step 3:** Implement, mirroring `spareBodyStore.ts`; `setSourceType` clears what the new
  type doesn't use (rateUpName unless Free Pulls; sourceInfo for Free Pulls; gems, times and names
  past the first unless Guaranteed SSR).
- [ ] **Step 4:** `yarn test otherStore`. Expected: PASS.
- [ ] **Step 5:** Stage files.

### Task 6: Other page, route, nav, mock, cli sweep

**Files:**
- Create: `ui/src/pages/Other.vue`
- Modify: `ui/src/router/index.ts` (`/other`), `ui/src/App.vue` (nav `{ to: '/other', label: 'Other' }`
  after SpareBody), `ui/src/services/mock/fixtures.ts` (`tab(OTHER_TAB, [...])` with a Welfare Unit
  and a Guaranteed SSR row in the new shape), `cli/tools/names.py:24`
  (`"Other": ("rateUpName", "ssrDetails")`)
- Test: `cli/tests/test_names.py`

- [ ] **Step 1: cli test first.** In `test_missing_header_goes_on`, give the Other fixture a
  `rateUpName` column (`[["date", "rateUpName", "ssrDetails"], ["2022-11-08", "", "Anis"]]`) so its
  expected lines don't change. Add `test_other_rate_up_name_is_swept`: Other rows
  `[["date", "rateUpName", "ssrDetails"], ["2026-11-05", "Scarlt", "Anis"]]` gives first line
  starting `Other!B2  Scarlt`.
- [ ] **Step 2:** From `cli/`: `uv run pytest tests/test_names.py`. Expected: the new test FAILS.
- [ ] **Step 3:** Change `names.py:24`. Rerun. Expected: PASS.
- [ ] **Step 4:** Write `Other.vue` from `SpareBody.vue`: Date; four type buttons
  (`@click="store.setSourceType(t)"`); Info text input (id `other-info`, hidden for Free Pulls);
  for Free Pulls a `NikkePicker single` labelled Rate-up bound to `rateUpName`; for Guaranteed SSR,
  Gems and Times inputs (`inputmode="numeric"`) and a multi `NikkePicker`; else a single
  `NikkePicker` and the Copies input as SpareBody. Everything below the type shows once a type is
  picked. Notes; Save bar.
- [ ] **Step 5:** From `ui/`: all checks. Expected: pass.
- [ ] **Step 6:** `yarn dev:mock`, open `#/other`, save one of each type, switching types mid-entry
  once; rows land under the fixture rows with no stale fields.
- [ ] **Step 7:** Stage files. Remind the owner: do the spec's manual sheet step on the test copy,
  log a few rows of each page there, then do it on the real sheet before release.
