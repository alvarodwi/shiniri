# Form limits (short design)

## Why

Using the forms showed three limits that were too loose. The owner also wants every such limit in
one file, so a future game change (a higher daily cap, say) is a one-line commit there.

## Changes (owner's)

- **Anomaly runs are fixed at the daily limit:** 5, or 10 on a double day. The "Runs" box goes away
  and Save always writes the full limit. A day with fewer runs can't be logged from the app.
- **Gear items per save: at most 10** (was 100). Bigger hauls go in as several saves.
- **Level jumps: at most 20 levels** (4 steps of 5; was 100 steps). The game rewards 20-level
  milestones (801, 821, 841), so a bigger jump in one log is a typo.

## Approaches

- **One `src/config/limits.ts` that every store, row helper and page imports (picked, owner's
  ask).**
- Keep each constant next to its code. Rejected: that's how things are now, and the owner wants
  one place to change.

## Design

`src/config/limits.ts`, one commented constant per game or app limit:

- `ANOMALY_RUNS = { normal: 5, double: 10 }`
- `GEAR_MAX_ITEMS = 10`
- `LEVEL_STEP = 5`, `LEVEL_MAX_JUMP = 20` (levels, not steps)
- `SOLO_RAID_MAX_PLACE = 100` (was 500): only the top 100 show on the in-game leaderboard. A rank
  below that is logged as a top-%.

Users (no other copies of these numbers stay in `src/`):

- `anomalyStore`: `runCount`, `setRunCount` and the Runs input are removed. `activeRuns` is the
  first `dailyLimit` runs.
- `gearStore` clamp and `Gear.vue` `max`.
- `levelRows` (`levelSteps`), `levelStore` (default target `last + LEVEL_STEP`), and `Level.vue`
  (`step`, hint "at most 20 levels").
- `soloRaidRows` and the `SoloRaid.vue` hint ("Placement 1-100").

The Level design doc's 100-step note is updated. The 100 in the solo raid top-% check stays: it's
what a percentage means, not a game limit.
