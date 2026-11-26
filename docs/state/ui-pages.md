# UI forms: pages, stores and row logic

## Purpose

Each log form in the web app: a page, a Pinia store, and pure row logic that turns the entry into
sheet cells. Routing and the Pulls/Log pages are in `ui-navigation.md`; the writer is in
`sheet-writer.md`. All paths are under `ui/src/`.

## Public surface

One form is `pages/<Name>.vue` + `stores/<name>Store.ts` + `services/<name>/<name>Rows.ts`, with a
test next to each store and rows file. Tabs and headers are in `config/sheets.ts` (`TabSpec`).

| Form | Tab(s) written | Group |
| --- | --- | --- |
| Anomaly (`anomalyStore`) | `Anomaly`, plus `Gear` for gear drops | Journal |
| Gear (`gearStore`) | `Gear`, plus `Furnace` | Journal |
| Level (`levelStore`) | `LevelLog` | Journal |
| Solo Raid (`soloRaidStore`) | `SoloRaid` | Journal |
| Event, Ordinary, Molds, Social, Other, Spare Body | `Event`, `Ordinary`, `Mold`, `Social`, `Extra`, `Exchange`, each plus `Overcore` | Gacha (Pulls page) |
| Spending (`spendingStore`) | `Spending` | Gacha |
| Costumes (`costumeStore`) | none, read-only | Gacha |

Shared pieces:

- Nikke names: `services/nikke/nikkeDatabase.ts` (`readNikkes`, `searchNikkes`, `nikkeIcon`) and
  `nikkePool.ts` (`ssrPool`), picked with `components/nikke/NikkePicker.vue`. Reads the CLI-written
  `NikkeDatabase` tab and caches nothing. `Nikke.limited` is true only for a `TRUE` cell.
- Overcore: `checkOvercores` in `services/overcore/overcore.ts`, used by the six pull stores.
- Limits: `config/limits.ts` (`ANOMALY_RUNS`, `GEAR_MAX_ITEMS`, `LEVEL_STEP`, `LEVEL_MAX_JUMP`,
  `MAX_COPIES`). Overcore lines: `config/overcoreLines.ts`.
- Dates: `gameDay` (`utils/gameDay.ts`), `wibTimestamp`, `isEntryDirty` (`utils/dirty.ts`).
- Cell text: `asText` and `cellToIsoDate` in `services/anomaly/anomalyRows.ts`, reused by other forms.

## Invariants and rules

- Every store has the same shape: `status` (`idle|loading|saving|saved|error`), `error`,
  `lastSaved`, `canSave`, `load(api)`, `save(api)`. `api` defaults to the shared `sheetsApi`, so
  tests pass a fake. Tested in each `*Store.test.ts`.
- `save` returns early unless `canSave`. A save is one `writeTabsAtEnd` call, so a form's data tab
  and its `Overcore` or `Gear` rows land together or not at all.
- The form is cleared before the post-save reload, so a failed reload cannot leave the entry to be
  saved twice. The status goes `saved` only if the reload works.
- `load` runs on every visit to a page. It returns early when a save is running, and it must not wipe
  a typed entry.
- Duplicate guards re-read the sheet at save time, because another device may have logged:
  - Anomaly: any row for the game date locks the day (`loggedRows`, `locked`). Rows are always the
    full daily limit (5, or 10 on a double day).
  - Solo Raid: refuses a season already in column A (`isLogged`).
  - Level: `levelSteps` re-derives from the last level, so a stale page cannot log a lower one.
    Rejects a date before the last logged date.
  - Pull forms, Spending and Gear have no duplicate guard: several entries per day are normal.
- Level writes one row per `LEVEL_STEP` (5) level, never more than `LEVEL_MAX_JUMP` (20) per save.
  Column C carries a per-row formula (`daysElapsed` in `levelRows.ts`), so these rows hold a formula
  the app writes.
- Free text from the user goes through `asText` (leading `'`) so the sheet never parses it as a
  formula or date (`anomalyRows.test.ts`).
- Anomaly gear rows exist only when the run can drop gear (`needsGear`): not Kraken, and dropped (stage
  9 always drops). `toRow` blanks gear otherwise.
- Overcore: from copy 12 (past C7) each copy gets an `Overcore` row. The start copy comes from the sheet's
  `AllPulls` (`copy`) and `RosterLog` tabs, both read-only here. An error cell in `AllPulls`
  (`copy`) throws and aborts the save, so no row is skipped silently. `overcore.test.ts`.
- Pools: Pilgrim and Abnormal are allowed per source (`ssrPool`): Event allows Abnormal only for a
  collaboration banner, Social allows neither.
