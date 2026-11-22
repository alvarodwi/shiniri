# Sheet Name Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `ui/` and `cli/` write and read the renamed tabs, headers, and `source` values from the spec, so they match the sheets after the owner's manual renames.

**Architecture:** Renames only. Sheet-facing strings live in `ui/src/config/sheets.ts` (TabSpecs), `ui/src/services/overcore/overcore.ts` plus three stores (source values), and the CLI modules' `TAB`/`TABS`/`HEADERS` constants and `cli/tools/names.py`. Tests that spell out ranges like `"'Molds'!A1:F1"` change with them. Nothing changes structurally, and no logic changes except the new `OvercoreSource` literals.

**Tech Stack:** Vue 3 + TypeScript + Vitest (`ui/`, yarn). Python + pytest (`cli/`, uv).

**Spec:** `docs/superpowers/specs/2026-11-22-sheet-name-normalization-design.md`. The tables there are the source of truth for every name. Copy names from them verbatim.

## Global Constraints

- Work on a branch `sheet-name-normalization` off `develop`. It must not reach `develop` before release day: the homeserver pulls `develop` and would start failing header checks.
- The owner's rule: no `git commit` or push without asking. Ask once before the first commit step. If the owner says yes, the commit steps below stand.
- Column order never changes. Only names change.
- The header check stays exact. Never accept old and new names side by side.
- Don't rename internal names: TypeScript entry fields (`OtherEntry.sourceType`, `.times`), store, page, component, service file and directory names (`moldsStore`, `SpareBody.vue`, `services/spareBody/`), and the stores' `use…Store` names.
- Rename these TabSpec constants: `T9MANU_TAB`→`GEAR_TAB`, `MOLDS_TAB`→`MOLD_TAB`, `SPARE_BODY_TAB`→`EXCHANGE_TAB`, `OTHER_TAB`→`EXTRA_TAB`, `OVERCORED_TAB`→`OVERCORE_TAB`. All others keep their names.
- Values that are not renamed stay verbatim: `Gold Mileage`, `Welfare Unit`, mold types, gear `sourceType` values in `types/gear.ts`, `cli-*` FORM values.
- Old docs under `docs/superpowers/` stay untouched, except this plan and the spec.
- UI checks run from `ui/`: `yarn format && yarn lint && yarn check && yarn build && yarn test`. CLI checks run from `cli/`: `uv run pytest`.

## Review Focus

1. **Old `Overcore` rows** with `source` = `Molds`/`SpareBody`/`Other` must still mark their pulls as overcore in `AllPulls`. This lives in the owner's `SWITCH` edit, not in code, so Task 5 verifies it on the sheet copy.
2. **An overcore-triggering save reads `AllPulls` and `RosterLog` through `checkHeaders`.** If `ALL_PULLS_TAB.headers` and the formula's header literal disagree, every Gacha save fails. Task 1 pins the headers. Task 5 makes a real save on the copy.
3. **Pain levels must not shift with the rename:** `Mold` + `Perfect…` = 5, `Mold` + `Pilgrim Mold` = 4, `Exchange` + `Gold Mileage` = 7, `Exchange` + `Union Chip` = 6, `Extra` = 1. Task 2 pins these.
4. **An Exchange save that overcores** must write an `Overcore` row with `source` = `Exchange` and an `AuditLog` row with `form` = `Exchange`. The same holds for Mold and Extra. Task 2 pins these.
5. **CLI union writes** must target `UnionRaid`/`UnionRoster` both in the data range and when growing the grid (`ensure_rows` keys). `tools/names.py` must find `nikke` in `Exchange` and `ssrDetails` in `Mold`. Task 4 pins both.

---

### Task 1: UI tab specs (names, headers, constants)

