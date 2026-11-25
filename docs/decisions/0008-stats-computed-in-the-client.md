# 0008 Stats are facts computed in the client

## Context
The app logs a wide range of data and has no way to look back at it. The stats page shows one fact
at a time as a card (a title, a question with its filters filled in, one answer), picked by the
viewer or rolled at random. Vocabulary is in `GLOSSARY.md`.

## Decision
- A **fact** is a TypeScript definition in `ui/`: title, question, filters and their options, the
  tabs, columns and headers it reads, and how it computes. The code is the catalog. No list of
  facts is kept in docs.
- The browser computes every answer from raw rows read with `getValues`. Nothing is written to the
  sheet for stats, and the writer contract is untouched. The CLI does not read facts.
- A fact belongs to one spreadsheet and may read several of its tabs. A fact never crosses the
  journal and gacha spreadsheets. A tab that needs to cross is migrated instead.
- Loading is lazy. Nothing loads at app start. A tab loads when its fact is chosen, only the
  declared columns are read, and the cache is per tab, in memory, for the session.
- Facts address columns by header name. A missing header is an error on that card only.
- Relative ranges ("last week", "this month") resolve through `gameDay`.
- A filter has no default. Each fact declares its options, including "any" where it makes sense,
  or they are derived from the loaded data.
- An answer is one value, 0 included, or no answer. Random never re-rolls on a 0 or an empty card.
- The page keeps no state between visits.

## Rejected
- A stats tab of stored formulas (question, answer formula, args). The answers would be computed by
  the sheet, which is slow to load once it holds many formulas. Relative ranges would need
  `TODAY()`, a volatile function. Editing args edits a logged row. A sheet-side query-history tab
  would fix that last point, but costs a write and a recalculation for every query and keeps every
  combination for good.
- An expression language (CEL or a DSL) over a stats tab. It only pays off if facts live as data,
  and the CLI does not need them. A fact in code is typed, testable and ships with the web app.
- SQLite. It is a server-side copy of the sheet, which the sheet contract forbids, and it needs
  somewhere to live.
- Reading only the last N rows. Column A can be in any order and is edited by hand, so a row window
  cannot say whether a date range reaches older data. Facts with no range cannot be windowed at all.

## Revisit when
- A tab's whole-tab read is noticeably slow on a phone. The window is then defined by the oldest
  date loaded, with a warning when a range starts before it. At the time of writing `Anomaly` is
  about 3k rows (about 1.5k a year) and the CLI tabs are under 10k.
- The PWA work starts. It may change the in-memory cache and the stateless page.
- The CLI needs stats. Facts would then need a shared definition, or a second port.
