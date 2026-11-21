# Split normal and hard damage in union tables

## Intent
`member` and `boss` add normal and hard damage into one number. Normal mode scales past lv1000, so a season of
normal grinding and a season of real hard hits land in the same column and can't be compared. Keep them apart.

## Goals
- `member`: the per-season damage column becomes `normal dmg` and `hard dmg`, beside the existing hit counts.
- `boss`: `union` / `me` become `union hard`, `union normal`, `me hard`, `me normal`.
- A mode with no hits shows `-`, not `0`, so "didn't play that mode" reads differently from "dealt nothing".

## Non-goals
- `season` recap, `hits`, `normal`, `growth` already keep modes apart; unchanged.
- No wipe of cached exports in `data/exports/union/`; old tables show until rebuilt with `!command`.

## Approaches
- Split columns (picked): nothing is lost; `boss` grows to six columns.
- Hard only (rejected): narrower and matches the recap's top 5, but normal effort vanishes from both views.

## Details
- One small helper sums damage over a list of hits and returns `-` when the list is empty.
