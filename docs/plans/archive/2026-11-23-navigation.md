# Navigation and Log Paging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 14-link header with three groups (Journal, Gacha, Log) plus a sub-row, host the six pull forms behind one guarded selector, and give Log per-sheet tabs with infinite scroll.

**Architecture:** Flat routes under group prefixes. A pure `NAV` config drives the header and the active group is derived from the URL. A `Pulls` page renders one of the six existing form pages chosen by a `<select>`. `logStore` keeps a per-sheet cursor and reads older audit chunks on demand.

**Tech Stack:** Vue 3 SFCs, Pinia, vue-router 5 (hash history), Vitest, Tailwind. Everything is in `ui/`.

**Spec:** `docs/superpowers/specs/2026-11-23-navigation-design.md`

## Global Constraints

- `ui/` only. No sheet write, header or tab-name change. Reads go through `SheetsApi`.
- Do not git commit. The owner commits themselves. Leave changes in the working tree.
- Run Prettier from `ui/` (`npx prettier --write` on touched files). Run `npm run lint`, `npx vue-tsc -b` and `npm test` before calling a task done.
- Keep `min-h-11` touch targets and the existing Tailwind tokens (`ink`, `ink-soft`, `rule`, `rule-ink`, `paper`, `focus`, `press`).
- Hash history stays.
- Do not edit the `Special` sheet tab. Only the page, route and link go.
- `localStorage` access is wrapped in try/catch and the page works without it.
- Set-in-spec values: groups `Journal` (Anomaly, Gear, Level, Solo Raid), `Gacha` (Pulls, Spending, Costumes), `Log`; pull forms Social, Event, Ordinary, Mold, Exchange, Extra; first-visit form Event.

## Review Focus

- Select change cancelled while a form is dirty: the select must snap back to the current form (Task 2).
- Remembered form is missing, stale or storage throws: fall back to Event (Task 1).
- An untouched form must not count as dirty after the game day rolls over, since `date` defaults to `gameDay()` at store creation (Task 1).
- Empty audit tab, or a tab with one chunk or less: no "more", no read below row 2 (Task 4).
- Scroll fires twice before the first chunk returns, or an older chunk fails: no duplicate rows, loaded entries stay, only the error shows (Task 4).

---

## File Structure

- Create `ui/src/utils/dirty.ts`: `isEntryDirty`.
- Create `ui/src/services/gacha/pullForms.ts`: form keys, labels, remembered choice, switch guard.
- Create `ui/src/pages/Pulls.vue`: selector plus the active form page.
- Create `ui/src/router/nav.ts`: `NAV`, `groupOf`.
- Create `ui/src/router/redirects.ts`: `REDIRECTS` (pure data).
- Modify the six pull stores: add an `isDirty` getter.
- Modify `ui/src/router/index.ts`, `ui/src/App.vue`.
- Delete `ui/src/pages/Special.vue`.
- Modify `ui/src/stores/logStore.ts`, `ui/src/pages/Log.vue`, `ui/src/config/sheets.ts`.

### Task 1: Dirty detection and the Pulls service

**Files:**
- Create: `ui/src/utils/dirty.ts`, `ui/src/utils/dirty.test.ts`
- Create: `ui/src/services/gacha/pullForms.ts`, `ui/src/services/gacha/pullForms.test.ts`
- Modify: `socialStore.ts`, `eventStore.ts`, `ordinaryStore.ts`, `moldsStore.ts`, `spareBodyStore.ts`, `otherStore.ts` in `ui/src/stores/`
- Test: one added case per store test file (`*Store.test.ts`)

**Interfaces:**
- Produces: `isEntryDirty(entry: object, fresh: object): boolean`. Produces on each of the six stores a getter `isDirty: boolean`. Produces in `pullForms.ts`:
  - `type PullFormKey = 'social' | 'event' | 'ordinary' | 'mold' | 'exchange' | 'extra'`
  - `PULL_FORMS: readonly { key: PullFormKey; label: string }[]` in the spec order
  - `readLastForm(storage?: Pick<Storage, 'getItem'>): PullFormKey`
  - `rememberForm(key: PullFormKey, storage?: Pick<Storage, 'setItem'>): void`
  - `allowSwitch(dirty: boolean, confirmFn: (msg: string) => boolean): boolean`

- [ ] **Step 1: Write failing tests**

`dirty.test.ts`: `isEntryDirty` is false for equal entries, false when only `date` differs, true when a string, number or array field differs.

`pullForms.test.ts`: `readLastForm` returns `'event'` when the item is null, when it is an unknown string, and when `getItem` throws; returns the stored key when valid. `rememberForm` swallows a throwing `setItem`. `allowSwitch(false, fn)` is true and never calls `fn`; `allowSwitch(true, fn)` returns whatever `fn` returns.

Each store test file: a fresh store has `isDirty === false`; after changing one non-date field of `entry` it is `true`; after `store.entry` is replaced by a fresh entry (what a successful save does) it is `false` again.

