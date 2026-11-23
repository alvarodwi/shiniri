# Navigation and Log paging design

Date: 2026-11-23. Scope: `ui/` only. No sheet contract change, no manual sheet step.

## Intent

The header shows 14 flat links, and the order interleaves the Journal sheet and the Gacha sheet.
The owner's daily page is Anomaly. The goal is a short, stable header, grouped by sheet, that
keeps Anomaly one tap away. The Log page also needs a fix: it renders the 20 newest entries of
both audit logs in one long list, so the Gacha log sits below the Journal log.

## Goals

- Header shows three groups: `Journal`, `Gacha`, `Log`. A second row shows the active group's
  links, and fits at phone width.
- Anomaly stays the landing page.
- Log shows one sheet at a time, newest first, with infinite scroll.
- Old bookmarks keep working.

## Non-goals and anti-goals

- No sidebar or drawer.
- No change to any form's fields, validation or save behaviour.
- No server-side state. Only the remembered pull form lives in the browser.
- Do not edit or delete the `Special` sheet tab. The app never edits tabs.

## Approaches considered

Navigation:

1. Two-level header (chosen). Three top groups, a second row for the active group. Small change in
   `App.vue` plus nested routes.
2. A Gacha hub page with cards. Shorter header, but every gacha entry costs an extra tap.
3. Sidebar or drawer. Scales best, but is the largest change and too much for about 12 pages.

Gacha selector (the six pull forms):

1. Native `<select>` (chosen). One row, no wrapping, phone picker for free, accessible. Costs a
   second tap.
2. Chip grid. One tap, but wraps to two rows on a phone, which is the problem being solved.
3. Chip row for the pulls plus a separate link row for Spending and Costumes. Two controls where
   the owner wanted one.

## Design

### Routes and header

| Group | Sub links |
| --- | --- |
| Journal | Anomaly, Gear, Level, Solo Raid |
| Gacha | Pulls, Spending, Costumes |
| Log | none |

Routes are nested: `/journal/anomaly`, `/journal/gear`, `/journal/level`, `/journal/solo-raid`,
`/gacha/pulls`, `/gacha/spending`, `/gacha/costumes`, `/log`. The active group comes from the URL,
not from a hand-kept list.

Redirects: `/` goes to `/journal/anomaly`. The old flat paths (`/anomaly`, `/gear`, `/level`,
`/solo-raid`, `/spending`, `/costumes`) go to their new paths. The old form paths (`/social`,
`/event`, `/ordinary`, `/mold`, `/exchange`, `/extra`) go to `/gacha/pulls`. `/special` goes to
`/journal/anomaly`.

The sub row is hidden for Log. The top row and sub row keep the existing 44px minimum touch
target (`min-h-11`).

### Pulls page

A new `Pulls` page holds a `<select>` with the six forms: Social, Event, Ordinary, Mold, Exchange,
Extra. It renders the chosen existing form page below the select. The form pages (`Social.vue`,
`Event.vue`, `Ordinary.vue`, `Molds.vue`, `SpareBody.vue`, `Other.vue`) are not changed. The
selection is remembered in `localStorage` (wrapped in try/catch, the page works without it) and
defaults to Event on a first visit. The selection is page state, not a route.

Guard (owner's decision): when the shown form has unsaved input, changing the select asks for
confirmation first. Cancel keeps the current form and its input and restores the select to it.
Confirm switches and discards the input. A saved or untouched form switches without a prompt.
The guard covers the select only. Leaving Pulls through the header is not guarded.

No dirty-state pattern exists in the codebase today, so the builder decides how each form reports
"has unsaved input" (a shared composable or a store getter, whichever fits how the six forms
already hold their input) and uses one mechanism for all six.

### Special removal

Delete `src/pages/Special.vue`, its route and its link. Redirect `/special`. The `Special` sheet
tab stays untouched.

### Log

One `/log` page with in-page tabs `Journal | Gacha`, sourced from `SPREADSHEETS`. Each tab loads
only its own audit tab, so opening one never waits on the other sheet.

Paging reuses what `logStore` already does: find the last used row from column A, then read a
fixed-size chunk from the bottom with `readRows`. Infinite scroll reads the next older chunk
(rows `last - n*CHUNK` and up, never below row 2) when the end of the list scrolls into view.
Keep the cursor per tab in the store, so switching tabs does not re-read. A failing sheet marks
only its own tab with the error, as now. Refresh resets both tabs.

Read-only. The existing hand-cleared-row filter stays.

## Constraints

- `ui/CLAUDE.md` rules apply: run Prettier from `ui/`, keep the existing Tailwind tokens.
- Reads go through the existing `SheetsApi`. Headers and tab names stay verbatim.
- The hash history mode stays, so Cloudflare needs no rewrite rules.

## Left to the builder

- The tab labels and `Pulls` name are placeholders; the owner may rename.
- Chunk size. The current constant is 20.
- How the infinite scroll triggers (`IntersectionObserver` sentinel is the obvious choice).
- How the dirty state is detected and how the confirmation is shown (see Pulls page).
- Tests: route redirects, group detection from the URL, the chunk cursor in `logStore`, and the
  select guard (blocked when dirty, allowed when clean or after save).
