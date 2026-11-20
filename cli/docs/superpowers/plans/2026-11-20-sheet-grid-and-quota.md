# Sheet Grid Growth and Read-Quota Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Writes keep working when a tab reaches the bottom of its grid, and a Sheets 429 is waited out instead of failing the tab.

**Architecture:** `write_rows` asks the API to make the target tab and AuditLog long enough before its empty-range check. `HttpSheets` answers from sheet metadata cached per instance and appends blank rows with `appendDimension`. Separately, `HttpSheets._request` retries 429s after a fixed wait.

**Tech Stack:** Python, httpx (`MockTransport` in tests), pytest.

**Spec:** `docs/superpowers/specs/2026-11-20-sheet-grid-and-quota-design.md`

## Global Constraints

- `write_rows` still sends exactly one `values:batchUpdate` carrying the data block and its AuditLog row.
- Never insert rows or shift data: grow only with `appendDimension` (adds rows at the bottom).
- 429 retry: wait 60 s, up to 3 retries (4 attempts total), then raise `SheetsError` as today.
- Only 429 is retried; every other error raises immediately.
- No git commits unless the user asks (user rule); the plan has no commit steps.
- Run tests with `uv run pytest`.

## Review Focus

- A tab named in `ensure_rows` that is missing from the spreadsheet: `SheetsError` naming the tab, no `appendDimension` sent.
- Tabs already long enough: no `:batchUpdate` request at all (not an empty `requests` list).
- Two `ensure_rows` calls in one check: metadata read once, and a tab grown by the first call is not grown again.
- A 403 or 400 must not be retried or slept on.
- `profile._check` builds `HttpSheets(sheet_id, token, http)` positionally: the new `sleep` parameter must be keyword-only with a default.

---

### Task 1: Grow the grid before writing

**Files:**
- Modify: `src/shiniri_cli/sheets.py` (`SheetsApi`, `write_rows`, `HttpSheets`, module docstring)
- Modify: `tests/conftest.py` (`FakeSheets`)
- Test: `tests/test_sheets.py`

**Interfaces:**
- Produces: `SheetsApi.ensure_rows(self, rows: dict[str, int]) -> None` makes each tab hold at least that many grid rows. `HttpSheets.ensure_rows` implements it. `FakeSheets.ensure_rows` appends its argument to `self.ensured: list[dict]`.

- [ ] **Step 1: Write the failing tests** in `tests/test_sheets.py`

```python
def test_write_rows_grows_tab_and_audit_before_checking():
    api = fake([["date"], [46345]])
    api.values["'Profile'!A3:C4"] = []
    write_rows(api, "Profile", H, [["a", 1, 2], ["b", 3, 4]], form="f", timestamp="t")
    assert api.ensured == [{"Profile": 4, "AuditLog": 2}]


def _grid_api(row_counts):
    calls = []
    def handler(req):
        calls.append(req)
        if req.method == "GET":
            return httpx.Response(200, json={"sheets": [
                {"properties": {"sheetId": i, "title": t, "gridProperties": {"rowCount": n}}}
                for i, (t, n) in enumerate(row_counts.items())]})
        return httpx.Response(200, json={})
    return HttpSheets("sid", lambda: "tok", httpx.Client(transport=httpx.MockTransport(handler))), calls


def test_ensure_rows_appends_only_the_shortfall_once():
    api, calls = _grid_api({"Union": 1023, "AuditLog": 1000})
    api.ensure_rows({"Union": 1169, "AuditLog": 40})
    api.ensure_rows({"Union": 1169, "AuditLog": 41})
    gets = [c for c in calls if c.method == "GET"]
    posts = [c for c in calls if c.method == "POST"]
    assert len(gets) == 1 and len(posts) == 1
    assert posts[0].url.path.endswith(":batchUpdate")
    assert json.loads(posts[0].content) == {"requests": [
        {"appendDimension": {"sheetId": 0, "dimension": "ROWS", "length": 146}}]}


def test_ensure_rows_long_enough_sends_nothing():
    api, calls = _grid_api({"Profile": 1000})
    api.ensure_rows({"Profile": 1000})
    assert [c.method for c in calls] == ["GET"]


def test_ensure_rows_missing_tab_refuses():
    api, calls = _grid_api({"Profile": 1000})
    with pytest.raises(SheetsError, match="Roster"):
        api.ensure_rows({"Roster": 5})
    assert [c.method for c in calls] == ["GET"]
```