- [ ] **Step 2: Run to verify failure**

Run: `cd ui && npx vitest run src/utils/dirty.test.ts src/services/gacha/pullForms.test.ts src/stores`
Expected: FAIL (missing modules and getters).

- [ ] **Step 3: Implement**

`isEntryDirty`: compare `JSON.stringify` of both entries with `date` blanked on each side, so a rolled game day alone never prompts. Each store gets `isDirty: (state) => isEntryDirty(state.entry, newEntry())`. `pullForms.ts` uses key `shiniri.pullForm`, default `'event'`, and `allowSwitch` calls `confirmFn('Discard the unsaved entry?')` only when dirty. `storage` params default to `localStorage`.

- [ ] **Step 4: Run to verify pass**

Run: `cd ui && npx vitest run src/utils src/services/gacha src/stores`
Expected: PASS.

### Task 2: Pulls page

**Files:**
- Create: `ui/src/pages/Pulls.vue`

**Interfaces:**
- Consumes: `PULL_FORMS`, `readLastForm`, `rememberForm`, `allowSwitch`, the six stores' `isDirty`, and the six form pages (`Social.vue`, `Event.vue`, `Ordinary.vue`, `Molds.vue`, `SpareBody.vue`, `Other.vue`).
- Produces: default-exported page used by the `/gacha/pulls` route.

- [ ] **Step 1: Implement `Pulls.vue`**

A labelled `<select>` (inside a `max-w-xl` row matching the form pages) lists `PULL_FORMS`. A map from `PullFormKey` to page component and one from key to that store's `isDirty` live in this file (components do not belong in the service). On `change`: if `allowSwitch(dirtyOfCurrent, window.confirm)` is true, set the current key and call `rememberForm`; otherwise set `select.value` back to the current key. Render the current form with `<component :is>`.

- [ ] **Step 2: Verify in mock mode**

Run the app in mock mode (see `ui/CLAUDE.md`). Check at `/gacha/pulls` once Task 3 is in; until then temporarily mount nothing. Expected after Task 3: type in Social, pick Event, confirm dialog appears; Cancel keeps Social with the select back on Social; OK switches. Saving a form, then switching, shows no dialog.

### Task 3: Routes, header, Special removal

**Files:**
- Create: `ui/src/router/nav.ts`, `ui/src/router/nav.test.ts`, `ui/src/router/redirects.ts`, `ui/src/router/redirects.test.ts`
- Modify: `ui/src/router/index.ts`, `ui/src/App.vue`
- Delete: `ui/src/pages/Special.vue`

**Interfaces:**
- Produces: `NAV: { key: 'journal' | 'gacha' | 'log'; label: string; to: string; links: { to: string; label: string }[] }[]`; `groupOf(path: string): NAV[number] | null`; `REDIRECTS: Record<string, string>`.

- [ ] **Step 1: Write failing tests**

`nav.test.ts`: `groupOf('/journal/gear')` is the Journal group, `groupOf('/gacha/costumes')` is Gacha, `groupOf('/log')` is Log with no links, `groupOf('/nowhere')` is `null`.

`redirects.test.ts`: build `createRouter({ history: createMemoryHistory(), routes })` where `routes` are the `REDIRECTS` entries plus stub components for the targets. Assert `/` resolves to `/journal/anomaly`, each old flat path to its new path, `/event` and the other five form paths to `/gacha/pulls`, and `/special` to `/journal/anomaly`.

- [ ] **Step 2: Run to verify failure**

Run: `cd ui && npx vitest run src/router`
Expected: FAIL.

- [ ] **Step 3: Implement**

- `router/index.ts`: real routes `/journal/anomaly`, `/journal/gear`, `/journal/level`, `/journal/solo-raid`, `/gacha/pulls`, `/gacha/spending`, `/gacha/costumes`, `/log`, plus `REDIRECTS` spread in as `{ path, redirect }`. Remove the Special import and route.
- `App.vue`: top `<nav aria-label="Main">` renders `NAV` groups (active when `groupOf(route.path)?.key` matches); under it a second `<nav aria-label="Section">` as a `basis-full` row renders the active group's `links` and is absent when it has none. Keep Sign out and the signed-out state as they are.
- Delete `Special.vue`.
- [ ] **Step 4: Sweep old paths**

Run: `cd ui && grep -rnE "'/(anomaly|event|ordinary|mold|exchange|extra|spending|gear|level|social|solo-raid|special|costumes)'|\"/(anomaly|event|ordinary|mold|exchange|extra|spending|gear|level|social|solo-raid|special|costumes)\"" src`
Expected: only `redirects.ts` and its test. Fix any other hit to the new path.

- [ ] **Step 5: Verify**

Run: `cd ui && npm run lint && npx vue-tsc -b && npm test`
Expected: all pass. In the running app (mock mode): header shows three groups, the sub-row fits at 375px width, `/#/event` lands on Pulls, `/#/special` lands on Anomaly.

