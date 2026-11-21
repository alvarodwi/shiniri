# Overcore on save (ui)

Step 6.5 of `2026-11-21-gacha-tracker-design.md`. Small change. Decided with the owner on
2026-11-21 and 2026-11-22.

## Why

When a gacha save includes a copy past C7, the owner wants the `Overcored` row added without typing
it, and a remark that rubs it in. The "congratulation" is sarcastic: salt in the wound, scaled to
how much that source hurts.

## What

On every save from the six gacha pages (Social, Event, Ordinary, Molds, SpareBody, Other):

1. Before writing, read `'AllPulls'!B:E` and `'RosterLog'!A:D` from the gacha sheet.
2. For each SSR in the save, in entry order, work out its copy number:
   - start = the Nikke's last `copy` in AllPulls (the lowest row with its name). If that's blank
     (its last pull is on or before the baseline) or it has no row, use its baseline copies: its
     `copies` in the first RosterLog row dated on the earliest RosterLog date, else 0.
   - each occurrence in this save adds 1 (two Noah in one save are start + 1 and start + 2).
   - a save dated on or before the baseline date checks nothing. AllPulls gives those pulls no copy
     number either.
3. Every copy above 11 becomes one `Overcored` row, written in the same `writeTabsAtEnd` call as the
   session row, so both land or neither does.
4. After a successful save the page shows one remark under its "Saved to …" line.

The sheet formula stays the only place that counts copies (owner: "I trust in sheet formula").

### Overcored rows

`OVERCORED_TAB` headers, exactly as on both sheets: `date`, `from`, `ssr`, `manufacturer`, `notes`.

| header | value |
| --- | --- |
| `date` | the session's date |
| `from` | the tab name: `Social`, `Event`, `Ordinary`, `Molds`, `SpareBody`, `Other` (owner: follow the tab name, like AllPulls) |
| `ssr` | the Nikke's name as picked |
| `manufacturer` | `NikkeDatabase` `manufacturer`, title-cased (`MISSILIS` → `Missilis`) to match the hand rows |
| `notes` | blank; the owner adds comments by hand |

Hand rows dated up to the baseline keep feeding AllPulls' historical `isOvercore`. App rows are
dated after it, so the formula never counts them twice.

### Pain levels

From the owner's order: other = social < ordinary = common mold < event < manufacturer mold < perfect
mold < sparebody, with Gold Mileage the worst. Social is level 1: its currency comes from logging in
every day.

| level | source |
| --- | --- |
| 1 | Other, Social |
| 2 | Ordinary; `Yellow Mold`, `Purple Mold`, `HQ Mold` |
| 3 | Event |
| 4 | `Pilgrim Mold`, `Missilis Mold`, `Elysion Mold`, `Tetra Mold` |
| 5 | any `… Perfect Mold`, `HQ Perfect Mold` included |
| 6 | SpareBody with `Silver Mileage` or `Union Chip` |
| 7 | SpareBody with `Gold Mileage` |

- A Pilgrim overcore never changes the line: the line always fits the source (owner, 2026-11-22: a Pilgrim Perfect Mold overcore got SpareBody's "You bought…" line, and molds aren't bought). Pilgrim pain shows as the Pilgrim line instead.
- A save with several overcores gets one remark, from its most painful one, naming all of them.

### Remarks

`ui/src/config/overcoreLines.ts` holds the lines, so the owner can make them worse without touching
logic: a few lines per level, picked at random, plus one Pilgrim line appended when any overcore in the
save is a Pilgrim. `{who}` is the Nikke and its core label: copy 12 is `C8`, copy 13 `C9` (copy − 4), so
`Rapi C8`. With several overcores it's a list: `Noah C8, Noah C9 and Liter C8` (my call). Each
overcore pays 6000 Body Labels. Starting lines (one per level, owner polishes):

1. `{who}, from a freebie. 6000 Body Labels, I guess.` (Other and Social)
2. `{who} again. Here's 6000 Body Labels for the trouble.`
3. `Your gem hoard, converted: {who}. 6000 Body Labels.`
4. `You picked the manufacturer. The manufacturer picked {who}.`
5. `A Perfect Mold, perfectly wasted on {who}.`
6. `You bought {who}. With your own hands.`
7. `Gold Mileage, spent on {who}. Nobody did this to you.`
- Pilgrim: `And she's a Pilgrim.`, appended when any overcore in the save is a Pilgrim.

## Failure handling

- If the AllPulls or RosterLog read fails, or their headers aren't what's expected, the save fails
  with that error and nothing is written (my call: a save that silently skipped its Overcored row
  would leave a hole the owner wouldn't notice). The form keeps its entry, so a retry is one tap.
- If RosterLog is empty there's no baseline, so nothing is checked and the save goes through.

## Approaches

- **A. Read AllPulls at save (picked).** One count, kept in the sheet formula. Costs one more
  read per save.
- B. Count again in TypeScript from the six tabs: duplicates the formula, and the two would drift.
- C. `watch` adds Overcored rows from `isOvercore`: no remark at save time, up to an hour late.

## Builder's calls

- One shared helper used by all six stores, in `src/services/overcore/`, with a store-side `remark`
  that the pages show. Randomness is injectable for tests.
- Mock mode doesn't compute formulas, so `MOCK_SHEETS` gets a hand-written `AllPulls`, `RosterLog`
  and `Overcored`.
- A backdated save (after the baseline but before the newest AllPulls row) uses "last copy + n",
  which can differ from where the formula places it. Fine for one person logging on the day;
  `shortcut:` comment.

## Mock scenarios (owner's ask)

The mock fixtures reproduce the two most painful overcores, and `ui/CLAUDE.md` (Reviewing the UI)
documents them step by step so a browser test can replay them:

1. **Level 7:** SpareBody, `Gold Mileage`, target `Rapi`, 1 copy. Rapi is at copy 11 in the mock
   AllPulls and RosterLog, so the save writes one Overcored row (`from` `SpareBody`, `manufacturer`
   `Elysion`) and shows a level 7 remark with `Rapi C8`.
2. **Level 5 + Pilgrim:** Molds, `Pilgrim Perfect Mold`, result `Noah`. The mock NikkeDatabase gains `Noah`
   (`PILGRIM`) at copy 11, so the save writes one Overcored row (`from` `Molds`, `manufacturer`
   `Pilgrim`) and shows a level 5 (Perfect Mold) remark ending with the Pilgrim line.

The mock RosterLog baseline is dated well before today (the forms default to today's game day), so
both saves fall after it. The mock AllPulls is static (formulas aren't computed), so repeating a
scenario shows C8 again rather than C9. A reload resets the mock sheet.

## Manual sheet steps

None. The `Overcored` headers are already renamed on both sheets. Check row 1 reads `date`,
`from`, `ssr`, `manufacturer`, `notes` on the real sheet before release.

## Not in scope

Warning before a SpareBody purchase (the copy is bought in game before it's logged), and editing
remarks in the app.
