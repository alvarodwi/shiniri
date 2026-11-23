# SpareBody and Other pages (cli, ui) — design

Step 5 of `2026-11-21-gacha-tracker-design.md`: the pages for the `SpareBody` and `Other` gacha tabs,
plus a restructure of both tabs. Decided with the owner on 2026-11-21. This replaces the roadmap's
"Other mixes freebies and step-up recruits; that stays": Other keeps them, under new columns.

## Why

Both tabs grew by hand and drifted. SpareBody marks its source with five one-hot TRUE/FALSE columns.
Other's `sourceName` values are inconsistent (`Freebie`, `Free Pulls`, `Selector`,
`2026 Selector Box`), and `tix` was never used. The owner restructures both by hand first, then the
pages take over logging, the same way Social, Event, Ordinary and Molds did, so names always come
from the picker and match `NikkeDatabase`.

What each tab is for:

- **SpareBody:** copies the game promised — a spare body bought with mileage or union chips, or a
  copy guaranteed by a mode (liberation, bonus recruit). One row per copy.
- **Other:** every copy outside the banners, Molds and SpareBody: welfare freebies, lucky free
  pulls, and guaranteed-SSR packs (yearly step-up, tutorial pull, selector boxes).

## SpareBody

- Headers after the restructure: `date, target, source, notes`. `target` keeps its name because the
  cli name sweep (`cli/tools/names.py`) already reads it.
- `source` values, verbatim: `Gold Mileage`, `Silver Mileage`, `Liberation`, `Union Chip`,
  `Bonus Recruit`. The form offers only `Gold Mileage`, `Silver Mileage`, `Union Chip`. Liberation
  is finished for the owner's account and bonus recruit is gone from the game; their rows stay as
  history.
- Picker pool (single pick), per source:
  - `Gold Mileage`: any SSR, Pilgrim and Abnormal included (gold mileage covers every rate-up,
    collabs too).
  - `Silver Mileage`: the Ordinary pool, `ssrPool(nikkes, { pilgrim: true, abnormal: false })`. The
    game's silver pool is fixed and narrower; treating it as Ordinary's is the owner's call.
  - `Union Chip`: only `Sin`, `Quency`, `Guilty`, `Nihilister` (the liberation units), matched by
    exact `name` (checked on the test copy's `NikkeDatabase`, 2026-11-21). Exact, never a prefix:
    `Sin: Swift Bunny`, `Guilty: Mighty Bunny` and `Quency: Escape Queen` are separate units.
- Changing the source clears a picked name that isn't in the new pool.
- `copies`: whole number from 1 to `MAX_COPIES` (in `config/limits.ts`, 11: one copy, three
  spare bodies to max limit break (MLB), seven more to core 7 (C7)). It caps one save, not copies
  owned: the form never counts what the owner has, so overcore copies (12th and on, from mileage or
  free pulls) log like any other. A save writes `copies` identical rows; only the last carries
  `notes`, as the owner logged by hand.
- Saveable when date, source and target are set and `copies` is valid.

## Other

- Headers after the restructure:
  `date, sourceType, sourceInfo, rateUpName, gems, times, totalSsr, ssrDetails, notes`.
- `sourceType` values, verbatim, a fixed list; a new kind of source is a one-line addition:
  - `Welfare Unit`: anniversary and half-anniversary free units.
  - `Welfare Pass`: units from a pass such as Road to Villain.
  - `Free Pulls`: a lucky SSR from a banner's free pulls.
  - `Guaranteed SSR`: yearly step-up recruit, tutorial pull, selector boxes.
- `sourceInfo`: free text, required — the label a list can't keep up with (`3.5 Anniv`,
  `Road to Villain`, `Step Up 2026`, `Tutorial`, `2026 Selector`). Blank for `Free Pulls`, where
  `rateUpName` says it.
- `rateUpName`: `Free Pulls` only, required there, picked with the same picker and names as Event's
  `rateUpName`, so a free-pull hit joins to that banner's Event rows. Blank otherwise.
- Picker pool for every type: `ssrPool(nikkes, { pilgrim: true, abnormal: false })`. Abnormal comes
  only from collab banners and gold mileage during a collab, never from Other's sources.
- Rows per type:
  - `Welfare Unit`, `Welfare Pass`: single pick plus `copies` (1 to `MAX_COPIES`). `Free Pulls`:
    single pick, always one row (a free pull is one a day, so each hit is its own save).
    Each copy is one row: `gems` blank, `times` 1, `totalSsr` 1, `ssrDetails` the name. Only the
    last row carries `notes`.
  - `Guaranteed SSR`: one row. Multi pick (at least one name), `totalSsr` = number of names,
    `ssrDetails` = names joined with `, `. `gems` optional, a whole number when filled (tutorial and
    selector leave it blank). `times` typed, a whole number >= 1, and never derived from gems
    (6600 gems gave 31 step-up pulls). No `copies`.
- Changing the type clears fields that type doesn't use (`rateUpName`, `gems`, `times`, extra
  names), so they can't reach the sheet.

