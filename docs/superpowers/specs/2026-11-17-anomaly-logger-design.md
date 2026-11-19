# Anomaly Interception Logger — Design

Date: 2026-11-17
Status: draft, awaiting approval

## Intent

The owner has logged every NIKKE Anomaly Interception run in Google Sheets daily since 2024. It's an ingrained habit, but a chore: open the sheet, Ctrl+↓ to the last row, copy the repeated metadata, type the results. They want a fast, opinionated input screen that writes straight into the existing sheet, and they want to use it from their phone as well as their PC.

An earlier attempt kept a second copy of the data in a relational DB and nearly wiped the sheet's history because of sync bugs. **The sheet is the only source of truth.** The app never holds its own copy of the data.

This is the proof of concept for a larger personal app. Later forms (gacha tracker, T9Manu gear from other sources) will join the same app, but they are out of scope here.

## Domain

- 5 attempts per day normally, doubled to 10 on some weekends and anniversaries (it was 3, or 6 when doubled, before an update). Each attempt targets one of 5 bosses, chosen freely, and attempts can be split across bosses.
- Each boss has a fixed reward type:

  | bossName (as written in sheet) | dropType                                                    |
  | ------------------------------ | ----------------------------------------------------------- |
  | Kraken                         | Modules (custom module shards, fixed 50; amount not logged) |
  | Ultra                          | Helmet                                                      |
  | Mirror Container               | Gloves                                                      |
  | Indivilia                      | Torso                                                       |
  | Harvester                      | Boots                                                       |

- Stage is 1–9. At stage 9 the reward always drops. Below 9 it can fail (`dropped = FALSE`).
- Every attempt can also give 0–3 bonus modules, independent of whether the reward dropped.
- An equipment box gives exactly one piece: a class (Attacker / Defender / Supporter) and a manufacturer (Elysion / Missilis / Tetra / Pilgrim / Abnormal), so 15 variants.
- Typical day: Kraken, stage 9, 5 runs, and the only thing that varies is the module count per run.

> Builder: confirm the exact boss spellings, the class spelling ("Support" vs "Supporter") and the `dropType` values by reading existing rows in `Anomaly` before hardcoding. Existing data wins over this table.

## Target sheet

- File: **NIKKE Progression Journal**, ID `1DMd9oaZ08m2BmfatAlpetwEchtuxUbYh0PDRUhFyaHQ`
- Tab: `Anomaly`, one row per attempt, columns A–H:
  `date | bossName | stage | dropped | modules | gearClass | gearManu | dropType`
  (Columns F and G were renamed from `gear class` and `gear manu` on 2026-11-19.)
- Column I holds an optional per-row note for unusual events (rule changes, events, big updates). Its header in I1 is empty. Columns J–N hold unrelated notes, and the app must never touch them.
- Gear columns stay empty for Kraken and for failed drops.
- Dates are ISO `YYYY-MM-DD` and must land as real date values, not text. Booleans must land as real booleans.

## Goals

1. Log a day's attempts from phone or PC in a few taps.
2. Defaults remove all retyping: date = today, and boss/stage for run 1 = the last row in the sheet, for run N = run N-1.
3. Writes are append-only and cannot damage existing rows.
4. The common case (5× Kraken stage 9) takes 5 module taps plus Save.

## Non-goals (this POC)

- Gacha tracker, T9Manu form, editing or deleting past rows, stats or charts, offline mode, multi-user.
- ~~Copying or syncing Anomaly gear into T9Manu.~~ Reversed on 2026-11-19: Anomaly gear drops are now written to T9Manu in the same save. See `2026-11-19-gear-logger-design.md`.

## Anti-goals (failure even if it "works")

- Any code path that updates, clears or deletes existing cells.
- Any local or server-side store of log data that could disagree with the sheet.
- Writing outside `Anomaly!A:I`.
- Silently writing to the wrong columns if the sheet layout changes.

## Approaches considered

1. **Apps Script web app bound to the sheet.** Zero setup and no OAuth, but you're stuck in Google's iframe with a clunkier dev loop.
2. **Static Vue SPA calling the Sheets API from the browser with Google OAuth.** ← **chosen by the owner.** Their preferred stack (Vue + Vite + UnoCSS), no server, and Google sign-in is the access control.
3. **Own backend with a service account.** Adds hosting and secrets with no benefit, since Sheets is already the DB.

## Decided

