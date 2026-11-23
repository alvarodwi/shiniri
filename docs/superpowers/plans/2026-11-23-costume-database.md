# CostumeDatabase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The CLI fetches and stores every Nikke's roledata, appends every costume to a new `CostumeDatabase` tab (marking equipped ones `TRUE`), downloads the medium costume images, and the UI shows owned costumes as an infinite-scroll gallery.

**Architecture:** A new `roledata.py` owns fetching, storing and reading roledata. `costume_sheet.py` mirrors `nikke_sheet.py` and is called from `profile._check` next to `roster_sheet`. The dev tool `cli/tools/assets.py` reads the stored roledata and adds the `mi` images. The UI adds a read-only tab spec, service, store, page and route, following `nikkeDatabase.ts` and `logStore.ts`.

**Tech Stack:** Python 3.14 + uv + pytest + httpx (cli); Vue 3 + Pinia + UnoCSS + Vitest + Yarn 4 (ui).

**Spec:** `docs/superpowers/specs/2026-11-23-costume-database-design.md`

**Commits:** `CLAUDE.md` says never commit unless the owner asks, so this plan has no commit steps. Stop after each task and leave the tree for the owner.

## Global Constraints

- The sheet is append-only. The only writer is `write_rows` (`cli/src/shiniri_cli/sheets.py`). Never update or clear a cell, never touch `owned` on an existing row.
- `CostumeDatabase` headers, in order, verbatim: `costumeId`, `nikke`, `costumeName`, `grade`, `source`, `image`, `owned`. Column A (`costumeId`) is the dedupe key.
- `source` takes only: `Collab Alt Costume`, `Mission Pass`, `Cash Shop`, `Login Reward`, `Event Pass`, `Popularity Poll`, `Costume Gacha`, or blank when unknown.
- `owned` is written as a boolean `TRUE` / `FALSE` (not a checkbox). The UI reads a cell as owned when its trimmed text is `TRUE`, ignoring case. `costume_id` 0 in `GetUserCharacters` means no costume.
- Form value for the audit row: `cli-costume-database`.
- Image path: `character/mi/mi_c{resource_id:03}_{costume_index:02}_s.webp`, stored as-is in `image`, saved to `ui/public/img/nikke/mi/<file name>`.
- Roledata is gitignored (`cli/data/`). `watch` never imports `cli/tools/`.
- The UI keeps no local copy of sheet rows and never writes to `CostumeDatabase`.
- Run all `uv` commands from `cli/`, all `yarn` commands from `ui/`.

## Review Focus

1. One roledata file fails (404, bad JSON): it is skipped and logged, the rest still save (Task 1).
2. A costume that is hidden, has a non-int `id`, or has no usable `resource_id` is skipped, never a crash (Task 1).
3. The roster call fails or returns no characters: nothing is appended, because a row written `FALSE` can never be corrected by the CLI (Task 4).
4. An id typed by hand as text (`"130007"`) in column A is not appended again (Task 4).
5. A Nikke missing from `NikkeDatabase`: its costumes are skipped, named in the log line, and written on a later check (Task 4).
6. The `owned` cell is boolean `true`, `"TRUE"`, `"true"`, `"FALSE"` or blank; only the first three count (Task 6). A missing image file shows the fallback tile; zero owned costumes shows an empty state (Task 7).

---

### Task 1: Roledata fetch, store and read (`cli/src/shiniri_cli/roledata.py`)

**Files:**
- Create: `cli/src/shiniri_cli/roledata.py`
- Test: `cli/tests/test_roledata.py`

**Interfaces:**
- Consumes: `fetch.ROLEDATA_PATH`, `fetch.cdn_url(path) -> str`, `fetch.CDN_HEADERS`, `Store.load_raw(name, default)`, `Store.save_raw(name, obj)`, `Store.state()`, `Store.mark(event)`.
- Produces:
  - `raw_name(rid: int) -> str` returns `f"roledata/{rid}"` (stored at `data/raw/json/roledata/{rid}.json`).
  - `resource_ids(store: Store) -> list[int]`: unique int `resource_id`s of `nikke_list_en`, in list order.
  - `missing_ids(store: Store) -> list[int]`: ids with no stored roledata file.
  - `costume_entries(data: dict) -> list[dict]`: the usable entries of `data["character_costume_list"]`. Drops any entry that is not a dict, is hidden (`is_hidden` true), or lacks an int `id`, an int `resource_id` or an int `costume_index`.
  - `image_path(costume: dict) -> str`: the `character/mi/...webp` path above.
  - `async fetch_roledata(store: Store, client: httpx.AsyncClient, *, force: bool, limit: int = 4) -> str`: the log line, e.g. `roledata new 3 · failed 1`. Fetches ids with no file, or every id when `force`. Never raises.
  - `needs_full_refresh(store: Store, day: str) -> bool`: true when `store.state().get("roledata", "")[:10] != day`.