- Spending: a purchase belongs to its WIB calendar day, not the game day. Prices are validated as
  whole rupiah and dollars with up to two decimals (`validIdr`, `validUsd`); separators are rejected so
  `79.000` never lands as 79. The store checks the `Spending` headers when it reads history.
- Solo Raid damage is typed with locale separators; `parseDamage` accepts only whole groups of
  three, and `rankText` keeps two decimals at most, comma or dot.
- Pull stores expose `isDirty` and `discard()` (see `ui-navigation.md`).
- Pools by source: Event allows Pilgrim, and Abnormal only for the collaboration banner; Ordinary
  allows Pilgrim, not Abnormal; Social allows neither; Spare Body Gold Mileage allows both, Silver
  Mileage and Other allow Pilgrim only; a Union Chip gives only `LIBERATION_UNITS` (`Sin`, `Quency`,
  `Guilty`, `Nihilister`), by exact name (`types/spareBody.ts`). Changing the type or source prunes
  picks outside the new pool (`setRateUpType`, `setMoldType`).
- `pulls()` (`services/gacha/pulls.ts`, shared by Event, Ordinary and Other): a blank currency is 0, gems
  must be a multiple of 300, and under 1 pull is `null`. Molds: `toRow` is `null` when names exceed the
  amount, and a Perfect mold needs names equal to the amount (`moldRows.ts`).
- Spare Body writes one row per copy (1 to `MAX_COPIES`) and only the last row carries the note, as does
  Other. Other: Free Pulls is one row with `rateUpName` required and `sourceDetail` blank; Guaranteed SSR
  needs `sourceDetail`, and its `pulls` is typed, never derived from gems.
- Gear: `GEAR_MAX_ITEMS` per save; lowering the count discards the dropped cards, so raising it again does
  not restore them. A Furnace result's manufacturer is forced to the target, and the card is complete
  only if they match, so `Furnace` has no `resultManufacturer` column. No once-a-day lock on Gear.
- Level: `lastLevel` throws when the last cell of column A is not a number, so the page refuses to
  load. A function cell in column A is refused by the writer. The note goes on the last step row only.
- Overcore: `findOvercores` returns nothing when RosterLog has no baseline, or the date is on or before
  it. One remark is built from the worst level and names all the overcores in a save. A Pilgrim adds
  `PILGRIM_LINE` and does not raise the level. Header errors from the reads name the tab.
- Anomaly: turning Double day off drops the edits made to runs 6 to 10. The sheet link and the
  "fix in the sheet" line are hidden below `sm` on purpose.
- Costumes: reads `A1:Z` and finds the owner's `releaseDate` column by header text, right of column G.
  `costumeImage` accepts only `character/mi/<name>.webp`. Cards render 24 at a time.
- The mock sheet is keyed by spreadsheet id (`MOCK_SHEETS`), and a test checks the `SPREADSHEETS` ids
  are distinct. `vite.config.ts` pins test env ids so tests never read `.env.local`.
- `NikkePicker`: the same name can be picked again, Enter picks the last hit, results are capped at 8
  with prefix matches first, and `pinned` is ignored in `single` mode.

## Owns

Nothing persistent. Entry state is in-memory Pinia state. The sheet is the only copy of logged data
(`../../CLAUDE.md`).

## Gotchas

- The Journal tabs and Gacha tabs are in two spreadsheets (`VITE_JOURNAL_SHEET_ID`,
  `VITE_GACHA_SHEET_ID`). Overcore, Event, Ordinary, Mold, Social, Extra, Exchange and Spending are in
  the gacha one; Anomaly, Gear, Level and Solo Raid are in the journal one. A tab in `TabSpec` with
  a wrong id fails the header check.
- `Anomaly` has a headerless column I (the note); its header list ends with `''`.
- `NikkeDatabase` and `CostumeDatabase` are written by the CLI; the UI only reads them. The owner's
  lookup columns (`releaseDate`, `priceUsd`) sit right of the checked headers.
- Overcore pain levels are fixed by source (`painLevel`): Social/Extra 1, Ordinary 2, Event 3,
  molds 2 to 5, Exchange 6 or 7.
- `overcore.ts` has a `shortcut:` note: a backdated save uses "last copy + n", which may differ from
  where the sheet formula would place it.
- New forms follow the steps in `../../ui/CLAUDE.md` ("Adding a form"); `services/google` and
  `services/sheets` should not change.

## Known gaps

- `GearGrid.vue` is still in `components/anomaly/` though the Gear page uses it; moving it to
  `components/gear/` was planned and not done.
- Anomaly always logs the full daily limit; logging a partial day (1 to the limit runs) was in the first
  spec and was dropped. (unconfirmed whether still wanted)
- The Spending types `Mission Pass, Costume` and `Event Pass, Costume` must be split by hand on the
  sheet; whether that was done on the real sheet is unconfirmed (a test fixture still has one).