### Task 4: logStore paging and tab names

**Files:**
- Modify: `ui/src/stores/logStore.ts`, `ui/src/stores/logStore.test.ts`, `ui/src/config/sheets.ts`, `ui/src/services/mock/mockFlow.test.ts` (and `fixtures.ts` only if its `Progression` key is the display name)

**Interfaces:**
- Consumes: `readColumnA`, `readRows`, `nextEmptyRow` from `services/sheets/tabWriter`.
- Produces (replaces `load`):
  - `LogSection = { name: string; entries: AuditEntry[]; error: string | null; loaded: boolean; oldest: number; busy: boolean }`
  - `hasMore(section: LogSection): boolean` (true when `loaded` and `oldest > 2`)
  - actions `open(name: string, api?: SheetsApi, spreadsheets?: Spreadsheet[]): Promise<void>` (reads the newest chunk once; no-op if already loaded or busy), `more(name, api?, spreadsheets?): Promise<void>` (reads the next older chunk; no-op if busy or no more), `reset(): void` (clears every section so the next `open` rereads).
  - `sections` holds one entry per `SPREADSHEETS` item from creation, in order.

- [ ] **Step 1: Rename the display name**

In `config/sheets.ts` change `name: 'Progression'` to `name: 'Journal'` (this is the owner's word for the sheet and the tab label). Fix every reference: `grep -rn "Progression" ui/src` and update the log tests and `mockFlow.test.ts`. Leave `fixtures.ts` alone if `Progression` there is a sheet key, not this display name; say which in the hand-over.

- [ ] **Step 2: Write failing tests** in `logStore.test.ts`, replacing the `load` tests

- `open` reads only the named sheet (the other sheet's id never appears in `getValues` calls) and returns the newest 20 first.
- `more` reads rows `[oldest-20, oldest-1]` and appends them after the existing entries; with 45 entries three calls give 20, 20, 5 and `hasMore` is false after the third.
- Chunk lower bound is row 2: no `getValues` range starts below row 2.
- Empty audit tab (header only): `loaded` is true, no entries, `hasMore` false.
- Two `more` calls fired together read one chunk (second is a no-op while `busy`).
- `more` that throws sets `error`, keeps the loaded entries, and a later `more` can retry.
- `open` on a failing sheet sets only that section's `error`.
- `reset` clears entries and `loaded` for both sections.

- [ ] **Step 3: Run to verify failure**

Run: `cd ui && npx vitest run src/stores/logStore.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement**

Keep `RECENT = 20` as the chunk size and the hand-cleared-row filter. `recentEntries` becomes a chunk reader: given the sheet and an upper row, read `[max(2, upper - 19), upper]`, map, filter, reverse. `open` finds `last` via `readColumnA` once and stores `oldest` as the first row read. `oldest` is the cursor: `more` reads up to `oldest - 1`. Do not read past the header at row 1.

- [ ] **Step 5: Run to verify pass**

Run: `cd ui && npx vitest run src/stores src/services/mock && npx vue-tsc -b`
Expected: PASS. `Log.vue` still calls `load`; vue-tsc fails until Task 5, so run Task 5 straight after.

### Task 5: Log page tabs and infinite scroll

**Files:**
- Modify: `ui/src/pages/Log.vue`

**Interfaces:**
- Consumes: `useLogStore` (`sections`, `hasMore`, `open`, `more`, `reset`).

- [ ] **Step 1: Implement**

- A tab bar (`role="tablist"`, one `role="tab"` button per section, `min-h-11`) switches the shown section. The first tab is active on mount and calls `store.open(name)`; switching to a tab calls `open` too (it no-ops when loaded).
- The entry list markup stays as it is today for the active section only.
- After the list, when `hasMore(active)`, render a sentinel element observed by an `IntersectionObserver`. When it is visible and the section is not `busy`, call `store.more(active.name)`. Disconnect the observer on unmount. Show a small "Reading…" line while `busy`.
- Refresh calls `store.reset()` then `store.open(active.name)`.
- Keep the aria-live loading text and the per-section error alert.

- [ ] **Step 2: Verify**

Run: `cd ui && npx prettier --write src && npm run lint && npx vue-tsc -b && npm test`
Expected: all pass.

In mock mode: Log shows tabs Journal and Gacha; opening Gacha does not read the Journal audit tab; scrolling the Journal tab loads older chunks until the first entry, then stops; Refresh returns to the newest chunk.

## Self-Review Notes

- Spec coverage: header and sub-row, redirects, Pulls selector with remembered form and unsaved guard, Special removal, Log tabs and chunked scroll are each in a task. The spec's "Journal | Gacha" labels required renaming `Progression` in `SPREADSHEETS` (Task 4, Step 1), which the spec did not say.
- Not covered by automated tests: the sub-row layout, the confirm dialog and the observer. These are checked by hand in mock mode, since the repo has no component-test tooling.
- Known gap: an old bookmark like `/#/event` lands on Pulls with the remembered form, not Event.
