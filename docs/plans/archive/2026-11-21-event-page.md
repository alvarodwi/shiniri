# Event page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Event page that logs one event gacha session (rate-up, banner type, gems, tix, SSRs) to the `Event` tab of the gacha sheet.

**Architecture:** Mirror the Social page (type, rows service, Pinia store, page, route, `TabSpec`, mock fixture). The SSR pool filter moves out of `socialStore` into one shared helper. `NikkePicker` gains an optional `pinned` chip and a `single` mode.

**Tech Stack:** Vue 3, Pinia, Vite, UnoCSS, Vitest. Run everything from `ui/`.

**Spec:** `docs/superpowers/specs/2026-11-21-event-page-design.md`

## Global Constraints

- Tab `Event`, headers in this order, verbatim: `date`, `rateUpName`, `rateUpType`, `gems`, `tix`, `times`, `totalSsr`, `ssrDetails`.
- `rateUpType` values, verbatim: `Pilgrim Limited`, `Collaboration Limited`, `Regular`, `Winter Limited`, `Summer Limited`. Required, no default.
- `times` = `tix + gems / 300`, written as a number, never a formula. `totalSsr` = number of picked names.
- Pool: `rarity` `SSR`; `PILGRIM` allowed; `ABNORMAL` only when `rateUpType` is `Collaboration Limited`. Compare `manufacturer` case-insensitively.
- Append-only through `writeTabsAtEnd`; no change to `services/google` or `services/sheets`. No spook column, no notes field.
- Names only from the picker, never free text. Phone-first, every input labelled.
- Do not `git commit`; the owner commits when asked. Checks: `yarn format && yarn lint && yarn check && yarn build && yarn test`.

## Review Focus

- `gems` 100, `tix` 0 (times 0.33): not saveable; the page must not write a sub-1 pull count.
- `rateUpType` switched away from `Collaboration Limited` with an Abnormal Nikke picked as an SSR or as `rateUpName`: both are dropped.
- `rateUpName` left empty: no chip, cell written as an empty string, row still saves.
- `rateUpType` not chosen yet: row is null, pool has no Abnormal.
- `gems` 450 and `tix` 0: `times` is `1.5`, not rounded.

## File Structure

- Create `ui/src/services/nikke/nikkePool.ts` (+ test): `ssrPool`, the shared filter.
- Modify `ui/src/stores/socialStore.ts`: `ssrNikkes` calls `ssrPool`.
- Modify `ui/src/config/sheets.ts`: `EVENT_TAB`.
- Create `ui/src/types/event.ts`: `EventEntry`, `RATE_UP_TYPES`, `COLLAB_TYPE`.
- Create `ui/src/services/event/eventRows.ts` (+ test): `toRow`.
- Modify `ui/src/components/nikke/NikkePicker.vue`: `pinned`, `single`.
- Create `ui/src/stores/eventStore.ts` (+ test).
- Create `ui/src/pages/Event.vue`; modify `ui/src/router/index.ts`, `ui/src/App.vue`, `ui/src/services/mock/fixtures.ts`.

### Task 1: Shared SSR pool helper

**Files:**
- Create: `ui/src/services/nikke/nikkePool.ts`, `ui/src/services/nikke/nikkePool.test.ts`
- Modify: `ui/src/stores/socialStore.ts:26-32`

**Interfaces:**
- Produces: `ssrPool(nikkes: Nikke[], allow: { pilgrim: boolean; abnormal: boolean }): Nikke[]`

- [ ] **Step 1: Write the failing test** in `nikkePool.test.ts`, with a small `Nikke` list (SSR TETRA, SSR PILGRIM, SSR ABNORMAL in mixed case, SR TETRA):
  - `{ pilgrim: false, abnormal: false }` returns only the SSR TETRA.
  - `{ pilgrim: true, abnormal: false }` adds the Pilgrim, not the Abnormal.
  - `{ pilgrim: true, abnormal: true }` returns all three SSRs; the SR never appears.
  - Manufacturer comparison is case-insensitive (`'Pilgrim'`, `'ABNORMAL'`).