- [ ] **Step 1: Check the real file shape.** With the owner's cookie-less CDN access, fetch one roledata file (`roledata/19-v2-en.json` through `cdn_url`) and print its top-level keys and `character_costume_list`. Confirm `character_costume_list` is a top-level key. If it is nested, adjust `costume_entries` and its test to the real path, and tell the owner.
- [ ] **Step 2: Write the failing tests** in `tests/test_roledata.py` (use `httpx.MockTransport` for the client, the `store` fixture from `conftest.py` for files):
  - `test_costume_entries_drops_hidden_and_malformed`: a list holding one good entry, one `is_hidden: True`, one with `id` `"x"`, one `None`; assert only the good one comes back.
  - `test_image_path`: entry `{"resource_id": 19, "costume_index": 1}` gives `"character/mi/mi_c019_01_s.webp"`.
  - `test_resource_ids_unique_in_order`: nike list with a repeated and a non-int `resource_id`; assert unique ints in order.
  - `test_fetch_saves_missing_only`: ids `[19, 20]`, file for 19 already stored; assert one request for 20, the line is `roledata new 1`, and `store.load_raw("roledata/20")` returns the response.
  - `test_fetch_force_refetches_all`: same setup, `force=True`, two requests.
  - `test_fetch_one_failure_does_not_abort`: 19 answers 404, 20 answers 200; the line contains `failed 1`, 20 is stored, 19 is not.
  - `test_needs_full_refresh`: no state gives true; `store.mark("roledata")` then `needs_full_refresh(store, today)` gives false; a different `day` gives true.
- [ ] **Step 3: Run `uv run pytest tests/test_roledata.py -v`.** Expected: FAIL (module missing).
- [ ] **Step 4: Implement `roledata.py`** with the signatures above. Fetch with `client.get(cdn_url(ROLEDATA_PATH.format(resource_id=rid)), headers=CDN_HEADERS, timeout=30.0)`, `raise_for_status()`, `.json()`; bound concurrency with an `asyncio.Semaphore(limit)`; save with `store.save_raw(raw_name(rid), data)`. Call `store.mark("roledata")` only when nothing failed.
- [ ] **Step 5: Run `uv run pytest tests/test_roledata.py -v`.** Expected: PASS.

---

### Task 2: Wire the roledata fetch into `watch` and the shell

**Files:**
- Modify: `cli/src/shiniri_cli/profile.py` (`refresh_reference`, `_check` call at the top of `_check`)
- Modify: `cli/src/shiniri_cli/cli.py` (`do_sync`, around line 452)
- Test: `cli/tests/test_profile.py`, `cli/tests/test_cli.py`

**Interfaces:**
- Consumes: `roledata.fetch_roledata`, `roledata.needs_full_refresh`, `profile.game_day(now: datetime) -> str`.
- Produces: `refresh_reference(store: Store, now: datetime | None = None) -> str` (existing callers unchanged; `now` defaults to `datetime.now()`). The line gains ` · ` plus the roledata line. `do_sync` also runs `fetch_roledata(..., force=True)` and prints its line, so the owner's machine gets the files.

- [ ] **Step 1: Write the failing tests.**
  - In `test_profile.py`: `test_refresh_reference_includes_roledata_line` (extend the existing `test_refresh_reference_line` monkeypatch style: patch `profile.fetch_roledata` to return `"roledata new 2"`, assert the returned line ends with `· roledata new 2`).
  - `test_refresh_reference_skips_full_refresh_same_day`: with `store.mark("roledata")` just done, assert `fetch_roledata` is called with `force=False`; with an old state, `force=True`.
  - `test_refresh_reference_never_raises` (already exists) must still pass when roledata raises: patch `fetch_roledata` to raise `RuntimeError`, assert the line still starts with `sync:` and contains `roledata: RuntimeError`.
  - In `test_cli.py`: `test_sync_command_fetches_roledata`: patch `fetch_roledata`, run `do_sync`, assert it was called with `force=True`.
