# Social page and Nikke picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/social` page that logs one Social recruit session per save to the gacha sheet's `Social` tab, with a reusable Nikke picker.

**Architecture:** Same layering as Solo Raid: `TabSpec` in config, pure row logic in `services/social/`, a Pinia store that reads `NikkeDatabase` via `readNikkes` and saves through `writeTabsAtEnd`, a page, and a shared `NikkePicker` component in `components/nikke/`.

**Tech Stack:** Vue 3, Pinia, UnoCSS, Vitest. All in `ui/`.

**Spec:** `docs/superpowers/specs/2026-11-21-social-page-design.md`

## Context

Step 5-1 of the gacha roadmap (`docs/superpowers/specs/2026-11-21-gacha-tracker-design.md`). The owner logs Social sessions by hand; this page takes over, and its picker is the foundation for the other five gacha pages. Step 4 already wired `VITE_GACHA_SHEET_ID`, the Gacha `AuditLog`, `NIKKE_DATABASE_TAB`, `readNikkes`, `nikkeIcon`.

On approval, first copy this plan to `docs/superpowers/plans/2026-11-21-social-page.md` (plan mode only allowed writing here).

## Global Constraints

- Headers verbatim: `['date', 'times', 'totalSsr', 'ssrDetails', 'notes']`, tab `'Social'`, spreadsheet `import.meta.env.VITE_GACHA_SHEET_ID`.
- Form name passed to `writeTabsAtEnd`: `'Social'`.
- Row: `[date, times, names.length, asText(names.join(', ')), asText(notes.trim())]`. `totalSsr` always counted, never typed.
- Date defaults to `gameDay()` (`ui/src/utils/gameDay.ts`), same as Solo Raid; written as `YYYY-MM-DD`, matching live rows.
- No dedupe by date. No edits to existing rows. No local cache of rows or `NikkeDatabase`.
- `services/google` and `services/sheets` unchanged.
- Don't commit unless the owner asks (owner's global rule overrides the skill's commit steps: stage nothing, just report).

## Review Focus

1. `times` typed as `0`, `1.5`, `-3`, `''`, `' 10 '` — only whole numbers ≥ 1 pass (trimmed). Test in Task 1.
2. Notes starting with `=` / `+` (e.g. `+2 copies`) must land as text, not a formula. Covered by `asText`; test in Task 1.
3. Double tap on Save writes once (`canSave` false while `saving`). Test in Task 2.
4. `NikkeDatabase` read fails (no access, header mismatch): error shown, Save disabled, typed entry kept. Test in Task 2.
5. Search matches collab names case-insensitively mid-string (`frost` finds `Soline: Frost Ticket`), trims query, blank query returns no results. Test in Task 3.

---

### Task 1: Social tab spec, row logic, mock fixture

**Files:**
- Modify: `ui/src/config/sheets.ts` (add `SOCIAL_TAB` after `NIKKE_DATABASE_TAB`)
- Create: `ui/src/types/social.ts`
- Create: `ui/src/services/social/socialRows.ts`
- Test: `ui/src/services/social/socialRows.test.ts`
- Modify: `ui/src/services/mock/fixtures.ts` (import `SOCIAL_TAB`, add `tab(SOCIAL_TAB, [...])`)

**Interfaces:**
- Produces: `SOCIAL_TAB: TabSpec`; `type SocialEntry = { date: string; times: string; names: string[]; notes: string }`; `toRow(e: SocialEntry): Cell[] | null`.
- Consumes: `asText` from `@/services/anomaly/anomalyRows`.

- [ ] **Step 1: Write failing tests** in `socialRows.test.ts`:
  - `builds the row with a counted totalSsr`: `toRow({date:'2026-11-21', times:'20', names:['Biscuit','Biscuit','Frima'], notes:' doggo '})` → `['2026-11-21', 20, 3, "'Biscuit, Biscuit, Frima", "'doggo"]`.
  - `zero SSR leaves details blank`: names `[]`, notes `''` → `['2026-11-21', 1, 0, '', '']`.
  - `refuses bad times`: each of `'0'`, `'1.5'`, `'-3'`, `''`, `'abc'` → `null`; `' 10 '` → times `10`.
  - `refuses a blank date` → `null`.
  - `keeps notes as text`: notes `'+2 copies'` → last cell `"'+2 copies"`.
- [ ] **Step 2: Run** `cd ui && yarn test src/services/social` — expect FAIL (module missing).
- [ ] **Step 3: Implement** `SOCIAL_TAB`, `SocialEntry`, and `toRow` (times: `/^\d+$/` on trimmed text, then `> 0`).
- [ ] **Step 4: Add mock fixture** `tab(SOCIAL_TAB, ...)` with 3 past rows shaped like the live sheet, e.g. `['2026-11-04', 10, 1, "'Rumani", '']`, `['2026-11-13', 20, 0, '', '']`, `['2026-11-17', 20, 0, '', "'let's make a habit of 20 pull every tuesday"]`.
- [ ] **Step 5: Run** `yarn test` — expect PASS (including `mockFlow`/`mockSheetsApi` tests).

### Task 2: Social store

**Files:**
- Create: `ui/src/stores/socialStore.ts`
- Test: `ui/src/stores/socialStore.test.ts` (copy the `fakeApi` shape from `soloRaidStore.test.ts`; seed `"'NikkeDatabase'!A1:J"`, `"'Social'!A1:E1"`, `"'Social'!A:A"`, `"'AuditLog'!A1:D1"`, `"'AuditLog'!A:A"`)

