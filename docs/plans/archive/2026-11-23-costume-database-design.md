# CostumeDatabase: every costume in the game, and a gallery of the ones I own

## Intent

The gacha tracker's last open piece is `CostumeGallery`. It was waiting on medium image URLs. While
tracing them, the owner found that blablalink never says which costumes the account has bought. It
exposes only the costume each Nikke has equipped (`costume_id` in `GetUserCharacters`). An
unequipped costume never appears.

So ownership cannot be read from the game. The fix is to catalogue every costume the game has, the
way `NikkeDatabase` catalogues every Nikke, mark the equipped ones as owned automatically, and let
the owner tick the rest by hand. A UI page then shows the owned ones as a gallery.

## Goals

- A new sheet tab, `CostumeDatabase`, written by the CLI, listing every costume in the game.
- Costumes found equipped on the account are marked owned when their row is appended. The owner
  ticks every other owned costume by hand.
- The CLI stores the detailed roledata JSON of every Nikke, which is the source of the catalogue.
- Medium costume images (`character/mi/...`) are downloaded into the UI's public folder and served
  with the UI.
- A read-only UI page shows owned costumes as a searchable, infinitely scrolling gallery.

## Non-goals

- `CostumeGallery` is not changed. It stays the owner's hand-curated tab
  (`releaseDate pic nikke skinName source priceUsd`). The owner joins it to `CostumeDatabase` with
  formulas.
- No CLI write ever touches `owned` on an existing row.
- The UI never writes to the sheet, and never marks ownership.
- No "5 random costumes" strip, and no view of unowned costumes.
- Default costumes (`costume_index` 0 and the `_00_` art) are not catalogued. The `si` icon already
  covers `_00_`. Roledata lists the purchasable skins.
- No TypeScript port of the CDN URL obfuscation.

## Anti-goals

- Any CLI behaviour that edits, clears or reorders existing sheet cells, including `owned`.
- A server-side copy of catalogue data. The sheet stays the source of truth.
- The download tool fetching roledata itself, or silently producing a partial image set.

## Constraints

From `CLAUDE.md`:

- The sheet is append-only. The writer is `write_rows` (CLI) and keys on column A. A rerun must not
  duplicate rows.
- A contract change goes on one branch under one spec for `ui/` and `cli/`. This is that spec.
- Sheet strings must match the sheet verbatim. Headers are lowerCamelCase with no spaces.
- The owner creates tabs and headers by hand. Neither part creates tabs.
- The CLI never imports `cli/tools/`. `tools/` is dev-only and runs on the owner's machine.

Specific to this work:

- **Formula columns sit outside the writer's header set.** The owner's lookup formulas
  (`releaseDate`, `priceUsd`) go to the right of the CLI's columns. `write_rows` checks
  headers and target emptiness only across its own `HEADERS` width, so the owner's columns are never
  touched. If the CLI wrote blanks there, or an array formula spilled into a row it wants to append,
  the empty-target check would reject the write.
- **Roledata is gitignored.** `cli/data/` is not in the repo. The homeserver's `watch` fetches and
  keeps the roledata, so the owner's machine has none until the owner runs the CLI fetch once
  locally.

## Approaches

### Where ownership data and curated data live

- **One tab** (extend `CostumeGallery` with CLI-written columns). Rejected: it mixes CLI-appended
  rows with the owner's hand-curated rows and column layout, which breaks the contract's clear
  split.
- **Two tabs, joined by formula.** Chosen. `CostumeDatabase` holds only what roledata provides plus
  `owned`; `CostumeGallery` stays the owner's. The owner pulls the gaps in with lookups.

### Where the medium images live

- **A. Commit every `mi` webp to `ui/public/img/nikke/mi/`.** Chosen. Roughly 200 to 300 files at an
  estimated 5 to 10 MB, which is small for Cloudflare Pages. The cost is repo size and a commit per
  batch. Ticking `owned` in the sheet needs no redeploy.
- **B. Commit only owned costumes.** Rejected: every hand-ticked `owned` would need a tool run and
  a deploy, or the gallery shows a broken image.
