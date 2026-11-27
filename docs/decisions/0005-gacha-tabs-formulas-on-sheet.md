# 0005 Gacha: one page per tab, derived views are sheet formulas

## Context
The gacha sheet has six data tabs (Event, Ordinary, Mold, Social, Extra, Exchange) and several derived
views (AllPulls, DupeTracker, AcquisitionLog, Overcore history). Formulas: `../sheet-formulas.md`.

## Decision
- Each data tab has its own store and page (`ui-pages.md`). Rows are not deduped by date.
- Derived views are formulas in the sheet. No code writes AllPulls, DupeTracker or AcquisitionLog.
  Code reads `AllPulls` `copy` only, to decide Overcore rows at save time (`overcore.ts`).
- The owner keeps Stats, AcquisitionLog, NikkeRoster and DupeTracker by hand. shiniri never writes them.
- Pools are SSR only. Overspec and Abnormal depend on the source (`ui-pages.md`).

## Rejected
- One config-driven form for every tab: columns and pool rules differ, so the abstraction would be
  guessed from one example.
- A writer for AllPulls (two writes per save, a backfill, and hand fixes never reach it) or a CLI job
  that rebuilds it (rewriting rows breaks append-only).
- Counting copies again in TypeScript, or `watch` adding Overcore rows later: it would drift from the
  formula, and give no remark at save time.
- A hand-kept spook column: a session can hold several SSRs, so `AllPulls.spook` derives it.
