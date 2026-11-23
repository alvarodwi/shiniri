# 0004 Sheet names changed in one cutover, no old-name support

## Context
Tabs and headers were renamed to lowerCamelCase names (see `../../CLAUDE.md`). The owner renames the
live sheet by hand, which takes 15-30 minutes.

## Decision
One branch for `ui/` and `cli/`, one cutover. While the owner renames, saves and `watch` fail the
header check and write nothing. Meaning of names: `date` is the in-game day, `...At` is a real
timestamp, `weakness` and `bossElement` stay distinct. Old `AllPulls` source values stay valid
through the owner's `SWITCH` formula, so no logged row is edited.

## Rejected
- Rollout in batches (Gacha, then Journal, then CLI): three cutovers and mixed names in between.
- Accepting old and new headers: alias code in both writers to delete later, and it loosens the
  exact header check the contract relies on.
- Keeping old UI routes: one user, so old bookmarks were not worth it.
