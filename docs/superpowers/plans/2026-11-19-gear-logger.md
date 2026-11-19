# Gear Logger (T9Manu) and Anomaly Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Log Manufacturer Arms / Selection Box / Furnace gear into `T9Manu` (and `Furnace`), and have
every Anomaly save also write its gear drops to `T9Manu`, each save as one all-or-nothing write.

**Architecture:** `tabWriter` gains a multi-tab write that runs today's guards per tab and then sends
one `values:batchUpdate`. `writeRowsAtEnd` becomes the one-tab case of it. Gear rows are pure
functions in `src/services/gear/`, a `gearStore` drives a count-first card form, and the Anomaly
store adds T9Manu rows to its write.

**Tech Stack:** Vue 3, Pinia, UnoCSS, Vitest, Sheets REST API v4.

**Spec:** `docs/superpowers/specs/2026-11-19-gear-logger-design.md`

## Global Constraints

- Append-only. Every write goes through `tabWriter`. No updates, clears, inserts or deletes.
- `T9Manu` headers, exact: `date | sourceType | classType | manufacturer | slotType`.
- `Furnace` headers, exact: `Date | Target | Sacrifice 1 | Sacrifice 2 | Result`.
- Source strings: `Anomaly Interception`, `Manufacturer Arms`, `Manufacturer Selection Box`,
  `Manufacturer Arms Furnace`. Only the last is confirmed verbatim; the owner verifies the rest on
  the test copy (Task 6).
- Slots: `Helmet`, `Torso`, `Gloves`, `Boots`. Furnace gear cell: `manufacturer-classType-slotType`.
- One save = one `values:batchUpdate`. Never two writes for one save.
- Checks: `yarn format && yarn lint && yarn check && yarn build && yarn test`.

## Review Focus

- Anomaly save with no gear drops (all Kraken, or nothing dropped) must write Anomaly only, not an
  empty T9Manu target. Test in Task 4.
- Furnace target changed after the result was picked: the result's manufacturer must follow the
  target, never keep the old one. Test in Task 3.
- Two targets on different spreadsheets, or the same tab twice, must be refused before any read.
  Test in Task 1.
- Lowering the count must drop the extra cards from the save; raising it again shows blank cards.
  Test in Task 3.
- A refused write (header mismatch on `Furnace`) must write nothing to `T9Manu` either. Test in
  Task 1.

---

### Task 1: Multi-tab writer

**Files:**

- Modify: `src/services/google/sheetsApi.ts`, `src/services/google/sheetsApi.test.ts`
- Modify: `src/services/sheets/tabWriter.ts`, `src/services/sheets/tabWriter.test.ts`
- Modify: `src/stores/anomalyStore.test.ts` (fake API), `CLAUDE.md` (invariant wording)

**Interfaces:**

- Produces: `SheetsApi.batchUpdateValues(spreadsheetId: string, data: { range: string; rows: Cell[][] }[]): Promise<{ updatedRanges: string[] }>`
  (replaces `updateValues`, which has no other caller).
- Produces: `type WriteTarget = { tab: TabSpec; rows: Cell[][] }`,
  `writeTabsAtEnd(api, targets: WriteTarget[]): Promise<{ updatedRanges: string[] }>`,
  and `writeRowsAtEnd(api, tab, rows): Promise<{ updatedRange: string }>` (unchanged signature).

- [ ] Tests: `batchUpdateValues` POSTs to `/spreadsheets/sid/values:batchUpdate` with body
      `{ valueInputOption: 'USER_ENTERED', data: [{ range, values }] }` and returns
      `responses[].updatedRange`. Existing `writeRowsAtEnd` tests switch to asserting
      `batchUpdateValues`. New: two targets → one `batchUpdateValues` call with both ranges in order;
      header mismatch on the second tab → no write at all; different `spreadsheetId` or a repeated tab
      → throws before any `getValues`; a target with zero rows → throws.
- [ ] Run `yarn test src/services` → FAIL.
- [ ] Implement. Guards per target exactly as today, all before the single write.
- [ ] Run `yarn test` → PASS. Commit `feat: write several tabs in one batch update`.

### Task 2: Gear types and row logic

**Files:**

- Create: `src/types/gear.ts`, `src/services/gear/gearRows.ts`, `src/services/gear/gearRows.test.ts`
- Modify: `src/types/anomaly.ts` (move `CLASS_TYPES`, `MANUFACTURERS`, `Gear` to `types/gear.ts`;
  `DropType = 'Modules' | Slot`), importers of those names, `src/config/sheets.ts`

**Interfaces:**

- Produces in `types/gear.ts`: `CLASS_TYPES`, `MANUFACTURERS`, `Manufacturer`, `Gear`,
  `SLOTS = ['Helmet','Torso','Gloves','Boots']`, `Slot`,
  `GEAR_SOURCES = { arms: 'Manufacturer Arms', box: 'Manufacturer Selection Box', furnace: 'Manufacturer Arms Furnace' }`,
  `GearSource = keyof typeof GEAR_SOURCES`, `ANOMALY_SOURCE = 'Anomaly Interception'`,
  `GearItem = { gear: Gear | null; slot: Slot | null }`,
  `GearCard = GearItem & { target: Manufacturer | null; sacrifices: [GearItem, GearItem] }`.