- **C. Hotlink the CDN.** Rejected: it needs the TypeScript URL port the image-assets spec ruled
  out, and ties the UI to a third-party host.

## Design

### Sheet: `CostumeDatabase`

One row per costume, keyed on column A. Appended in ascending costume id.

Proposed columns (the exact header text needs the owner's confirmation before anything is written
against the real sheet):

| Header | Source |
| --- | --- |
| `costumeId` (A) | roledata `character_costume_list[].id`, an int. The dedupe key. |
| `nikke` | the Nikke's name from the sheet's `NikkeDatabase`, the same lookup `RosterLog` uses. The owner renames collab names by hand there. |
| `costumeName` | `costume_name_locale` |
| `grade` | `costume_grade_id` (for example `Unique`) |
| `source` | derived from `costume_description_locale` (see "Deriving `source`"), blank when unknown |
| `image` | `character/mi/mi_c{rid:03}_{skin:02}_s.webp`, the CDN path, stored as-is |
| `owned` | written once, at append time: `TRUE` when the costume is equipped on the account, `FALSE` otherwise |

`owned` is plain `TRUE` / `FALSE` values, not a checkbox. The owner changes `FALSE` to `TRUE` by
hand. The UI treats a cell as owned when its trimmed text is `TRUE`, ignoring case.

The `description` column is dropped. It exists only as the input for `source`.

#### Deriving `source`

`source` takes one of the values already used on `CostumeGallery`, which must match verbatim:
`Collab Alt Costume`, `Mission Pass`, `Cash Shop`, `Login Reward`, `Event Pass`, `Popularity Poll`,
`Costume Gacha`.

Roledata has no source field. The only hint is the closing phrase of
`costume_description_locale`; the one known sample ends "Obtained from the Costume Gacha." with
`costume_shop_type` `"None"`. `shopType` is not a column: it adds nothing beyond `source`. The CLI holds a fixed table from known description phrases to these
seven values. A costume whose description is in no table entry is written with a blank `source`,
and the distinct unmapped descriptions are named in the log line. The owner fills them in by hand,
and the table grows when the owner confirms a mapping. The table is not guessed: it is built from
the descriptions found in the stored roledata, and the owner confirms each mapping before it goes
in.

### CLI

1. **Fetch and store roledata.** `fetch.py` already defines `ROLEDATA_PATH`
   (`roledata/{resource_id}-v2-en.json`), marked "not synced yet". Fetch it for every `resource_id`
   in `nikke_list_en` and save each file raw under `data/raw/json/` through `Store.save_raw`. The
   reference refresh in `watch` fetches files that are missing, and re-fetches every file once per
   game day, so a new skin for an existing Nikke shows up. One failed file is logged and skipped,
   and does not abort the run or the other files. Concurrency and pacing are the builder's call.
2. **`costume_sheet.py`**, mirroring `nikke_sheet.py`: `TAB`, `FORM`, `HEADERS`, a `costume_rows`
   function that builds rows from the stored roledata, and a `sync_costume_database` that never
   raises and returns a log line. It reads column A for the ids the tab already has, appends only
   the missing ones in one `write_rows` block, and writes the `AuditLog` row through the writer as
   the other tabs do. Form value: `cli-costume-database` (my call, following `cli-nikke-database`).
3. **Marking `owned`.** The equipped `costume_id` values come from the `GetUserCharacters` response
   the roster step already fetches (`costume_id` 0 means no costume and is ignored). A new row gets
   `owned` `TRUE` when its `costumeId` is among them, and `FALSE` otherwise.
   An existing row is never read for `owned` and never updated. A costume equipped after its row was
   appended is ticked by hand. This follows from the append-only contract, and the owner agreed.
4. **A Nikke not yet in `NikkeDatabase`.** Its costumes are skipped and named in the log line, and
   written on a later check once the Nikke is in the sheet. This matches `RosterLog`.
5. **`watch` wiring** is the builder's call within the existing check flow, since the roster step
   already holds the response `owned` needs.

### Download tool (`cli/tools/assets.py`)