## Non-goals

- No Liberation or Bonus Recruit in the SpareBody form.
- No pull/currency math (`pulls()` doesn't fit step-up gems or free sources).
- No `tix`, no `rateUpType` on Other.
- No backfill of rows from before 2023 (Privaty and Diesel from a welfare pass); the owner adds
  those by hand if wanted.
- No generic gacha store shared by every tab (rejected in the Ordinary spec).

## Approaches

The open choice was how the old rows reach the new columns.

1. **The owner converts by hand with sheet formulas (picked).** About 15 minutes, no code; there
   are 60 SpareBody rows and 44 Other rows.
2. A dev-only cli tool prints converted rows to paste in. Safer against typos, but one-shot dead
   code, and the paste is still manual. Rejected.
3. Keep the TRUE/FALSE columns and have the form write them. Skips the restructure the owner wants.
   Rejected.

For the pages, each follows Molds/Ordinary's shape (pure row logic, a store, a page). One spec
covers both because the restructure was decided together.

## Pieces

- `config/sheets.ts`: `SPARE_BODY_TAB`, `OTHER_TAB` (gacha spreadsheet, headers above).
- `config/limits.ts`: `MAX_COPIES = 11`.
- `types/spareBody.ts`, `types/other.ts`: the value lists and entry types.
- `services/spareBody/`: pool per source and `toRows` (copies rows, or null while invalid).
- `services/other/`: `toRows` per type (or null while invalid).
- `stores/spareBodyStore.ts`, `stores/otherStore.ts`: shaped like `moldsStore`, with a setter for
  source/type that prunes, saving via `writeTabsAtEnd` with form names `SpareBody` and `Other`.
- `pages/SpareBody.vue`, `pages/Other.vue`, routes, nav entries, and both tabs in
  `services/mock/fixtures.ts`. Pickers reuse `NikkePicker` (single mode where noted).
- Tests next to the row logic and stores.
- CLI: `cli/tools/names.py` `"Other": ("rateUpName", "ssrDetails")`; update the `SpareBody`/`Other`
  fixtures in `cli/tests/test_names.py` to the new headers.

## Left to the builder

- Form layout and hint wording; source and type as buttons or `<select>` (phone-first).
- How `copies` is entered (stepper or buttons).

## Manual sheet step

On the test copy first, then the real gacha sheet; the real sheet needs it before release or the
header check refuses the save. The owner does it by hand.

Before anything: search the whole spreadsheet (Find, "Also search within formulas") for
`SpareBody!` and `Other!`. Deleting columns turns formulas that point at them into `#REF!`, and
column letters inside strings (`QUERY`, `INDIRECT`) don't shift. Fix any dependents (`Stats`,
`AllPulls`, `DupeTracker`, ...) as part of the step.

SpareBody:

1. Insert a column after `target`, header `source`, and in `C2` put
   `=IFS(D2,"Gold Mileage",E2,"Silver Mileage",F2,"Liberation",G2,"Union Chip",H2,"Bonus Recruit")`
   (the five TRUE/FALSE columns are now D-H). Fill down to the last data row only: a formula left
   below the data makes the next save fail with `TargetNotEmptyError`.
2. Check: no `#N/A` or `#VALUE!` in column C (a row with no TRUE, or TRUE stored as text), and
   every row has exactly one TRUE (`=COUNTIF(D2:H2,TRUE)=1`). Fix the source row by hand first.
3. Copy column C and paste as values only.
4. Delete the five TRUE/FALSE columns. Headers read `date, target, source, notes`.

Other:

1. Rename `sourceName` to `sourceType`. Delete the `tix` column. Insert `rateUpName` after
   `sourceInfo`. Headers read
   `date, sourceType, sourceInfo, rateUpName, gems, times, totalSsr, ssrDetails, notes`.
2. Rewrite each row's `sourceType` / `sourceInfo` / `rateUpName`:
   - `Freebie` + `Wellfare Anniv Unit` -> `Welfare Unit` + the anniversary as `<n> Anniv`
     (`0.5 Anniv`, `1 Anniv`, `1.5 Anniv`, ...), one format for every row.
   - `Freebie` + `Road to Villain` -> `Welfare Pass` + `Road to Villain`.
   - `Free Pulls` + `<name> Banner` -> `Free Pulls`, blank `sourceInfo`, `rateUpName` `<name>`
     (as Event's `rateUpName` has it).
   - `Step Up Recruit` + `Step Up Recruit 2025` -> `Guaranteed SSR` + `Step Up 2025` (2026 too).
   - `Freebie` + `Tutorial Pull` -> `Guaranteed SSR` + `Tutorial`.
   - `Selector` + `2025 Selector Box` and `2026 Selector Box` rows -> `Guaranteed SSR` +
     `2025 Selector` / `2026 Selector`.
   - Any row that matches none of these: ask before changing it.
3. Check: filter `sourceType`; every value is one of the four types, `sourceInfo` is blank only on
   Free Pulls rows, and `rateUpName` is filled only on them.
