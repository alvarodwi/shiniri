# AllPulls formula (sheet only)

Step 6.3 of `2026-11-21-gacha-tracker-design.md`. Small change. Decided with the owner on 2026-11-21.

## Why

`AllPulls` was the hand-kept list of every SSR, one per row. It broke (`#VALUE!` in row 2) when the
gacha tabs moved to the new format, and the forms now hold the same data. AcquisitionLog,
DupeTracker and overcore detection all need one list of every pulled SSR with its date.

## What

One formula in `AllPulls!A1` builds the whole tab, header row included. No writer: neither `ui/`
nor `cli/` writes AllPulls, and no code changes.

It stacks the SSR lists of the six gacha tabs and splits each list on `, ` (the separator every
form writes) into one row per SSR:

| tab | date | SSR list | rate-up |
| --- | --- | --- | --- |
| `Social` | A | D `ssrDetails` | none |
| `Event` | A | H `ssrDetails` | B `rateUpName` |
| `Ordinary` | A | F `ssrDetails` | none |
| `Molds` | A | E `result` | none |
| `SpareBody` | A | B `target` (already one per row) | none |
| `Other` | A | H `ssrDetails` | D `rateUpName` |

Columns, in order:

| header | value |
| --- | --- |
| `date` | the source row's date |
| `ssr` | one name from the list |
| `source` | the source tab's name, verbatim (`Social` ... `Other`) |
| `spook` | Event and Other only: TRUE when `ssr` isn't one of the row's `rateUpName` names (also split on `, `), else FALSE. Blank for the other tabs and for rows with no `rateUpName`. |
| `copy` | which copy of that Nikke this pull was, counted from the RosterLog baseline (below). Blank on or before the baseline date. |
| `isOvercore` | TRUE when `copy` > 11, FALSE when `copy` is a number, blank otherwise |

- `date`, `ssr`, `source` stay in A:C. AcquisitionLog's formulas read `AllPulls!$A:$A`, `$B:$B` and
  `$C:$C`.
- Rows sort by date. Pulls on the same date keep source order (the table above), then sheet row,
  then list order. The sort needs an explicit tiebreak key, not a stable sort.
- The owner applies Other's `spook` the same as Event's (my call, they can narrow it to Event).

### Baseline and `copy`

- The baseline date is the earliest `date` in `RosterLog` (the first `watch` run with it,
  2026-11-21 in the test copy).
- A Nikke's baseline copies is its `copies` in the first `RosterLog` row dated on the baseline date,
  matched on `name`. A Nikke with no such row starts at 0. This covers Nikkes first pulled after the
  baseline: their own first RosterLog row comes later and must not count as the baseline.
- `copy` = baseline copies + the number of this Nikke's AllPulls rows dated after the baseline date,
  up to and including this row in AllPulls order.

## Data found on the test copy (2026-11-21)

- Dates are real dates (serial numbers), except one text date in Molds (`2025-06-11`). The formula
  reads a text date as a date.
- SSR counts by tab: Social 74, Event 265, Ordinary 116, Molds 301, SpareBody 61, Other 45, so 862
  rows.
- Event row 122 has `totalSsr` 1 but four names in `ssrDetails` (`Red Hood, Harran, Julia,
  Folkwang`). AllPulls counts names, so it disagrees with `totalSsr` there. That's a hand fix for
  the owner.
- No list uses any separator other than `, `.

## Approaches

- **A. One sheet formula (picked).** It covers every past row and every hand fix on the source tabs,
  and needs no writer, so the append-only contract doesn't apply.
- B. Each form also writes one AllPulls row per SSR: two writes per save, history needs a backfill,
  and hand fixes on source rows never reach AllPulls.
- C. A cli job that rebuilds AllPulls: rewriting rows breaks the append-only rule.