**Files:**
- Create: `ui/src/config/sheets.test.ts`
- Modify: `ui/src/config/sheets.ts`
- Modify: every importer of a renamed constant. Find them with `grep -rln "T9MANU_TAB\|MOLDS_TAB\|SPARE_BODY_TAB\|OTHER_TAB\|OVERCORED_TAB" ui/src`. Expect the stores, `services/mock/fixtures.ts`, `stores/overcoreTestData.ts`, `services/overcore/overcore.ts`, `services/nikke/*`, and tests.
- Modify (tests whose literal ranges or headers name renamed tabs or headers): `stores/anomalyStore.test.ts`, `stores/gearStore.test.ts`, `stores/levelStore.test.ts`, `stores/moldsStore.test.ts`, `stores/spareBodyStore.test.ts`, `stores/otherStore.test.ts`, `stores/{social,event,ordinary,spending}Store.test.ts`, `services/mock/mockFlow.test.ts`, `services/overcore/overcore.test.ts`, `services/nikke/nikkeDatabase.test.ts`, `stores/overcoreTestData.ts`, `services/mock/fixtures.ts`.
- Leave alone: `services/google/sheetsApi.test.ts` and `services/sheets/tabWriter.test.ts`. They use `T9Manu` only as a sample tab name for generic writer tests.

**Interfaces:**
- Produces: `GEAR_TAB`, `MOLD_TAB`, `EXCHANGE_TAB`, `EXTRA_TAB`, `OVERCORE_TAB` (all `TabSpec`). Other constant names are unchanged.

- [ ] **Step 1: Create the branch**

Run: `git switch -c sheet-name-normalization develop`

- [ ] **Step 2: Write the failing contract test `ui/src/config/sheets.test.ts`**

One `it` per TabSpec asserting `{ tab, headers }` with `toEqual`. Copy the values from the spec's "Header renames" table and the unchanged tabs:

```ts
expect({ tab: GEAR_TAB.tab, headers: GEAR_TAB.headers }).toEqual({
  tab: 'Gear',
  headers: ['date', 'source', 'class', 'manufacturer', 'slot'],
})
```

Cover: `ANOMALY_TAB` (`'Anomaly'`, `date, boss, stage, dropped, modules, class, manufacturer, dropType, ''`), `GEAR_TAB`, `FURNACE_TAB` (`date, target, sacrifice1, sacrifice2, result`), `LEVEL_TAB` (`'LevelLog'`, `synchroLevel, date, daysElapsed, notes`), `SOLO_RAID_TAB` (`season, month, boss, weakness, damage, rank, notes`), `SOCIAL_TAB`, `EVENT_TAB`, `ORDINARY_TAB`, `MOLD_TAB` (`'Mold'`), `EXCHANGE_TAB` (`'Exchange'`, `date, nikke, source, notes`), `EXTRA_TAB` (`'Extra'`), `NIKKE_DATABASE_TAB`, `SPENDING_TAB`, `ALL_PULLS_TAB` (`date, nikke, source, spook, copy, isOvercore`), `ROSTER_LOG_TAB` (`date, nameCode, nikke, copies`), `OVERCORE_TAB` (`'Overcore'`, `date, source, nikke, manufacturer, notes`), and both `SPREADSHEETS[i].audit` (`'AuditLog'`, unchanged).

- [ ] **Step 3: Run it to verify it fails**

Run: `cd ui && yarn vitest run src/config/sheets.test.ts`
Expected: FAIL, with import errors for `GEAR_TAB` etc., or header mismatches.

- [ ] **Step 4: Update `ui/src/config/sheets.ts`**

Change the tab names, headers, and constant names to the spec values, and update its comments. Then update every importer and every test literal (ranges like `"'Molds'!A1:F1"` → `"'Mold'!A1:F1"`, `"'Overcored'!A1:E1"` → `"'Overcore'!A1:E1"`, `"'LevelLogs'!…"` → `"'LevelLog'!…"`, `"'T9Manu'!…"` → `"'Gear'!…"`, `"'SpareBody'…"` → `"'Exchange'…"`, `"'Other'…"` → `"'Extra'…"`). Fixture header rows that spell headers out by hand get the new headers. Most fixtures spread `X_TAB.headers` and need only the constant rename.

