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
  session in each tab's own columns. Other mixes freebies and step-up recruits; that stays.
- Before a tab gets a page, the owner renames its headers to lowerCamelCase and flattens 2-row
  headers (`Resources Used` over `Gems`/`Tix` becomes `gems`, `tix`), on both sheets.
- Several rows share a date (Social in the morning, Event twice later). Gacha rows are never
  deduped by date.
- `NikkeDatabase` `name` cells may be renamed by hand (collab full names), and `releaseDate` is
  filled by hand. The cli keys on `nameCode`, so renames are never re-appended.
- Tabs the owner keeps by hand, untouched by shiniri: `Stats`, `AcquisitionLog`, `NikkeRoster`
  (to be replaced by `NikkeDatabase`), `AllPulls`, `DupeTracker` (likely deleted), `Overcored`,
  `Spending`, `CostumeGallery`, and the `*Csv` / `Molds23` tabs.

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
6. **Later:** a `Roster` history tab from `GetUserCharacters` (append-only, so dated snapshots, not a
   current roster), `Spending`, then the dashboard.

## Not in scope

- Live roster, investment status, full or medium Nikke art.
- Any edit to existing rows, including filling blank cells.
