# Gacha tracker (cli, ui) — roadmap

The map for every gacha step. Each step still gets its own spec and plan; this file holds what is
already decided so the next iteration starts without re-asking. Decided with the owner on
2026-11-21.

## Why

The owner logs gacha sessions by hand into the Nikke Gacha Tracker spreadsheet. shiniri takes
that over: the web app logs sessions, the cli keeps the Nikke metadata the pages pick from, and a
future dashboard reads both. The live roster site is shelved (nikkehub.com does it); shiniri adds
only the owner's own tracking.

## The spreadsheet

- A separate spreadsheet from the progression journal. Its id goes in the cli's
  `config/sheets.json` and the ui's env. The service account used for progression is shared on
  it (prod already; the owner adds it to the test copy).
- Development uses the test copy, never prod.
- Gacha tabs: `Social`, `Event`, `Ordinary`, `Molds`, `SpareBody`, `Other`. They stay, one row per
  session in each tab's own columns. SpareBody and Other were restructured; see
  `2026-11-21-sparebody-other-design.md`.
- Before a tab gets a page, the owner renames its headers to lowerCamelCase and flattens 2-row
  headers (`Resources Used` over `Gems`/`Tix` becomes `gems`, `tix`), on both sheets.
- Several rows share a date (Social in the morning, Event twice later). Gacha rows are never
  deduped by date.
- `NikkeDatabase` `name` cells may be renamed by hand (collab full names), and `releaseDate` is
  filled by hand. The cli keys on `nameCode`, so renames are never re-appended.
- Tabs the owner keeps by hand, untouched by shiniri: `Stats`, `AcquisitionLog`, `NikkeRoster`
  (to be replaced by `NikkeDatabase`), `AllPulls`, `DupeTracker`, `Overcored`,
  `Spending`, `CostumeGallery`, and the `*Csv` / `Molds23` tabs. Step 6 takes over several of them.

## Steps, in order

1. **cli: `NikkeDatabase` tab + `AuditLog` on the gacha sheet.** Spec:
   `2026-11-21-nikke-database-cli-design.md`.
2. **cli: name sweep.** A read-only report of every name in the gacha tabs' result columns that
   isn't a `name` in `NikkeDatabase`. The owner fixes rows by hand.
3. **Release dates and collab aliases, by hand on the sheet.** No script. Spec:
   `2026-11-21-collab-aliases-design.md`.
4. **ui: gacha sheet wiring.** A second entry in `SPREADSHEETS` with its own `AuditLog` and env var.
   The pages read `NikkeDatabase` for name pickers and `ui/public/img/nikke/si/` icons (by
   `resourceId`). Spec: `2026-11-21-gacha-sheet-ui-design.md`. It adds the reader and icon helper;
   the shared picker component is built in step 5's Social page.
5. **ui: one page per gacha tab, one spec each.** Social first (simplest), then the rest. Names come
   from the picker only, so new rows always match `NikkeDatabase`.
6. **The remaining tabs**, in this order, decided with the owner on 2026-11-21:
   1. `RosterLog` (cli): a change log of copies per Nikke from `GetUserCharacters`. Spec:
      `2026-11-21-roster-log-design.md`. Its first run is the baseline for steps 3 to 5.
   2. `tools/cdn.py` (cli): print the CDN URL for a path. Spec: `2026-11-21-cdn-url-tool-design.md`.
   3. `AllPulls`: rebuilt as one sheet formula over the six gacha tabs, one SSR per row. No writer.
   4. `DupeTracker`: revived as a formula over `RosterLog` and `AllPulls`. Unused dupes =
      MIN(baseline + pulls since baseline, 11) − current copies. A negative value means a missed log.
   5. Overcore on save (ui): a pulled copy numbered 12 or higher (baseline copies + pulls since)
      gets a congratulation and an `Overcored` row in the same write. Hand rows already there stay.
   6. `Spending` page (ui), a form. Headers already renamed on both sheets.
   7. `AcquisitionLog`: fix its formulas, and fill the pre-tracking `?` cells from the baseline.
   8. Later: `CostumeGallery` (waits on medium image URLs) and the dashboard, which reads
      `Spending` and the rest.
   Everything else in the hand-kept list below is to be dropped.

## Picker pools

Each page's picker offers only the Nikkes that source can give, filtered on `NikkeDatabase`
columns. Rules from the owner, 2026-11-21 (compare `manufacturer` case-insensitively):

- All pages: `rarity` is `SSR` (the tabs count SSRs).
- `Social`: no `ABNORMAL`, no `PILGRIM`.
- `Event`: `ABNORMAL` only when the banner's `rateUpType` is `Collaboration Limited`. `PILGRIM`
  allowed.
- `Ordinary`: `PILGRIM` allowed, no `ABNORMAL`.
- `Molds`: rules differ per mold type (a Pilgrim mold can give Pilgrim). Settled in its own spec.
- `SpareBody` and `Other`: settled in `2026-11-21-sparebody-other-design.md`.

`rateUpType` exists only on the `Event` tab. How it is entered (typed, picked from a list, and what
it does to the picker) is an open question for the Event spec's brainstorm; its header text is asked
for there, not guessed. Social is built (filter in `socialStore.ssrNikkes`); when Event or Ordinary arrives, lift
the shared part out of that getter rather than copying it.

## Not in scope

- Live roster, investment status, full or medium Nikke art.
- Any edit to existing rows, including filling blank cells.