- [ ] **Step 2: Run** `uv run pytest tests/test_profile.py tests/test_cli.py -v`. Expected: the four new tests FAIL.
- [ ] **Step 3: Implement.** In `refresh_reference`, after `sync_reference` and inside the same `cdn` client block, append the roledata line from `fetch_roledata(store, cdn, force=needs_full_refresh(store, game_day(now)))`, wrapped so an exception becomes `roledata: <Type>: <msg>`. In `_check`, pass `now=now`. In `do_sync`, call it with `force=True` and print the line.
- [ ] **Step 4: Run** `uv run pytest tests/test_profile.py tests/test_cli.py -v`. Expected: PASS.
- [ ] **Step 5: Owner checkpoint.** Ask the owner to run `sync` in the CLI shell once so `data/raw/json/roledata/` fills. Do not continue to Task 3 until the owner confirms the files exist.

---

### Task 3: Owner review of the `source` phrases (no code until done)

**Files:**
- Create (by Task 4): the `SOURCE_BY_PHRASE` table in `cli/src/shiniri_cli/costume_sheet.py`

**Interfaces:**
- Produces: the owner-approved mapping from a description's `Obtained from X` phrase to one of the seven `source` values.

- [ ] **Step 1: List the phrases.** Run from `cli/`:
  `uv run python -I -c "from shiniri_cli.store import Store; from shiniri_cli.roledata import *; from pathlib import Path; s=Store(Path('.')); import collections as c; n=c.Counter(); [n.update([e.get('costume_description_locale','').split('\n')[-1]]) for r in resource_ids(s) for e in costume_entries(s.load_raw(raw_name(r), {}))]; print(*n.most_common(), sep='\n')"`
  Expected: a count per distinct last description line, including `Obtained from the Costume Gacha.`.
- [ ] **Step 2: Show the owner the list** (phrase and count) and ask which of the seven sources each phrase is. Record the answers in the plan's Task 4 test as the table. Costumes whose phrase the owner leaves unmapped stay blank.
- [ ] **Step 3: Stop here until the owner has answered.** Task 4 consumes the table.

---

### Task 4: `CostumeDatabase` sync (`cli/src/shiniri_cli/costume_sheet.py`)

**Files:**
- Create: `cli/src/shiniri_cli/costume_sheet.py`
- Modify: `cli/src/shiniri_cli/roster_sheet.py` (extract `fetch_characters`)
- Modify: `cli/src/shiniri_cli/profile.py` (`_check`, after the `RosterLog` block)
- Test: `cli/tests/test_costume_sheet.py`, `cli/tests/test_roster_sheet.py`, `cli/tests/test_profile.py`

**Interfaces:**
- Consumes: `roledata.resource_ids / costume_entries / image_path / raw_name`, `sheets.write_rows / column_a / int_ids / SheetsError / SheetsApi`, `roster_sheet.database_names(values) -> dict[int, str]`.
- Produces:
  - `roster_sheet.fetch_characters(client, openid: str) -> list` (async): the `data.characters` list; raises `SheetsError` on a non-zero `code` or an empty/absent list. `sync_roster_log` calls it, behaviour unchanged.
  - `costume_sheet.TAB = "CostumeDatabase"`, `FORM = "cli-costume-database"`, `HEADERS` (the seven, in order).
  - `costume_sheet.SOURCE_BY_PHRASE: dict[str, str]`: keyed on the text after `Obtained from ` with the trailing `.` removed (for example `"the Costume Gacha"`), values from the seven. Filled from Task 3. Owner-approved (2026-11-23): `the Costume Gacha`, `Costume Gacha`, `the costume Gacha` -> `Costume Gacha`; `a Mission Pass`, `Mission Pass` -> `Mission Pass`; `an Event Pass` -> `Event Pass`; `the Costume Shop` -> `Cash Shop`; `a login event`, `Login Event`, `login event in Memories of Spring` -> `Login Reward`. Every other phrase (`an event`, named event missions, `AEGIS THE DIVER`, `Re:CIPE FOR YOU`, `the CBT Special Costume`, `a package`) stays blank. Match the phrase case-insensitively.
  - `costume_sheet.source_for(description: str) -> str`: looks up the last line of the description; `""` when it is not `Obtained from ...` or not in the table.
  - `costume_sheet.costume_rows(store: Store, names: dict[int, str], equipped: set[int]) -> tuple[list[list], list[str]]`: rows `[costumeId, nikke, costumeName, grade, source, image, owned]` sorted by `costumeId`, the first of a repeated id winning, plus notes (`<id> not in NikkeDatabase` once per missing Nikke, `no roledata for <rid>`). `owned` is a Python `bool`.
  - `async sync_costume_database(store: Store, client, openid: str, api: SheetsApi, *, timestamp: str) -> str`: appends the ids the tab lacks in one `write_rows` block; the log line `CostumeDatabase +N (skipped ...)`. Never raises.

