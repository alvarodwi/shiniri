# UI stats: per-tab fact rules

How each tab's facts read the sheet: which tab, what a row means, and what a fact leaves out. The engine (types, loading, card states, filters) is in `ui-stats.md`. Facts are code in `ui/src/services/stats/`; this records only the sheet rules that are not obvious from it.

The social facts read the gacha spreadsheet. `social-missing` reads `Social` and `NikkeDatabase`; its social pool
is every SSR in `NikkeDatabase` whose `overspec` and `limited` are not `TRUE`.

The event facts read the gacha spreadsheet. Most work on chases, which `eventFacts.ts` builds from
the `Event` rows: one rate-up's sessions, split after a gap of more than 30 days, falling in a Date
range by its first session. A rerun chase (starting over 30 days after the NIKKE's `releaseDate`)
with no gems and no rate-up is left out of every chase fact; the row facts still count its pulls and
spooks. The `rateUpType`s `Pilgrim Limited` and `Summer Pilgrim Limited` are 1% odds,
every other type 2%.

The ordinary facts also read the gacha spreadsheet. A Pilgrim there is any NIKKE whose `overspec` is
`TRUE`, Pilgrim dry runs count whole sessions, and a gem session is any row with gems. The ordinary
pool is every SSR whose `limited` is not `TRUE`, overspec included.

The mold facts read the gacha spreadsheet. A `Mold` row is one mold type in one sitting; a row with
nothing opened is ignored. Odds per `moldType` are a constant in `moldFacts.ts`. The facts about
chance skip Perfect molds without breaking a run. A mixed 50/50 sitting ends both streaks. The
mold pool is the ordinary pool. Mold SSR wait and hoard count the stretch still running.

The exchange facts read the gacha spreadsheet. An `Exchange` row is one copy. The liberation wait
runs between consecutive `Liberation` rows; the mileage saving counts the stretch still running.

The extra facts read the gacha spreadsheet's `Extra` tab. Freebies are `Welfare Unit` and
`Welfare Pass` rows. A free rate-up is a `Free Pulls` row whose `ssrDetails` is its `rateUpName`.
Bonus guests counts one guarantee per `Guaranteed SSR` row.

`pullFacts.ts` holds the facts that span pull sources (gacha spreadsheet). A pull there is a `Social`,
`Event` or `Ordinary` one; the per-source session facts take one of those as `source`. The rest mostly
read `AllPulls`, which a sheet formula builds (`docs/sheet-formulas.md`). The facts about chance leave
out `Exchange` and `Extra`. A rescued chase is a failed one that a mileage exchange or a free pull on
the same banner completed within 30 days of its last session. The two Overcore facts there pair each
`Overcore` row with the latest unpaired non-`Liberation` exchange of that NIKKE on or before it.

`overcoreFacts.ts` holds the other Overcore facts (gacha spreadsheet). Pain level is the app's
`painLevel`. `Overcore` stores neither mold type nor exchange currency, so those come from the `Mold`
or `Exchange` rows with the same day and NIKKE. If any overcore a pain fact looks at has no match, or
matches with different levels, the fact has no answer. Blessed streak includes the current stretch.

The Roster facts in `rosterFacts.ts` (gacha spreadsheet) read `RosterLog` joined to `NikkeDatabase`
on `nameCode`, SSRs only. A NIKKE's state is its latest row; owned means it has one. Roster growth
sums the rises in copies (a first row counts from 0), leaving out the earliest date, the baseline.

The Roster facts in `dupeFacts.ts` (gacha spreadsheet) are about unused dupes. The snapshot ones read
the computed `DupeTracker` tab, count only positive `unused`, and answer `None` (the count `0`) when
nothing is waiting. The history ones join `AllPulls` copies 2 to 11 (blank up to the `RosterLog`
baseline) to the first `RosterLog` date whose `copies` reaches that copy; a date before the pull drops
the dupe. Waits count used dupes only, and `{range}` applies to the date used.

The Roster facts in `acquisitionFacts.ts` read `AcquisitionLog` (gacha spreadsheet), which a sheet
formula builds; nothing is rebuilt from `AllPulls` or `RosterLog`. A slot from `firstCopy` to `c7` is
a date, a newline and a source, or `?` (untracked) or blank; row 2 holds slot numbers, which the slot
parser skips. A NIKKE counts when the slots a fact needs are known, whatever its `confidence`; only
"First recorded core" wants `Perfect`. "Late arrival" counts NIKKE released on or after the earliest
logged copy.

The union facts count own hits by the fixed nickname `VAROA`, except that the days of a mode come
from every member's rows. Their `season` filter is its own (not a Date range), counts "last N" back
from the newest season in the tab the fact is about, and takes years from `UnionSeason.startDate`.
The sheet says `Electronic`; answers say `Electric`.

The spending facts read the gacha spreadsheet's `Spending` tab. A row is one purchase. Rankings and
shares use rupiah. Costume purchases are `Costume`, `Costume Gacha`, `Event Pass` and `Mission Pass`
at full price, and their NIKKE is what precedes the type in `packageName`. A monthly pass covers 30
days and passes stack. Daily cost divides by the days from launch (2022-11-04) through today.

The costume facts read the gacha spreadsheet's `CostumeDatabase` tab. A blank `grade` or `source`
counts only under that filter's `any` option. A choice with no costumes gives no answer. Skipped passes
are unowned `Event Pass` and `Mission Pass` costumes.
The date and price facts (oldest wardrobe gap, wardrobe by year, release drought, upcoming costumes,
list value, value skipped) also read `costumeName`, `releaseDate` and `priceUsd`. `priceUsd` is the
owner's column outside `COSTUME_DATABASE_TAB.headers`, so a missing header fails only the
cards that read it. A blank `releaseDate` is left out of every date fact; a future date counts only
in "upcoming". The year filter lists only years with a released costume. A `priceUsd` cell that is not a number (`Free`, blank) adds 0.

Stage names come raw from the sheet (`46-40 HARD BOSS`, `SUB 2-1 STAGE`, `EX HARD STAGE`): story,
side and boss stages are told apart by that text, and a boss floor is every tenth floor. The
manufacturer towers' open weekdays and 3-clear daily limit are constants in `towerFacts.ts`.
