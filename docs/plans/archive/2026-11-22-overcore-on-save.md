# Overcore on Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every gacha save that includes a copy past C7 also writes its `Overcored` row(s) in the same batch and shows a sarcastic remark scaled by source pain.

**Architecture:** A pure service `src/services/overcore/overcore.ts` turns AllPulls + RosterLog values into copy starts, finds overcores, builds Overcored rows and the remark; one async `checkOvercores` reads the two tabs. Each of the six gacha stores calls it before `writeTabsAtEnd` and adds an `OVERCORED_TAB` target when it has rows. Remark copy lives in `src/config/overcoreLines.ts`.

**Tech Stack:** Vue 3, Pinia, TypeScript, Vitest. Paths below are relative to `ui/`.

**Spec:** `docs/superpowers/specs/2026-11-22-overcore-on-save-design.md`

## Global Constraints

- `OVERCORED_TAB` headers exactly `['date', 'from', 'ssr', 'manufacturer', 'notes']`, tab `Overcored`, gacha sheet.
- Read-only specs (header-checked before reading): `ALL_PULLS_TAB` tab `AllPulls`, headers `['date', 'ssr', 'source', 'spook', 'copy', 'isOvercore']`; `ROSTER_LOG_TAB` tab `RosterLog`, headers `['date', 'nameCode', 'name', 'copies']`.
- `from` is the tab name: `Social`, `Event`, `Ordinary`, `Molds`, `SpareBody`, `Other`.
- Overcore = copy > 11. Core label `C${copy - 4}`.
- Pain levels: 1 Other, Social · 2 Ordinary, `Yellow Mold`, `Purple Mold`, `HQ Mold` · 3 Event · 4 `Pilgrim Mold`, `Missilis Mold`, `Elysion Mold`, `Tetra Mold` · 5 any mold containing `Perfect` · 6 SpareBody `Silver Mileage` / `Union Chip` · 7 SpareBody `Gold Mileage`. A Pilgrim Nikke adds 1, capped at 7.
- Lines exactly as the spec's `### Remarks` list, `{who}` placeholder; Pilgrim line `And she's a Pilgrim.`
- `manufacturer` title-cased: first letter as is, rest lowercase (`MISSILIS` → `Missilis`). Unknown Nikke: `''`, no Pilgrim bump.
- `notes` written as `''`.
- Checks: `yarn format && yarn lint && yarn check && yarn build && yarn test` from `ui/`.
- No git commits: the owner commits.

## Review Focus

1. The same Nikke twice in one save gets C8 then C9, two rows. Test in Task 1.
2. A save dated on or before the baseline writes no Overcored row, even at copy 11. Test in Task 1.
3. A picked name missing from the store's Nikke list still gets its row, with blank `manufacturer` and no bump. Test in Task 1.
4. AllPulls rows with blank `copy`, short rows, or a later row for the same name with blank `copy` (a later pre-baseline pull can't exist after a post-baseline one in date order, but hand-sorted junk can): the last non-header row for the name decides, and a blank falls back to baseline. Test in Task 1.
5. A failed AllPulls read leaves the form entry and writes nothing. Test in Task 2.

---

### Task 1: Overcore service and lines

**Files:**
- Modify: `src/config/sheets.ts` (add `ALL_PULLS_TAB`, `ROSTER_LOG_TAB`, `OVERCORED_TAB`)
- Create: `src/config/overcoreLines.ts`
- Create: `src/services/overcore/overcore.ts`
- Test: `src/services/overcore/overcore.test.ts`

**Interfaces:**
- Consumes: `cellToIsoDate`, `asText` from `@/services/anomaly/anomalyRows`; `checkHeaders` from `@/services/sheets/tabWriter`; `Nikke` from `@/services/nikke/nikkeDatabase`.
- Produces:
  - `OVERCORE_LINES: Record<1 | 2 | 3 | 4 | 5 | 6 | 7, readonly string[]>`, `PILGRIM_LINE: string`
  - `type OvercoreSource = 'Social' | 'Event' | 'Ordinary' | 'Molds' | 'SpareBody' | 'Other'`
  - `type Overcore = { name: string; copy: number }`
  - `painLevel(from: OvercoreSource, detail: string): number` — `detail` is the mold type for Molds, the spare source for SpareBody, else ignored.
  - `copyStarts(allPulls: string[][], rosterLog: string[][]): { baseline: string | null; start: (name: string) => number }` — both arguments include the header row. Dates via `cellToIsoDate`.
  - `findOvercores(names: string[], date: string, starts: ReturnType<typeof copyStarts>): Overcore[]` — `[]` when `baseline` is null or `date <= baseline` (ISO strings compare lexically).
  - `overcoreRows(found: Overcore[], from: OvercoreSource, date: string, nikkes: Nikke[]): Cell[][]` — `[date, from, asText(name), maker, '']`.
  - `remark(found: Overcore[], from: OvercoreSource, detail: string, nikkes: Nikke[], rand?: () => number): string | null` — null when `found` is empty.
  - `async checkOvercores(api: SheetsApi, s: { from: OvercoreSource; detail: string; date: string; names: string[]; nikkes: Nikke[] }, rand?: () => number): Promise<{ rows: Cell[][]; remark: string | null }>` — reads `'AllPulls'!A1:F` and `'RosterLog'!A1:D` with `'UNFORMATTED_VALUE'` (same range style as `readNikkes`), runs `checkHeaders` on each row 1, throws on mismatch.

- [ ] **Step 1: Write the failing tests** in `src/services/overcore/overcore.test.ts`:

```ts
const AP_H = ['date', 'ssr', 'source', 'spook', 'copy', 'isOvercore']
const RL_H = ['date', 'nameCode', 'name', 'copies']
const roster = [RL_H, ['2026-11-21', '5001', 'Rapi', '10'], ['2026-11-21', '5002', 'Noah', '11'],
  ['2026-11-25', '5001', 'Rapi', '11']]
