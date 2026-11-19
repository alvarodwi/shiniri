# Level logs (short design)

## Why

`LevelLogs` records the date the owner reached each synchro level that is a multiple of 5. It's
used to see how fast the account progresses. Lately the owner sits on one level and then jumps
15-20 levels at once. A jump is logged as one row per 5-level step, all with the same date (for
example 215, 220 and 225 all on 2023-04-30). Writing those rows by hand and pasting the
`daysElapsed` formula is the chore this form removes.

## Sheet shape (real sheet, verbatim)

`LevelLogs` columns: `newSynchroLevel | achievedAt | daysElapsed | note`.

- `daysElapsed` on row N is `=B{N+1}-B{N}`: the days spent at that level before the next one. The
  newest row's cell is left empty until the next level exists.
- `note` is optional and usually empty, as on Anomaly.

## Goals

- A `/level` page: pick the level just reached and the date, add an optional note, and save.
- One save writes every missing 5-level step from the last logged level up to the entered one,
  all with the same date.
- `daysElapsed` fills in on its own, so the owner never pastes formulas again.

## Non-goals

- Editing or back-filling old rows, including the current last row's empty `daysElapsed` (see the
  manual steps).
- A list of logged levels (dashboard territory).
- Solo Raid (next brainstorm).

## Approaches

How the new rows get a `daysElapsed` formula that references their own row numbers:

- **The writer resolves row-dependent cells once it knows the start row (picked).**
  `writeTabsAtEnd` already finds the next empty row in `checkedRange`. A cell may be a function of
  its own sheet row, and the writer calls it after the checks pass. The sheet gets a readable
  `=IF(B231="","",B231-B230)`. This is a small, general change to `services/sheets`, not a
  LevelLogs special case. The owner agreed to it, although CLAUDE.md says new forms shouldn't need
  changes there.
- Row-independent `INDIRECT("R[1]C[-1]",FALSE)` formula. Rejected: unreadable and volatile next to
  the plain formulas in the existing rows.
- The store computes the row number from its own read of column A. Rejected: the writer finds the
  row again later, and if the two disagree the formula points at the wrong rows.

Formula style (owner's pick): guarded `=IF(B{N+1}="","",B{N+1}-B{N})`. It stays blank until the
next save adds the row below, then shows the number. The owner has rewritten every existing
`daysElapsed` cell to this form on both sheets, including the current last row, so the column is
uniform.

## Design

- **Writer:** `WriteTarget.rows` cells may be `(sheetRow: number) => Cell`. `checkedRange` also
  returns the start row. Function cells are resolved per row before the batch write. Plain cells are
  unchanged, so Anomaly and Gear don't change. The column-A check needs a plain value; level is
  always plain. Tests cover a function cell resolving to the right row numbers.
- **Config:** `LEVEL_TAB` in `src/config/sheets.ts`, headers
  `['newSynchroLevel', 'achievedAt', 'daysElapsed', 'note']`.
- **Row logic (`src/services/level/`), pure:**
  - `levelSteps(last, target)`: `[last+5, ..., target]`. Valid only when `target` is a multiple of 5
    and greater than `last`. With no previous level (empty tab), just `[target]`.
  - `toRow(level, date, note)`: `[level, date, (n) => '=IF(B{n+1}="","",B{n+1}-B{n})', note]`. The
    note uses the same leading-apostrophe text guard as Anomaly.
  - `lastLevel(colA)`: the last numeric value in column A, or null.
- **Store (`src/stores/levelStore.ts`):** `load()` reads column A for the last level and defaults
  the target to `last + 5`. `save()` re-reads the last level first (another device may have logged
  since), builds the rows and calls `writeTabsAtEnd(api, [{ tab: LEVEL_TAB, rows }], 'Level')`, then
  reloads. Same status/error shape as the Anomaly store.
- **Page `/level` + nav link:** labelled inputs for date (default `gameDay()`, editable for late
  logging), level reached (number, step 5, default last + 5), and note. A line above Save shows what
  it will write, for example "Last logged: 210. Writes 3 rows: 215, 220, 225". Save is disabled
  while the target is invalid, the date is empty, or the date is before the last row's
  `achievedAt` (that would make its `daysElapsed` negative). Jumps over 4 steps preview as
  "215 … 400". Phone-first; no sheet link on this page (Gear has none either).

## Claude's calls (check these)

- The note goes on the last written row only. Intermediate step rows get an empty note.
- A jump is capped at 100 steps (500 levels), so a typo like 2250000 can't freeze the page. The
  "Writes N rows" preview guards against smaller typos.
- If the last filled cell in column A isn't a number, the page refuses to load: the next rows
  would land below it and the formula above them would subtract against it.
- The date defaults to the game day (reset at 03:00 WIB), matching Anomaly.
- Form name in `AuditLog` is `Level`.

## Manual sheet steps

- Real sheet, before release: confirm row 1 is exactly `newSynchroLevel | achievedAt | daysElapsed |
note`.
- Done by the owner on both sheets: guarded formula in every `daysElapsed` cell, including the last
  row, so no paste is needed after the first app save. Sheet copy headers already adjusted.
