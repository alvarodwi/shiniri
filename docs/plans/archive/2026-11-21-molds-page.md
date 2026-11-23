# Molds Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `Molds` page that logs one mold session per row to the gacha sheet's `Molds` tab.

**Architecture:** Same shape as the Ordinary page: a `TabSpec`, pure row logic in
`services/molds/`, a Pinia store saving through `writeTabsAtEnd`, a page using `NikkePicker`. The
picker pool comes from a new `moldPool(nikkes, type)`.

**Tech Stack:** Vue 3, Pinia, Vitest, TypeScript.

**Spec:** `docs/superpowers/specs/2026-11-21-molds-page-design.md`

## Global Constraints

- Headers, verbatim: `date, moldType, amount, ssr, result, notes`.
- Mold type strings, verbatim, in this order: `Pilgrim Mold`, `Yellow Mold`, `Purple Mold`,
  `Missilis Mold`, `Elysion Mold`, `Tetra Mold`, `Pilgrim Perfect Mold`, `Elysion Perfect Mold`,
  `Missilis Perfect Mold`, `Tetra Perfect Mold`, `HQ Mold`, `HQ Perfect Mold`.
- Writer form name: `Molds`.
- Free-text cells (`result`, `notes`) go through `asText` (from `services/anomaly/anomalyRows`);
  `moldType` is written raw, as Event writes `rateUpType`.
- Checks from `ui/`: `yarn format && yarn lint && yarn check && yarn build && yarn test`.
- No commits unless the owner asks (owner rule overrides the commit steps below; stage only).

## Review Focus

- Mold type switched after picking: names outside the new pool are dropped (store test, Task 2).
- `amount` typed as `2.5`, `0`, `-1`, ` 3 `: only whole numbers >= 1 save; spaces trimmed (Task 1).
- Same Nikke picked twice in one session is allowed (picker already allows it; Task 1 row test).
- Manufacturer compare is case-insensitive: `ELYSION` and `Elysion` both match (Task 1).
- Perfect mold with fewer names than `amount` stays unsaveable (Task 1).

---

### Task 1: Types, tab spec, row logic

**Files:**
- Create: `ui/src/types/molds.ts`, `ui/src/services/molds/moldRows.ts`
- Modify: `ui/src/config/sheets.ts` (after `ORDINARY_TAB`)
- Test: `ui/src/services/molds/moldRows.test.ts`

**Interfaces:**
- Produces:
  - `MOLD_TYPES: readonly [...]` (the 12 strings), `type MoldType = (typeof MOLD_TYPES)[number]`
  - `type MoldsEntry = { date: string; moldType: string; amount: string; names: string[]; notes: string }`
  - `MOLDS_TAB: TabSpec` (gacha spreadsheet, tab `Molds`, headers above)
  - `isMoldType(t: string): t is MoldType` (`(MOLD_TYPES as readonly string[]).includes(t)`)
  - `isPerfect(t: MoldType): boolean` (`t.includes('Perfect')`)
  - `moldPool(nikkes: Nikke[], t: string): Nikke[]` (`[]` when not a mold type)
  - `toRow(e: MoldsEntry): Cell[] | null`

- [ ] **Step 1: Write failing tests** in `moldRows.test.ts`:
  - `moldPool` with a db of SSR `Elysion`/`ELYSION`, SSR `Modernia`/`Pilgrim`, SSR `Asuka`/`ABNORMAL`,
    SSR `Maxwell`/`Missilis`, SR `Soda`/`Tetra`:
    - `'Elysion Mold'` and `'Elysion Perfect Mold'` give `['Elysion']`
    - `'Pilgrim Mold'` gives `['Modernia']`
    - `'Tetra Mold'` gives `[]` (SR dropped)
    - `'Yellow Mold'`, `'Purple Mold'`, `'HQ Mold'`, `'HQ Perfect Mold'` give `['Elysion', 'Maxwell']`
  - `toRow({ date: '2026-11-21', moldType: 'Yellow Mold', amount: ' 5 ', names: ['Maiden', 'Folkwang'], notes: ' ok ' })`
    equals `['2026-11-21', 'Yellow Mold', 5, 2, "'Maiden, Folkwang", "'ok"]`
  - zero names on `'Purple Mold'`, amount `'1'`: `['2026-11-21', 'Purple Mold', 1, 0, '', '']`
  - same name twice allowed: `names: ['Liter', 'Liter']`, amount `'2'` gives `ssr` 2
  - null when: date `''`; moldType `''` or `'Gold Mold'`; amount `''`, `'0'`, `'-1'`, `'2.5'`, `'x'`; names longer
    than amount; `'HQ Perfect Mold'` with amount `'2'` and one name
  - non-null for `'HQ Perfect Mold'` with amount `'2'` and two names
