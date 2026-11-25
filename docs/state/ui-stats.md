# UI stats

## Purpose

The Stats page shows one fact at a time as a card: a title, a question with its filters filled in,
and one answer. The viewer picks the fact or rolls one at random. Every answer is computed in the
browser from raw rows read with `getValues`. Nothing is written, so the writer contract is
untouched, and the CLI does not read facts. All in `ui/`. Vocabulary is in `GLOSSARY.md`; the why is
in `docs/decisions/0008-stats-computed-in-the-client.md`.

This doc does not list the facts. `FACTS` in `ui/src/services/stats/facts.ts` is the catalog.

## Public surface

- `ui/src/services/stats/facts.ts`: the types (`Fact`, `Filter`, `Columns`, `Values`, `Answer`),
  `FACTS`, and `fillQuestion`, which replaces each `{filterId}` in a question with the chosen value
  (`…` while unchosen).
- `ui/src/services/stats/ranges.ts`: `RANGE_PRESETS`, `ANY_TIME` and `inRange`.
- `ui/src/stores/statsStore.ts`: `useStatsStore`, tested in `statsStore.test.ts`.
- `ui/src/pages/Stats.vue` renders the card. `ui/src/components/stats/PickSheet.vue` is the bottom
  sheet for "Pick a fact". The route is `/stats` (see `ui-navigation.md`).

## How a fact is defined

A `Fact` is a plain object in `FACTS`:

- `id`, `category`, `title`. The picker chooses a category before a fact and lists titles.
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
  a number or string, or `null` for no answer. `0` is a real answer.

Cells arrive raw (`UNFORMATTED_VALUE`): blanks are `''`, dates are serial numbers or ISO text,
and the number of rows is the whole tab. Compute filters blanks itself.

## How to add a fact

1. Add an object to `FACTS` in `facts.ts`. Reuse the `TabSpec` constants from `config/sheets.ts`
   in `reads`; use the exact header text from the sheet (ask when unsure).
2. Declare only the columns `compute` uses. Each one costs a read the first time its tab is used.
3. For a date filter, use `[ANY_TIME, ...RANGE_PRESETS]` as options and `inRange(range, today)` as
   the predicate over the date column. Do not compute dates by hand.
4. For options derived from data, give `options` as a function of `cols`. These are available once
   the tab has loaded, which the store guarantees before it asks.
5. Add a case to `statsStore.test.ts` only if the fact needs behaviour the store tests do not
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
- Random (`roll`) picks a fact, then picks every filter from its real options, ignoring the
  category. It never re-rolls on a `0` or an empty card. A filter with no options is left unchosen.
- The pick sheet is a store-held `sheet.step`: `category`, `fact`, then one step per unchosen
  filter. Each step has a Random option. A category only limits the fact step. Choosing a fact loads
  its tab, so derived options exist for the filter steps. The sheet closes on the card, also when
  the load failed. A filter chip calls `editFilter` to reopen the sheet at that step.
  A double tap on a fact while loading is ignored.
  The sheet focuses its dialog on open and on each step so Esc closes it, and returns focus to
  the opener on close. There is no focus trap.
- `Stats.vue` resets `card` to `idle` and closes the picker on unmount, so nothing carries
  between visits.

## Range presets

`this week`, `last week`, `this month` and `last month`, plus `any time`. They resolve against the
game day (`gameDay(now)`, passed to `compute` as `today`), never the device clock directly. Weeks
start on Monday and months are calendar months. `inRange` is a predicate over a raw date cell:
blank cells are never in range, `any time` included; serial numbers and ISO text both work;
anything else is out of range. An unknown preset throws, which becomes an `error` card.

`show`, `setFilter`, `roll` and the pick functions take an optional `now` (and `random`, `api`,
`facts`) so tests inject them.

## Invariants and rules

The rules (fact as code, no writes, header-name columns, lazy loading, no filter default, `gameDay`
ranges) are stated where they apply above and in ADR 0008.
