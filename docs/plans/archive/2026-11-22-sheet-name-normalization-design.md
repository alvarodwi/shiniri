# Sheet name normalization

## Intent

A dashboard is coming that will join tabs across both spreadsheets (Journal and Gacha). Today the
same idea has several names (`ssr` / `target` / `name` / `nikke` for a Nikke, `times` / `amount`
for pull counts, `note` / `notes` / `comments`), and some tab names are unclear (`T9Manu`,
`SpareBody`, `Other`), past tense (`Overcored`), or plural (`Molds`). This change renames tab
names, headers, and the tab-name-as-value `source` strings so each idea has one name everywhere.

The owner renames everything in the sheets by hand. The code changes so both writers (`ui/`,
`cli/`) match the new names.

## Goals

- One name per idea across every live tab, following the rules below.
- `ui/` and `cli/` write and read under the new names, with tests green.
- One cutover: the sheet renames and the code release happen together.

## Non-goals

- Frozen archive tabs: `Anomaly24`, `Anomaly25`, `T9Manu23`, `T9Manu24`, `Interception24`,
  `SIInterception23`, `Molds23`, `MoldGachaCsv`, `BannerGachaCsv`. Untouched.
- Output and reference tabs: `Stats`, `FilteredStats`, `BoxCalc`, `Metadata`, `DupeTracker`. Their
  headers stay. `T9ManuUsage` gets a new tab name only.
- Cell values, except the `source` values listed under "Source values". Values like
  `Gold Mileage`, `Welfare Unit`, `cli-clears`, and mold types stay.
- Internal code names: TypeScript entry fields, store, page, component, and service file names
  (`moldsStore`, `SpareBody.vue`, `services/spareBody/`, `OtherEntry.times`) stay.
- Old spec and plan docs under `docs/superpowers/` stay as written.
- Old `AuditLog` rows that name old tabs in `ranges`. The log is append-only history.
- Consumers outside `ui/` and `cli/`. The owner confirmed none exist (no Apps Script, Looker
  Studio, or other reader of these tabs).

## Anti-goals

- Never edit, reorder, insert, or delete logged rows or columns. These are renames only, and every
  column keeps its position.
- Never let the code accept both old and new headers. The header check stays exact.
- Never rename a column without checking every formula that reads it. All formulas in both prod
  copies were scanned (2026-11-22): references use column letters or named ranges
  (`Overcored!D:D`, `RosterLog!C2:C`), with no `INDIRECT`, no `QUERY`, and no lookup by header
  text. The only string literals that hold tab names or headers are in `AllPulls` and
  `AcquisitionLog` (see "Formula edits"). `Stats` and `FilteredStats` hold no source strings, so
  their numbers don't change. `BoxCalc` uses `MATCH`, but only on its own named tables.

## Naming rules

- Tabs are PascalCase singular nouns. Headers are lowerCamelCase with no spaces (the existing
  contract).
- `date` means the in-game day the row happened. Real timestamps keep the `…At` ending
  (`savedAt`, `takenAt`). Attribute dates keep a specific name (`releaseDate`).
- `nikke` means one Nikke's name. `nameCode` stays the exact join key.
- `pulls` is the number of attempts, `totalSsr` is how many SSRs came out, and `ssrDetails` lists
  their names.