- [ ] **Step 1: Write the failing tests** in `tests/test_costume_sheet.py` using `FakeSheets` and the `AUDIT` dict from `test_nikke_sheet.py`:
  - `test_row_shape`: one Nikke (resource_id 19, name_code 5185, name "Marian: Queen"), roledata costume `{id 130007, resource_id 19, costume_index 1, costume_grade_id "Unique", costume_name_locale "Last Affection", costume_description_locale "Marian: Queen costume.\nObtained from the Costume Gacha.", is_hidden False}`, `equipped={130007}`. Assert the row is `[130007, "Marian: Queen", "Last Affection", "Unique", "Costume Gacha", "character/mi/mi_c019_01_s.webp", True]`.
  - `test_owned_false_when_not_equipped`: same with `equipped=set()` gives `False`.
  - `test_unmapped_description_gives_blank_source`: description `"Obtained from somewhere new."` gives `""`.
  - `test_nikke_missing_from_database_is_skipped_and_noted`: names without 5185; no rows, a note containing `not in NikkeDatabase`.
  - `test_sorted_by_costume_id_and_first_repeat_wins`.
  - `test_sync_appends_only_missing_ids`: column A already holds `130007` as the text `"130007"`; assert nothing is written and the line is `CostumeDatabase +0`.
  - `test_sync_writes_one_block_with_audit`: one new costume; assert one `batch_update` whose second item is the audit row with form `cli-costume-database`.
  - `test_sync_writes_nothing_when_roster_call_fails`: a mock client answering `code` 1; assert no `batch_update` and the line starts `CostumeDatabase:`.
  - `test_sync_never_raises_on_header_mismatch`: wrong header row in the fake; the line starts `CostumeDatabase:`.
  - In `test_roster_sheet.py`, keep the existing tests green after the extraction (no new test needed beyond them).
- [ ] **Step 2: Run** `uv run pytest tests/test_costume_sheet.py -v`. Expected: FAIL (module missing).
- [ ] **Step 3: Extract `fetch_characters`** from `sync_roster_log` into `roster_sheet.py` and call it there. Run `uv run pytest tests/test_roster_sheet.py -v`. Expected: PASS unchanged.
- [ ] **Step 4: Implement `costume_sheet.py`** with the signatures above. Join Nikke names the way `roster_sheet` does: costume `resource_id` to the first `nikke_list_en` entry with that `resource_id` to its `name_code` to `names[name_code]`, with `names` from `database_names(api.get_values("'NikkeDatabase'!A:B", unformatted=True))`. `equipped` is the set of positive int `costume_id`s of the characters. Fetch characters before reading the tab; on `SheetsError` return the log line and write nothing. Fill `SOURCE_BY_PHRASE` with the Task 3 answers.
- [ ] **Step 5: Wire `_check`.** After the `RosterLog` try/except, add the same shape for the costume sync: an inner `async def costumes()` using `make_client(cookies)` and `sync_costume_database(store, client, cookies["game_openid"], gacha, timestamp=wib_timestamp(now))`, logged, with the same `except Exception` fallback line `CostumeDatabase: <Type>: <msg>`. In the `else` branch (no `gacha_spreadsheet_id`) also log `CostumeDatabase: no gacha_spreadsheet_id`. Extend the existing `_check` test in `test_profile.py` to assert a `CostumeDatabase` line is logged.
- [ ] **Step 6: Run** `uv run pytest -q`. Expected: all pass.

---

### Task 5: Download tool: roledata precheck and `mi` images (`cli/tools/assets.py`)

**Files:**
- Modify: `cli/tools/assets.py`
- Test: `cli/tests/test_assets.py`

