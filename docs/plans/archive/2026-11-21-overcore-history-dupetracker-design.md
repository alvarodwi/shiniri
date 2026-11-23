# Overcore history in AllPulls, and DupeTracker (sheet only)

Steps 6.3 (follow-up) and 6.4 of `2026-11-21-gacha-tracker-design.md`. Small change, formulas
only. Decided with the owner on 2026-11-21.

## Why

- The old AllPulls flagged historical overcores by counting back from the hand-kept `Overcored`
  tab. The new AllPulls only flags pulls after the RosterLog baseline (`copy` > 11), so everything
  before it shows nothing.
- DupeTracker should remind the owner of unused dupes sitting in the in-game inventory, and point
  out pulls that never got logged.

## 1. AllPulls `isOvercore` for history

Only the `oc` step of the AllPulls formula changes
(`2026-11-21-allpulls-formula-design.md`).

- **After the baseline** (`copy` isn't blank): unchanged, `copy` > 11.
- **On or before the baseline:** group AllPulls rows by date + `ssr` + `source`. k = the number of
  `Overcored` rows with that date, `ssr` and `from`, after mapping `from`: `Social Pulls` → `Social`,
  `Event Banner` → `Event`, `Other Banner` → `Other`, and anything else kept as is (`Molds`). The
  last k rows of the group, in AllPulls order, are TRUE and the rest FALSE. The later copies that day
  were the overcores.
- Overcored rows the app adds later are dated after the baseline, so they're never counted twice.
- An Overcored row with no matching pull flags nothing. On the test copy, after the owner restored
  missing Molds rows from version history, all 66 matched.
- `Overcored` dates can be text or real dates. Both are read as dates, like AllPulls does.

## 2. DupeTracker

One formula in `DupeTracker!A1`, header included. The owner clears the old contents by hand.

| header | value |
| --- | --- |
| `nikke` | each distinct `name` in RosterLog |
| `copies` | `copies` of its last RosterLog row (lowest on the sheet) |
| `expected` | MIN(its last `copy` in AllPulls, 11). If its last pull is on or before the baseline (blank `copy`) or it has no pull, its baseline copies (0 when it's not in the baseline). |
| `unused` | `expected` − `copies` |

- Only Nikkes with `unused` ≠ 0 are listed, biggest `unused` first. Positive means a dupe is waiting
  in the inventory. Negative means the roster grew without a logged pull.
- With nothing to list, the tab shows only the header.
- AllPulls is sorted by date, so a Nikke's last AllPulls row is its latest pull.

## Approaches

- **A. Extend the formulas (picked).** History, DupeTracker and the future app-written Overcored
  rows all read one source, and nothing is written by code.
- B. A helper column the owner fills by hand for historical overcores: manual work that the
  Overcored tab already holds.
- C. Leave history unflagged: loses what the old AllPulls showed.

## Manual sheet steps (test copy first, then the real sheet)

1. Replace the AllPulls formula with the updated one.
2. Clear DupeTracker by hand, then paste its formula into `A1`.
3. Copy both final formulas into the `## Formulas` section below.

## Formulas

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