Not included (owner's call): a source row number. No planned step needs one, and since AllPulls is
computed, a column added later breaks nothing.

## Manual sheet steps (test copy first, then the real sheet)

1. Clear the old `AllPulls` contents by hand (shiniri never edits rows).
2. Paste the formula into `A1`. Format column A as a date.
3. Check: `COUNTIF(AllPulls!C:C, "<tab>")` matches each count above, and AcquisitionLog still
   resolves.

## Formula

Checked on the test copy (counts, spook, copy and isOvercore). Pulls dated on or before the RosterLog baseline get a blank `copy`, and
their `isOvercore` counts back from `Overcored` (see `2026-11-21-overcore-history-dupetracker-design.md`;
66 of 66 Overcored rows matched on the test copy). A `LEN(...)` bound with `LET` evaluates as one
value, not an array, so each `FILTER` keeps its own `LEN(Overcored!C2:C)`.

```
=LET(
  ex, LAMBDA(src, d, l, rate, hasRate, LET(
    k, FILTER(HSTACK(d, l, rate), LEN(l)),
    ns, IFERROR(ARRAYFORMULA(SPLIT(CHOOSECOLS(k, 2), ", ", FALSE)), ""),
    at, LAMBDA(col, TOCOL(MAKEARRAY(ROWS(ns), COLUMNS(ns), LAMBDA(r, c, INDEX(k, r, col))))),
    nm, MAP(TOCOL(ns), LAMBDA(x, TRIM(x))),
    dt, MAP(at(1), LAMBDA(x, IF(ISTEXT(x), DATEVALUE(x), x))),
    sp, MAP(nm, at(3), LAMBDA(n, r, IF(OR(NOT(hasRate), r = ""), "", ISNA(XMATCH(n, SPLIT(r, ", ", FALSE)))))),
    FILTER(HSTACK(dt, nm, MAP(nm, LAMBDA(x, src)), sp), LEN(nm))
  )),
  all, VSTACK(
    ex("Social", Social!A2:A, Social!D2:D, Social!A2:A, FALSE),
    ex("Event", Event!A2:A, Event!H2:H, Event!B2:B, TRUE),
    ex("Ordinary", Ordinary!A2:A, Ordinary!F2:F, Ordinary!A2:A, FALSE),
    ex("Molds", Molds!A2:A, Molds!E2:E, Molds!A2:A, FALSE),
    ex("SpareBody", SpareBody!A2:A, SpareBody!B2:B, SpareBody!A2:A, FALSE),
    ex("Other", Other!A2:A, Other!H2:H, Other!D2:D, TRUE)),
  s, CHOOSECOLS(SORT(HSTACK(all, SEQUENCE(ROWS(all))), 1, TRUE, 5, TRUE), 1, 2, 3, 4),
  n, ROWS(s), names, CHOOSECOLS(s, 2), dates, CHOOSECOLS(s, 1),
  b, MIN(FILTER(RosterLog!A2:A, LEN(RosterLog!C2:C))),
  bn, FILTER(RosterLog!C2:C, RosterLog!A2:A = b),
  bc, FILTER(RosterLog!D2:D, RosterLog!A2:A = b),
  cp, MAP(SEQUENCE(n), LAMBDA(i, IF(INDEX(dates, i) <= b, "",
    IFNA(XLOOKUP(INDEX(names, i), bn, bc), 0)
      + SUMPRODUCT((SEQUENCE(n) <= i) * (names = INDEX(names, i)) * (dates > b))))),
  srcs, CHOOSECOLS(s, 3),
  od, MAP(FILTER(Overcored!A2:A, LEN(Overcored!C2:C)), LAMBDA(x, IF(ISTEXT(x), DATEVALUE(x), x))),
  on, MAP(FILTER(Overcored!C2:C, LEN(Overcored!C2:C)), LAMBDA(x, TRIM(x))),
  of, MAP(FILTER(Overcored!B2:B, LEN(Overcored!C2:C)), LAMBDA(x, SWITCH(TRIM(x), "Social Pulls", "Social", "Event Banner", "Event", "Other Banner", "Other", TRIM(x)))),
  oc, MAP(SEQUENCE(n), LAMBDA(i, IF(INDEX(cp, i) <> "", INDEX(cp, i) > 11, LET(
    d, INDEX(dates, i), nm, INDEX(names, i), sr, INDEX(srcs, i),
    SUMPRODUCT((SEQUENCE(n) > i) * (dates = d) * (names = nm) * (srcs = sr))
      < SUMPRODUCT((od = d) * (on = nm) * (of = sr)))))),
  VSTACK({"date", "ssr", "source", "spook", "copy", "isOvercore"}, HSTACK(s, cp, oc))
)
```

## Not in scope

DupeTracker, overcore on save, AcquisitionLog fixes. Each reads `copy` from here.
