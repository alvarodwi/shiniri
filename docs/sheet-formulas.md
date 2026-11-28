# Sheet formulas the app depends on

These formulas live only in the Google Sheet (the gacha spreadsheet). No code writes them. The code
reads their output: `AllPulls` `copy` is read by `checkOvercores` (`ui/src/services/overcore/overcore.ts`),
and the Stats facts read `AllPulls` and `AcquisitionLog`.
The text below is copied from the 2026-11 specs, now archived in `plans/archive/`, so it is **the last
known version, not the live one**. Check it against the sheet before relying on it.

Stale names since the rename (`decisions/0004-sheet-names-one-cutover.md`): headers `name`/`ssr` are
now `nikke`; tabs `Molds`, `SpareBody`, `Other` are now `Mold`, `Exchange`, `Extra`; `Overcored` is now
`Overcore` with headers `date, source, nikke, manufacturer, notes`. `Overcore` `source` values are the current
names (the owner tidied the old rows), and `AllPulls` compares them as they are. A renamed header on `AllPulls`, `RosterLog` or `Overcore`
breaks these formulas without an error in the app.

## AllPulls

### Baseline and `copy`

- The baseline date is the earliest `date` in `RosterLog` (the first `watch` run with it,
  2026-11-21 in the test copy).
- A Nikke's baseline copies is its `copies` in the first `RosterLog` row dated on the baseline date,
  matched on `name`. A Nikke with no such row starts at 0. This covers Nikkes first pulled after the
  baseline: their own first RosterLog row comes later and must not count as the baseline.
- `copy` = baseline copies + the number of this Nikke's AllPulls rows dated after the baseline date,
  up to and including this row in AllPulls order.