- Produces in `gearRows.ts`: `newCard(): GearCard`, `isCardComplete(card, source): boolean`,
  `t9ManuRow(date, sourceType: string, gear: Gear, slot: Slot): Cell[]`,
  `gearCode(item: GearItem): string`, `furnaceRow(date, card): Cell[]`,
  `rowsFor(date, source, cards): { t9Manu: Cell[][]; furnace: Cell[][] }`.
- Produces in `config/sheets.ts`: `T9MANU_TAB`, `FURNACE_TAB`.

- [ ] Tests: `t9ManuRow('2026-11-19','Manufacturer Arms',{classType:'Defender',manufacturer:'Tetra'},'Boots')`
      → `['2026-11-19','Manufacturer Arms','Defender','Tetra','Boots']`.
      `gearCode` → `'Abnormal-Supporter-Helmet'`. `furnaceRow` →
      `[date,'Pilgrim','Abnormal-Supporter-Helmet','Abnormal-Supporter-Boots','Pilgrim-Defender-Torso']`.
      `isCardComplete`: arms needs gear+slot; furnace also needs target, both sacrifices complete, and
      result manufacturer === target. `rowsFor` furnace → equal-length `t9Manu` (source
      `Manufacturer Arms Furnace`, manufacturer = target) and `furnace`; arms → `furnace: []`.
- [ ] Run → FAIL. Implement. Run `yarn test` → PASS. Commit `feat: add gear row logic`.

### Task 3: Gear store

**Files:** Create `src/stores/gearStore.ts`, `src/stores/gearStore.test.ts`

**Interfaces:**

- Consumes: Task 1 `writeTabsAtEnd`, Task 2 names.
- Produces: `useGearStore` with state `date` (`gameDay()`), `source: GearSource` (`'arms'`),
  `count` (1), `cards: GearCard[]`, `status`, `error`, `lastSaved: { updatedRange: string; count: number }[]`;
  getters `activeCards`, `canSave`; actions `setCount(n)` (clamp 1..`MAX_COUNT` = 100, keep
  existing cards, add blanks), `setSource(s)`, `setCard(i, patch: Partial<GearCard>)` (a `target`
  change sets the result gear's manufacturer to the new target, keeping its class),
  `save(api = sheetsApi)`.

- [ ] Tests: arms save → one target `T9Manu` with `count` rows; furnace save → `T9Manu` and
      `Furnace` in one call; after save cards are blank, count is 1, source kept, `lastSaved` has one
      entry per tab; count 3 → 1 → save writes 1 row, → 3 shows blanks for 2 and 3; target change
      re-points the result; failed write keeps cards and shows the error.
- [ ] Run → FAIL. Implement. Run → PASS. Commit `feat: add gear store`.

### Task 4: Anomaly sync

**Files:** Modify `src/services/anomaly/anomalyRows.ts` (+test), `src/stores/anomalyStore.ts`
(+test), `src/pages/Anomaly.vue`

**Interfaces:**

- Produces: `anomalyGearRow(date, run): Cell[] | null` →
  `[date, ANOMALY_SOURCE, classType, manufacturer, DROP_TYPE[boss]]` when `needsGear(run)`.
- `lastSaved` becomes `{ updatedRange: string; count: number }[]`.

- [ ] Tests: Ultra stage 7 dropped with Attacker/Tetra → `['2026-11-19','Anomaly Interception','Attacker','Tetra','Helmet']`;
      Kraken or not dropped → `null`. Store: a save with 2 gear runs of 5 → one `batchUpdateValues`
      with Anomaly (5 rows) and T9Manu (2 rows); all-Kraken save → Anomaly only.
- [ ] Run → FAIL. Implement; page lists each `lastSaved` entry. Run → PASS.
      Commit `feat: sync anomaly gear drops to T9Manu`.

### Task 5: Gear page, components, route, nav

**Files:**

- Move: `src/components/anomaly/GearGrid.vue` → `src/components/gear/GearGrid.vue` (add optional
  `manufacturers` prop, default all five; furnace result passes `[target]`)
- Create: `src/components/gear/SlotTaps.vue` (ModuleTaps pattern), `src/components/gear/GearCard.vue`,
  `src/pages/Gear.vue`
- Modify: `src/router/index.ts` (`/gear`), `src/App.vue` (Anomaly / Gear links), `RunCard.vue` import

- [ ] Page: date, source select (Arms, Selection Box, Furnace), count input, numbered cards, fixed
      Save bar ("Save N rows"), error and one status line per `lastSaved` entry. No gear list.
- [ ] Furnace card: target select, Sacrifice 1 and 2 (grid + slot each), Result (grid limited to
      target + slot).
- [ ] Run full checks → PASS. Commit `feat: add gear page`.

### Task 6: Docs and owner checks

- [ ] Old spec: strike the "copies nothing into T9Manu" non-goal, pointing to the new spec.
- [ ] Owner, on the test copy: distinct `T9Manu!B` values match the four source strings; one Arms,
      one Furnace and one Anomaly gear save land in the right tabs; a Furnace save with the Furnace
      header renamed writes nothing to `T9Manu`.