- **Stack:** Vue 3 + Vite + UnoCSS, TypeScript. Owner's choice.
- **Auth:** Google Identity Services token client (browser-only), scope `https://www.googleapis.com/auth/spreadsheets`. There's no password page: the OAuth consent screen stays in _Testing_ with only the owner as a test user, so nobody else can get a token. No secrets ship in the bundle; the client ID is public by design. Tokens last about 1 hour with no refresh token. Re-request on expiry, silently where possible.
- **Hosting:** Netlify from a private GitHub repo, deploying from `main` (same as ntrsv). Authorized JS origins: the Netlify domain and `http://localhost:5173`.
- **Writes (Claude's call, after review):** no `values.append`. Append guesses where the table ends, and `INSERT_ROWS` would push down the I–N notes and break fixed row references. Instead the app computes the target rows itself:
  1. Read `Anomaly!A:A`. The target start row is n = last non-empty row + 1.
  2. Read `Anomaly!A{n}:I{n+k-1}`, where k is the number of runs. Abort if any cell holds anything. The last row changes daily because this is live data, so never hardcode a row number. (Verified 2026-11-17: column D has no checkboxes below the data. Real headers: `date,bossName,stage,dropped,modules,gearClass,gearManu,dropType`. Class spelling is `Supporter`. Column I holds occasional per-row notes; the app writes it only from a run's note field.)
  3. Write with one `values.update` to exactly that range, `valueInputOption=USER_ENTERED`. One call means the save is all-or-nothing.
     This never shifts, overwrites or inserts rows. Rows are never inserted, so I–N stay put.
- **Date = game day (owner's decision).** The game resets at 03:00 local time (WIB, UTC+7), which is 20:00 UTC. The default date is the UTC date of `now + 4h`, which doesn't depend on the device's timezone. The once-a-day lock uses that same date. The date stays editable in the header.
- **Reads:** the header row, `Anomaly!A:A` (about 1k date cells, cheap), and the last few full rows for defaults. The once-a-day lock matches dates across all of column A, so it doesn't rely on rows being in date order.

## Safety guards (required)

1. **Header check before every write.** Read `Anomaly!A1:I1` and compare it to the expected headers. On mismatch, refuse to write and show both versions.
2. **Once-a-day lock** (replaces the duplicate-day warning, see `2026-11-19-anomaly-once-a-day-design.md`). If rows already exist for the chosen date, the form is hidden and those rows are shown read-only. Save re-checks and refuses if the day was logged meanwhile. Mistakes are fixed by hand in the sheet.
3. **Double-submit protection.** Disable Save while a request is in flight. After success, clear the form and show the appended range returned by the API.
4. **Failure is visible.** On any API error, keep the form contents and show the error. Never retry automatically.

## UI (phone-first, also fine on desktop)

```
┌ Anomaly · 2026-11-17 ▾ ─────────────┐
│ Run 1  [Kraken ▾] [9 ▾]             │
│        modules  (0)(1)(2)(3)        │
│ Run 2  [Kraken ▾] [9 ▾]             │
│        modules  (0)(1)(2)(3)        │
│ … up to 5 runs (fewer allowed)      │
│ Run 4  [Ultra ▾] [7 ▾]  dropped [✓] │
│        modules  (0)(1)(2)(3)        │
│        gear  Ely Mis Tet Pil Abn    │
│          Atk  ·   ·   ·   ·   ·     │
│          Def  ·   ·   ·   ·   ·     │
│          Sup  ·   ·   ·   ·   ·     │
│ [ Save 5 rows ]                     │
└─────────────────────────────────────┘
```

- The `dropped` toggle is hidden at stage 9 and forced to TRUE.
- The 3×5 gear grid appears only for equipment bosses with `dropped = TRUE`. One tap sets class and manufacturer.
- A run can't be saved until its required fields are set (module count always; gear when the grid is shown).
- Changing run N's boss or stage carries forward to later runs the user hasn't touched yet.
- The number of runs can be set from 1 to the daily limit, so the owner can log partial days. A "double day" toggle switches the limit from 5 to 10. It isn't remembered between visits (scraping the event schedule is future work).
- Each run has a collapsed "add note" link. When opened, it shows a text field whose value goes to column I. It's hidden by default because notes are rare.

## Left to the builder

- Component structure, state handling, and the GIS integration details.
- Config (sheet ID, client ID) comes from Vite env vars. During development `.env.local` points at a copy of the journal, so test writes never touch live data. Only the deployed build uses the real sheet ID.
- Visual styling within UnoCSS.
- How the post-save confirmation looks.

## Acceptance

- On a copy of the spreadsheet: sign in, log 5× Kraken stage 9 with mixed module counts, and confirm 5 correct rows appended under the last row, with columns I–N and all prior rows unchanged.
- Log an Ultra stage-7 failed run, and an Indivilia run with gear. Confirm the gear columns, `dropped` and `dropType` values match existing row conventions.
- Rename a header on the copy and confirm the app refuses to write.
- Works on a phone browser via the Pages URL.