- Before any download, require that every `resource_id` in the local `nikke_list_en` has a roledata
  file in `data/raw/json/`. If any are missing, print how many and the first few ids, tell the owner
  to run the CLI fetch, and exit before any request. This mirrors the existing `cwebp` precheck.
- The tool does not fetch roledata itself.
- For every costume in each roledata file, download
  `character/mi/mi_c{rid:03}_{skin:02}_s.webp` through the existing computed CDN URL, save it as-is
  to `ui/public/img/nikke/mi/`, and skip files that exist. The `si` and item steps are unchanged.

### UI

- A new route and nav entry, in the style of the existing pages. The page is read-only.
- A service next to `nikkeDatabase.ts` reads `CostumeDatabase` and keeps the rows where `owned` is
  `TRUE`. It never reads `CostumeGallery`.
- Order: newest first, which is reverse sheet order. Appended rows follow the game's id order.
- Infinite scroll: 24 cards at a time, an `IntersectionObserver` on a sentinel at the bottom loads
  the next batch, and `loading="lazy"` on the images.
- Search filters owned costumes by Nikke name or costume name. The filter runs before the batching.
- Image URL: the stored `character/mi/...` path maps to `/img/nikke/mi/...`. A missing file shows a
  fallback tile with the costume's first letter, as `NikkePicker` does.
- Show `releaseDate` on a card only when it is filled in. `source` and `priceUsd` are not shown.
- Add a `CostumeDatabase` tab to the mock sheets so mock mode renders the page.

```
Costumes                      [ search nikke or costume... ]
42 owned

+--------+ +--------+ +--------+ +--------+
|  mi    | |  mi    | |  mi    | |  mi    |
| image  | | image  | | image  | | image  |
+--------+ +--------+ +--------+ +--------+
|Marian  | |Rapi    | |Anis    | |Neon    |
|Last Aff| |Red Hood| |Sparkl..| |Blue Ocn|
+--------+ +--------+ +--------+ +--------+
   ... more load as you scroll ...
```

## Manual sheet step before release

The owner must create the `CostumeDatabase` tab on the **real sheet, and on the copy**, with the
final header row, before the CLI or UI is released. The CLI never creates tabs. The owner then adds
the lookup formulas (`releaseDate`, `priceUsd`) into the columns to the right of the CLI's columns,
joining to `CostumeGallery` on `nikke` and `skinName` together. `source` is now a CLI column, so it
no longer needs a lookup. Where the CLI leaves it blank, the owner types it in. A costume name alone can repeat across Nikkes.

## Open items

For the owner:

1. The exact header text of `CostumeDatabase`, confirmed against the proposed table above (with
   `source` in place of `description`).
2. The description-to-`source` table. Once the roledata is fetched, the builder lists the distinct
   description phrases, and the owner says which of the seven sources each one is.

Settled:

- `owned` is `TRUE` / `FALSE` text, not a checkbox.
- The equipped `costume_id` in `GetUserCharacters` is the same id as roledata's
  `character_costume_list[].id`. The owner's samples show `costume_id` 130007 on `name_code` 5185
  (`resource_id` 19, "Marian: Queen") and a roledata costume `id` 130007 on `resource_id` 19.

For the builder:

- Where roledata files sit inside `data/raw/json/` (flat names or a subfolder, as `union/` does).
- Concurrency and pacing for the daily roledata refresh.
- How `watch` passes the roster response to the costume sync.

## Testing

- CLI: tests against fakes, as the rest of `cli/tests/` does (`FakeSheets`, `httpx.MockTransport`):
  `costume_rows` (field mapping, the default `_00_` skin absent, repeated ids, a Nikke missing from
  `NikkeDatabase`), `sync_costume_database` (appends only missing ids, rerun adds nothing, `owned`
  set only on new rows and never on existing ones), roledata fetch (one failure does not abort the
  rest), and the download tool precheck (missing roledata stops before any request).
- UI: the service filters on `owned`, orders newest first and maps the image path. The batching and
  search filter are tested as plain functions.
- Real API behaviour, including the id check above, is only verifiable in a `watch` run on the
  homeserver.
