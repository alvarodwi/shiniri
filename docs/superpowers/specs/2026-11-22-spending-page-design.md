# Spending page (ui)

Step 6.6 of `2026-11-21-gacha-tracker-design.md`. A standalone form that appends one purchase to the
`Spending` tab of the gacha sheet. Approved with the owner on 2026-11-22.

## Why

The owner buys the 30-day supply every month and logs every purchase by hand. The form should make
the monthly one a single tap and keep package names consistent for the later dashboard.

## Tab

`Spending`, headers verbatim: `purchaseDate, packageName, type, priceIdr, priceUsd, platform, notes`.
Prices are numbers; the sheet's column format shows them as currency.

## Fields

- `purchaseDate`: defaults to today's WIB calendar date (not the game day: a purchase at 01:00 is
  that day's purchase).
- `type`: one of `Monthly Pass`, `Campaign Pass`, `Costume`, `Mission Pass`, `Event Pass`,
  `Costume Gacha`, `Music Pack`. Single values only.
- `packageName`, built per type:
  - Monthly Pass: `30-day supply`.
  - Mission Pass / Event Pass: `<SSR> Mission Pass (<Month>)` / `<SSR> Event Pass (<Month>)`. Month
    is the English full month name of purchaseDate unless the owner picks another.
  - Costume Gacha: `<SSR> Costume Gacha`. Costume: `<SSR> Costume`.
  - Campaign Pass, Music Pack: free text, suggesting past names of that type.
  - SSR comes from `NikkePicker` over every SSR in `NikkeDatabase` (Pilgrim and Abnormal included).
  - The built name is previewed above Save.
- `priceIdr` (whole number) and `priceUsd` (up to 2 decimals): both required, typed by hand, no
  conversion.
- `platform`: one of `GooglePlay`, `RazerGold`, `Apple`, `DebitCard`. Defaults to the platform of
  the last row with the same packageName, else the last row of the same type; the owner can override.
- `notes`: optional free text.

A "30-day supply" button sets type Monthly Pass and fills both prices and the platform from the last
`30-day supply` row, so the monthly purchase is one tap plus Save.

## Approaches

- Chosen: per-type name builder in pure row logic, following the other forms (`TabSpec`, service,
  store, page, route, mock tab).
- Dropped: one free-text name with SSR autocomplete (can't guarantee the month and suffix format);
  name templates kept in the sheet (config for 7 fixed types).

## Non-goals

- `CostumeGallery` and how a pass's bundled costume is tracked: its own step.
- Currency conversion, overcore checks, duplicate detection (Spending has no natural key; same-day
  purchases are normal).

## Manual sheet step

Before release, the owner splits the compound types (`Mission Pass, Costume`, `Event Pass, Costume`)
into the single type, on both the copy and the real sheet. Until then the type-based platform default
skips those rows.
