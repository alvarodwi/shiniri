# Overcore History and DupeTracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AllPulls flags historical overcores from the `Overcored` tab, and a new DupeTracker formula lists unused dupes and missed logs.

**Architecture:** Sheet-only. The AllPulls `LET` gets new `oc`, `srcs` and `Overcored` bindings; DupeTracker is a separate `LET` over `RosterLog` and `AllPulls`. No repo code changes.

**Tech Stack:** Google Sheets (`LET`, `MAP`, `XLOOKUP` with search mode -1, `SUMPRODUCT`, `SWITCH`, `UNIQUE`).

**Spec:** `docs/superpowers/specs/2026-11-21-overcore-history-dupetracker-design.md`

## Global Constraints

- DupeTracker headers exactly `nikke`, `copies`, `expected`, `unused`. AllPulls headers unchanged.
- `from` mapping exactly: `Social Pulls` → `Social`, `Event Banner` → `Event`, `Other Banner` → `Other`, else unchanged.
- Test copy first. The owner clears the old DupeTracker by hand.
- No git commits: the owner commits by hand.

## Review Focus

1. Overcored rows with a trailing space in `ssr` or `from` would miss their pull. `TRIM` both. Checked in Task 1 Step 3 (the match count).
2. A same-day group with more pulls than Overcored rows must flag the later ones, not the earlier ones. Checked in Task 1 Step 3.
3. A Nikke whose latest pull is before the baseline must use its baseline copies, not a blank `copy`. Checked in Task 2 Step 3.
4. An empty DupeTracker result must show just the header, not `#N/A`. Checked in Task 2 Step 3.
5. A Nikke first owned after the baseline with no logged pull shows `unused` -1. Checked by reading the formula: the baseline lookup falls back to 0.

---

### Task 1: AllPulls historical `isOvercore`

**Files:** sheet only (test copy, `AllPulls!A1`). Then `## Formulas` in the spec.

- [ ] **Step 1: Edit the formula.** Starting from the formula in `2026-11-21-allpulls-formula-design.md` `## Formulas`, add these bindings after `bc` and replace the `oc` line:

```
  srcs, CHOOSECOLS(s, 3),
  ok, LEN(Overcored!C2:C),
  od, MAP(FILTER(Overcored!A2:A, ok), LAMBDA(x, IF(ISTEXT(x), DATEVALUE(x), x))),
  on, MAP(FILTER(Overcored!C2:C, ok), LAMBDA(x, TRIM(x))),
  of, MAP(FILTER(Overcored!B2:B, ok), LAMBDA(x, SWITCH(TRIM(x), "Social Pulls", "Social", "Event Banner", "Event", "Other Banner", "Other", TRIM(x)))),
  oc, MAP(SEQUENCE(n), LAMBDA(i, IF(INDEX(cp, i) <> "", INDEX(cp, i) > 11, LET(
    d, INDEX(dates, i), nm, INDEX(names, i), sr, INDEX(srcs, i),
    SUMPRODUCT((SEQUENCE(n) > i) * (dates = d) * (names = nm) * (srcs = sr))
      < SUMPRODUCT((od = d) * (on = nm) * (of = sr)))))),
```

- [ ] **Step 2: Paste on the test copy** and confirm no error cell.

- [ ] **Step 3: Check.**
  - `=COUNTIF(AllPulls!F:F, TRUE)` equals the number of Overcored rows minus the unmatched ones. 66 − 1 before the Molds restore; recount after it, since the restored rows may have matched Centi.
  - `2025-02-20 Cinderella (Molds)`: two TRUE. `2025-05-01 Pepper (Molds)`: two TRUE.
  - In the one group with more pulls than Overcored rows, the TRUE rows are the last ones of the group.
  - Rows after the baseline still follow `copy` > 11.

- [ ] **Step 4: Record** the full working AllPulls formula in the AllPulls spec's `## Formulas` section (replace it) and note there that `oc` now reads Overcored.

### Task 2: DupeTracker

**Files:** sheet only (test copy, `DupeTracker!A1`). Then `## Formulas` in this plan's spec.

- [ ] **Step 1: The owner clears DupeTracker** by hand.

- [ ] **Step 2: Paste into `DupeTracker!A1`** (starting draft):

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
  t, HSTACK(nikkes, cur, exp, exp - cur),
  VSTACK({"nikke", "copies", "expected", "unused"},
    IFERROR(SORT(FILTER(t, CHOOSECOLS(t, 4) <> 0), 4, FALSE), {"", "", "", ""}))
)
```

- [ ] **Step 3: Check.**
  - Today (no unused dupes, every pull on or before the baseline) it shows only the header, or only Nikkes the owner knows are off.
  - On the test copy only: add a temporary Social row dated after the baseline with an owned Nikke below C7. Expected: that Nikke shows `unused` 1. Delete the row, and it disappears.
  - A Nikke whose last pull is before the baseline shows `expected` = its baseline copies (pick one from RosterLog and check by eye after the temporary row).

- [ ] **Step 4: Record** both formulas in this spec's `## Formulas` section, then the owner pastes both on the real sheet (clearing DupeTracker first) and repeats Task 1 Step 3's counts there.