**Interfaces:**
- Consumes: `SOCIAL_TAB`, `toRow`, `SocialEntry` (Task 1); `readNikkes`, `Nikke` (`@/services/nikke/nikkeDatabase`); `writeTabsAtEnd`; `sheetsApi` from `@/stores/authStore`; `gameDay`.
- Produces: `useSocialStore` with state `{ entry: SocialEntry, nikkes: Nikke[], status: 'idle'|'loading'|'saving'|'saved'|'error', error: string|null, lastSaved: string|null }`, getters `row`, `canSave`, actions `load(api?) => Promise<boolean>`, `add(name: string)`, `removeAt(i: number)`, `save(api?)`.

- [ ] **Step 1: Write failing tests:**
  - `loads NikkeDatabase`: after `load`, `nikkes.map(n => n.name)` equals the seeded names; returns `true`.
  - `cannot save without nikkes or valid times`: before load `canSave` false; after load with `times:''` false; `times:'10'` true.
  - `add and removeAt`: `add('Biscuit')` twice → `['Biscuit','Biscuit']`; `removeAt(0)` → `['Biscuit']`.
  - `writes one row with an audit row, then resets`: fill, `save`; `batchUpdateValues` called once with data ranges `"'Social'!A2:E2"` and an `AuditLog` row whose `form` is `'Social'`; afterwards `entry.names` is `[]`, `entry.times` `''`, `status` `'saved'`, `lastSaved` `"'Social'!A2:E2"`.
  - `double save writes once`: `await Promise.all([store.save(api), store.save(api)])` → `batchUpdateValues` called once.
  - `load failure keeps the entry and disables save`: `getValues` rejects for NikkeDatabase → `status` `'error'`, `error` set, typed `times` unchanged, `canSave` false.
- [ ] **Step 2: Run** `yarn test src/stores/socialStore` — expect FAIL.
- [ ] **Step 3: Implement** following `soloRaidStore.ts`: `canSave` = `row !== null && nikkes.length > 0 && status not loading/saving`; `load` must not run during `saving` and must not reset `entry`; `save` resets `entry` before reloading (same comment/reason as Solo Raid). No date re-read guard (no dedupe).
- [ ] **Step 4: Run** `yarn test` — expect PASS.

### Task 3: Nikke picker, Social page, route, nav

**Files:**
- Modify: `ui/src/services/nikke/nikkeDatabase.ts` (add `searchNikkes`)
- Modify: `ui/src/services/nikke/nikkeDatabase.test.ts`
- Create: `ui/src/components/nikke/NikkePicker.vue`
- Create: `ui/src/pages/Social.vue`
- Modify: `ui/src/router/index.ts` (`{ path: '/social', component: Social }` before `/log`)
- Modify: `ui/src/App.vue` (`links`: `{ to: '/social', label: 'Social' }` before Log)

**Interfaces:**
- Produces: `searchNikkes(nikkes: Nikke[], query: string, limit = 8): Nikke[]`; `NikkePicker` props `{ nikkes: Nikke[] }`, `v-model` = `string[]` (selected names, order kept, repeats allowed). Later gacha pages reuse it unchanged.
- Consumes: `useSocialStore` (Task 2), `nikkeIcon`.

- [ ] **Step 1: Write failing tests** for `searchNikkes`: `'frost'` finds `Soline: Frost Ticket`; `'  BIS '` finds `Biscuit`; `''` → `[]`; more matches than `limit` → length `limit`; names starting with the query sort before mid-string matches.
- [ ] **Step 2: Run** `yarn test src/services/nikke` — FAIL; implement; run — PASS.
- [ ] **Step 3: Build `NikkePicker.vue`:** labelled search input (`Search Nikke`); result buttons (min-h-11) showing icon `<img>` (32px, `alt=""`, on `null` or `@error` show a neutral square with the name's first letter), name, rarity; tap emits `update:modelValue` with the name appended and clears the query; chips below in order, each with `×` button (`aria-label="Remove {name}"`) emitting the list without that index. Style with the existing tokens used in `SoloRaid.vue` (`rule-ink paper border`, `focus`, the `tap` classes).
- [ ] **Step 4: Build `Social.vue`** on the `SoloRaid.vue` layout: heading `Social`, loading text `Reading the sheet…`, date input, `Times` numeric input (`inputmode="numeric"`), `NikkePicker` bound to `store.entry.names` (via `add`/`removeAt` or v-model), a read-only `SSR: {n}` count, optional `Notes` input, Save button disabled by `!store.canSave`, error with `role="alert"`, saved message with `lastSaved`. `onMounted(() => store.load())`.
- [ ] **Step 5: Wire route and nav link.**
- [ ] **Step 6: Run** `yarn format && yarn lint && yarn check && yarn build && yarn test` — all pass.

### Task 4: Verify in mock mode

- [ ] `yarn dev:mock`, open `http://localhost:5173/#/social`: search `bis`, add Biscuit twice, remove one chip, set Times 10, save. Open `#/log`: Gacha section shows a new `Social` audit row; the Social row has `totalSsr` equal to the chip count. Check a broken-icon Nikke from the fixture shows the fallback.
- [ ] Report to the owner: manual steps still pending (rename `Social` headers on the test copy now, on the real sheet before release; test-copy check of a 0-SSR and a multi-SSR save).

## Verification

- `cd ui && yarn format && yarn lint && yarn check && yarn build && yarn test`.
- Mock walkthrough as in Task 4.
- Owner against the test copy after renaming headers: two saves land directly below the existing data, one `AuditLog` row each, nothing else changed.
