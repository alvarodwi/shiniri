# Collab aliases and release dates (sheet only)

Replaces step 3 of `2026-11-21-gacha-tracker-design.md`. Small change, no code.

## Why

Step 3 planned a `tools/` script that fetches release dates, but no source was found. The name
sweep also shows collab units logged by full name (`Asuka Shikinami Langley`) while `NikkeDatabase`
has the source's short name (`Asuka`), and two names clash (`Rei`: 5069, 5119; `Sakura`: 1012,
3015). The gacha pages and the dashboard need one unambiguous name per Nikke.

## Decision (owner, 2026-11-21)

Aliases live on the sheet only. The owner renames collab `name` cells in `NikkeDatabase` by hand.
Release dates come from a one-off VLOOKUP out of `NikkeRoster`, pasted as values. No script, no
config file, no ui change: the ui pickers read `NikkeDatabase` `name`, and icons go by `resourceId`,
so a renamed name still shows the right icon.

Why this is safe: the `watch` writer keys on `nameCode` (column A), so a renamed `name` cell is not
re-appended, and nothing ever updates existing rows.

## Findings (test copy, 2026-11-21)

- `NikkeRoster` has 164 rows with `Release Date`; 157 match a `NikkeDatabase` `name` exactly. The
  rest are the collab full names and `Eve` (database has `EVE`). `Elegg: Boom And Shock` differs only
  by case, which VLOOKUP ignores.
- No date exists for the 13 most recent SSRs (`Marciana: Marine Study` through `Yukiko`) or for
  SR/R units.
- Collabs are `corporation` `ABNORMAL` (28 units).
- `EVE` and `Asuka: WILLE` are in `nikke_list_en.json`; the name-sweep spec's note that `Eve` is
  missing from the source is wrong.

## Approaches

- **A. Sheet only (picked).** Zero code, nothing to keep once `NikkeRoster` is deleted.
- B. `cli/config/aliases.json` applied by `watch`: the 207 existing rows still need the hand rename
  (append-only), and two places would hold the same names.
- C. A `tools/` TSV script joining `NikkeRoster`: same job as a VLOOKUP, dead once `NikkeRoster` goes.

## Manual sheet steps (owner; test copy first, prod before release)

1. In `NikkeDatabase` `name`, rename collab rows to the names already logged: 5118
   `Asuka Shikinami Langley`, 5119 `Rei Ayanami`, 5120 `Mari Makinami Illustrious`, 5133
   `Asuka Shikinami Langley: Wille`, 5132 `Rei Ayanami (Tentative Name)`, 5142 `Eve` (optional).
   Choose a distinct name for 3015 `Sakura` and any other collab as wanted. Exact text is the
   owner's; never guessed.
2. In `NikkeDatabase` `J2`: `=IFERROR(VLOOKUP(B2,NikkeRoster!A:G,7,FALSE),"")`, fill down, then copy
   column J and paste values only, so it survives deleting `NikkeRoster`.
3. Type the dates `NikkeRoster` lacks, as wanted.
4. Fix typo cells in the gacha tabs: `Event!B145` (`Belora: Pumpkin Witch`), `Molds!E269` (`E.H`),
   `Event!B92` (`Little Mermaid (Siren)`, or rename the database row instead).
5. Later collabs arrive with the source's name. The sweep's `duplicate name` line flags clashes;
   rename by hand.

## Verification

- `cd cli && uv run python tools/names.py` on the test copy: no collab lines, no `duplicate name`
  lines, summary `0 unknown names in 0 cells` once the typos are fixed.
- The next `watch` check logs `NikkeDatabase +0`.

## Not in scope

Any code, a config alias file, ui changes, filling dates the owner has no source for.