- [ ] **Step 2: Run** `yarn vitest run src/services/nikke/nikkePool.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `ssrPool` in `nikkePool.ts`, moving the filter out of `socialStore.ssrNikkes`.
- [ ] **Step 4: Change `socialStore.ssrNikkes`** to `ssrPool(state.nikkes, { pilgrim: false, abnormal: false })`, keeping its comment about Social pulls.
- [ ] **Step 5: Run** `yarn vitest run src/services/nikke src/stores/socialStore.test.ts`. Expected: PASS, Social tests unchanged.

### Task 2: Event type, tab spec and row logic

**Files:**
- Modify: `ui/src/config/sheets.ts` (after `SOCIAL_TAB`)
- Create: `ui/src/types/event.ts`, `ui/src/services/event/eventRows.ts`, `ui/src/services/event/eventRows.test.ts`

**Interfaces:**
- Produces: `EVENT_TAB: TabSpec` (gacha `spreadsheetId`, tab `'Event'`, the 8 headers above).
- Produces: `RATE_UP_TYPES` (readonly tuple of the 5 values), `COLLAB_TYPE = 'Collaboration Limited'`, `type EventEntry = { date: string; rateUpName: string; rateUpType: string; gems: string; tix: string; names: string[] }`.
- Produces: `toRow(e: EventEntry): Cell[] | null`. Row: `[date, asText(rateUpName), rateUpType, gems, tix, times, names.length, asText(names.join(', '))]`, with `gems`, `tix` as numbers.

- [ ] **Step 1: Write the failing tests** in `eventRows.test.ts` (entry helper like Social's):
  - `gems '900'`, `tix '2'`, names `['Biscuit','Biscuit']`, `rateUpName 'Biscuit'`, type `'Regular'` gives `['2026-11-21', "'Biscuit", 'Regular', 900, 2, 5, 2, "'Biscuit, Biscuit"]`.
  - `gems '450'`, `tix '0'` gives `times` `1.5`; `gems '0'`, `tix '3'` gives `times` `3`.
  - `gems '100'`, `tix '0'` is `null` (times below 1); `'0'`/`'0'` is `null`.
  - `null` for each of: empty `date`, empty `rateUpType`, a `rateUpType` outside the list, `gems`/`tix` of `''`, `'-1'`, `'1.5'`, `'abc'`.
  - Empty `rateUpName` and no names give `''` in both cells and `totalSsr` 0; surrounding spaces in `gems`/`tix` are trimmed.
- [ ] **Step 2: Run** `yarn vitest run src/services/event`. Expected: FAIL.
- [ ] **Step 3: Add `EVENT_TAB`** next to `SOCIAL_TAB`, with a one-line comment that `times` is `tix + gems/300`. Add `types/event.ts`. Implement `toRow` in `eventRows.ts`, reusing `asText` from `@/services/anomaly/anomalyRows` as Social does.
- [ ] **Step 4: Run** `yarn vitest run src/services/event`. Expected: PASS.

### Task 3: NikkePicker `pinned` and `single`

**Files:**
- Modify: `ui/src/components/nikke/NikkePicker.vue`

**Interfaces:**
- Produces: props `pinned?: string` (a name) and `single?: boolean`. `modelValue` stays `string[]` (length at most 1 when `single`). Social passes neither and must behave exactly as before.

- [ ] **Step 1: Add `pinned`.** When set and not `single`, render a button above the search box, labelled with the name (at least `min-h-11`), that calls the same `pick(name)` path. It can be tapped repeatedly. When `pinned` is empty or undefined, nothing renders.
- [ ] **Step 2: Add `single`.** In `pick`, emit `[name]` instead of appending; the picked-chips list and its remove button stay. Keep the Enter-picks-the-last-result behaviour.
- [ ] **Step 3: Verify.** `yarn check && yarn lint`. Then `yarn dev:mock`, open `#/social`, and confirm Social looks and works as before (no chip, multi pick). The new modes are verified in Task 5.

### Task 4: Event store

**Files:**
- Create: `ui/src/stores/eventStore.ts`, `ui/src/stores/eventStore.test.ts`

