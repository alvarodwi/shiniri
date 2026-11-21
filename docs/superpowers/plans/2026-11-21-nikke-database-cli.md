# NikkeDatabase tab (cli) Implementation Plan

> **For agentic workers:** Execute natively in this session (root `CLAUDE.md`, Development flow
> step 3). Steps use checkbox (`- [ ]`) syntax for tracking. Don't commit; the owner commits at
> merge. Stop after the checks pass; never start a review.

**Goal:** Every `watch` check appends the Nikkes missing from the gacha spreadsheet's
`NikkeDatabase` tab, built from `data/raw/json/nikke_list_en.json`.

**Architecture:** A new module `nikke_sheet.py` turns the raw list into rows and appends the missing
ones through the existing `write_rows`, keyed on column A (`nameCode`), like `union_sheet.py`.
`profile._check` calls it once per check, right after the reference sync, against a second
`HttpSheets` built from `gacha_spreadsheet_id`, and logs its line.

**Tech Stack:** Python 3.14, uv, pytest, httpx. Run everything from `cli/`.

**Spec:** `docs/superpowers/specs/2026-11-21-nikke-database-cli-design.md` (roadmap:
`docs/superpowers/specs/2026-11-21-gacha-tracker-design.md`).

## Global Constraints

- Tab name: `NikkeDatabase`. Headers, exactly and in order: `nameCode`, `name`, `rarity`,
  `manufacturer`, `class`, `burst`, `element`, `weapon`, `resourceId`, `releaseDate`.
- AuditLog form value: `cli-nikke-database`.
- Config key: `gacha_spreadsheet_id` in `config/sheets.json`. Missing-key log line, exactly:
  `NikkeDatabase: no gacha_spreadsheet_id`.
- Values verbatim from the raw file, no translation (`ELYSION`, `Step1`). `releaseDate` always `""`.
- Append-only through `write_rows` (`src/shiniri_cli/sheets.py`). Never update existing rows.
  Never hardcode row numbers.
- A gacha-sheet failure never stops or changes the progression writes (profile, clears, union).
- No new dependencies.

## Review Focus

1. A `name_code` repeated in the raw list: written once, never two rows with the same key.
2. An entry with a missing/non-int `name_code` (or a bool) or an empty name: skipped and named in the
   log line, the rest still written.
3. `nikke_list_en.json` missing (fresh install, failed first sync): `NikkeDatabase +0`, no write, no
   crash.
4. Owner typed something non-numeric in column A by hand: `int_ids` ignores it, known ids still
   skipped (covered by reusing `int_ids`).
5. Header row not created yet or renamed: the line carries the `SheetsError` text; progression
   writes in the same check still run.

---

### Task 1: `nikke_sheet.py` rows and sync

**Files:**
- Create: `cli/src/shiniri_cli/nikke_sheet.py`
- Test: `cli/tests/test_nikke_sheet.py`

**Interfaces:**
- Consumes: `write_rows`, `column_a`, `int_ids`, `SheetsApi`, `SheetsError` from `.sheets`;
  `Store.load_raw("nikke_list_en", [])` from `.store`.
- Produces:
  - `TAB = "NikkeDatabase"`, `FORM = "cli-nikke-database"`, `HEADERS: tuple[str, ...]` (the ten
    headers above).
  - `nikke_rows(nikkes: list) -> tuple[list[list], list[str]]`: rows sorted by ascending `order`
    (an entry without an int `order` sorts last, stable), first occurrence wins on a repeated
    `name_code`; plus one note per skipped entry, `entry <index>` where index is its position in
    the raw list.
  - `sync_nikke_database(store: Store, api: SheetsApi, *, timestamp: str) -> str`: the log line.
    Never raises.

Row shape per entry `n`:
`[n["name_code"], name_localkey.name, original_rare, corporation, class, use_burst_skill,
element_id.element.element, shot_id.element.weapon_type, resource_id, ""]`. Missing nested
fields become `""` (same `(x or {}).get(...)` style as `store.py`).

