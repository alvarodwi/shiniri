# AllPulls Formula Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One formula in `AllPulls!A1` lists every SSR from the six gacha tabs, one per row, with `spook`, `copy` and `isOvercore`.

**Architecture:** Sheet-only. A `LET` with one `LAMBDA` (`ex`) that explodes one tab's SSR lists into rows. `VSTACK` stacks the six tabs, `SORT` orders them on date plus a tiebreak key, and `MAP` adds `copy` from the RosterLog baseline. No repo code changes; the checked formula goes into the spec.

**Tech Stack:** Google Sheets functions (`LET`, `LAMBDA`, `MAP`, `MAKEARRAY`, `SPLIT`, `TOCOL`, `VSTACK`, `HSTACK`, `XLOOKUP`, `XMATCH`).

**Spec:** `docs/superpowers/specs/2026-11-21-allpulls-formula-design.md`

## Global Constraints

- Headers exactly `date`, `ssr`, `source`, `spook`, `copy`, `isOvercore`, in that order. A:C must stay `date`, `ssr`, `source` (AcquisitionLog reads them).
- `source` values are the tab names verbatim: `Social`, `Event`, `Ordinary`, `Molds`, `SpareBody`, `Other`.
- Split on `", "` as a whole delimiter (`SPLIT(..., ", ", FALSE)`), never on each character: `Red Hood` must stay one name.
- Work on the test copy first. The owner clears old `AllPulls` contents by hand. Writing the formula cell through the Sheets connector needs the owner's yes each time.
- No git commits: the owner commits by hand.

## Review Focus

1. A source tab with no SSR rows makes its `FILTER` return `#N/A` and breaks the whole tab. All six tabs have rows on both sheets today, so this is accepted. If it ever shows `#N/A`, wrap `ex`'s `FILTER` in `IFERROR`. No test.
2. The one text date in Molds (`2025-06-11`) must sort by its date, not at the top or bottom. Checked in Task 1 Step 4.
3. Pulls dated on the baseline day get a blank `copy` (spec rule). Checked in Task 1 Step 5.
4. A Nikke with two RosterLog rows on the baseline date takes the first. `XLOOKUP` returns the first match. Checked by reading the formula.
5. Stray spaces around a name (`Drake `) would stop it matching RosterLog. `TRIM` each name. Checked in Task 1 Step 4.

---

### Task 1: Formula on the test copy

**Files:** none in the repo. Sheet: test copy (`VITE_GACHA_SHEET_ID` in `ui/.env.local`), tab `AllPulls`.

**Interfaces:**
- Consumes: the tabs and columns in the spec's table; `RosterLog` A (`date`), C (`name`), D (`copies`).
- Produces: `AllPulls` A:F, which DupeTracker and overcore on save read later.

- [ ] **Step 1: The owner clears `AllPulls`** on the test copy by hand (the old 3300-row grid and its broken formula).

- [ ] **Step 2: Put this formula in `AllPulls!A1`** (the starting draft; fix syntax on the sheet if needed):

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
  oc, MAP(cp, LAMBDA(c, IF(c = "", "", c > 11))),
  VSTACK({"date", "ssr", "source", "spook", "copy", "isOvercore"}, HSTACK(s, cp, oc))
)
```

Notes for whoever fixes it: tabs without a rate-up pass their date column as `rate` with `hasRate` FALSE, so `HSTACK` sizes match. The `SEQUENCE` column is the tiebreak (source order, then row, then list order), so `SORT`'s stability doesn't matter. Format column A as a date.

- [ ] **Step 3: Check counts.** In a scratch cell, `=COUNTIF(AllPulls!C:C, "Social")` and so on.
Expected: Social 74, Event 265, Ordinary 116, Molds 301, SpareBody 61, Other 45 (862 rows below the header). Event is 265 even though Event row 122's `totalSsr` says 1. Delete the scratch cells afterwards.

- [ ] **Step 4: Spot checks.**
  - The Molds `2025-06-11` row sits among the other 2025-06-11 rows.
  - An Event row whose SSR equals its `rateUpName` has `spook` FALSE; another SSR in the same row has TRUE.
  - Social, Ordinary, Molds and SpareBody rows have blank `spook`.
  - No `ssr` cell has a leading or trailing space: `=SUMPRODUCT(--(AllPulls!B2:B <> TRIM(AllPulls!B2:B)))` gives 0.
  - AcquisitionLog has no new errors.

- [ ] **Step 5: Check `copy` with a temporary row (test copy only).** Every pull today is on or before the baseline, so `copy` and `isOvercore` should all be blank. Then the owner adds a temporary `Social` row dated the day after the RosterLog baseline, with `ssrDetails` `Laplace, Rapi` (Laplace is 11 copies in RosterLog).
Expected: Laplace's row shows `copy` 12 and `isOvercore` TRUE. Rapi shows her baseline copies + 1. A Nikke missing from the baseline would show 1. The owner then deletes the temporary row and the two rows vanish from AllPulls.

### Task 2: Record it and go live

**Files:**
- Modify: `docs/superpowers/specs/2026-11-21-allpulls-formula-design.md` (the `## Formula` section)

- [ ] **Step 1: Replace the placeholder line** under `## Formula` with the formula exactly as it works on the test copy, in a fenced block.

- [ ] **Step 2: The owner pastes it into the real sheet** after clearing the old `AllPulls`, then repeats Task 1 Steps 3 and 4. Real counts may be higher than the test copy's, but each count must equal that tab's number of names.
