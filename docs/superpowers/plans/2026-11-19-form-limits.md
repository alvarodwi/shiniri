# Form Limits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tighten the Anomaly, Gear and Level limits and keep every form limit in
`src/config/limits.ts`.

**Architecture:** One constants file, imported by the stores, row helpers and pages that used local
numbers.

**Tech Stack:** Vue 3, Pinia, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-19-form-limits-design.md`

## Global Constraints

- Values, exact: Anomaly runs 5 / 10, gear 10, level step 5, level jump 20 levels, solo raid
  placement 100 (was 500).
- Afterwards, `grep -rnE 'MAX_RUNS|NORMAL_LIMIT|MAX_COUNT|MAX_STEPS|MAX_PLACE|max="100"|step="5"|1-500' src`
  finds nothing outside `limits.ts`.
- No commits until the owner says "commit and merge".
- Checks: `yarn format && yarn lint && yarn check && yarn build && yarn test`.

## Review Focus

- Turning Double day off after editing runs 6-10: Save writes exactly 5 runs. Test in Task 1.
- Turning Double day on: 10 runs are saved, with runs 6-10 picking up the carried-forward boss and
  stage. Covered by the existing double-day test, updated in Task 1.
- Gear count 11, or `NaN`, clamps to 10, or 1 for `NaN`. Test in Task 1.
- Level 780 → 800 is allowed and → 805 is refused, with the hint naming 20 levels. Test in Task 1.

---

### Task 1: Limits file and all users

**Files:** Create `src/config/limits.ts`. Modify `src/stores/anomalyStore.ts` (+ test),
`src/pages/Anomaly.vue`, `src/stores/gearStore.ts` (+ test), `src/pages/Gear.vue`,
`src/services/level/levelRows.ts` (+ test), `src/stores/levelStore.ts`, `src/pages/Level.vue`,
`src/services/soloRaid/soloRaidRows.ts`, `src/pages/SoloRaid.vue`, and
`docs/superpowers/specs/2026-11-19-level-logs-design.md`.

**Interfaces (produces):** `ANOMALY_RUNS: { normal: number; double: number }`,
`GEAR_MAX_ITEMS`, `LEVEL_STEP`, `LEVEL_MAX_JUMP` (levels), `SOLO_RAID_MAX_PLACE`.
`anomalyStore` loses `runCount` and `setRunCount`; `activeRuns` becomes
`runs.slice(0, dailyLimit)`.

- [ ] **Step 1: Update the tests first:**
  - anomalyStore: remove the clamp test and the `runCount` assertions. Add: after
    `setDoubleDay(true)`, editing run 7, then `setDoubleDay(false)`, `activeRuns` has length 5 and
    a save writes 5 rows.
  - gearStore: `'clamps the count to 1..10'` (`setCount(11)` gives 10, `setCount(NaN)` gives 1).
  - soloRaidRows: `rankText('place', '100')` gives `"'#100"`; `'101'` gives null (the old `'501'`
    case moves to `'101'`).
  - levelRows: `levelSteps(780, 800)` gives `[785, 790, 795, 800]`; `levelSteps(780, 805)`,
    `(210, 710)` and `(210, 225_000_000)` give `[]`. The 100-step test is replaced.
- [ ] **Step 2:** `yarn vitest run src/stores src/services/level` → FAIL.
- [ ] **Step 3:** Add `limits.ts` and point every user at it. In the Anomaly page, remove the Runs
      input and its handler; Save reads `Save {dailyLimit} runs`. SoloRaid hint: `Placement 1-100` (from the constant). Level hint, exact:
      `Enter a multiple of 5 above {last}, at most 20 levels.` (both numbers from the constants).
      Update the Level design doc's cap line.
- [ ] **Step 4:** Run the full checks and the grep from Global Constraints → all pass, grep empty.
- [ ] **Step 5:** `yarn dev:mock` plus a headless Chrome dump of `#/anomaly`: no "Runs" box, and the
      Save button reads "Save 5 runs".