- [ ] **Step 5: Run the UI checks**

Run: `cd ui && yarn format && yarn lint && yarn check && yarn build && yarn test`
Expected: all pass. Source and form values (`'Molds'` etc.) are still the old ones in both code and tests at this point, and Task 2 changes them.

- [ ] **Step 6: Commit (spec, plan, and Task 1 together)**

```bash
git add docs/superpowers/specs/2026-11-22-sheet-name-normalization-design.md docs/superpowers/plans/2026-11-22-sheet-name-normalization.md ui/src
git commit -m "refactor(ui): rename sheet tabs and headers to the normalized names"
```

### Task 2: UI source values and AuditLog form names

**Files:**
- Modify: `ui/src/services/overcore/overcore.ts:10-35`
- Modify: `ui/src/stores/moldsStore.ts:79,91`, `ui/src/stores/spareBodyStore.ts:78,90`, `ui/src/stores/otherStore.ts:91,104`
- Test: `ui/src/services/overcore/overcore.test.ts`, `ui/src/stores/{molds,spareBody,other}Store.test.ts`

**Interfaces:**
- Consumes: `OVERCORE_TAB`, `MOLD_TAB`, `EXCHANGE_TAB`, `EXTRA_TAB` from Task 1.
- Produces: `type OvercoreSource = 'Social' | 'Event' | 'Ordinary' | 'Mold' | 'Exchange' | 'Extra'`, with `painLevel(from: OvercoreSource, detail: string): number` keeping the same signature.

- [ ] **Step 1: Write failing tests**

In `overcore.test.ts`, add `it('keeps pain levels under the new source names')`:

```ts
expect(painLevel('Mold', 'Pilgrim Perfect Mold')).toBe(5)
expect(painLevel('Mold', 'Pilgrim Mold')).toBe(4)
expect(painLevel('Mold', 'Manufacturer Mold')).toBe(2) // any non-listed mold type
expect(painLevel('Exchange', 'Gold Mileage')).toBe(7)
expect(painLevel('Exchange', 'Union Chip')).toBe(6)
expect(painLevel('Extra', '')).toBe(1)
```

Before writing it, check `MOLD_TYPES` in `types/molds.ts` for a real non-listed mold type. Replace the existing `'Molds'`/`'SpareBody'`/`'Other'` literals in `overcore.test.ts` (for example `overcoreRows(…, 'Molds', …)` expecting `'Molds'` in column B) with the new names.

In each of the three store tests, update the overcore-save assertions so the written `Overcore` row has column B `'Mold'` / `'Exchange'` / `'Extra'` and the `AuditLog` row has `form` `'Mold'` / `'Exchange'` / `'Extra'`.

- [ ] **Step 2: Run to verify they fail**

Run: `cd ui && yarn vitest run src/services/overcore src/stores/moldsStore.test.ts src/stores/spareBodyStore.test.ts src/stores/otherStore.test.ts`
Expected: FAIL. Type errors on `'Mold'` etc. count as failures.

- [ ] **Step 3: Implement**

`OvercoreSource` and the `painLevel` cases take the new literals, and the comment at line 16 uses the new names. Each store's `from:` and the AuditLog form string use `'Mold'` / `'Exchange'` / `'Extra'`.

- [ ] **Step 4: Run the UI checks**

Run: `cd ui && yarn format && yarn lint && yarn check && yarn build && yarn test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add ui/src
git commit -m "refactor(ui): name overcore sources and audit forms after the new tabs"
```

### Task 3: UI labels, routes, comments, ui/CLAUDE.md

