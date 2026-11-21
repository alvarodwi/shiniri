# Gacha sheet wiring (ui) — design

Step 4 of `2026-11-21-gacha-tracker-design.md`. Part touched: `ui/` only. Decided with the owner on
2026-11-21.

## Context

The gacha pages (step 5, Social first) save to the separate Nikke Gacha Tracker spreadsheet and
fill their name pickers from its `NikkeDatabase` tab. The ui knows only the progression journal
today. This step teaches it the second spreadsheet and gives every gacha page one tested way to
read `NikkeDatabase`, so step 5 specs stay about their own tab.

## What exists

- `writeTabsAtEnd` (`ui/src/services/sheets/tabWriter.ts`) already picks the `AuditLog` whose
  `spreadsheetId` matches the target tab. No change needed.
- `useLogStore` (`ui/src/stores/logStore.ts`) reads every `SPREADSHEETS` entry; a new entry gets a
  Log page section for free, failing alone if the sheet can't be read.
- `MOCK_TABS` (`ui/src/services/mock/fixtures.ts`) adds an `AuditLog` per spreadsheet.
- cli writes `NikkeDatabase` with headers `nameCode, name, rarity, manufacturer, class, burst,
  element, weapon, resourceId, releaseDate` and the gacha `AuditLog` with the shared
  `savedAt, form, ranges, rows`.
- Icons: `ui/public/img/nikke/si/c{resourceId zero-padded to 3}.webp` (207 files, from
  `cli/tools/assets.py`).

## Goals

1. Env var `VITE_GACHA_SHEET_ID` in `ui/src/vite-env.d.ts`, `ui/.env.example`, `ui/.env.mock`
   (`mock-gacha`), and the owner's `ui/.env.local` (test copy id; owner sets it).
2. `SPREADSHEETS` gets a second entry `{ name: 'Gacha', audit: { spreadsheetId:
   VITE_GACHA_SHEET_ID, tab: 'AuditLog', headers: AUDIT_HEADERS } }`. The Log page shows a Gacha
   section.
3. `NIKKE_DATABASE_TAB: TabSpec` in `ui/src/config/sheets.ts`, tab `'NikkeDatabase'`, headers
   verbatim: `['nameCode', 'name', 'rarity', 'manufacturer', 'class', 'burst', 'element',
   'weapon', 'resourceId', 'releaseDate']`. Read-only from the ui (no form writes it).
4. `ui/src/services/nikke/`: pure `toNikkes(rows)` turning the tab's rows into
   `Nikke = { nameCode, name, rarity, manufacturer, class, burst, element, weapon, resourceId,
   releaseDate }` (all strings as the sheet gives them; rows with blank `nameCode` or `name`
   skipped), `readNikkes(api)` that reads `A1:J`, throws `HeaderMismatchError` if row 1 differs
   from the headers, and returns `toNikkes` of the rest; and `nikkeIcon(resourceId)` returning
   `/img/nikke/si/c{padded}.webp`, or `null` for a blank / non-numeric id. Vitest tests next to it.
5. Mock: `NikkeDatabase` fixture with a handful of rows (one collab full name, one blank
   `releaseDate`, one `resourceId` with no icon), and the gacha `AuditLog` under the mock id. The mock sheet is keyed by spreadsheet id so the two
   `AuditLog` tabs stay apart.

## Non-goals

- No picker component, no store, no page, no route. The Social page spec (5-1) builds the shared
  Nikke picker against its real columns; later gacha pages reuse it and widen it only if needed.
  Decided with the owner: step 4 has no page to check a picker on, and its shape depends on the
  tab columns.
- No caching of `NikkeDatabase` beyond what a page holds in memory (sheet contract: no local copy).
- No writes to `NikkeDatabase` from the ui; no cli change.

## Approaches

- **Wiring + reader (picked by owner).** Config, env, Log section, a tested reader and icon
  helper. Every gacha page shares it; the picker waits for its first user.
- Wiring only: smallest, but every step-5 spec would re-decide how `NikkeDatabase` is read.
- Wiring + reader + picker: builds UI before any page uses it.

## Left to the builder

- Whether `readNikkes` uses `readRows` or a direct `getValues('A1:J')`; whether the header check
  shares code with `startRow` in `tabWriter.ts` (export a small `checkHeaders` if reuse is clean).
- Icon fallback rendering is a step 5 concern; this step only returns `null` when there's no id.
  A numeric id with no file still returns a path (the page handles the `<img>` error).

## Manual steps (owner)

- Add `VITE_GACHA_SHEET_ID` (prod gacha sheet id) in Netlify before release.
- Set it in `ui/.env.local` to the test copy id before trying it in dev.
- The browser account must have edit access to both gacha sheets (it owns them already).

## Verification

- `yarn format && yarn lint && yarn check && yarn build && yarn test` from `ui/`.
- `yarn dev:mock`, open `#/log`: a Gacha section lists the mock audit rows.
- Owner, against the test copy: Log page shows the gacha `AuditLog` rows the cli wrote; Progression
  section unchanged.