- [ ] **Step 1: Write the failing tests** in `cli/tests/test_nikke_sheet.py`. Build raw entries
  with a local helper `entry(code, name, order)` returning the full nested shape with the defaults
  `original_rare="SSR"`, `corporation="ELYSION"`, `class="Supporter"`, `use_burst_skill="Step1"`,
  element `"Fire"`, weapon_type `"MG"`, `resource_id=90` (the real Emma entry). Use
  `FakeSheets` from `conftest` and an `AUDIT` dict like `tests/test_clear_sheet.py` line 9; the
  header read range is `'NikkeDatabase'!A1:J1`, column A is `'NikkeDatabase'!A:A`.

```python
def test_row_shape():
    rows, notes = nikke_rows([entry(5005, "Emma", 10001)])
    assert rows == [[5005, "Emma", "SSR", "ELYSION", "Supporter", "Step1", "Fire", "MG", 90, ""]]
    assert notes == []

def test_sorted_by_order_missing_order_last():
    rows, _ = nikke_rows([entry(2, "B", 30), entry(3, "C", None), entry(1, "A", 10)])
    assert [r[0] for r in rows] == [1, 2, 3]

def test_repeated_name_code_written_once():
    rows, _ = nikke_rows([entry(1, "A", 10), entry(1, "A again", 20)])
    assert [r[1] for r in rows] == ["A"]

def test_bad_entries_skipped_and_named():
    rows, notes = nikke_rows([entry(1, "A", 10), entry(None, "X", 11), entry(True, "Y", 12),
                              entry(4, "", 13), "junk"])
    assert [r[0] for r in rows] == [1] and notes == ["entry 1", "entry 2", "entry 3", "entry 4"]

def test_sync_writes_only_missing(store):
    store.save_raw("nikke_list_en", [entry(1, "A", 10), entry(2, "B", 20)])
    api = FakeSheets({**AUDIT, "'NikkeDatabase'!A1:J1": [list(HEADERS)],
                      "'NikkeDatabase'!A:A": [["nameCode"], [1]]})
    assert sync_nikke_database(store, api, timestamp="ts") == "NikkeDatabase +1"
    [[(target, rows), (_, [audit])]] = api.batches
    assert target == "'NikkeDatabase'!A3:J3" and rows[0][0] == 2 and audit[1] == "cli-nikke-database"

def test_sync_nothing_missing_no_write(store):  # also covers a missing raw file
    (store.raw_dir / "nikke_list_en.json").unlink()
    api = FakeSheets({**AUDIT, "'NikkeDatabase'!A1:J1": [list(HEADERS)],
                      "'NikkeDatabase'!A:A": [["nameCode"]]})
    assert sync_nikke_database(store, api, timestamp="ts") == "NikkeDatabase +0" and api.batches == []

def test_sync_notes_skipped(store):
    store.save_raw("nikke_list_en", [entry(1, "A", 10), entry(None, "X", 11)])
    api = FakeSheets({**AUDIT, "'NikkeDatabase'!A1:J1": [list(HEADERS)],
                      "'NikkeDatabase'!A:A": [["nameCode"]]})
    assert sync_nikke_database(store, api, timestamp="ts") == "NikkeDatabase +1 (skipped entry 1)"

def test_sync_header_mismatch_is_the_line(store):
    store.save_raw("nikke_list_en", [entry(1, "A", 10)])
    api = FakeSheets({**AUDIT, "'NikkeDatabase'!A1:J1": [["Name"]], "'NikkeDatabase'!A:A": [["Name"]]})
    line = sync_nikke_database(store, api, timestamp="ts")
    assert line.startswith("NikkeDatabase: NikkeDatabase headers changed") and api.batches == []
```

  Skip notes join with `, ` inside one `(skipped …)`, e.g. `(skipped entry 1, entry 4)`. Any other
  exception becomes `NikkeDatabase: <TypeName>: <message>`, a `SheetsError` becomes
  `NikkeDatabase: <message>` (same split as `sync_union`).

- [ ] **Step 2: Run** `uv run pytest tests/test_nikke_sheet.py -v`. Expected: FAIL, module not
  found.