const pulls = [AP_H, ['2026-11-20', 'Rapi', 'Event', 'FALSE', '', 'FALSE'],
  ['2026-11-24', 'Rapi', 'Event', 'FALSE', '11', 'FALSE'], ['2026-11-24', 'Liter', 'Molds', '', '', ''], ['x']]
const nikkes = [nikke('Rapi', 'ELYSION'), nikke('Noah', 'PILGRIM')]

it('painLevel follows the owner order', () => {
  expect(painLevel('Other', '')).toBe(1); expect(painLevel('Social', '')).toBe(1)
  expect(painLevel('Ordinary', '')).toBe(2); expect(painLevel('Molds', 'HQ Mold')).toBe(2)
  expect(painLevel('Event', '')).toBe(3); expect(painLevel('Molds', 'Tetra Mold')).toBe(4)
  expect(painLevel('Molds', 'HQ Perfect Mold')).toBe(5); expect(painLevel('SpareBody', 'Union Chip')).toBe(6)
  expect(painLevel('SpareBody', 'Gold Mileage')).toBe(7)
})
it('copyStarts uses the last AllPulls copy, else the baseline, else 0', () => {
  const s = copyStarts(pulls, roster)
  expect(s.baseline).toBe('2026-11-21')
  expect([s.start('Rapi'), s.start('Noah'), s.start('Liter'), s.start('Nobody')]).toEqual([11, 11, 0, 0])
})
it('same Nikke twice in a save is C8 then C9', () => {
  expect(findOvercores(['Rapi', 'Rapi', 'Liter'], '2026-11-26', copyStarts(pulls, roster)))
    .toEqual([{ name: 'Rapi', copy: 12 }, { name: 'Rapi', copy: 13 }])
})
it('a save on or before the baseline finds nothing', () => {
  expect(findOvercores(['Noah'], '2026-11-21', copyStarts(pulls, roster))).toEqual([])
})
it('no RosterLog rows means no baseline and nothing found', () => {
  expect(findOvercores(['Noah'], '2026-11-26', copyStarts(pulls, [RL_H]))).toEqual([])
})
it('overcoreRows title-cases the maker and blanks unknown Nikkes', () => {
  expect(overcoreRows([{ name: 'Rapi', copy: 12 }, { name: 'Ghost', copy: 12 }], 'SpareBody', '2026-11-26', nikkes))
    .toEqual([['2026-11-26', 'SpareBody', "'Rapi", 'Elysion', ''], ['2026-11-26', 'SpareBody', "'Ghost", '', '']])
})
it('remark: worst level, every overcore named, Pilgrim bump and line', () => {
  const r = remark([{ name: 'Noah', copy: 12 }], 'Molds', 'Pilgrim Perfect Mold', nikkes, () => 0)
  expect(r).toBe(`${OVERCORE_LINES[6][0].replace('{who}', 'Noah C8')} ${PILGRIM_LINE}`)
  expect(remark([{ name: 'Rapi', copy: 12 }, { name: 'Rapi', copy: 13 }, { name: 'Noah', copy: 12 }],
    'SpareBody', 'Gold Mileage', nikkes, () => 0))
    .toBe(`${OVERCORE_LINES[7][0].replace('{who}', 'Rapi C8, Rapi C9 and Noah C8')} ${PILGRIM_LINE}`)
  expect(remark([], 'Other', '', nikkes)).toBeNull()
})
it('checkOvercores throws on an AllPulls header mismatch', async () => {
  // fake api returning [['date', 'ssr']] for AllPulls
  await expect(checkOvercores(api, input)).rejects.toThrow(HeaderMismatchError)
})
it('checkOvercores returns rows and remark', async () => { /* fake api with pulls and roster above */ })
```

`nikke(name, maker)` builds a full `Nikke` with `rarity: 'SSR'`. The fake api follows `socialStore.test.ts`'s `values` map.

- [ ] **Step 2: Run them and see them fail**

Run: `yarn test src/services/overcore`
Expected: FAIL, cannot resolve `./overcore`.

- [ ] **Step 3: Implement** the three `TabSpec`s, `overcoreLines.ts` (one line per level from the spec, as arrays so the owner can add more), and `overcore.ts` with the interfaces above. `remark` picks `lines[Math.floor(rand() * lines.length)]`; the level is the max over `found` of `painLevel + (Pilgrim ? 1 : 0)`, capped at 7; the list joins with `, ` and ` and ` before the last. Put a `shortcut:` comment on `findOvercores`: backdated saves after the baseline use "last copy + n", which can differ from where the formula places them; fine when logging on the day, upgrade by re-reading AllPulls after the write if that changes.

- [ ] **Step 4: Run them and see them pass**

Run: `yarn test src/services/overcore`
Expected: PASS.

### Task 2: Wire the six stores and pages

**Files:**
- Modify: `src/stores/{social,event,ordinary,molds,spareBody,other}Store.ts` and their `.test.ts`
- Modify: `src/pages/{Social,Event,Ordinary,Molds,SpareBody,Other}.vue`

**Interfaces:**
- Consumes: `checkOvercores`, `OVERCORED_TAB` from Task 1.
- Produces: store state `remark: string | null`.

Per store, the call is `checkOvercores(api, { from, detail, date: entry.date, names, nikkes: this.nikkes })`:

| store | from | detail | names |
| --- | --- | --- | --- |
| social | `Social` | `''` | `entry.names` |
| event | `Event` | `''` | `entry.names` |
| ordinary | `Ordinary` | `''` | `entry.names` |
| molds | `Molds` | `entry.moldType` | `entry.names` |
| spareBody | `SpareBody` | `entry.source` | `entry.target` repeated `parseCopies(entry.copies)` times |
| other | `Other` | `''` | `entry.names` |

Check each store's entry type for the actual field names before wiring.

- [ ] **Step 1: Write the failing store tests.** In each store's test, add `AllPulls`, `RosterLog` and `Overcored` keys to the fake api (A1 header ranges, `A:A`, and the `A1:F` / `A1:D` reads), with the picked Nikke at copy 11 after a baseline before the entry date:

```ts
it('writes the Overcored row in the same batch and sets a remark', async () => {
  // entry with the copy-11 Nikke, then save
  const [batch] = api.batches   // or however the existing test captures batchUpdateValues
  expect(batch.map((d) => d.range.split('!')[0])).toEqual([`'<Tab>'`, `'Overcored'`, `'AuditLog'`])
  expect(store.remark).toMatch(/C8/)
})
it('a failed AllPulls read writes nothing and keeps the entry', async () => {
  // getValues rejects for 'AllPulls'
  expect(store.status).toBe('error'); expect(batches).toHaveLength(0); expect(store.entry.names.length).toBe(1)
})
```

For SpareBody, a save of 2 copies of a copy-11 target writes two Overcored rows (C8, C9). For Molds, the `Pilgrim Perfect Mold` remark ends with `And she's a Pilgrim.` Match the batch order to what `writeTabsAtEnd` actually produces (targets in order, then AuditLog).