- `source` is where something came from, and `sourceDetail` refines it. `notes` is free text.
- Spell `boss`, `class`, `manufacturer`, and `slot` out in full, with no prefix or suffix.
- `weakness` (the element a boss is weak to) and `bossElement` (the boss's own element) mean
  different things. Both stay.

## Tab renames

| Spreadsheet | Old | New | Code touches it |
|---|---|---|---|
| Journal | `T9Manu` | `Gear` | yes |
| Journal | `LevelLogs` | `LevelLog` | yes |
| Journal | `Union` | `UnionRaid` | yes (CLI) |
| Journal | `Roster` | `UnionRoster` | yes (CLI) |
| Journal | `T9ManuEquipped` | `GearEquipped` | no |
| Journal | `T9ManuUsage` | `GearUsage` | no |
| Journal | `CampaignLog` | `CampaignChapters` | no |
| Gacha | `Molds` | `Mold` | yes |
| Gacha | `SpareBody` | `Exchange` | yes |
| Gacha | `Other` | `Extra` | yes |
| Gacha | `Overcored` | `Overcore` | yes |

Unchanged: `Anomaly`, `Furnace`, `Special`, `SoloRaid`, `Profile`, `Campaign`, `Tower`, `AuditLog`,
`Social`, `Event`, `Ordinary`, `NikkeDatabase`, `AllPulls`, `AcquisitionLog`, `DupeTracker`,
`RosterLog`, `Spending`, `CostumeGallery`.

When a tab is renamed, Sheets updates direct formula references (`Molds!E2:E`) by itself.

## Header renames

Full new header row for each changed tab the code touches, in column order.

| Tab (new name) | New headers | Changed from |
|---|---|---|
| `Anomaly` | `date, boss, stage, dropped, modules, class, manufacturer, dropType` (+ the blank 9th) | `bossName`, `gearClass`, `gearManu` |
| `Gear` | `date, source, class, manufacturer, slot` | `sourceType`, `classType`, `slotType` |
| `Furnace` | `date, target, sacrifice1, sacrifice2, result` | `Date`, `Target`, `Sacrifice 1`, `Sacrifice 2`, `Result` |
| `LevelLog` | `synchroLevel, date, daysElapsed, notes` | `newSynchroLevel`, `achievedAt`, `note` |
| `SoloRaid` | `season, month, boss, weakness, damage, rank, notes` | `totalDmg`, `comments` |
| `Campaign` | `stageId, mode, chapter, stageName, date, recommendedCp, teamCp, synchroLevel, slot1…slot5` | `dateCleared` |
| `Tower` | `stageId, mode, floor, stageName, date, recommendedCp, teamCp, synchroLevel, slot1…slot5` | `dateCleared` |
| `Social` | `date, pulls, totalSsr, ssrDetails, notes` | `times` |
| `Event` | `date, rateUpName, rateUpType, gems, tickets, pulls, totalSsr, ssrDetails, notes` | `tix`, `times` |
| `Ordinary` | `date, gems, tickets, pulls, totalSsr, ssrDetails, notes` | `tix`, `times` |
| `Mold` | `date, moldType, pulls, totalSsr, ssrDetails, notes` | `amount`, `ssr`, `result` |
| `Exchange` | `date, nikke, source, notes` | `target` |
| `Extra` | `date, source, sourceDetail, rateUpName, gems, pulls, totalSsr, ssrDetails, notes` | `sourceType`, `sourceInfo`, `times` |
| `NikkeDatabase` | `nameCode, nikke, rarity, manufacturer, class, burst, element, weapon, resourceId, releaseDate` | `name` |
| `RosterLog` | `date, nameCode, nikke, copies` | `name` |
| `Overcore` | `date, source, nikke, manufacturer, notes` | `from`, `ssr` |
| `Spending` | `date, packageName, type, priceIdr, priceUsd, platform, notes` | `purchaseDate` |
| `AllPulls` | `date, nikke, source, spook, copy, isOvercore` | `ssr` |

Unchanged headers: `Profile`, `UnionRaid`, `UnionRoster`, `AuditLog`.

Tabs only the owner edits:

| Tab | New headers |
|---|---|
| `Special` | `bossName` → `boss` (the tab is frozen; the owner agreed to this one rename) |
| `GearEquipped` | `nikke, manufacturer, class, helmet, torso, gloves, boots` (from `Nikke Name, Manu, Class, Head, Torso, Gloves, Boots`; `helmet` matches the code's `Helmet` slot) |
| `CampaignChapters` | `normalChapter, normalCleared, hardChapter, hardCleared, releaseDate, date, walledDays` (the note in column H stays) |
| `CostumeGallery` | `releasedOn` → `releaseDate` |
| `AcquisitionLog` | `release` → `releaseDate` |

## Source values

`AllPulls` tags every pull with the tab it came from, using fixed text in its formula. The UI writes
the same words into `Overcore.source`, and `AllPulls` matches the two to find overcores. They follow
the new tab names:

| Old value | New value |
|---|---|
| `Molds` | `Mold` |
| `SpareBody` | `Exchange` |
| `Other` | `Extra` |

`Social`, `Event`, and `Ordinary` are unchanged. Existing `Overcore` rows keep their old values. The
`SWITCH` in `AllPulls` already maps legacy names (`"Social Pulls"`, `"Event Banner"`,
`"Other Banner"`), and gains the three old names so old rows still match. No logged row is edited.

## Formula edits (owner, by hand)

Headers for `AllPulls` and `AcquisitionLog` come from literals inside their formulas, so those
renames are text edits in the formula (in cell A1 of each tab):

- `AllPulls`:
  - In `ex(...)`: `ex("Molds", …)` → `ex("Mold", …)`, `ex("SpareBody", …)` → `ex("Exchange", …)`,
    `ex("Other", …)` → `ex("Extra", …)`.
  - In the `of` `SWITCH`: `"Other Banner", "Other"` → `"Other Banner", "Extra"`, and add
    `"Molds", "Mold", "SpareBody", "Exchange", "Other", "Extra"` before the default `TRIM(x)`.
  - Header literal: `"ssr"` → `"nikke"`.
- `AcquisitionLog`: header literal `"release"` → `"releaseDate"`.

Tab references inside both formulas update by themselves when the tabs are renamed.

## Code changes

### ui/

- `src/config/sheets.ts`: new tab names and headers as above. Rename the constants that name
  renamed tabs: `T9MANU_TAB` → `GEAR_TAB`, `MOLDS_TAB` → `MOLD_TAB`, `SPARE_BODY_TAB` →
  `EXCHANGE_TAB`, `OTHER_TAB` → `EXTRA_TAB`, `OVERCORED_TAB` → `OVERCORE_TAB`. `LEVEL_TAB` keeps its
  name.
- `src/services/overcore/overcore.ts`: `OvercoreSource` becomes
  `'Social' | 'Event' | 'Ordinary' | 'Mold' | 'Exchange' | 'Extra'`, with `painLevel` cases to match.
  The stores pass these values.
- The `form` values the stores write to `AuditLog` follow the page labels: `'Molds'` → `'Mold'`,
  `'SpareBody'` → `'Exchange'`, `'Other'` → `'Extra'` (`moldsStore.ts`, `spareBodyStore.ts`,
  `otherStore.ts`). Old audit rows keep the old names. CLI `FORM` values (`cli-union` and others)
  don't name renamed tabs and stay.
- User-facing labels follow the tab names: the nav in `App.vue` (`Mold`, `Exchange`, `Extra`), page
  headings in `pages/Molds.vue`, `pages/SpareBody.vue`, `pages/Other.vue`, and routes `/mold`,
  `/exchange`, `/extra` in `router/index.ts`. The old routes are not kept (personal app, one user).
- Comments that name old tabs or headers (for example `config/limits.ts`, `gearRows.ts`,
  `overcore.ts`) are updated.
- `src/services/mock/fixtures.ts` and every test fixture that spells out tabs, ranges, or headers
  (for example `stores/overcoreTestData.ts`, which keys on `"'Overcored'!A1:E1"`).
- `ui/CLAUDE.md`: the overcore review scenarios (routes `#/sparebody`, `#/molds`; tab names
  `AllPulls` stays).
- `.env.local` (not committed) points at the new test copies: Journal
  `1XiU-PoljepdZ7whZDZ3e94lXmlla5dO-O60FfbgXv44`, Gacha `1qgmp0_OsWBOMuRy-ddt8qi7Sbbcx2WwAjSl1jEJ-Ylg`.

### cli/

- `union_sheet.py`: `TABS` becomes `{"union": "UnionRaid", "roster": "UnionRoster"}`.
- `clear_sheet.py`: `_TAIL` has `dateCleared` → `date`.
- `nikke_sheet.py`: `HEADERS` has `name` → `nikke`.
- `roster_sheet.py`: `HEADERS` has `name` → `nikke`.
- `tools/names.py`: `COLUMNS` keys on the new tab names and header text: `Social: (ssrDetails)`,
  `Event: (rateUpName, ssrDetails)`, `Ordinary: (ssrDetails)`, `Mold: (ssrDetails)`,
  `Exchange: (nikke)`, `Extra: (rateUpName, ssrDetails)`. It reads `NikkeDatabase` by header too, so
  check its use of `name`.
- Tests under `cli/tests/` that spell out tab names or headers (`test_sheets.py`,
  `test_union_sheet.py`, `test_names.py`, `test_nikke_sheet.py`, `test_roster_sheet.py`,
  `test_profile.py`, `test_clear_sheet.py` if present).
- `cli/config/sheets.json` already points at the new copies.

### Root

- `CLAUDE.md`: the header example `totalDmg` becomes `damage`.

## Approaches

1. **Everything at once (chosen).** One branch covers every rename in `ui/` and `cli/`. The owner
   renames the copies and tests there, then renames prod on release day, and the release follows
   right away. There is one cutover and the names are never mixed. During the cutover (about
   15–30 minutes of renaming), saves and `watch` hit the header check and write nothing. Nothing is
   lost.
2. **In batches (Gacha, then Journal, then CLI tabs).** Each batch is smaller, but there are three
   cutovers and three releases, with mixed names in between.
3. **The code accepts old and new headers for a while.** Dropped: it adds alias logic to both
   writers only to delete it later, and loosens the exact header check the contract relies on.

## Rollout

1. Build and pass checks: `yarn format && yarn lint && yarn check && yarn build && yarn test` in
   `ui/`, and the CLI test suite.
2. The owner applies every rename and formula edit above to the two test copies.
3. Verify against the copies: save one row from each UI form (including one save that triggers an
   overcore row), run each CLI writer once (`watch` or the one-shot commands), run `tools/names.py`,
   and confirm rows land under the right headers and `AllPulls` / `AcquisitionLog` still compute.
4. Release day: the owner applies the same edits to prod. Then the web release follows
   `ui/CLAUDE.md`, and the homeserver pulls `develop`. Until both sides match, writes fail the
   header check and write nothing.

This is a sheet contract change: the real sheet needs the manual edits before release.

## Left to the builder

- Plan order and test layout.
- Exact wording of updated comments.
- The release version bump per `ui/CLAUDE.md`.
