# AcquisitionLog Formula Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One formula in `AcquisitionLog!A1` rebuilds the tab: one row per owned SSR, each copy slot filled from its latest pulls downward, `?` for unknown copies.

**Architecture:** Sheet-only. A `LET` picks the owned SSRs from `RosterLog` + `NikkeDatabase`, sorts them by release, and a `REDUCE` stacks one 17-column row per Nikke under the two header rows. Each row computes N and its non-overcore pulls once.

**Tech Stack:** Google Sheets functions (`LET`, `LAMBDA`, `REDUCE`, `VSTACK`, `HSTACK`, `FILTER`, `XLOOKUP`, `UNIQUE`, `SORT`, `MAKEARRAY`).

**Spec:** `docs/superpowers/specs/2026-11-22-acquisitionlog-formula-design.md`

## Global Constraints

- Row 1 headers exactly, in order: `nikke`, `confidence`, `release`, `firstCopy`, `lb1`, `lb2`, `lb3`, `c1`, `c2`, `c3`, `c4`, `c5`, `c6`, `c7`, `totalCopies`, `untracked`, `tracked` (A:Q).
- Row 2: blank in A:C and O:Q, `1` to `11` in D:N.
- Slot text: `TEXT(date, "yyyy-mm-dd") & CHAR(10) & source`, unknown copy `?`, slot above N blank.
- `confidence`: `untracked` 0 `Perfect`, ≤2 `Good`, ≤5 `Approx`, else `Unknown`.
- Inputs: `NikkeDatabase` B `name`, C `rarity`, J `releaseDate`; `RosterLog` A `date`, C `name`, D `copies`; `AllPulls` A `date`, B `ssr`, C `source`, E `copy`, F `isOvercore`.
- Work on the test copy first (`VITE_GACHA_SHEET_ID` in `ui/.env.local`). The owner clears old contents by hand. Writing a formula cell through the Sheets connector needs the owner's yes each time.
- No git commits: the owner commits by hand.

## Review Focus

1. A pull logged under a name that isn't the `NikkeDatabase` name (a collab rename) isn't found, so that Nikke shows only `?`. The name sweep (`cli` step 2) is the fix; check in Task 1 Step 4 that no row is all `?` with `tracked` 0 when AllPulls has that Nikke.
2. More non-overcore pulls than N: only the latest N show, `tracked` = N, `untracked` 0. Checked in Task 1 Step 4.
3. A pull saved after the last `watch` run: N comes from AllPulls `copy`, so the latest pull sits in the new top slot. Checked in Task 1 Step 5.
4. Two pulls of one Nikke on the same date keep AllPulls order (the later one in the higher slot). `FILTER` keeps sheet order; checked by reading the formula.
5. A blank `releaseDate` sorts to the top. Accepted; the owner fills release dates by hand.

---

### Task 1: Formula on the test copy

**Files:** none in the repo. Sheet: test copy, tab `AcquisitionLog`.

**Interfaces:**
- Consumes: the inputs in Global Constraints. AllPulls `copy` is blank on or before the RosterLog baseline.
- Produces: `AcquisitionLog` A:Q. Nothing reads it.

- [ ] **Step 1: The owner clears `AcquisitionLog`** on the test copy by hand (the old per-row formulas, all of them).

- [ ] **Step 2: Put this formula in `AcquisitionLog!A1`** (the starting draft; fix syntax on the sheet if needed):

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
  list, SORT(HSTACK(own, XLOOKUP(own, dbN, dbD, "")), 2, TRUE),
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

Notes for whoever fixes it: slot k holds pull number `p − (N − k)` in AllPulls order, so the latest pull (number p) lands in slot N. `XLOOKUP(..., 0, -1)` searches from the bottom, giving the last RosterLog row and the last AllPulls row. If `REDUCE` + `VSTACK` is too slow, the fallback is `MAKEARRAY` over all 17 columns, at the cost of recomputing `pulls` per cell.

- [ ] **Step 3: Check the shape.**
  - Row 1 and row 2 match Global Constraints.
  - Rows below are SSRs only and sorted by `release`. `=COUNTA(A3:A)` equals the number of distinct RosterLog names that are SSR in NikkeDatabase.
  - No cell shows an error: `=SUMPRODUCT(--ISERROR(A3:Q))` gives 0 (scratch cell, delete afterwards).
  - `totalCopies` = `untracked` + `tracked` on every row, and the number of non-blank slots equals `totalCopies` (or 11 when it's above 11).

- [ ] **Step 4: Spot checks against the game and AllPulls.**
  - Laplace (11 copies in RosterLog): `totalCopies` 11, `c7` holds her latest non-overcore pull.
  - A Nikke with an overcore in AllPulls (`isOvercore` TRUE): that pull's date/source doesn't appear in her slots.
  - A Nikke with more non-overcore pulls than copies: `untracked` 0, `firstCopy` is a pull, not `?`.
  - A Nikke with fewer pulls than copies: the bottom slots are `?`, `confidence` matches its band.
  - No row has `tracked` 0 while `=COUNTIF(AllPulls!B:B, <name>)` > 0 (Review Focus 1).

- [ ] **Step 5: Check a fresh pull (test copy only).** The owner adds a temporary `Social` row today with a Nikke at under 11 copies. Expected: her `totalCopies` goes up by 1 and the new pull sits in the new top slot, before any `watch` run. The owner then deletes the temporary row.

### Task 2: Record it and go live

**Files:**
- Modify: `docs/superpowers/specs/2026-11-22-acquisitionlog-formula-design.md` (add a `## Formula` section at the end)

- [ ] **Step 1: Add `## Formula`** with the formula exactly as it works on the test copy, in a fenced block.

- [ ] **Step 2: Mark step 6.7 done** in `docs/superpowers/specs/2026-11-21-gacha-tracker-design.md`: append `Built: \`2026-11-22-acquisitionlog-formula-design.md\`.` to its line.

- [ ] **Step 3: The owner pastes it into the real sheet** after clearing the old `AcquisitionLog`, then repeats Task 1 Steps 3 and 4. This is needed before release.