### Formula

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
    ex("Mold", Mold!A2:A, Mold!E2:E, Mold!A2:A, FALSE),
    ex("Exchange", Exchange!A2:A, Exchange!B2:B, Exchange!A2:A, FALSE),
    ex("Extra", Extra!A2:A, Extra!H2:H, Extra!D2:D, TRUE)),
  s, CHOOSECOLS(SORT(HSTACK(all, SEQUENCE(ROWS(all))), 1, TRUE, 5, TRUE), 1, 2, 3, 4),
  n, ROWS(s), names, CHOOSECOLS(s, 2), dates, CHOOSECOLS(s, 1),
  b, MIN(FILTER(RosterLog!A2:A, LEN(RosterLog!C2:C))),
  bn, FILTER(RosterLog!C2:C, RosterLog!A2:A = b),
  bc, FILTER(RosterLog!D2:D, RosterLog!A2:A = b),
  cp, MAP(SEQUENCE(n), LAMBDA(i, IF(INDEX(dates, i) <= b, "",
    IFNA(XLOOKUP(INDEX(names, i), bn, bc), 0)
      + SUMPRODUCT((SEQUENCE(n) <= i) * (names = INDEX(names, i)) * (dates > b))))),
  srcs, CHOOSECOLS(s, 3),
  od, MAP(FILTER(Overcore!A2:A, LEN(Overcore!C2:C)), LAMBDA(x, IF(ISTEXT(x), DATEVALUE(x), x))),
  on, MAP(FILTER(Overcore!C2:C, LEN(Overcore!C2:C)), LAMBDA(x, TRIM(x))),
  of, MAP(FILTER(Overcore!B2:B, LEN(Overcore!C2:C)), LAMBDA(x, TRIM(x))),
  oc, MAP(SEQUENCE(n), LAMBDA(i, IF(INDEX(cp, i) <> "", INDEX(cp, i) > 11, LET(
    d, INDEX(dates, i), nm, INDEX(names, i), sr, INDEX(srcs, i),
    SUMPRODUCT((SEQUENCE(n) > i) * (dates = d) * (names = nm) * (srcs = sr))
      < SUMPRODUCT((od = d) * (on = nm) * (of = sr)))))),
  VSTACK({"date", "nikke", "source", "spook", "copy", "isOvercore"}, HSTACK(s, cp, oc))
)
```

## DupeTracker

### What it shows

One formula in `DupeTracker!A1`, header included. The owner clears the old contents by hand.

| header     | value                                                                                                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nikke`    | each distinct `name` in RosterLog                                                                                                                                            |
| `copies`   | `copies` of its last RosterLog row (lowest on the sheet)                                                                                                                     |
| `expected` | MIN(its last `copy` in AllPulls, 11). If its last pull is on or before the baseline (blank `copy`) or it has no pull, its baseline copies (0 when it's not in the baseline). |
| `unused`   | `expected` − `copies`                                                                                                                                                        |

- Only Nikkes with `unused` ≠ 0 are listed, biggest `unused` first. Positive means a dupe is waiting
  in the inventory. Negative means the roster grew without a logged pull.
- With nothing to list, the tab shows only the header.
- AllPulls is sorted by date, so a Nikke's last AllPulls row is its latest pull.

### Formulas

Checked on the test copy, 2026-11-21.

**AllPulls:** the full formula, with the new `oc`, is in `2026-11-21-allpulls-formula-design.md`.
Result: 66 TRUE (every Overcored row matched), and the one surplus group
(`2026-05-11 Privaty: Unkind Maid`, Molds) flags its later copy.

**DupeTracker `A1`:** 200 Nikkes computed, `expected` = `copies` for all of them, so only the
header shows. Array arithmetic like `exp - cur` inside `LET` evaluates as one value, so the
difference goes through `MAP`.

```
=LET(
  rc, RosterLog!C2:C, rd, RosterLog!D2:D, ra, RosterLog!A2:A,
  b, MIN(FILTER(ra, LEN(rc))),
  nikkes, UNIQUE(FILTER(rc, LEN(rc))),
  bn, FILTER(rc, ra = b), bc, FILTER(rd, ra = b),
  cur, MAP(nikkes, LAMBDA(nm, XLOOKUP(nm, rc, rd, , 0, -1))),
  exp, MAP(nikkes, LAMBDA(nm, LET(
    last, XLOOKUP(nm, AllPulls!B2:B, AllPulls!E2:E, "", 0, -1),
    MIN(IF(last = "", IFNA(XLOOKUP(nm, bn, bc), 0), last), 11)))),
  t, HSTACK(nikkes, cur, exp, MAP(exp, cur, LAMBDA(e, c, e - c))),
  VSTACK({"nikke", "copies", "expected", "unused"},
    IFERROR(SORT(FILTER(t, CHOOSECOLS(t, 4) <> 0), 4, FALSE), {"", "", "", ""}))
)
```

## AcquisitionLog

### N, the copy count

N = MAX of:

- the Nikke's latest `RosterLog` `copies` (its lowest row on the sheet), and
- DupeTracker's `expected`: MIN(its last `copy` in AllPulls, 11), or its baseline copies when its
  last pull is on or before the baseline or it has no pull (0 when it's not in the baseline).

The second covers a pull saved before `watch` next updates RosterLog. The first covers pulls that
were never logged; those end up as `?`.

### Filling the slots (reverse lookup)

- Take the Nikke's AllPulls rows with `isOvercore` not TRUE (an overcore adds no copy), in AllPulls
  order.
- The latest goes in slot N, the one before it in N−1, and so on down. Pulls that don't fit below
  slot 1 (more logged pulls than copies) are dropped, oldest first.
- Slots from 1 up to the lowest filled slot that have no pull: `?` (unknown copies).
- Slots above N: blank.

### Formula

```
=LET(
  dbN, NikkeDatabase!B2:B, dbR, NikkeDatabase!C2:C, dbD, NikkeDatabase!J2:J,
  rlD, RosterLog!A2:A, rlN, RosterLog!C2:C, rlC, RosterLog!D2:D,
  apD, AllPulls!A2:A, apS, AllPulls!B2:B, apSrc, AllPulls!C2:C, apCp, AllPulls!E2:E, apOc, AllPulls!F2:F,
  b, MIN(FILTER(rlD, LEN(rlN))),
  bN, FILTER(rlN, rlD = b), bC, FILTER(rlC, rlD = b),
  names, UNIQUE(FILTER(rlN, LEN(rlN))),
  cur, MAP(names, LAMBDA(n, XLOOKUP(n, rlN, rlC, 0, 0, -1))),
  own, FILTER(names, XLOOKUP(names, dbN, dbR, "") = "SSR", cur > 0),
  rel, MAP(own, LAMBDA(n, LET(d, XLOOKUP(n, dbN, dbD, ""), IF(ISNUMBER(d), TEXT(d, "yyyy-mm-dd"), TRIM(d))))),
  list, SORT(HSTACK(own, rel), 2, TRUE),
  head, VSTACK(
    {"nikke", "confidence", "releaseDate", "firstCopy", "lb1", "lb2", "lb3", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "totalCopies", "untracked", "tracked"},
    HSTACK("", "", "", SEQUENCE(1, 11), "", "", "")),
  REDUCE(head, SEQUENCE(ROWS(list)), LAMBDA(acc, i, LET(
    n, INDEX(list, i, 1),
    lastCp, XLOOKUP(n, apS, apCp, "", 0, -1),
    expected, IF(lastCp = "", IFNA(XLOOKUP(n, bN, bC), 0), MIN(lastCp, 11)),
    nn, MAX(XLOOKUP(n, rlN, rlC, 0, 0, -1), expected),
    pulls, IFERROR(FILTER(TEXT(apD, "yyyy-mm-dd") & CHAR(10) & apSrc, apS = n, NOT(apOc = TRUE)), ""),
    p, IF(INDEX(pulls, 1) = "", 0, ROWS(pulls)),
    tracked, MIN(p, nn),
    untracked, nn - tracked,
    slots, MAKEARRAY(1, 11, LAMBDA(r, k, IF(k > nn, "",
      IF(p - (nn - k) < 1, "?", INDEX(pulls, p - (nn - k)))))),
    VSTACK(acc, HSTACK(
      n,
      IFS(untracked = 0, "Perfect", untracked <= 2, "Good", untracked <= 5, "Approx", TRUE, "Unknown"),
      INDEX(list, i, 2),
      slots, nn, untracked, tracked))
  )))
)
```

## CostumeDatabase

### `priceUsd`

Column I, formula in `I2` (the owner's column, right of the contract columns; pasted by the owner 2026-11-27).
`source` (E) decides the price. Anything not listed, blank included, is `Free`, so the column mixes numbers
and text. Typing a value below `I2` breaks the whole column: change `source` or the formula instead.

```
=ARRAYFORMULA(IF(A2:A="", "", IF(E2:E="Costume Gacha", 59.94, IF(E2:E="Cash Shop", 14.99, IF((E2:E="Mission Pass")+(E2:E="Event Pass"), 19.99, "Free")))))
```