**Interfaces:**
- Consumes: `roledata.missing_ids / resource_ids / costume_entries / image_path / raw_name`, `Store`.
- Produces:
  - `STORE_ROOT = Path(__file__).resolve().parents[1]` (the `cli/` folder).
  - `costume_jobs(store: Store, root: Path) -> list[Job]`: one `Job(cdn_url(image_path(c)), root / "nikke" / "mi" / <file name of image_path(c)>, None)` per usable costume of every stored roledata file.
  - `main_async(client=None, root=IMG_ROOT, store=None) -> int`: after the `cwebp` check and before any request, calls `missing_ids(store)`; if non-empty prints `roledata missing for N Nikkes (first: 19, 20, 21); run sync first` and returns 1.

- [ ] **Step 1: Write the failing tests** in `test_assets.py` (existing `MockTransport` style):
  - `test_costume_jobs_paths`: a store with one roledata file holding Marian's costume; assert one job whose `dest` is `root/"nikke"/"mi"/"mi_c019_01_s.webp"` and whose `args` is `None`.
  - `test_main_stops_before_any_request_when_roledata_missing`: store with a nikke list but no roledata; the transport asserts it is never called; the return value is 1 and the output names the missing count.
  - `test_main_downloads_costume_images`: with roledata present, assert the `mi` file is written from an `image/webp` response and existing files are skipped on a rerun.
- [ ] **Step 2: Run** `uv run pytest tests/test_assets.py -v`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** `costume_jobs`, the precheck, and add the costume jobs to the existing `run(client, jobs + item_jobs(...) + costume_jobs(...))` call. The `si` and item steps stay as they are.
- [ ] **Step 4: Run** `uv run pytest -q`. Expected: all pass.
- [ ] **Step 5: Owner checkpoint.** Ask the owner to run `uv run python tools/assets.py`, check the size of `ui/public/img/nikke/mi/`, and review the 40 MB of untracked `ui/public/img/c201_00*.png` files separately; they are not part of this work. If the size is a surprise, tell the owner before anything is committed.

---

### Task 6: UI tab spec, service and mock data

**Files:**
- Modify: `ui/src/config/sheets.ts`, `ui/src/config/sheets.test.ts`, `ui/src/services/mock/fixtures.ts`
- Create: `ui/src/services/costume/costumeDatabase.ts`, `ui/src/services/costume/costumeDatabase.test.ts`

