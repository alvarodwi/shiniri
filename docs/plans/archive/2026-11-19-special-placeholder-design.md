# Special Interception placeholder (short design)

## Why

`Special` holds daily Special Interception results from 2023 to August 2024. It is frozen for good:
interception farming moved to Anomaly. The owner wants it visible in the app as a form that cannot
be used, as a record of its shape ahead of a future dashboard / data-query layer.

## Goals

- A `/special` page, linked in the nav, showing a disabled form with the tab's fields and a banner
  saying the tab is frozen.

## Non-goals

- Any read or write of `Special`, a store, row logic, or tests.
- A `TabSpec` for `Special`. It belongs with the dashboard, once something reads the tab (Claude's call).
- A read-only view of past rows (dashboard territory).

## Approaches

- **Display-only page (picked).** Frozen for good, so nothing to wire up.
- Real row logic behind a disabled switch. Rejected: the owner says it will never be unfrozen.

## Design

- Banner: "Frozen. Special Interception isn't farmed any more: since August 2024 interception farming
  is Anomaly. History stays in the `Special` tab."
- Disabled fields, labelled after the tab's columns: date, boss, T9 equipment, modules,
  T9 manufacturer, empty. Disabled Save button labelled "Frozen".

## Future (not built)

The owner wants `shiniri-cli` to snapshot blablalink data on a schedule and feed it into this site.
One fitting route: the CLI writes its own spreadsheet, which the site reads as one more entry in
`SPREADSHEETS` with its own `AuditLog`. That keeps the sheet as the only copy.
