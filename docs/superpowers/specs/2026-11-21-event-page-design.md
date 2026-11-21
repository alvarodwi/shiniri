# Event page (ui) — design

Step 5 of the gacha roadmap (`2026-11-21-gacha-tracker-design.md`), second page after Social.
Decided with the owner on 2026-11-21. ui only; the cli is untouched.

## Why

The owner logs event gacha sessions by hand into the `Event` tab of the gacha spreadsheet. This
page takes that over, the same way the Social page took over `Social`. Event differs from Social in
three ways: two currencies pay for a pull (gems and recruit vouchers, "tix"), each banner has a
rate-up target, and the picker pool depends on the banner type.

## Sheet contract

Tab `Event`, headers in this exact order, columns A to I:

`date`, `rateUpName`, `rateUpType`, `gems`, `tix`, `times`, `totalSsr`, `ssrDetails`, `notes`

- `times` is `tix + gems / 300` (300 gems = 1 voucher = 1 pull). The page writes the computed
  number, not a formula: the writer finds the row at call time and never hardcodes row numbers, so
  it cannot write `=E2+(D2/300)`. `gems` must be a multiple of 300, so `times` is always a whole number (owner's call, 2026-11-21).
- `totalSsr` is the number of picked names, so it cannot disagree with `ssrDetails`.
- `ssrDetails` is the picked names joined with `, `, through `asText` like Social. `notes` is optional
  free text, trimmed, through `asText`, like Social's.
- Spooks (an SSR that is not `rateUpName`) are not logged here. A session can hold several SSRs, so
  a per-row spook mark would be unreadable. They are derivable later from `ssrDetails` and
  `rateUpName`, and `AllPulls` (kept by hand) has its own entry for them.
- Append-only, one row per session, never deduped by date, same writer and `AuditLog` as Social
  (`writeTabsAtEnd`, gacha spreadsheet). No sheet change is needed: the owner confirmed column F
  holds no pre-filled formula on blank rows, so the target-empty check passes.

## Goals

- Log one Event session: date, rate-up Nikke, banner type, gems, tix, and the SSRs pulled.
- Names come only from the picker, so rows always match `NikkeDatabase`.
- Pin the rate-up Nikke in the picker, since it is the most likely SSR.

## Non-goals

- Spook tracking or any stats (future dashboard).
- Summer or winter specific logic. `NikkeDatabase` has no such metadata, so those banner types only
  appear in the `rateUpType` list and change nothing else.
- Free-text names, editing existing rows.

## Fields

- `date`: defaults to `gameDay()`, as Social.
- `rateUpType`: required dropdown, no default, exactly these values (sheet text, verbatim):
  `Pilgrim Limited`, `Collaboration Limited`, `Regular`, `Winter Limited`, `Summer Limited`.
  No default so a forgotten banner type cannot silently pick the wrong pool.
- `rateUpName`: one Nikke, picked from the same SSR pool. Optional, since a banner may have no
  target; when empty, no chip is pinned and the cell is written empty.
- `gems`, `tix`: non-negative integers. A blank one counts as 0 once the other is filled (the
  owner fills one currency, not both); both blank is invalid. `gems` must be a multiple
  of 300.
- SSR picker: multi-pick like Social, the same Nikke may be picked twice.

`toRow` returns null (cannot save) until `date` is set, `rateUpType` is chosen, `gems` and `tix` are
valid, and `times >= 1`.

## Picker pool

Rules from the roadmap: `rarity` is `SSR`; `PILGRIM` allowed; `ABNORMAL` only when `rateUpType` is
`Collaboration Limited`. Compare `manufacturer` case-insensitively.

The filter is lifted out of `socialStore.ssrNikkes` into one shared helper that both stores call
(Social: no Abnormal, no Pilgrim; Event: Pilgrim yes, Abnormal conditional). The roadmap already
asks for this. Changing `rateUpType` away from `Collaboration Limited` removes any already picked
Abnormal Nikke from `names` and from `rateUpName`, so a stale pick can never reach the sheet. With
no `rateUpType` chosen yet, use the no-Abnormal pool.

## Picker changes (`NikkePicker`)

- `pinned?: string` prop. When set, a one-tap chip labelled with that name sits above the search
  box; tapping it adds the name like any pick (so it can be tapped twice). Social omits the prop
  and is unchanged. A chip rather than a sort, because results only show while typing.
- A single-pick mode for `rateUpName`: picking replaces the value, with a remove control, and the
  chip is not shown. The model type stays a string array or gets a sibling component; left to the
  builder, whichever is smaller and keeps Social's behaviour byte-for-byte.

## Approaches

- **A. Event as its own page beside Social (chosen).** Own type, rows service, store, page, route,
  `TabSpec` and mock fixture, with a shared pool helper. Costs some repeated form plumbing, which
  the roadmap expects, and each tab keeps its own columns and rules.
- **B. One config-driven gacha form for all six tabs.** Rejected for now: columns and pool rules
  differ per tab and Molds and SpareBody rules are unsettled, so the abstraction would be guessed
  from one example. The owner plans to split progression and gacha later; A fits that.
- **C. Free-text `rateUpName`.** Rejected: breaks the rule that names come only from the picker.

## Parts, by the repo's "adding a form" recipe

`EVENT_TAB` in `config/sheets.ts` beside `SOCIAL_TAB`; `types/event.ts`;
`services/event/eventRows.ts` plus tests; `stores/eventStore.ts` plus tests (mirror `socialStore`:
`load`, `add`, `removeAt`, `save`, `canSave`, `row`); `pages/Event.vue`; route; `MOCK_SHEETS`
entry for `Event` in `services/mock/fixtures.ts`; the shared pool helper plus tests; `NikkePicker`
changes. Page layout follows Social: phone-first, labelled inputs, a fixed Save button, a live
`times` hint (for example `1.5 pulls`).

## Left to the builder

File names inside the folders above, where the pool helper lives, exact copy and hint text, the
single-pick component shape, and test cases beyond: row output for gems-only, tix-only and mixed;
`times` fractions; invalid inputs return null; leaving Collaboration Limited drops Abnormal picks.

## Manual check (owner)

Log a few sessions against the sheet copy: confirm rows land directly below existing data, `times`
matches your formula, and the `AuditLog` row appears. No manual sheet step is needed and nothing
changes on the real sheet before release.
