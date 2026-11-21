# Social page and Nikke picker (ui) — design

Step 5-1 of `2026-11-21-gacha-tracker-design.md`. Part touched: `ui/` only. Decided with the owner on
2026-11-21.

## Context

The owner logs Social recruit sessions by hand in the `Social` tab of the Nikke Gacha Tracker
spreadsheet. This page replaces that. It is also the first gacha page, so it builds the Nikke
picker that the Event, Ordinary, Molds, SpareBody and Other pages reuse.

## What exists

- `NIKKE_DATABASE_TAB`, `readNikkes`, `nikkeIcon` (`ui/src/services/nikke/`) and the Gacha entry in
  `SPREADSHEETS` (step 4).
- `writeTabsAtEnd` already picks the gacha `AuditLog` by spreadsheet id. No writer change.
- Solo Raid is the pattern to follow: store in `src/stores/`, page in `src/pages/`, pure row logic
  in `src/services/<form>/`, mock fixture in `src/services/mock/fixtures.ts`.
- Live `Social` rows: `date` is `YYYY-MM-DD`; `ssrDetails` is names joined with `, ` (repeats are
  real: `Biscuit, Biscuit, Frima`; collab names carry a colon: `Soline: Frost Ticket`);
  `totalSsr` is always the count of those names; `notes` is optional.

## Goals

1. `SOCIAL_TAB: TabSpec` in `ui/src/config/sheets.ts`, tab `'Social'`, headers verbatim:
   `['date', 'times', 'totalSsr', 'ssrDetails', 'notes']`.
2. Page `/social` with: date (default today in WIB, same helper the other pages use), `times`
   (whole number, at least 1), the Nikke picker, `notes` (optional), Save.
3. Nikke picker component, `src/components/nikke/NikkePicker.vue`. Takes the `Nikke[]` list and
   a selected name list (v-model). A search box filters by `name` (case-insensitive substring).
   Each result shows icon (`nikkeIcon`, with a fallback when `null` or the image fails), name and
   rarity. Tapping a result appends that name; the same name can be added again. Selected names
   show as chips in order; the chip's `×` removes that one. Names come only from the list, never
   free text.
4. Pure row logic in `src/services/social/`: builds the row
   `[date, times, names.length, names.join(', '), notes]`. `totalSsr` is counted, never typed.
   Rows with `times` below 1 or a blank date are refused. Vitest tests next to it.
5. Store in `src/stores/socialStore.ts`: loads `NikkeDatabase` on page open (failure shows an error,
   Save stays disabled), holds the entry, saves through `writeTabsAtEnd(api, targets, 'Social')`,
   resets the form after a good save. Vitest tests like the other stores.
6. Route, nav entry, mock fixture (`Social` tab with the new headers, in `MOCK_SHEETS` under the
   mock gacha id).

## Non-goals

- No dedupe by date: several sessions per day are normal.
- No history list on the page (belongs to the future dashboard).
- No validation that `totalSsr` matches an old row; no edit of existing rows.
- No picker filters beyond name (rarity, class, etc. wait for a page that needs them).
- No cli change.

## Approaches

- **A. Native `<datalist>`.** Smallest, but no icons, and adding up to six names means retyping into
  one box. Weak for a shared component.
- **B. Search box plus chips (picked by owner).** Type to filter, tap to append, chips show the
  list. Reusable by the other five pages.
- **C. Full icon grid with a filter.** About 200 icons is heavy on a phone, and a log form does not
  need browsing.

## Left to the builder

- Exact date format written to column A: match what the other pages write to their date columns,
  and check against the live `date` values (`YYYY-MM-DD` text).
- Whether the `times` input is a number or text input; result cap and keyboard behaviour of the
  search list; chip and fallback-icon styling, within the phone-first rules in `ui/CLAUDE.md`.
- Whether `readNikkes` results are held in the store or a small shared composable, so the other
  gacha pages do not each re-decide it. Nothing is cached beyond memory.

## Manual steps (owner)

- Rename the `Social` headers to `date`, `times`, `totalSsr`, `ssrDetails`, `notes` on the test
  copy now, and on the real sheet **before release**. The page refuses to save until they match.
- `VITE_GACHA_SHEET_ID` in `ui/.env.local` must point at the test copy (see step 4).

## Verification

- `yarn format && yarn lint && yarn check && yarn build && yarn test` from `ui/`.
- `yarn dev:mock`, open `#/social`: search, add a name twice, remove a chip, save, confirm the
  row lands in the fake `Social` tab with `totalSsr` equal to the chip count.
- Owner, against the test copy: save a 0-SSR session and a multi-SSR session; rows land directly
  below existing data and the gacha `AuditLog` gets one row per save; nothing else changes.