- [ ] **Step 3: Implement** `cli/src/shiniri_cli/nikke_sheet.py` with the interfaces above. A one-line
  module docstring like `union_sheet.py`'s. `sync_nikke_database` reads
  `int_ids(column_a(api, TAB))`, drops rows whose `nameCode` is in it, returns `+0` without calling
  `write_rows` when nothing is left, else one `write_rows(api, TAB, HEADERS, rows, form=FORM,
  timestamp=timestamp)`.

- [ ] **Step 4: Run** `uv run pytest tests/test_nikke_sheet.py -v`. Expected: all PASS.

### Task 2: wire into `watch`, config docs

**Files:**
- Modify: `cli/src/shiniri_cli/profile.py` (`_check`, around lines 193-216)
- Modify: `cli/tests/test_profile.py` (`test_check_joins_clears_and_union`, around line 224)
- Modify: `cli/README.md:132`, `cli/CLAUDE.md` (Specifics: column A keys list)

**Interfaces:**
- Consumes: `sync_nikke_database(store, api, *, timestamp) -> str` from Task 1;
  `HttpSheets(spreadsheet_id, token, http)`, `service_account_token`, `wib_timestamp` already in
  `profile.py`.
- Produces: one extra `log(...)` line per check, directly after the `sync:` line.

- [ ] **Step 1: Update the test.** In `test_check_joins_clears_and_union`, the existing
  `sheets.json` has no `gacha_spreadsheet_id`, so assert
  `lines == ["sync: raid_list changed", "NikkeDatabase: no gacha_spreadsheet_id", "Campaign: wrote"]`.
  Add `test_check_syncs_nikke_database` next to it: same setup, `sheets.json` =
  `{"spreadsheet_id": "x", "gacha_spreadsheet_id": "g"}`, `HttpSheets` monkeypatched to
  `lambda sid, *a: f"sheets:{sid}"`, `nikke_sheet.sync_nikke_database` monkeypatched to record its
  `api` and return `"NikkeDatabase +2"`. Assert the recorded api is `"sheets:g"`, `lines[1] ==
  "NikkeDatabase +2"`, and the clears/union fakes still received `"sheets:x"`.
  Add `test_nikke_database_error_keeps_progression`: the fake raises `RuntimeError("boom")`; assert
  `_check` still returns the clears/union text and `lines[1] == "NikkeDatabase: RuntimeError: boom"`.

- [ ] **Step 2: Run** `uv run pytest tests/test_profile.py -v`. Expected: the three tests FAIL.

- [ ] **Step 3: Implement in `_check`.** Read `sheets.json` once into a dict; `spreadsheet_id` as
  before, `gacha_spreadsheet_id` via `.get`. Inside the existing `with httpx.Client() as http:`,
  before building the progression `sheets`, log `sync_nikke_database(store, HttpSheets(gacha_id,
  token, http), timestamp=wib_timestamp(now))`, or the missing-key line. Import `nikke_sheet` the
  same lazy way as `clear_sheet` (inside `_check`, `from . import nikke_sheet` then
  `nikke_sheet.sync_nikke_database(...)`, so the monkeypatch hits). Wrap the call so any exception
  that escapes (e.g. from building `HttpSheets`) logs `NikkeDatabase: <TypeName>: <message>`.

- [ ] **Step 4: Docs.** `cli/README.md:132` becomes
  `{"spreadsheet_id": "<progression sheet id>", "gacha_spreadsheet_id": "<gacha sheet id>"}` with a
  line that the gacha key is optional and the service account needs edit access to that sheet too.
  `cli/CLAUDE.md` Specifics: the column-A list gains `nameCode`.

- [ ] **Step 5: Run the cli checks** `uv run pytest`. Expected: all PASS.

## Owner's manual sheet steps (not code)

On the test copy first, prod before the homeserver pulls `develop`:
1. Tab `NikkeDatabase`, row 1: `nameCode | name | rarity | manufacturer | class | burst | element |
   weapon | resourceId | releaseDate`.
2. Tab `AuditLog`, row 1: `savedAt | form | ranges | rows`.
3. Share the sheet with the service account (edit).
4. Add `gacha_spreadsheet_id` to `config/sheets.json` (dev machine pointing at the test copy;
   homeserver at prod).