Add `import json` at the top. Add `self.ensured = []` to `FakeSheets.__init__`; it does not exist yet, so the first test fails.

- [ ] **Step 2: Run to verify they fail**

Run: `uv run pytest tests/test_sheets.py -v`
Expected: the 4 new tests FAIL (`AttributeError` on `ensured` / `ensure_rows`); the existing ones still pass.

- [ ] **Step 3: Implement**

- `tests/conftest.py`: `FakeSheets.ensure_rows(self, rows)` does `self.ensured.append(dict(rows))`.
- `SheetsApi`: add `def ensure_rows(self, rows: dict[str, int]) -> None: ...`.
- `write_rows`: after computing `target` and `audit`, and before `_ensure_empty`, call `api.ensure_rows({tab: start + len(rows) - 1, AUDIT_TAB: audit_start})`.
- `HttpSheets.ensure_rows`:
  - On the first call, load `{title: [sheetId, rowCount]}` into `self._grid` with `GET {self.base}?fields=sheets.properties(sheetId,title,gridProperties.rowCount)`. Set `self._grid = None` in `__init__`.
  - For each tab that `_grid` lacks, raise `SheetsError(f"{tab} tab not found")`.
  - For each tab whose `rowCount < need`, add `{"appendDimension": {"sheetId": id, "dimension": "ROWS", "length": need - rowCount}}`.
  - If there are any such requests, `POST {self.base}:batchUpdate` with `{"requests": [...]}`, then set each cached `rowCount` to its `need`.
  - Check every tab before sending anything, so a missing tab sends no POST.
- Module docstring: change "never inserts, shifts" so it says that blank rows are only ever appended at the bottom when the grid is too short, and nothing is inserted or shifted.

- [ ] **Step 4: Run to verify they pass**

Run: `uv run pytest -q`
Expected: all tests PASS (the clear_sheet and union_sheet tests use `FakeSheets` and keep passing).

### Task 2: Retry 429 in HttpSheets

**Files:**
- Modify: `src/shiniri_cli/sheets.py` (`HttpSheets.__init__`, `HttpSheets._request`)
- Test: `tests/test_sheets.py`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `HttpSheets(spreadsheet_id, token, client, *, sleep: Callable[[float], None] = time.sleep)`.

- [ ] **Step 1: Write the failing tests**

```python
def _seq_api(statuses):
    it, slept = iter(statuses), []
    def handler(req):
        s = next(it)
        return httpx.Response(s, json={"values": [["ok"]]} if s == 200 else {"error": {"message": f"e{s}"}})
    api = HttpSheets("sid", lambda: "tok", httpx.Client(transport=httpx.MockTransport(handler)), sleep=slept.append)
    return api, slept


def test_429_is_waited_out_and_retried():
    api, slept = _seq_api([429, 200])
    assert api.get_values("'Roster'!A:A") == [["ok"]]
    assert slept == [60.0]


def test_429_gives_up_after_three_retries():
    api, slept = _seq_api([429] * 4)
    with pytest.raises(SheetsError, match="429"):
        api.get_values("'Roster'!A:A")
    assert slept == [60.0] * 3


def test_other_errors_are_not_retried():
    api, slept = _seq_api([403])
    with pytest.raises(SheetsError, match="403"):
        api.get_values("'Roster'!A:A")
    assert slept == []
```

- [ ] **Step 2: Run to verify they fail**

Run: `uv run pytest tests/test_sheets.py -k "429 or retried" -v`
Expected: FAIL with `TypeError: ... unexpected keyword argument 'sleep'`.

- [ ] **Step 3: Implement**

- `HttpSheets.__init__` takes a keyword-only `sleep=time.sleep` and stores it.
- `_request` loops for at most 4 attempts. On `resp.status_code == 429` with attempts left, it calls `self.sleep(60.0)` and tries again. Otherwise it falls through to the existing error and success handling, unchanged.
- Add a one-line comment: the read quota is per minute, so a 60 s wait always refills it.

- [ ] **Step 4: Run the whole suite**

Run: `uv run pytest -q`
Expected: all PASS.
