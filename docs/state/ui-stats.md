# UI stats

## Purpose

The Stats page shows one fact at a time as a card: a title, a question with its filters filled in,
and one answer. The viewer picks the fact or rolls one at random. Every answer is computed in the
browser from raw rows read with `getValues`. Nothing is written, so the writer contract is
untouched, and the CLI does not read facts. All in `ui/`. Vocabulary is in `GLOSSARY.md`; the why is
in `docs/decisions/0008-stats-computed-in-the-client.md`.

This doc does not list the facts. `FACTS` in `ui/src/services/stats/facts.ts` is the catalog.

## Public surface

- `ui/src/services/stats/facts.ts`: the types (`Fact`, `Filter`, `Columns`, `Values`, `Answer`,
  `Category`), `CATEGORIES` (the picker's order), `FACTS`, and `fillQuestion`, which fills each
  `{filterId}` in a fact's question with the chosen value's question text (`…` while unchosen).
- `ui/src/services/stats/format.ts`: how answers write dates, months, counts, large numbers,
  durations, percents, signed changes and money. `rules.ts`: ties to the earliest row (`firstMax`),
  `topWithCount`, and the game day of a date cell (`cellGameDay`, `groupByGameDay`).
- `ui/src/services/stats/ranges.ts`: the Date range filter (`dateRange`, `customRange`), `RANGE_PRESETS`,
  `ANY_PERIOD` and `inRange`.
- `ui/src/services/stats/loader.ts`: `createLoader()`, the header-and-column reads and the cache.
  `roll.ts`: `rollValues`, the random pick of every filter. Both have tests beside them.
- `ui/src/stores/statsStore.ts`: `useStatsStore`, the card (`show`, `retry`, `setFilter`, `roll`,
  `reset`). `ui/src/stores/pickerStore.ts`: `usePickerStore`, the pick sheet. Each has a test file.
  The picker imports the card store, never the other way round.
- `ui/src/pages/Stats.vue` renders the card. `ui/src/components/stats/PickSheet.vue` is the bottom
  sheet for "Pick a fact". The route is `/stats` (see `ui-navigation.md`).

## How a fact is defined

A `Fact` is a plain object in `FACTS`:

- `id`, `category`, `title`. `category` is one of `CATEGORIES`. The picker chooses a category
  before a fact, shows only categories that have facts, and lists titles.
- `question`: a sentence template with a `{filterId}` slot per filter.
- `filters` (optional): each has `id`, `label` and `options`, either a string array or a function of
  the loaded columns (for options derived from the data). There is no default value. If "any"
  makes sense, the fact lists it as an ordinary option.
- `reads`: a list of `{ tab, columns }`. `tab` is a `TabSpec` (`spreadsheetId` and `tab`, from
  `ui/src/config/sheets.ts`) and `columns` are header names. A fact belongs to one spreadsheet and
  may read several of its tabs. By convention (ADR 0008) a fact never crosses the journal and gacha
  spreadsheets and a tab that has to is migrated instead; each `tab` carries its own
  `spreadsheetId`, so nothing in the code enforces this.
- `compute(cols, values, today)`: `cols[tabName][header]` is the column's cells below the header,
  `values` the chosen filter values, `today` the game day (`YYYY-MM-DD`). It returns an `Answer`:
  a string built with `format.ts`, or `null` for no answer. `"0"` is a real answer.

Cells arrive raw (`UNFORMATTED_VALUE`): blanks are `''`, dates are serial numbers or ISO text,
and the number of rows is the whole tab. Compute filters blanks itself.

## How to add a fact

1. Add an object to `FACTS` in `facts.ts`. Reuse the `TabSpec` constants from `config/sheets.ts`
   in `reads`; use the exact header text from the sheet (ask when unsure).
2. Declare only the columns `compute` uses. Each one costs a read the first time its tab is used.
3. Format the answer with `format.ts`; use `rules.ts` for ties, superlatives and per-day grouping.
4. For a date filter, add `dateRange(cols => <date cells>)` to `filters`, with `{ quick: false }`
   on finished history, and use `inRange(values.range, today)` as the predicate over the date column.
   Do not compute dates by hand.
5. For options derived from data, give `options` as a function of `cols`. These are available once
   the tab has loaded, which the store guarantees before it asks.
6. Add a case to `statsStore.test.ts` only if the fact needs behaviour the store tests do not
   already cover. No other file changes: the picker, the roll and the page read `FACTS`.

A new tab or header is a sheet change the owner makes by hand. Say so when a fact needs one.

## Loading and cache

- Nothing loads at app start. A tab loads when a fact that reads it is shown.
- `load` reads the header row (`'Tab'!1:1`) once per tab, finds each declared column by header
  name, then reads that column (`'Tab'!C:C`). It uses `UNFORMATTED_VALUE`.
- The cache is a `Map` inside the store, keyed on `spreadsheetId!range`, holding the read's
  promise. It lives in memory for the session, so concurrent asks share one read. A failed read is
  evicted so Retry refetches. Nothing is stored in `localStorage` or IndexedDB.
- `setFilter` re-runs `show` against the cache, so changing a filter makes no new read.

## Card states

`card` is one of `idle`, `loading`, `pending`, `ready`, `empty`, `error`.

- `pending`: the tab is loaded but not every filter is chosen. The card shows its filter chips
  (`Label: …` for an unchosen one) and no answer. The options themselves appear only in the pick
  sheet. Chips show only on cards that carry `options` (`pending`, `ready`, `empty`), not on
  `loading` or `error`.
- `ready` carries the `answer`. `empty` is a `null` answer ("No answer."). `0` is `ready`.
- `error` carries a message. `show` catches any throw: a failed read, a missing header
  (`Tab X has no header "y".`), an unknown range preset. The error stays on that card only. The
  card offers Retry (`retry`), which calls `show` again with the same values and the same pick
  function, so a failed random roll picks its filters again.
- Any card that is not loading has a Shuffle button, which calls `roll()` (all categories).
- Random (`roll`) picks a fact, then picks every filter from its real options, ignoring the
  category. It never re-rolls on a `0` or an empty card. A filter with no options is left unchosen.
- The pick sheet is a store-held `sheet.step`: `category`, `fact`, then one step per unchosen
  filter. Each step has a Random option. A category only limits the fact step. Choosing a fact loads
  its tab, so derived options exist for the filter steps. The sheet closes on the card, also when
  the load failed. A filter chip calls `editFilter` to reopen the sheet at that step.
  A double tap on a fact while loading is ignored.
  The sheet focuses its dialog on open and on each step so Esc closes it, and returns focus to
  the opener on close. There is no focus trap.
- `Stats.vue` calls `reset()` (card back to `idle`) and `closePicker()` on unmount, so nothing carries
  between visits.

## Filter text and the Date range

An option's value is its chip text. A filter's `say(value)` gives the question text where it differs
(`any boss` on the chip, nothing in the question); an empty text drops the slot and its space.

The Date range (`kind: 'dateRange'`, id `range`) offers `any period`, the range presets (Quick,
hidden with `quick: false`) and `in <year>` for each year in the fact's date cells. It also takes a
custom value outside its options, `from..to` built by `customRange`; `to` is left empty when it is
today, and the question then reads `since <date>`, otherwise `from <date> to <date>`. Rolls and the
Random button draw from the options, so never a custom range.

Presets resolve against the game day (`gameDay(now)`, passed to `compute` as `today`), never the
device clock directly. Weeks start on Monday and months are calendar months. `inRange` is a predicate
over a raw date cell: a cell is placed by `cellGameDay`: blank cells are never in range, `any period`
included; serial numbers, ISO text and WIB timestamps work; anything else is out of range. An unknown
range throws, which becomes an `error` card.

`show`, `setFilter`, `roll` and the pick functions take an optional `now` (and `random`, `api`,
`facts`) so tests inject them.

## Invariants and rules

The rules (fact as code, no writes, header-name columns, lazy loading, no filter default, `gameDay`
ranges) are stated where they apply above and in ADR 0008.