**Files:**
- Modify: `ui/src/App.vue:18-20` (`{ to: '/mold', label: 'Mold' }`, `{ to: '/exchange', label: 'Exchange' }`, `{ to: '/extra', label: 'Extra' }`)
- Modify: `ui/src/router/index.ts:24-26` (paths `/mold`, `/exchange`, `/extra`, same components)
- Modify: `ui/src/pages/Molds.vue:29`, `ui/src/pages/SpareBody.vue:16`, `ui/src/pages/Other.vue:16` (headings `Mold`, `Exchange`, `Extra`)
- Modify: comments that name old tabs or headers. Find them with `grep -rn "T9Manu\|LevelLogs\|Overcored\|SpareBody tab\|Molds tab\|achievedAt\|sourceType\b" ui/src --include=*.ts --include=*.vue`. Known ones: `config/limits.ts:9,19`, `services/anomaly/anomalyRows.ts:30`, `services/gear/gearRows.ts:21`, `stores/anomalyStore.ts:115`, `stores/levelStore.ts:12`. Code identifiers stay. `types/gear.ts:11` becomes "Gear `source` values".
- Modify: `ui/CLAUDE.md`, "Reviewing the UI" overcore scenarios: `#/sparebody` → `#/exchange`, `#/molds` → `#/mold`, "the mock AllPulls" stays.

No old-route redirects (spec: not kept).

- [ ] **Step 1: Make the edits above**

- [ ] **Step 2: Run the UI checks, plus a headless look**

Run: `cd ui && yarn format && yarn lint && yarn check && yarn build && yarn test`
Expected: all pass.
Then `yarn dev:mock` and `google-chrome --headless=new --virtual-time-budget=5000 --dump-dom http://localhost:5173/#/exchange | grep -o '<h2[^<]*>Exchange'`
Expected: one match. Repeat for `#/mold` (`Mold`) and `#/extra` (`Extra`).

- [ ] **Step 3: Commit**

```bash
git add ui/src ui/CLAUDE.md
git commit -m "refactor(ui): label Mold, Exchange and Extra pages after their tabs"
```

### Task 4: CLI tabs, headers, and name sweep

**Files:**
- Modify: `cli/src/shiniri_cli/union_sheet.py:12` (`TABS = {"union": "UnionRaid", "roster": "UnionRoster"}`)
- Modify: `cli/src/shiniri_cli/clear_sheet.py:14` (`_TAIL` starts `"stageName", "date", …`)
- Modify: `cli/src/shiniri_cli/nikke_sheet.py:8` and `cli/src/shiniri_cli/roster_sheet.py:11` (`"name"` → `"nikke"`)
- Modify: `cli/tools/names.py:19-25`: `COLUMNS = {"Social": ("ssrDetails",), "Event": ("rateUpName", "ssrDetails"), "Ordinary": ("ssrDetails",), "Mold": ("ssrDetails",), "Exchange": ("nikke",), "Extra": ("rateUpName", "ssrDetails")}`. `NikkeDatabase` is read by position, so nothing else changes there.
- Test: `cli/tests/test_union_sheet.py`, `test_clear_sheet.py`, `test_nikke_sheet.py`, `test_roster_sheet.py`, `test_profile.py`, `test_names.py`
- Leave alone: `cli/tests/test_sheets.py`, which uses `Union`/`Roster` only as sample tabs for `HttpSheets`.
- Check, and update if it names a renamed tab: `cli/CLAUDE.md`

**Interfaces:**
- Produces: nothing new. Same functions, new strings.

- [ ] **Step 1: Write failing tests and update fixtures**

