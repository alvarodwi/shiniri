# Molds page (ui) — design

Step 5 of `2026-11-21-gacha-tracker-design.md`: the page for the `Molds` gacha tab. Approved by the
owner on 2026-11-21.

## Why

The owner logs each mold session by hand. The page takes that over, the same way Social, Event and
Ordinary did, so names always come from the picker and match `NikkeDatabase`. A mold is an SSR
shard: each one opened gives one Nikke, an SSR or not, and the pool depends on the mold type.

## What it is

Date, mold type, amount opened, a multi-pick SSR picker, notes, Save. One row per session; never
deduped by date.

- Headers, after the owner's rename: `date, moldType, amount, ssr, result, notes`. Existing rows
  read `Yellow Mold, 5, 2, Maiden, Folkwang`: `amount` is molds opened, `ssr` the SSRs among them,
  `result` their names joined with `, `.
- Mold types, verbatim, in a `<select>` (12 taps are too long on a phone): `Pilgrim Mold`,
  `Yellow Mold`, `Purple Mold`, `Missilis Mold`, `Elysion Mold`, `Tetra Mold`,
  `Pilgrim Perfect Mold`, `Elysion Perfect Mold`, `Missilis Perfect Mold`, `Tetra Perfect Mold`,
  `HQ Mold`, `HQ Perfect Mold`.
- Pool, SSR only (compare `manufacturer` case-insensitively):
  - Manufacturer molds (`Pilgrim`, `Missilis`, `Elysion`, `Tetra`, plain or Perfect): only that
    manufacturer's SSRs.
  - `Yellow`, `Purple`, `HQ`, `HQ Perfect`: `ssrPool(nikkes, { pilgrim: false, abnormal: false })`.
- Perfect molds always give an SSR.
- Row: `ssr` = number of names, `result` = names joined with `, `. Saveable when date and mold type
  are set, `amount` is a whole number >= 1, names <= `amount`, and for a Perfect mold names ===
  `amount`. Zero SSRs is valid for a non-Perfect mold.
- Changing the mold type drops picked names that aren't in the new pool.

## Non-goals

- No pull/currency math (molds aren't gems or tix).
- No generic gacha store shared by every tab.
- No R/SR tracking: only SSR names go in `result`, as on the sheet today.

## Approaches

1. **Ordinary's shape plus a mold pool helper (picked).** `moldPool(nikkes, type)` in
   `services/molds/` reuses `ssrPool` for the mixed molds and filters by manufacturer for the rest.
2. Extend `ssrPool` with a manufacturer option. Its callers don't need it; rejected.
3. One config-driven store and page for every gacha tab. Rejected, as in the Ordinary spec.

## Pieces

- `MOLDS_TAB` in `config/sheets.ts` (gacha spreadsheet).
- `types/molds.ts`: `MOLD_TYPES`, `MoldType`, `MoldsEntry` (`date, moldType, amount, names, notes`).
- `services/molds/moldRows.ts`: `moldPool`, `isPerfect`, `toRow` for columns A-F (null while
  invalid, including the names-vs-amount rules).
- `stores/moldsStore.ts`: shaped like `ordinaryStore` (load, add, removeAt, save via
  `writeTabsAtEnd` with form name `Molds`), plus `setMoldType` that prunes names. Too many names
  is caught by `toRow` and shown as a hint; `NikkePicker` gets no cap.
- `pages/Molds.vue`, a route, a nav entry, and the tab in `services/mock/fixtures.ts`.
- Tests: `moldRows.test.ts`, `moldsStore.test.ts`.
- CLI: `cli/tests/test_names.py` fixture header `moldtype` -> `moldType`. `names.py` keys on
  `result`, so no code change.

## Left to the builder

- Hint wording for too many names and for the Perfect rule.

## Manual sheet step

The owner renames `moldtype` to `moldType` on the test copy and on the real gacha sheet. The real
sheet needs it before release, or the header check refuses the save.