- [ ] **Step 2: Run them and see them fail**

Run: `yarn test src/stores`
Expected: the new tests FAIL; existing ones pass. Saves without overcores must still write one tab plus AuditLog. Existing tests' fake apis need the two new read keys so `checkOvercores` finds headers; add them to the shared fixtures in each test file.

- [ ] **Step 3: Implement.** Each `save`: clear `remark` at the start, call `checkOvercores` inside the existing `try` before `writeTabsAtEnd`, pass `[{ tab: <TAB>, rows }, ...(oc.rows.length ? [{ tab: OVERCORED_TAB, rows: oc.rows }] : [])]`, and set `this.remark = oc.remark` right after the write succeeds (before the reload). Each page adds, right after its `lastSaved` line: `<p v-if="store.remark" role="status" class="py-1">{{ store.remark }}</p>`.

- [ ] **Step 4: Run the full checks**

Run: `yarn format && yarn lint && yarn check && yarn build && yarn test`
Expected: all pass.

### Task 3: Mock scenarios and docs

**Files:**
- Modify: `src/services/mock/fixtures.ts`
- Modify: `src/services/mock/mockFlow.test.ts`
- Modify: `CLAUDE.md` (`ui/CLAUDE.md`, "Reviewing the UI")
- Modify: `../docs/superpowers/specs/2026-11-21-gacha-tracker-design.md` (mark 6.5 built)