## Review 1

Reviewed the uncommitted working tree against `5e0493c` (spec, plan, sheet contract). `uv run pytest`:
216 passed. `nikke_rows` on the real `nikke_list_en.json`: 207 rows, 0 skipped. Implementation matches
Tasks 1 and 2; findings 1 and 2 are plan issues, not execution deviations. Fix every item below.

1. **Important: the gacha sync runs before the 02:59 daily profile write.**
   `cli/src/shiniri_cli/profile.py` `_check`: the NikkeDatabase block runs before `asyncio.run(go())`.
   `check_once` takes `game_day` from the `now` captured at check start, then fetches live daily
   progress. At the 02:59 WIB check a slow gacha step (30 s timeout per request, or a 429 retry that
   sleeps 60 s) pushes that fetch past the 03:00 reset, and day N's row gets day N+1 data (points 0,
   `dailyDone` false) with no error.
   - [ ] Keep `sheets = HttpSheets(ids["spreadsheet_id"], token, http)`, `write` and `go` as they are.
     Replace `return asyncio.run(go())` with `text = asyncio.run(go())`, then the NikkeDatabase block
     (see item 2 for its new form), then `return text`, all still inside `with httpx.Client() as http:`.
     If `go()` raises, the gacha step is skipped for that hour; that is accepted (`watch` logs the
     failure and the next hour retries).
   - [ ] `cli/tests/test_profile.py` `test_check_joins_clears_and_union`: expected lines become
     `["sync: raid_list changed", "Campaign: wrote", "NikkeDatabase: no gacha_spreadsheet_id"]`.
   - [ ] `test_check_syncs_nikke_database`: assert `lines[-1] == "NikkeDatabase +2"` instead of
     `lines[1]`.

2. **Minor: the outer `try/except` around the gacha call cannot fire.**
   `sync_nikke_database` already catches every `Exception` and returns it as the line; building
   `HttpSheets` and `wib_timestamp` don't raise. `test_nikke_database_error_keeps_progression` only
   passes because its fake replaces the inner function, so it tests a path real code can't reach.
   - [ ] In `_check`, the block becomes:
     ```python
     if gacha_id := ids.get("gacha_spreadsheet_id"):  # never raises: a failure is its own line
         log(nikke_sheet.sync_nikke_database(store, HttpSheets(gacha_id, token, http),
                                             timestamp=wib_timestamp(now)))
     else:
         log("NikkeDatabase: no gacha_spreadsheet_id")
     ```
   - [ ] Delete `test_nikke_database_error_keeps_progression`. Inline `_check_with_gacha` into
     `test_check_syncs_nikke_database` only if it is left with one caller and that reads simpler;
     otherwise leave it.

3. **Minor: `cli/README.md` has no setup step for the gacha sheet's tabs.**
   - [ ] After step 6 (the `Profile` tab), add a new step 7 and renumber the `./start.sh` step to 8:
     ```
     7. If you set `gacha_spreadsheet_id`, add two tabs to that sheet, each with this header row, in
        order: `NikkeDatabase` with `nameCode name rarity manufacturer class burst element weapon
        resourceId releaseDate` (10 columns, A to J), and `AuditLog` with `savedAt form ranges rows`.
     ```

4. [ ] Run `uv run pytest` from `cli/`. Expected: all pass (215, one test deleted).

Declined (no change):
- A missing `nikke_list_en.json` logs `NikkeDatabase +0`: it is only missing if never fetched, and the
  `sync:` line of the same check shows that failure. `test_sync_nothing_missing_no_write` pins `+0`.
- `NikkeDatabase: NikkeDatabase headers changed…` doubled prefix: cosmetic, the `SheetsError` text
  comes from the shared writer.
- `Sakura` and `Rei` each appear twice under different `nameCode`: correct here; the later picker and
  name sweep must key on `nameCode`, not `name`.
- `(skipped …)` repeats every hour: matches the spec, harmless.

Owner note, not code: `blabla.yml` at the repo root is untracked, not gitignored, and contains cookie
and token strings. Move it out of the repo or gitignore it before the merge commit; never stage it.