**Interfaces:**
- Consumes: `ssrPool`, `toRow` (Event), `EVENT_TAB`, `COLLAB_TYPE`, `writeTabsAtEnd`, `readNikkes`, `sheetsApi`, `gameDay` as `socialStore` uses them.
- Produces: `useEventStore` with state `entry: EventEntry`, `nikkes`, `status`, `error`, `lastSaved` (same shape as Social). Getters `row`, `pool: Nikke[]`, `canSave`. Actions `load(api?)`, `add(name)`, `removeAt(i)`, `setRateUpType(t: string)`, `save(api?)`. `save` passes the audit label `'Event'`. `newEntry()` starts with `rateUpType: ''`, `rateUpName: ''`, `gems: ''`, `tix: ''`.

- [ ] **Step 1: Write the failing tests** in `eventStore.test.ts`, reusing the fake-api pattern from `socialStore.test.ts` (headers range `'Event'!A1:H1`, `'Event'!A:A`, a database with SSR TETRA, SSR PILGRIM and SSR ABNORMAL Nikkes):
  - `pool` with `rateUpType 'Regular'` contains the Pilgrim and not the Abnormal; with `'Collaboration Limited'` contains both; with `''` has no Abnormal.
  - `setRateUpType('Regular')` after the Abnormal was picked as a name and as `rateUpName` removes both, and leaves the other names alone.
  - `canSave` is false while `row` is null or before `load`; true for a valid entry after `load`.
  - `save` calls `batchUpdateValues` once with the Event row plus an `AuditLog` row, then resets the entry.
- [ ] **Step 2: Run** `yarn vitest run src/stores/eventStore.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the store**, copying `socialStore`'s `load`/`save`/`canSave` flow unchanged. `setRateUpType` assigns the type, then, when it is not `COLLAB_TYPE`, filters `entry.names` and clears `entry.rateUpName` if their Nikke has `manufacturer` `abnormal` (case-insensitive). Pruning is by manufacturer, not by pool membership, so an unloaded database never wipes names.
- [ ] **Step 4: Run** `yarn vitest run src/stores/eventStore.test.ts`. Expected: PASS.

### Task 5: Event page, route, nav and mock fixture

**Files:**
- Create: `ui/src/pages/Event.vue`
- Modify: `ui/src/router/index.ts` (`{ path: '/event', component: Event }`), `ui/src/App.vue` (`{ to: '/event', label: 'Event' }` between Anomaly and Gear, alphabetical like the others; the router entry goes in the same place), `ui/src/services/mock/fixtures.ts` (`tab(EVENT_TAB, [...])` with two made-up rows, next to the Social tab).

**Interfaces:**
- Consumes: `useEventStore`, `NikkePicker`, `RATE_UP_TYPES`.

- [ ] **Step 1: Build `Event.vue`** like `Social.vue`: `onMounted(() => store.load())`, same loading, error, saved and fixed Save-button blocks. Fields: Date; `rateUpType` as a labelled `<select>` (first option empty and disabled-looking, then the 5 values) that calls `store.setRateUpType`; `rateUpName` as a single-mode `NikkePicker` over `store.pool` bound to `[store.entry.rateUpName]` (empty array when blank); Gems and Tix as labelled numeric text inputs; a live hint showing pulls (`times` from `store.row?.[5]`, else `0 pulls`) and the SSR count. The SSR `NikkePicker` takes `store.pool`, `store.entry.names`, and `:pinned="store.entry.rateUpName"`. No notes input.
- [ ] **Step 2: Wire route, nav link and mock fixture** as listed.
- [ ] **Step 3: Run the full checks**: `yarn format && yarn lint && yarn check && yarn build && yarn test`. Expected: all pass.
- [ ] **Step 4: Verify by hand in mock mode** (`yarn dev:mock`, `#/event`): pick a type and the rate-up Nikke, see the chip appear above the SSR search and add the Nikke twice; the hint shows `1.5 pulls` for 450 gems and 0 tix; with type Collaboration Limited, search finds an Abnormal Nikke, and switching the type to Regular removes it; Save lands the row in the fake sheet.

## Owner's pre-merge check

Log a few sessions against the sheet copy: rows land directly below existing data, `times` matches the sheet formula, the `AuditLog` row appears. No manual sheet step is needed.
