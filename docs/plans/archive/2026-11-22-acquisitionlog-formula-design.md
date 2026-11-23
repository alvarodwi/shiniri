# AcquisitionLog formula (sheet only)

Step 6.7 of `2026-11-21-gacha-tracker-design.md`. Small change, formulas only. Decided with the owner
on 2026-11-22.

## Why

AcquisitionLog shows, per owned SSR, when and from where each copy (first copy up to c7) came. It
broke: `nikke` and `release` read the dropped `NikkeRoster` (`#REF!`), and `totalCopies`,
`untracked`, `tracked` read DupeTracker columns that no longer exist. The new tabs (`NikkeDatabase`,
`RosterLog`, `AllPulls`) hold everything it needs.

## What

One formula in `AcquisitionLog!A1` builds the whole tab: the header row, the slot-number row (row 2,
`1` to `11` under `firstCopy` to `c7`) and one row per Nikke. No writer, no code changes.

Columns stay as they are now:

| header | value |
| --- | --- |
| `nikke` | an SSR in `NikkeDatabase` whose latest `RosterLog` `copies` is above 0 |
| `confidence` | from `untracked`: 0 `Perfect`, ≤2 `Good`, ≤5 `Approx`, else `Unknown` (unchanged) |
| `release` | `NikkeDatabase` `releaseDate` |
| `firstCopy` … `c7` | slot k: `date⏎source` of a pull, `?`, or blank (below) |
| `totalCopies` | N (below) |
| `untracked` | N − `tracked` |
| `tracked` | the number of slots holding a pull |

- Rows sort by `release` (my call).
- Matching between tabs is on `name` (NikkeDatabase `name`, RosterLog `name`, AllPulls `ssr`).

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

## Approaches

- **A. Reverse lookup from N (picked, the owner's idea).** No baseline arithmetic is needed to place
  pulls, and it can't go negative: excess logged pulls just fall off the bottom.
- B. Forward fill from the baseline (`?` for baseline copies minus pre-baseline pulls, then pulls in
  order): goes negative when an overcore wasn't logged, and needs more special cases.
- Per-row formulas copied down (the old layout) instead of one `A1` formula: new Nikkes would need
  rows extended by hand. One formula matches AllPulls and DupeTracker.

## Manual sheet steps (test copy first, then the real sheet)

1. Clear the old `AcquisitionLog` contents by hand (shiniri never edits rows).
2. Paste the formula into `A1`.
3. Check a few Nikkes against the game: `totalCopies` matches their in-game copies, and the latest
   slots match their latest pulls. Check one with an overcore in AllPulls.
4. Repeat on the real sheet before release.

## Data found on the test copy (2026-11-22)

- 171 rows, no errors. Confidence: 119 `Perfect`, 31 `Good`, 19 `Approx`, 2 `Unknown` (Diesel,
  Modernia).
- 13 Nikkes have a blank `releaseDate` in NikkeDatabase, so they sort to the top.
- `releaseDate` is a mix of real dates and text; `release` shows it as `yyyy-mm-dd` text either way.
- 7 Nikkes have more non-overcore pulls than copies (Scarlet: Goddeath, Exia, Quency: Escape Queen,
  Rumani, Flora, Nayuta, Mint), so their oldest pull drops off. Exia: 12 pulls, 11 copies. Each
  likely means an overcore with no `Overcored` row; a hand fix for the owner.

## Formula

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
    {"nikke", "confidence", "release", "firstCopy", "lb1", "lb2", "lb3", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "totalCopies", "untracked", "tracked"},
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
