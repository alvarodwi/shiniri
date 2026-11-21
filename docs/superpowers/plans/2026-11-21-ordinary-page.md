# Ordinary Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A ui page that logs one ordinary-banner session as a row in the gacha sheet's `Ordinary` tab.

**Architecture:** The gems/tix rules move out of `services/event/eventRows.ts` into a shared
`services/gacha/pulls.ts`, used by Event and Ordinary alike. Ordinary then follows the "Adding a
form" recipe in `ui/CLAUDE.md`: a `TabSpec`, pure row logic, a Pinia store, a page, a route, and a
mock fixture.

**Tech Stack:** Vue 3, Pinia, Vitest, UnoCSS. Run every command from `ui/`.

**Spec:** `docs/superpowers/specs/2026-11-21-ordinary-page-design.md`

## Global Constraints

- Headers, verbatim: `date, gems, tix, times, totalSsr, ssrDetails, notes`.
- Spreadsheet: `import.meta.env.VITE_GACHA_SHEET_ID`. Form name in `AuditLog`: `Ordinary`.
- Pool: `ssrPool(nikkes, { pilgrim: true, abnormal: false })`. No Abnormal is ever offered.
- Every write goes through `writeTabsAtEnd`. Don't change `services/google` or `services/sheets`.
- No commits unless the owner asks (owner's rule). Leave changes in the working tree.
- Final check: `yarn format && yarn lint && yarn check && yarn build && yarn test`.

## Review Focus

1. Gems or tix with surrounding spaces (`' 300 '`) are accepted and trimmed, as on Event. Pinned by the moved Event test `trims gems and tix` and the Ordinary `trims` test in Task 2.
2. A session with 0 SSRs (`ssrDetails` blank, `totalSsr` 0) saves. The mock fixture already has one of these. Pinned in Task 2.
3. An Abnormal Nikke is never in the picker, even if the database lists one. Pinned in Task 3.
4. A failed reload after a save never leaves the entry in place to be saved twice: clear before reload, as `eventStore.save` does. Pinned in Task 3.
5. The Event page behaves exactly as before the refactor. The existing Event tests pass unchanged apart from imports.

---

### Task 1: Shared pull math

**Files:**
- Create: `src/services/gacha/pulls.ts`, `src/services/gacha/pulls.test.ts`
- Modify: `src/services/event/eventRows.ts`, `src/services/event/eventRows.test.ts`, `src/pages/Event.vue`

**Interfaces:**
- Produces:
  - `type Currency = { gems: string; tix: string }`
  - `pullsHint(c: Currency): string`, with the same messages as today.
  - `pulls(c: Currency): { gems: number; tix: number; times: number } | null`. It returns null when an amount isn't a whole number, gems isn't a multiple of 300, or `times < 1`. Blank counts as 0.

- [ ] **Step 1:** Move the `describe('pullsHint')` block from `eventRows.test.ts` to `pulls.test.ts`, with an inline `{ gems, tix }` argument. Add a `describe('pulls')` block:
  - `pulls({ gems: '600', tix: '3' })` equals `{ gems: 600, tix: 3, times: 5 }`
  - `pulls({ gems: ' 300 ', tix: '' })` equals `{ gems: 300, tix: 0, times: 1 }`
  - `pulls({ gems: '', tix: '' })`, `pulls({ gems: '150', tix: '1' })` and `pulls({ gems: '-300', tix: '1' })` are null
- [ ] **Step 2:** Run `yarn test src/services/gacha`. Expected: FAIL, module not found.
- [ ] **Step 3:** Create `pulls.ts`. Move `amount` and `pullsHint` there, add `pulls`. Rewrite Event's `toRow` to use `pulls` (keep the date and `RATE_UP_TYPES` checks). Point `Event.vue`'s `pullsHint` import at `@/services/gacha/pulls`.
- [ ] **Step 4:** Run `yarn test src/services`. Expected: PASS, including every existing `eventRows` `toRow` test.

### Task 2: Ordinary row

**Files:**
- Create: `src/types/ordinary.ts`, `src/services/ordinary/ordinaryRows.ts`, `src/services/ordinary/ordinaryRows.test.ts`
- Modify: `src/config/sheets.ts` (add `ORDINARY_TAB` after `EVENT_TAB`)

**Interfaces:**
- Consumes: `pulls` from Task 1; `asText` from `@/services/anomaly/anomalyRows`.
- Produces:
  - `type OrdinaryEntry = { date: string; gems: string; tix: string; names: string[]; notes: string }`
  - `toRow(e: OrdinaryEntry): Cell[] | null`, covering columns A-G.
  - `ORDINARY_TAB: TabSpec` with tab `'Ordinary'` and the headers from Global Constraints. Its comment matches `EVENT_TAB`'s: times is tix + gems / 300, and totalSsr is the count of ssrDetails.

- [ ] **Step 1:** Write the tests:
  - `{ date: '2026-11-21', gems: '600', tix: '3', names: ['Rumani', 'Alice'], notes: ' lucky ' }` gives `['2026-11-21', 600, 3, 5, 2, "'Rumani, Alice", "'lucky"]`. Check `asText`'s output in `anomalyRows.ts` and match it.
  - `names: []` gives `0` and the blank text cell in columns E and F.
  - A missing date, `gems: '150'`, or both currencies blank give null.
  - `gems: ' 300 ', tix: ''` gives `times` 1.
- [ ] **Step 2:** Run `yarn test src/services/ordinary`. Expected: FAIL.
- [ ] **Step 3:** Implement the type, `toRow` and `ORDINARY_TAB`.
- [ ] **Step 4:** Run `yarn test src/services/ordinary`. Expected: PASS.

### Task 3: Ordinary store

**Files:**
- Create: `src/stores/ordinaryStore.ts`, `src/stores/ordinaryStore.test.ts`

**Interfaces:**
- Consumes: `ORDINARY_TAB`, `toRow`, `OrdinaryEntry` (Task 2); `readNikkes`, `ssrPool`, `writeTabsAtEnd`, `sheetsApi`, `gameDay`.
- Produces: `useOrdinaryStore` (Pinia id `'ordinary'`). It has the same state shape, `status` values, `load`, `add`, `removeAt` and `save` as `eventStore`, minus `setRateUpType` and the rate-up fields. Getters: `row`, `canSave`, and `pool = ssrPool(state.nikkes, { pilgrim: true, abnormal: false })`.

- [ ] **Step 1:** Write the tests. Copy the `fakeApi` and `dbRow` setup from `eventStore.test.ts`, with `'Ordinary'!A1:G1` and `'Ordinary'!A:A`.
  - `offers Pilgrim but never Abnormal`: a DB with one each of `ELYSION`, `PILGRIM` and `ABNORMAL` gives a pool of the first two names.
  - `cannot save before NikkeDatabase loads or with an invalid entry`.
  - `writes one row with an audit row, then resets`. Assert the batchUpdate data holds the Ordinary row, an `AuditLog` row with form `'Ordinary'`, and an entry reset afterwards.
  - `clears the entry even when the reload after save fails`. Make the DB read throw on the second call. After `save()`, `entry.names` is `[]` and `status` is `'error'`.
- [ ] **Step 2:** Run `yarn test src/stores/ordinaryStore`. Expected: FAIL.
- [ ] **Step 3:** Implement `ordinaryStore.ts` from `eventStore.ts`, with the rate-up parts dropped.
- [ ] **Step 4:** Run `yarn test src/stores`. Expected: PASS.

### Task 4: Page, route, nav, mock

**Files:**
- Create: `src/pages/Ordinary.vue`
- Modify: `src/router/index.ts` (add `/ordinary` after `/event`), `src/App.vue` (add `{ to: '/ordinary', label: 'Ordinary' }` after Event), `src/services/mock/fixtures.ts` (add `tab(ORDINARY_TAB, …)` after the Event tab)

**Interfaces:**
- Consumes: `useOrdinaryStore` (Task 3), `pullsHint` (Task 1), `NikkePicker`.

- [ ] **Step 1:** Build `Ordinary.vue` from `Event.vue`. Drop the Banner type select and the Rate-up section. Drop `:pinned` on the SSR picker. Use the heading `Ordinary` and input ids `ordinary-gems`, `ordinary-tix` and `ordinary-pulls-hint`.
- [ ] **Step 2:** Mock rows: `['2026-11-05', 0, 60, 60, 2, "'Alice, Maxwell", '']` and `['2026-11-12', 0, 40, 40, 0, '', "'shafted"]`.
- [ ] **Step 3:** Run `yarn format && yarn lint && yarn check && yarn build && yarn test`. Expected: all pass.
- [ ] **Step 4:** Run `yarn dev:mock` and open `#/ordinary`. Check that:
  - no Abnormal Nikke appears in the picker
  - the pull hint updates as gems and tix change
  - Save appends a row below the fixture rows and the form resets
  - the Event page still saves
- [ ] **Step 5:** Tell the owner the manual step: the real gacha sheet's `Ordinary` headers must match Global Constraints before release.