- [ ] **Step 1: Fixtures.** Add to `MOCK_SHEETS`:
  - NikkeDatabase: `[5005, 'Noah', 'SSR', 'PILGRIM', 'Defender', 'Step2', 'Wind', 'RL', 13, 45000]`.
  - `RosterLog`: `['2026-11-01', 5001, 'Rapi', 10]`, `['2026-11-01', 5005, 'Noah', 11]`.
  - `AllPulls` (static, as the formula would show): `['2026-10-20', 'Rapi', 'Event', false, '', false]`, `['2026-11-02', 'Rapi', 'Event', false, 11, false]`.
  - `Overcored`: one hand-style row, `['2025-05-01', 'Event Banner', 'Noah', 'Pilgrim', 'pilgrim core 8 pain']`.

- [ ] **Step 2: Write the failing mock-flow tests** in `mockFlow.test.ts`, following its existing style:

```ts
it('level 7: Gold Mileage Rapi', async () => {
  // SpareBody store on the mock api: source 'Gold Mileage', target 'Rapi', copies '1', save
  expect(overcoredRowsAdded).toEqual([[today, 'SpareBody', "'Rapi", 'Elysion', '']])
  expect(store.remark).toContain('Rapi C8')
})
it('level 6: Pilgrim Perfect Mold Noah', async () => {
  // Molds store: moldType 'Pilgrim Perfect Mold', amount '1', names ['Noah'], save
  expect(overcoredRowsAdded).toEqual([[today, 'Molds', "'Noah", 'Pilgrim', '']])
  expect(store.remark).toMatch(/Noah C8.*And she's a Pilgrim\.$/)
})
```

`today` is `gameDay()`, the entry's default date.

- [ ] **Step 3: Run them, see them fail, then pass** once the fixtures are in.

Run: `yarn test src/services/mock`
Expected: FAIL before Step 1's fixtures are added, PASS after.

- [ ] **Step 4: Document the scenarios** in `ui/CLAUDE.md` under "Reviewing the UI", as a short numbered list a browser test can follow:
  1. `#/sparebody`: source Gold Mileage, target Rapi, copies 1, Save. Expect the "Saved to …" line plus a remark containing `Rapi C8`.
  2. `#/molds`: Pilgrim Perfect Mold, amount 1, pick Noah, Save. Expect a remark containing `Noah C8` and ending `And she's a Pilgrim.`
  3. The mock AllPulls is static, so repeats show C8 again; reload to reset.

Check the real route paths in `src/router/index.ts` before writing them.

- [ ] **Step 5: Run the full checks, then check by hand**

Run: `yarn format && yarn lint && yarn check && yarn build && yarn test`, then `yarn dev:mock` and play both scenarios in a browser (or the headless command in `ui/CLAUDE.md`).
Expected: checks pass; both remarks appear.

## Manual steps (owner)

1. Before release, confirm the real sheet's `Overcored` row 1 is `date`, `from`, `ssr`, `manufacturer`, `notes`.
2. Pre-merge on the sheet copy: one save that isn't an overcore (one tab + AuditLog, nothing in Overcored) and, if possible, one that is.
