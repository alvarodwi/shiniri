# Spending Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `#/spending` form that appends one purchase row to the gacha sheet's `Spending` tab.

**Architecture:** Same shape as the other forms: `SPENDING_TAB` in `config/sheets.ts`, pure logic in
`services/spending/spendingRows.ts`, `stores/spendingStore.ts`, `pages/Spending.vue`, a route, a nav
link and a mock tab. The store reads `Spending!A1:G` (unformatted, header-checked) for history and
`NikkeDatabase` for the picker; it writes through `writeTabsAtEnd`.

**Tech Stack:** Vue 3, Pinia, Vitest, UnoCSS.

**Spec:** `docs/superpowers/specs/2026-11-22-spending-page-design.md`

## Global Constraints

- Headers verbatim: `purchaseDate, packageName, type, priceIdr, priceUsd, platform, notes`.
- Types: `Monthly Pass, Campaign Pass, Costume, Mission Pass, Event Pass, Costume Gacha, Music Pack`.
- Platforms: `GooglePlay, RazerGold, Apple, DebitCard`.
- Text cells go through `asText` (leading `'`); prices are written as numbers.

## Review Focus

1. Type switch after picking an SSR: the name must rebuild from the new type, never keep a stale one.
2. A history row with a compound type (`Event Pass, Costume`) must not crash or match a single type.
3. Prices typed with separators (`79.000`, `79,000`): rejected, not written as 79.
4. Picked month overrides the date's month; a cleared override follows the date again.
5. No `30-day supply` row in history: the button still sets name and type, leaves prices blank.

---

### Task 1: Row logic

**Files:** Create `ui/src/types/spending.ts`, `ui/src/services/spending/spendingRows.ts`,
`ui/src/services/spending/spendingRows.test.ts`; modify `ui/src/config/sheets.ts`.

**Produces:**
- `SPENDING_TYPES`, `PLATFORMS`, `MONTHS`, `MONTHLY = '30-day supply'`, `SpendingEntry`
  `{ date, type, name, ssr, month, priceIdr, priceUsd, platform, notes }` (all strings).
- `type Purchase = { packageName; type; priceIdr; priceUsd; platform }` and
  `toHistory(rows: unknown[][]): Purchase[]` (data rows, no header).
- `packageName(e): string` ('' while incomplete), `monthOf(date): string`,
  `suggestedPlatform(history, name, type): string`, `lastMonthly(history): Purchase | undefined`,
  `pastNames(history, type): string[]`, `toRow(e, platform): Cell[] | null`.

Tests cover Review Focus 1–4 plus a full row: `['2026-11-22', "'Isabel Event Pass (November)",
'Event Pass', 314333, 19.99, 'RazerGold', '']`.

### Task 2: Store

**Files:** Create `ui/src/stores/spendingStore.ts`, `ui/src/stores/spendingStore.test.ts`.

`load` reads history and Nikkes in parallel; `quickMonthly()` fills the 30-day entry (Review Focus 5);
`setType` clears fields the new type doesn't use; `platform` getter = typed or suggested; `save`
writes, resets, reloads. Tests: load, quickMonthly with and without history, save writes the row to
`Spending` and AuditLog.

### Task 3: Page, route, nav, mock

**Files:** Create `ui/src/pages/Spending.vue`; modify `ui/src/router/index.ts`, `ui/src/App.vue`,
`ui/src/services/mock/fixtures.ts`.

Verify: `yarn format && yarn lint && yarn check && yarn build && yarn test`, then `yarn dev:mock`
headless dump of `#/spending`.