- `test_union_sheet.py`: assert the union write's data range starts `'UnionRaid'!`, the roster write's range starts `'UnionRoster'!`, and the grid-growth keys passed to `ensure_rows` are `UnionRaid` / `UnionRoster`. Fake-sheet fixture tab names and header rows change to match.
- `test_clear_sheet.py`, `test_nikke_sheet.py`, `test_roster_sheet.py`, `test_profile.py`: fixture header rows use `date` (Campaign/Tower) and `nikke` (NikkeDatabase, RosterLog).
- `test_names.py`:
  - Fixture tabs become `"Mold": [["date", "moldType", "pulls", "totalSsr", "ssrDetails"], …]` and `{"Exchange": [["date", "nikke"], …]}`, and `"Other"` becomes `"Extra"`. Fixture header rows spelled out in full use the new headers (`Event`: `tickets`, `pulls`).
  - Expected lines become `"Mold!E2  Crwn  (closest: Crown)"`, `"Exchange!B3  Zzzzzz"` and `"Extra!B2  Scarlt"`. Rename `test_other_rate_up_name_is_swept` to `test_extra_rate_up_name_is_swept`.
  - `DB` stays positional (`["nameCode", "nikke"]` header row).

- [ ] **Step 2: Run to verify they fail**

Run: `cd cli && uv run pytest tests/test_union_sheet.py tests/test_names.py tests/test_clear_sheet.py tests/test_nikke_sheet.py tests/test_roster_sheet.py tests/test_profile.py`
Expected: FAIL, from header mismatches and old tab names in output.

- [ ] **Step 3: Implement the constant changes listed under Files**

- [ ] **Step 4: Run the CLI suite**

Run: `cd cli && uv run pytest`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add cli
git commit -m "refactor(cli): write and sweep the renamed tabs and headers"
```

### Task 5: Root docs, local env, verification on the sheet copies

**Files:**
- Modify: `CLAUDE.md` (sheet contract example `` (`bossElement`, `totalDmg`) `` → `` (`bossElement`, `damage`) ``)
- Modify (not committed, gitignored): `ui/.env.local`, with `VITE_JOURNAL_SHEET_ID=1XiU-PoljepdZ7whZDZ3e94lXmlla5dO-O60FfbgXv44` and `VITE_GACHA_SHEET_ID=1qgmp0_OsWBOMuRy-ddt8qi7Sbbcx2WwAjSl1jEJ-Ylg`. Show the owner the diff before writing it.

- [ ] **Step 1: Edit `CLAUDE.md` and `ui/.env.local` as above**

- [ ] **Step 2: Full checks**

Run: `cd ui && yarn format && yarn lint && yarn check && yarn build && yarn test`, then `cd ../cli && uv run pytest`
Expected: all pass.

- [ ] **Step 3: Hand the owner the manual edit list for the copies**

Give the owner the spec's "Tab renames", "Header renames" (both tables), and "Formula edits" sections as a checklist, and wait for them to confirm the copies are done.

- [ ] **Step 4: Verify on the copies (owner runs the UI, executor checks the results through the Sheets API)**

`yarn dev` against the copies. Save one row each on Anomaly (with a gear drop), Gear, Level, Solo Raid, Social, Event, Ordinary, Mold, Exchange, Extra, and Spending. On Exchange, use the overcore scenario from `ui/CLAUDE.md` (Gold Mileage, Rapi, 1 copy). Run `uv run shiniri …` one-shot writers for profile, clears, and union (per `cli/CLAUDE.md`), and `uv run python tools/names.py`.
Expected:
- Each row lands directly under existing data, under the new headers, with a matching `AuditLog` row. Mold/Exchange/Extra saves log `form` `Mold`/`Exchange`/`Extra`.
- The Exchange overcore writes an `Overcore` row with `source` = `Exchange`, and `AllPulls` marks that pull `isOvercore` TRUE.
- An old `Overcore` row with `source` = `Molds` is still marked TRUE on its `AllPulls` pull (Review Focus 1).
- `AcquisitionLog` and `DupeTracker` still compute with no `#REF!`/`#N/A` columns. `Stats` totals are unchanged from before the renames.
- `names.py` reports no `no column` lines.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: use a renamed header in the sheet contract example"
```

- [ ] **Step 6: Release-day note for the owner**

Don't merge to `develop` until the owner has applied the same edits to the prod sheets. Then follow the `ui/CLAUDE.md` release steps (minor bump) and restart `watch` on the homeserver after it pulls.