- [ ] **Step 2:** `yarn test moldRows` from `ui/`. Expected: FAIL (module missing).
- [ ] **Step 3:** Add types, `MOLDS_TAB` (one-line comment like Ordinary's: `ssr` is the count of
  `result`), and `moldRows.ts`. `moldPool`: for `Pilgrim`/`Missilis`/`Elysion`/`Tetra` (first word of
  the type) keep `rarity === 'SSR'` and lowercased `manufacturer` equal to that word lowercased;
  otherwise `ssrPool(nikkes, { pilgrim: false, abnormal: false })`. Amount parse: trim, `/^\d+$/`,
  `>= 1`.
- [ ] **Step 4:** `yarn test moldRows`. Expected: PASS.
- [ ] **Step 5:** Stage files.

### Task 2: Store

**Files:**
- Create: `ui/src/stores/moldsStore.ts`
- Test: `ui/src/stores/moldsStore.test.ts` (copy `ordinaryStore.test.ts`'s `fakeApi`, ranges
  `'Molds'!A1:F1` and `'Molds'!A:A` faked as header plus one row, so the write lands on A3; add a
  Missilis `dbRow` `Maxwell`)

**Interfaces:**
- Consumes: Task 1 exports.
- Produces: `useMoldsStore` with state `entry, nikkes, status, error, lastSaved`; getters `row`,
  `pool` (`[]` while `moldType` is `''`), `canSave`; actions `load(api?)`, `setMoldType(t: string)`,
  `save(api?)`. Same `load`/`save` behaviour as `ordinaryStore` (form name `'Molds'`, tab
  `MOLDS_TAB`). `newEntry()`: `{ date: gameDay(), moldType: '', amount: '', names: [], notes: '' }`.

- [ ] **Step 1: Write failing tests:**
  - `load` fills `nikkes`; `pool` is `[]` before a type is set
  - `setMoldType('Pilgrim Mold')` then `pool` names are `['Modernia']`
  - `setMoldType('Yellow Mold')`, names `['Elysion', 'Maxwell']`, then `setMoldType('Elysion Mold')`:
    names become `['Elysion']`
  - `save` with a valid entry writes `'Molds'!A3:F3` with the row and an AuditLog row with form
    `'Molds'`, then resets the entry and sets `lastSaved`
  - `canSave` false while row is null
- [ ] **Step 2:** `yarn test moldsStore`. Expected: FAIL.
- [ ] **Step 3:** Implement, mirroring `ordinaryStore.ts`; drop `add`/`removeAt` (the page binds
  the picker's `model-value`). `setMoldType` sets the type, then keeps names present in the new pool.
- [ ] **Step 4:** `yarn test moldsStore`. Expected: PASS.
- [ ] **Step 5:** Stage files.

### Task 3: Page, route, nav, mock, CLI fixture

**Files:**
- Create: `ui/src/pages/Molds.vue`
- Modify: `ui/src/router/index.ts` (`/molds`), `ui/src/App.vue` (nav `{ to: '/molds', label: 'Molds' }`
  after Ordinary), `ui/src/services/mock/fixtures.ts` (`tab(MOLDS_TAB, [...])` with two rows from the
  real sheet, e.g. `Yellow Mold, 5, 2, Maiden, Folkwang`), `cli/tests/test_names.py:9` (`moldtype` to
  `moldType`)

- [ ] **Step 1:** Write `Molds.vue` from `Ordinary.vue`: Date input; labelled `<select>` for mold
  type (placeholder `<option value="" disabled>Pick a mold</option>`, `@change` calls `store.setMoldType`); Amount
  text input (`inputmode="numeric"`, id `molds-amount`); `NikkePicker` with `:nikkes="store.pool"`, shown only once a type is picked
  (else `Pick a mold first.`);
  live hint under the picker: `SSR: n / amount`, plus `More SSRs than molds opened.` when too many
  and `Perfect molds always give an SSR: pick one per mold.` when a Perfect type is short. Notes,
  Save bar as Ordinary.
- [ ] **Step 2:** From `ui/`: `yarn format && yarn lint && yarn check && yarn build && yarn test`.
  Expected: all pass. From `cli/`: `uv run pytest tests/test_names.py` (or the project's usual
  pytest command). Expected: PASS.
- [ ] **Step 3:** `yarn dev:mock`, open `#/molds`, log a Yellow and a Perfect session; rows land
  under the fixture rows.
- [ ] **Step 4:** Stage files. Remind the owner: rename `moldtype` to `moldType` on the test copy
  and the real sheet before release.