**Interfaces:**
- Consumes: `NIKKE_DATABASE_TAB` as the pattern, `checkHeaders(spec, header)`, `SheetsApi.getValues(spreadsheetId, range, 'UNFORMATTED_VALUE')`, `cellToIsoDate`.
- Produces:
  - `COSTUME_DATABASE_TAB: TabSpec` (gacha spreadsheet, tab `CostumeDatabase`, the seven headers).
  - `type Costume = { costumeId: string; nikke: string; costumeName: string; grade: string; source: string; image: string; owned: boolean; releaseDate: string }`.
  - `toCostumes(rows: string[][], releaseDateCol?: number): Costume[]`: skips rows with a blank `costumeId`, `nikke` or `costumeName`; trims cells; `owned` is `String(cell).trim().toUpperCase() === 'TRUE'`; `releaseDate` comes from `releaseDateCol` when given, through `cellToIsoDate`, otherwise `''`.
  - `readCostumes(api: SheetsApi): Promise<Costume[]>`: reads `A1:Z`, runs `checkHeaders` on the first seven header cells only, finds the column whose header is exactly `releaseDate` beyond column G (the owner's lookup column) and passes its index.
  - `ownedNewestFirst(costumes: Costume[]): Costume[]`: owned only, reverse sheet order.
  - `searchOwned(costumes: Costume[], query: string): Costume[]`: owned, newest first, matching `nikke` or `costumeName` case-insensitively; a blank query matches all owned.
  - `costumeImage(image: string): string | null`: `${import.meta.env.BASE_URL}img/nikke/mi/<file name>` for a `character/mi/....webp` path, `null` otherwise.

- [ ] **Step 1: Write the failing tests.**
  - `sheets.test.ts`: `CostumeDatabase` shape check with the seven headers.
  - `costumeDatabase.test.ts`: `toCostumes maps every column`, `owned is true for true, "TRUE" and "true"; false for "FALSE", blank and a missing cell`, `skips rows with a blank costumeId, nikke or costumeName`, `reads releaseDate from the lookup column when present`, `ownedNewestFirst reverses and drops unowned`, `searchOwned matches nikke or costume name and keeps newest first`, `costumeImage maps the path and returns null for a path outside character/mi`, `readCostumes throws HeaderMismatchError on a renamed header`, and `readCostumes finds releaseDate in column K` against `createMockSheetsApi(MOCK_SHEETS)`.
- [ ] **Step 2: Run** `yarn vitest run src/config/sheets.test.ts src/services/costume`. Expected: FAIL.
- [ ] **Step 3: Implement** the tab spec and the service with the signatures above. Add a `tab(COSTUME_DATABASE_TAB, [...])` seed in `fixtures.ts` with a mix of `true`/`false` `owned` values (Marian's row first, then two more) and an `AuditLog` row for `cli-costume-database`, shaped like the `NikkeDatabase` seed.
- [ ] **Step 4: Run** `yarn vitest run src/config/sheets.test.ts src/services/costume src/services/mock`. Expected: PASS.

---

### Task 7: Store, page, route and nav

**Files:**
- Create: `ui/src/stores/costumeStore.ts`, `ui/src/stores/costumeStore.test.ts`, `ui/src/pages/Costumes.vue`
- Modify: `ui/src/router/index.ts`, `ui/src/App.vue`

**Interfaces:**
- Consumes: `readCostumes`, `searchOwned`, `costumeImage`, `sheetsApi` from `@/stores/authStore`.
- Produces: `useCostumeStore` with state `{ costumes: Costume[]; status: 'idle' | 'loading'; error: string | null }` and `load(api: SheetsApi = sheetsApi): Promise<void>`. Route `/costumes`, nav label `Costumes`.

- [ ] **Step 1: Write the failing store tests** (style of `logStore.test.ts`): `load fills costumes and returns to idle`, `load records the error message and keeps status idle when the read fails`, `load ignores a second call while loading`.
- [ ] **Step 2: Run** `yarn vitest run src/stores/costumeStore.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the store.**
- [ ] **Step 4: Implement `Costumes.vue`** in the style of `Log.vue` (`mx-auto max-w-xl`, a Refresh button, `aria-busy`, a live region). It holds a search input (labelled), a `visible` count starting at 24, and an `IntersectionObserver` on a sentinel element after the grid that raises `visible` by 24 while `visible < results.length`. Changing the query resets `visible` to 24. The grid is two columns on a phone. Each card shows the image (`loading="lazy"`, `@error` swaps to a fallback tile with the costume name's first letter, as `NikkePicker.vue` does), the `nikke`, the `costumeName`, and `releaseDate` only when it is not blank. Show `No owned costumes yet.` when `searchOwned(..., '')` is empty and `No match.` when only the filter empties it. Disconnect the observer on unmount.
- [ ] **Step 5: Add the route** `{ path: '/costumes', component: Costumes }` in `router/index.ts` and `{ to: '/costumes', label: 'Costumes' }` in `App.vue`'s `links`.
- [ ] **Step 6: Run the full UI check** `yarn format && yarn lint && yarn check && yarn build && yarn test`. Expected: all pass.
- [ ] **Step 7: Look at it.** Run `yarn dev:mock`, open `http://localhost:5173/#/costumes`, and confirm the grid, the search, the fallback tile for the mock's missing images, and the empty states. Report what you saw; the sketch in the spec is the reference.

---

## Handoff to the owner (not code)

Before release, in order:
1. Create the `CostumeDatabase` tab with the seven headers on the real sheet and on the copy.
2. Add the lookup formulas (`releaseDate`, `priceUsd`) to the right of column G.
3. Pull `develop` on the homeserver and run a `watch` check; confirm `CostumeDatabase +N` and the `owned` values.
4. Release the UI per `ui/CLAUDE.md` after the images are committed.

## Self-review notes

- **Spec coverage:** sheet and headers (Tasks 4, 6), `owned` rules (4, 6), `source` derivation and owner-confirmed table (3, 4), roledata fetch and daily refresh (1, 2), download precheck and images (5), UI page, search, infinite scroll, fallback, `releaseDate` only when filled (6, 7), mock data (6), manual sheet step (handoff).
- **Calls the spec left to the builder, made here:** roledata files live in a `roledata/` subfolder of `data/raw/json/`; concurrency 4; the costume sync makes its own `GetUserCharacters` call through the extracted `fetch_characters`; hidden costumes (`is_hidden` true) are not catalogued or downloaded; `releaseDate` is read by finding a header of that name beyond column G, since its position is the owner's.
