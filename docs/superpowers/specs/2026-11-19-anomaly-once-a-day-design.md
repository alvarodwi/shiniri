# Anomaly logger: once-a-day lock (short design)

## Why

After a save, the form resets to fresh runs. The only thing that stops a second save is a "Save anyway?"
confirm, which appends duplicate rows if accepted. The owner wants the logger to be a once-a-day form:
log the day in one sitting, see what was logged, and fix mistakes by hand in the sheet.

## Goals

- A game day that already has rows cannot be logged again from the app.
- A logged day shows its rows read-only, so the owner can check them without opening the sheet.
- The app states plainly that fixes happen in the sheet, and links to it.

## Non-goals

- Editing, deleting or topping up logged rows in the app. The append-only invariant stays.
- Split sessions. The owner always logs a day in one sitting.

## Approaches

- **A. Lock the day once it has any rows (picked).** Matches "once a day" exactly. A partly logged day
  is finished in the sheet.
- B. Lock only when the day reaches its limit (5, or 10 on a double day), with the form open for the
  remaining runs. Rejected: more logic, and a wrong "double day" tick reopens the duplicate risk.

## Design

- **Read.** `load` and the date watcher collect the rows whose column A matches the chosen date, by
  their positions in column A, and read those rows (A–I). Store state `loggedRows` replaces
  `existingForDate`. Claude's call: read one range covering the first to last matching row and keep
  only the matches. Rows are not assumed contiguous.
- **Page.** When `loggedRows` is non-empty, the run cards and the Save bar are hidden. In their place:
  a read-only list of the day's rows (boss, stage, dropped, modules, gear, note), then the line
  "Fix mistakes directly in the sheet." with a link to
  `https://docs.google.com/spreadsheets/d/<spreadsheetId>/edit`. That line and link are shown only
  on larger screens (owner's decision: editing the sheet on a phone is painful, so phones just see
  the read-only list). Changing the date unlocks the form
  for days with no rows.
- **Save.** Re-read the day at save time. If rows now exist (another device logged them), refuse the
  save, show the read-only list and the error "Already logged for <date>." The
  `ConfirmDuplicate` callback and `confirmDuplicate` dialog are removed.
- **After a save.** The reload finds the new rows, so the page shows them read-only straight away,
  with the existing "Saved N rows to <range>" status.
- **Spec.** Replace "Duplicate-day warning" in `2026-11-17-anomaly-logger-design.md` with this lock.

## Left to the builder

- Layout of the read-only list (it should read well on a phone).
- Tests: the date-matching helper (pure), the store's lock on load, and the refused save when rows
  appear between load and save.
