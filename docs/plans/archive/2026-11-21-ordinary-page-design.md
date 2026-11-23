# Ordinary page (ui) — design

Step 5 of `2026-11-21-gacha-tracker-design.md`: the page for the `Ordinary` gacha tab. Approved by
the owner on 2026-11-21.

## Why

The owner logs each ordinary-banner session by hand. The page takes that over, the same way Social
and Event did, so names always come from the picker and match `NikkeDatabase`.

## What it is

Event without the rate-up parts: date, gems and tix with the same pull count and checks, a
multi-pick SSR picker, notes, Save. One row per session; never deduped by date.

- Headers, verbatim from the test copy: `date, gems, tix, times, totalSsr, ssrDetails, notes`.
- Pool: SSR only, Pilgrim allowed, no Abnormal:
  `ssrPool(nikkes, { pilgrim: true, abnormal: false })`.
- Row: `times = tix + gems / 300`, `totalSsr` = number of names, `ssrDetails` = names joined with
  `, `. Saveable when the date is set, gems and tix are whole numbers (blank counts as 0), gems is
  a multiple of 300, and `times >= 1`. Zero SSRs is a valid row.

## Non-goals

- No rate-up name or banner type (they exist only on `Event`).
- No CLI change: `cli/tools/names.py` already sweeps `Ordinary.ssrDetails`, and the sheet contract
  is unchanged.
- No generic gacha store shared by every tab.

## Approaches

1. **Share the currency helpers (picked).** `amount` and `pullsHint` move out of
   `services/event/eventRows.ts` into `services/gacha/pulls.ts` and take `{ gems, tix }`. Event and
   Ordinary both import them. One copy of the 300-gems rule.
2. Copy the helpers into an Ordinary module. Two copies to keep in sync; rejected.
3. One config-driven store and page for every gacha tab. More than two pages need; rejected.

## Pieces

- `ORDINARY_TAB` in `config/sheets.ts` (gacha spreadsheet).
- `types/ordinary.ts`: `OrdinaryEntry` (`date, gems, tix, names, notes`, kept as typed).
- `services/gacha/pulls.ts`: `amount`, `pullsHint`, plus a `pulls` helper returning the pull count
  or null, used by both `toRow`s.
- `services/ordinary/ordinaryRows.ts`: `toRow` for columns A-G.
- `stores/ordinaryStore.ts`: shaped like `eventStore` minus rate-up (load, add, removeAt, save via
  `writeTabsAtEnd` with form name `Ordinary`).
- `pages/Ordinary.vue`, a route, a nav entry, and the tab in `services/mock/fixtures.ts`.
- Tests: `pulls.test.ts`, `ordinaryRows.test.ts`, `ordinaryStore.test.ts`; Event tests follow the
  moved helpers.

## Manual sheet step

The real gacha sheet's `Ordinary` headers must read exactly as above before release. Only the test
copy was checked.
