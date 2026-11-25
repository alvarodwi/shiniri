# UI navigation, Pulls and Log

## Purpose

How the web app's pages are grouped and reached, how the six pull forms share one page, and how
the Log pages audit rows. All in `ui/`. No sheet write behaviour lives here.

## Public surface

- Header and groups: `ui/src/App.vue`, driven by `NAV` and `groupOf` in `ui/src/router/nav.ts`.
  Groups are Journal (Anomaly, Gear, Level, Solo Raid), Gacha (Pulls, Spending, Costumes), Stats
  (no sub-row) and Log (no sub-row).
- Routes: `ui/src/router/index.ts`. Real routes are `/journal/*`, `/gacha/*`, `/stats`, `/log`. Hash history.
- Old paths: `ui/src/router/redirects.ts`. Each old form path goes to `/gacha/pulls?form=<key>`.
  `/special` goes to `/journal/anomaly` (`redirects.test.ts`): the Special page was dropped for good.
- Pulls page: `ui/src/pages/Pulls.vue`, a `<select>` over `PULL_FORMS`
  (`ui/src/services/gacha/pullForms.ts`) that renders one form page inside `<KeepAlive>`.
- Stats page: `ui/src/pages/Stats.vue` over `useStatsStore` (`ui/src/stores/statsStore.ts`) and the
  typed `FACTS` in `ui/src/services/stats/facts.ts`. "Random fact" calls `roll()`, which picks one
  fact, draws every filter value from that filter's real options (injected random source) and shows
  its card (title, question, answer). A fact's `filters` list options or derive them from the loaded
  columns; "any" is an option the fact lists. Filters have no default: the card stays `pending`
  until all are chosen. The card shows them as chips, `setFilter` recomputes from the cached tab
  (no new read), and `{filterId}` in the question is filled with the chosen value. "Pick a fact"
  opens `components/stats/PickSheet.vue`, a bottom sheet over the store's `sheet` step (category,
  fact by title, then one step per filter), each with a Random option. Facts declare a `category`;
  a picked or random category only limits the fact step (`roll()` ignores it). Choosing a fact
  loads its tab, so derived filter options exist for the filter steps. The sheet closes on the
  card, also on a load error. A filter chip on the card calls `editFilter` to reopen the sheet at
  that step.
- Log page: `ui/src/pages/Log.vue` over `useLogStore` (`ui/src/stores/logStore.ts`): tabs per
  spreadsheet, newest first, infinite scroll.

## Invariants and rules

- The active group comes from the URL, never from a hand-kept list. Tested in `nav.test.ts`.
- Old bookmarks keep working. Tested in `redirects.test.ts`.
- Switching form with unsaved input asks first. Cancel keeps the form and snaps the select back.
  Confirm calls the old store's `discard()`, so the old input cannot be saved later. Leaving Pulls
  through the header is not guarded.
- Every pull store exposes `isDirty` and `discard()`. `isDirty` is `isEntryDirty`
  (`ui/src/utils/dirty.ts`), which ignores `date`. Tested per store and in `dirty.test.ts`.
- The remembered form lives in `localStorage` key `shiniri.pullForm`, default `event`. Storage is
  resolved inside the `try`, so blocked site data falls back instead of throwing
  (`pullForms.test.ts`).
- Log reads one audit tab per `open(name)`, chunks of 20 from the bottom. `oldest` is the cursor;
  row 1 is the header and is never read. `busy` blocks overlapping reads. A failed `more` keeps the
  loaded entries. Tested in `logStore.test.ts`.
- Tab labels are the `name` of each `SPREADSHEETS` entry (`Journal`, `Gacha`). The mock fixtures
  key their audit rows by the same name (`ui/src/services/mock/fixtures.ts`).

- Stats reads only when a fact is shown: one header-row read (`'Tab'!1:1`) per tab, then one
  `UNFORMATTED_VALUE` column read per declared header, found by header name. Reads are cached per
  range in memory for the session; a failed read is evicted so Retry refetches. A compute result
  of `null` is the "No answer." card; `0` shows as 0. The card resets to `idle` when the page
  unmounts, so nothing carries between visits. Nothing is written. Tested in `statsStore.test.ts`
  (decision 0008).
- Range presets (`ui/src/services/stats/ranges.ts`: this/last week, this/last month, "any time") resolve
  against `gameDay(now)`, passed to `compute` as `today`. Weeks start Monday; date cells may be serials
  or ISO text. `show`, `setFilter` and `roll` take an optional `now` for tests. Placeholder fact:
  `anomaly-runs-by-range`.
- The mock sheets API reads whole-row ranges like `'Tab'!1:1` as well as `A1:G1`, `A:A` and `B12`
  (`mockSheetsApi.test.ts`).

## Owns

- Browser `localStorage` key `shiniri.pullForm`. Nothing else is stored.

## Gotchas

- The six form pages have a `<div>` root. `Pulls.vue` owns the page's `<main>`.
- `KeepAlive` means a form's `onMounted` load runs once per visit to Pulls, not per switch. Leaving
  Pulls and returning reloads.
- `Log.vue` re-arms its `IntersectionObserver` after each chunk and does not re-arm while a section
  has an error. Retry is the way out.
- Adding a pull form needs a `PULL_FORMS` entry, the `pages` and `stores` maps in `Pulls.vue`, and
  `isDirty` and `discard` on its store.

## Known gaps

- Unknown hash paths render a blank page.
- `Pulls.vue`, `Log.vue` and `App.vue` have no component tests (no test-utils in the repo). The
  confirm dialog, the sub-row at phone width and the scroll observer were not checked in a browser.
