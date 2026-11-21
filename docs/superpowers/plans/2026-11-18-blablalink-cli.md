# blablalink CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three loose scripts with one `prompt_toolkit` shell that fetches campaign/tower clears and CDN reference files, stores raw JSON, derives parsed CSVs, and answers seven fixed searches with cached, scope-wiped exports.

**Architecture:** A `blablalink/` package. `store.py` owns paths, raw JSON I/O, migration, the raw→table join, parsed CSVs, export files and wiping. `queries.py` holds pure functions from in-memory tables to a `Result`. `fetch.py` owns HTTP (cookie, lineup fetching, CDN sync) behind an injectable `httpx.AsyncClient`. `cli.py` parses commands, renders with `rich`, and drives everything.

**Tech Stack:** Python 3.14, httpx, prompt_toolkit, rich, pytest (no pytest-asyncio: async tests wrap calls in `asyncio.run`).

**Spec:** `docs/superpowers/specs/2026-11-18-blablalink-cli-design.md`

## Global Constraints

- Work on branch `feature/cli` off `develop`; merge back to `develop` when done.
- Python 3.14; runtime deps exactly `httpx`, `prompt_toolkit`, `rich` in `requirements.txt`; `pytest` in `requirements-dev.txt`.
- Never commit `data/`, `config/cookie.txt`, `blabla.yml`. `.gitignore` lands in Task 1, before any other file is added.
- Lineup request body `{"stage_id": <id>, "area_id": 85}`; 1.0–2.0 s random delay between requests; 3 retries; 10 s sleep on HTTP 429, 2 s on other HTTP errors, 1.5 s on exceptions; 12 s timeout.
- `code == 300001` → auth failure (stop whole fetch, tell user to run `cookie`). Any other non-zero code → uncleared.
- Endpoints: campaign `https://api.blablalink.com/api/game/proxy/Game/GetMainQuestClearLineup`, tower `https://api.blablalink.com/api/game/proxy/Game/GetCampaignStageCharacterInfo`. Request headers: copy `HEADERS` verbatim from `campaign-fetcher.py:35-58`.
- Displayed chapter = `chapter_id - 1`. Campaign eligible = mode in {Normal, Hard}, excluding Normal `chapter_id` 1 and 2.
- Dupes: `grade < 3 → LB{grade}`, `core == 0 → MLB`, else `C{core}`; Nikke missing from roster → `N/A`; Nikke missing from `nikke.json` → name `NIKKE_<tid>`.
- Times shown and grouped in the machine's local timezone (`datetime.fromtimestamp(ts).astimezone()`); `cleared_at` of `None`, `""` or `"0"` → no time.
- All JSON/CSV writes are atomic (write `<file>.tmp`, then `os.replace`). CSVs are written `utf-8-sig`.

## Review Focus

1. **Nikke names with spaces, colons and `+`** (`n crown + anis: star`) — parsed as two names, matched case-insensitively. Test in Task 7.
2. **Export filenames on Windows** — `nikke anis: star` must not produce a `:` in the path. Test in Task 5.
3. **Ctrl+C or a crash mid-fetch** — every clear fetched before the interruption is already in raw. Test in Task 6.
4. **First run with an empty data folder and no legacy files** — shell starts, searches return zero rows with a "run `sync` / `fetch`" hint, no traceback. Test in Task 7.
5. **Bad arguments** (`stage hard x`, `floor moon 3`, `date 2026-13-01`, unknown command, ambiguous prefix) — one-line usage error, shell keeps running. Test in Task 7.

---

## File Structure

```
main.py                     entry: blablalink.cli.main(Path(__file__).parent)
requirements.txt            httpx, prompt_toolkit, rich
requirements-dev.txt        -r requirements.txt, pytest
.gitignore                  data/, config/cookie.txt, blabla.yml, test_*_clear_history.json, __pycache__/, .pytest_cache/, *.tmp
config/sources.json         4 CDN URLs (committed)
blablalink/__init__.py      empty
blablalink/store.py         paths, raw I/O, migration, tables, parsed CSV, exports
blablalink/queries.py       Result + seven searches
blablalink/fetch.py         cookie, targets, lineup fetch, CDN sync
blablalink/cli.py           command parsing, help, rendering, prompt loop
tests/conftest.py           `store` fixture with the tiny dataset below
tests/test_store.py  tests/test_queries.py  tests/test_fetch.py  tests/test_cli.py
```

### Shared test fixture (`tests/conftest.py`)

`store` fixture: `Store(tmp_path)` with these files written to `tmp_path/data/raw/json/`:

- `nikke.json`: Crown (`id 433004, resource_id 330`, PILGRIM, Iron, MG, Step2); Anis: Star (`id 301706, resource_id 17`, TETRA, Electronic, RL, Step1); Anis (`id 5001, resource_id 50`). Shape as in the real file (`name_localkey.name`, `element_id.element.element`, `shot_id.element.weapon_type`, `use_burst_skill`, `corporation`).
- `historical_roster.json`: `{id 433004, resource_id 330, grade 3, core 0}`, `{id 301706, resource_id 17, grade 3, core 2}` (Anis absent).
- `campaign_level.json`: Normal `chapter_id 1`: `6000001 "0-1 STAGE"`; Normal `chapter_id 3`: `6002001 "2-1 STAGE"`, `6002002 "2-2 STAGE"`, `6002003 "2-3 STAGE"`; Hard `chapter_id 3`: `7002001 "2-1 HARD STAGE"`; all `standard_battle_power 1000`.
- `tower_level.json`: `tribe` floors 1–3 → `50001–50003`; `pilgrim` floor 1 → `51001`; `standard_battle_power 5000`.
- `campaign_clears.json`: `{"6002003": {"cleared_at": "1793443017", "list": [{"slot":1,"tid":433004,"lv":740,"combat":509195}, {"slot":2,"tid":301706,"lv":740,"combat":400000}]}}`
- `tower_clears.json`: `{"50001": {"cleared_at": "1794364831", "list": [{"slot":2,"tid":301706,"lv":801,"combat":776595}, {"slot":1,"tid":999999,"lv":801,"combat":1}]}}`

---

### Task 1: Scaffold, store paths and raw I/O

**Files:**
- Create: `.gitignore`, `requirements.txt`, `requirements-dev.txt`, `config/sources.json`, `blablalink/__init__.py`, `blablalink/store.py`, `tests/conftest.py`, `tests/test_store.py`

**Interfaces:**
- Produces:
  - `SOURCES = ("campaign", "tower")`, `REFERENCE = ("nikke", "historical_roster", "campaign_level", "tower_level")`, `SCOPES = ("campaign", "tower", "all")`
  - `format_dupes(grade: int, core: int) -> str`
  - `@dataclass class Store: root: Path` with properties `raw_dir`, `parsed_dir`, `exports_dir` (`root/data/raw/json`, `root/data/parsed/csv`, `root/data/exports`), `config_dir` (`root/config`)
  - `Store.load_raw(name: str, default=None) -> Any` — reads `raw_dir/<name>.json`, returns `default` if missing
  - `Store.save_raw(name: str, obj) -> None` — atomic, `ensure_ascii=False`
  - `Store.load_clears(source: str) -> dict[str, dict]` / `Store.save_clears(source: str, clears: dict) -> None` — `<source>_clears.json`, `{}` if missing

- [ ] **Step 1: Create branch and safety files first**

```bash
git checkout -b feature/cli develop
```
Write `.gitignore` (entries in Global Constraints), `requirements*.txt`, `config/sources.json`:
```json
{
  "nikke": "https://sg-tools-cdn.blablalink.com/yl-57/hd-03/1bf030193826e243c2e195f951a4be00.json",
  "historical_roster": "https://sg-tools-cdn.blablalink.com/kx-19/bc64a706accd3c7ec1f9a9f2afd8f1bc.json",
  "campaign_level": "https://sg-tools-cdn.blablalink.com/xx-97/b32816a11f83865b09bcf95e67ca83ae.json",
  "tower_level": "https://sg-tools-cdn.blablalink.com/mx-85/3aa6da781d62528da15bd138504c3955.json"
}
```
Run `pip install -r requirements-dev.txt`, then `git status --short` — Expected: `blabla.yml` absent from the list.

- [ ] **Step 2: Write failing tests** in `tests/test_store.py`, plus the fixture in `tests/conftest.py`

```python
def test_format_dupes():
    assert [format_dupes(0,0), format_dupes(2,0), format_dupes(3,0), format_dupes(3,7)] == ["LB0","LB2","MLB","C7"]

def test_raw_roundtrip_and_default(tmp_path):
    s = Store(tmp_path)
    assert s.load_clears("tower") == {}
    s.save_clears("tower", {"1": {"cleared_at": "5", "list": []}})
    assert s.load_clears("tower") == {"1": {"cleared_at": "5", "list": []}}
    assert not list(s.raw_dir.glob("*.tmp"))
```

- [ ] **Step 3: Run** `pytest tests/test_store.py -v` — Expected: FAIL (ImportError).
- [ ] **Step 4: Implement** the Interfaces above in `blablalink/store.py`.
- [ ] **Step 5: Run** `pytest tests/test_store.py -v` — Expected: PASS.
- [ ] **Step 6: Commit** `git add .gitignore requirements*.txt config/sources.json blablalink tests && git commit -m "feat: store scaffold and raw json io"`

### Task 2: One-time migration

**Files:** Modify `blablalink/store.py`; Test `tests/test_store.py`

**Interfaces:**
- Produces: `Store.migrate() -> list[str]` — human-readable lines of what was done; `[]` when nothing to do.

Behaviour: for each reference name, if `root/<name>.json` exists and `raw_dir/<name>.json` does not, move it. For each source, if `<source>_clears.json` is missing in raw and `root/test_<source>_clear_history.json` exists, convert each record to key `str(stage_id)` → `{"cleared_at": cleared_at_timestamp, "list": [{"slot", "tid", "lv": level, "combat": combat_power} for unit in team_lineup]}`, skipping records with empty `team_lineup`. Never delete or modify the `test_*` files.

- [ ] **Step 1: Write failing tests**

```python
def test_migrate_converts_legacy(tmp_path):
    (tmp_path / "test_tower_clear_history.json").write_text(json.dumps([{
        "stage_id": 51030, "cleared_at_timestamp": "1794364831", "team_lineup": [
            {"slot": 1, "tid": 301706, "name": "Anis: Star", "level": 801, "combat_power": 776595}]}]), encoding="utf-8")
    (tmp_path / "nikke.json").write_text("[]", encoding="utf-8")
    s = Store(tmp_path)
    assert s.migrate()
    assert s.load_clears("tower") == {"51030": {"cleared_at": "1794364831",
        "list": [{"slot": 1, "tid": 301706, "lv": 801, "combat": 776595}]}}
    assert s.load_raw("nikke") == [] and not (tmp_path / "nikke.json").exists()
    assert (tmp_path / "test_tower_clear_history.json").exists()
    assert s.migrate() == []
```

- [ ] **Step 2: Run** `pytest tests/test_store.py::test_migrate_converts_legacy -v` — Expected: FAIL.
- [ ] **Step 3: Implement** `Store.migrate`.
- [ ] **Step 4: Run** `pytest tests/test_store.py -v` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -am "feat: migrate legacy clear history to raw"` (add new files explicitly if any).

### Task 3: Raw → tables and parsed CSVs

**Files:** Modify `blablalink/store.py`; Test `tests/test_store.py`

**Interfaces:**
- Produces:
  - `@dataclass class Tables: clears: list[dict]; lineups: list[dict]; nikke_names: list[str]`
  - Clear row keys: `source` ("campaign"/"tower"), `stage_id` (int), `mode` ("Normal"/"Hard" or tower type capitalised, e.g. "Tribe"), `chapter` (displayed int, campaign only, else `None`), `floor` (int, tower only, else `None`), `stage_name` (campaign `name_localkey.name`; tower `f"{floor}F"`), `cleared_at` (aware local `datetime` or `None`), `recommended_cp` (int), `team_cp` (int, sum of `combat`), `synchro_level` (str: single value if all levels equal, else `", "`-joined in slot order), `team` (list of lineup rows, slot order).
  - Lineup row keys: `source, stage_id, mode, chapter, floor, cleared_at, slot, tid, name, dupe, level, cp, element, weapon, burst, manufacturer`.
  - `Store.build_tables() -> Tables` — joins per Global Constraints (name lookup: roster `resource_id` → nikke by `resource_id`, else nikke by `id == tid`). Clears whose stage id is not in the level list keep `stage_name = ""`, `mode = ""`. Missing reference or clear files count as empty (first run must not crash).
  - `Store.write_parsed(tables: Tables) -> None` — writes `campaign_clears.csv`, `tower_clears.csv` (columns: `stage_id, mode, chapter|floor, stage_name, date_cleared, recommended_cp, team_cp, synchro_level, slot1..slot5`; `date_cleared` as `%Y-%m-%d %H:%M:%S` or empty) and `lineups.csv` (lineup row keys, `cleared_at` same format).

`shortcut:` rebuild all three parsed CSVs every time (≈10k rows, sub-second) instead of only the changed source; upgrade if it gets slow.

- [ ] **Step 1: Write failing tests**

```python
def test_build_tables_joins(store):
    t = store.build_tables()
    camp = next(c for c in t.clears if c["source"] == "campaign")
    assert (camp["stage_id"], camp["mode"], camp["chapter"], camp["stage_name"]) == (6002003, "Normal", 2, "2-3 STAGE")
    assert camp["team_cp"] == 909195 and camp["synchro_level"] == "740"
    assert camp["cleared_at"] == datetime.fromtimestamp(1793443017).astimezone()
    assert [(u["name"], u["dupe"]) for u in camp["team"]] == [("Crown", "MLB"), ("Anis: Star", "C2")]
    tower = next(c for c in t.clears if c["source"] == "tower")
    assert (tower["mode"], tower["floor"], tower["stage_name"]) == ("Tribe", 1, "1F")
    assert [(u["slot"], u["name"], u["dupe"]) for u in tower["team"]] == [(1, "NIKKE_999999", "N/A"), (2, "Anis: Star", "C2")]
    assert len(t.lineups) == 4 and "Anis" in t.nikke_names

def test_cleared_at_zero_is_none(store):
    store.save_clears("tower", {"50002": {"cleared_at": "0", "list": [{"slot":1,"tid":433004,"lv":5,"combat":1}]}})
    assert store.build_tables().clears[-1]["cleared_at"] is None

def test_write_parsed(store):
    store.write_parsed(store.build_tables())
    rows = list(csv.DictReader(open(store.parsed_dir / "lineups.csv", encoding="utf-8-sig")))
    assert len(rows) == 4 and {r["name"] for r in rows} >= {"Crown", "NIKKE_999999"}
    assert (store.parsed_dir / "campaign_clears.csv").exists() and (store.parsed_dir / "tower_clears.csv").exists()
```

- [ ] **Step 2: Run** `pytest tests/test_store.py -v` — Expected: new tests FAIL.
- [ ] **Step 3: Implement** `Tables`, `build_tables`, `write_parsed`.
- [ ] **Step 4: Run** `pytest tests/test_store.py -v` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -am "feat: join raw clears into tables and parsed csv"`

### Task 4: Searches

**Files:** Create `blablalink/queries.py`, `tests/test_queries.py`

**Interfaces:**
- Consumes: `Tables` (Task 3).
- Produces:
  - `@dataclass class Result: scope: str; columns: list[str]; rows: list[list]; summary: str = ""`
  - `class QueryError(ValueError)` — message shown to the user as-is.
  - `resolve_nikke(tables, query: str) -> str` — exact case-insensitive match first; else the single name containing the query; 0 matches → `QueryError("no Nikke matches 'x'")`; >1 → `QueryError` listing up to 10 candidates.
  - `nikke(tables, names: list[str]) -> Result` — scope `all`; clears whose team contains every resolved name; columns `source, mode, stage, date, dupe, level, cp` (dupe/level/cp of the first named Nikke); summary `"<n> clears · first <date> · last <date>"`.
  - `stage(tables, mode: str, chapter: int) -> Result` — scope `campaign`; mode matched case-insensitively to Normal/Hard else `QueryError`; columns `stage, date, team_cp, recommended_cp, team` where `team` = `"Crown (MLB 740), …"`.
  - `floor(tables, tower: str, n: int) -> Result` — scope `tower`; tower must be one of the tower types present in tables else `QueryError`; same columns as `stage`.
  - `date_range(tables, start: date, end: date) -> Result` — scope `all`; inclusive local dates; sorted by time; clears with no time excluded; columns `time, source, mode, stage, team_cp`.
  - `top(tables, filter: str | None) -> Result` — scope `tower` if filter is a tower type, `campaign` if normal/hard, `all` if `None`, else `QueryError`; columns `name, clears`; sorted by count desc then name.
  - `compress_synchro(daily: dict[date, int]) -> list[tuple[date, int]]` and `synchro(tables) -> Result` — scope `all`; per clear, single integer synchro level ≥ 200 only; max per local date; compressed like `process-synchro.py` (keep first and last date of each run of equal levels); columns `date, synchro_level`.
  - `progress(tables) -> Result` — scope `all`; one row per campaign mode (highest displayed chapter and its stage name) and per tower (highest floor); columns `mode, highest`.

- [ ] **Step 1: Write failing tests** (use the `store` fixture → `store.build_tables()`)

```python
def test_resolve_nikke(tables):
    assert resolve_nikke(tables, "CROWN") == "Crown"
    assert resolve_nikke(tables, "anis") == "Anis"
    with pytest.raises(QueryError, match="Anis: Star"): resolve_nikke(tables, "ani")
    with pytest.raises(QueryError): resolve_nikke(tables, "zzz")

def test_nikke_pair(tables):
    r = nikke(tables, ["crown", "anis: star"])
    assert r.scope == "all" and len(r.rows) == 1 and r.summary.startswith("1 clears")
    assert len(nikke(tables, ["anis: star"]).rows) == 2

def test_stage_floor_scopes(tables):
    assert stage(tables, "normal", 2).scope == "campaign" and len(stage(tables, "normal", 2).rows) == 1
    assert floor(tables, "TRIBE", 1).rows[0][-1].startswith("NIKKE_999999 (N/A 801)")
    with pytest.raises(QueryError): floor(tables, "moon", 1)

def test_top_scope(tables):
    assert top(tables, "tribe").scope == "tower" and top(tables, "hard").scope == "campaign" and top(tables, None).scope == "all"
    assert top(tables, None).rows[0] == ["Anis: Star", 2]

def test_compress_synchro():
    d = {date(2026,1,1): 200, date(2026,1,2): 200, date(2026,1,3): 200, date(2026,1,4): 201}
    assert compress_synchro(d) == [(date(2026,1,1),200), (date(2026,1,3),200), (date(2026,1,4),201)]

def test_progress(tables):
    assert ["Normal", "2 · 2-3 STAGE"] in progress(tables).rows and ["Tribe", "1F"] in progress(tables).rows
```
(`tables` fixture in `conftest.py`: `return store.build_tables()`.)

- [ ] **Step 2: Run** `pytest tests/test_queries.py -v` — Expected: FAIL.
- [ ] **Step 3: Implement** `blablalink/queries.py`.
- [ ] **Step 4: Run** `pytest tests/test_queries.py -v` — Expected: PASS.
- [ ] **Step 5: Commit** `git add blablalink/queries.py tests && git commit -m "feat: fixed searches"`

### Task 5: Export cache and staleness

**Files:** Modify `blablalink/store.py`; Test `tests/test_store.py`

**Interfaces:**
- Consumes: `Result` (Task 4).
- Produces:
  - `export_name(command: str, args: list[str]) -> str` — lowercase, every run of chars outside `[a-z0-9]` → `_`, stripped: `export_name("nikke", ["crown", "anis: star"]) == "nikke_crown_anis_star"`.
  - `Store.export_path(scope: str, name: str) -> Path` — `exports_dir/<scope>/<name>.csv`.
  - `Store.write_export(path: Path, result: Result) -> None` — CSV of `columns` + `rows`; if `summary`, also `<name>.summary.txt`.
  - `Store.read_export(path: Path) -> Result | None` — `None` if missing; scope from the parent folder name.
  - `scopes_to_wipe(fetched: set[str] = frozenset(), synced: set[str] = frozenset()) -> set[str]` — pure; implements the spec's staleness table: fetched source → `{source, "all"}`; synced `nikke` or `historical_roster` → all three scopes; synced `campaign_level` → `{"campaign", "all"}`; `tower_level` → `{"tower", "all"}`.
  - `Store.wipe_exports(scopes: set[str]) -> None` — deletes those scope folders' files.

- [ ] **Step 1: Write failing tests**

```python
def test_export_name_windows_safe():
    assert export_name("nikke", ["crown", "anis: star"]) == "nikke_crown_anis_star"
    assert export_name("date", ["2026-11-01..2026-11-11"]) == "date_2026_11_01_2026_11_11"

def test_export_roundtrip(store):
    p = store.export_path("all", "nikke_crown")
    store.write_export(p, Result("all", ["a", "b"], [[1, "x"]], "1 clears"))
    r = store.read_export(p)
    assert (r.scope, r.columns, r.rows, r.summary) == ("all", ["a", "b"], [["1", "x"]], "1 clears")
    assert store.read_export(store.export_path("all", "missing")) is None

def test_scopes_to_wipe():
    assert scopes_to_wipe(fetched={"tower"}) == {"tower", "all"}
    assert scopes_to_wipe(synced={"nikke"}) == {"campaign", "tower", "all"}
    assert scopes_to_wipe(synced={"campaign_level"}) == {"campaign", "all"}
    assert scopes_to_wipe() == set()

def test_wipe_only_scope(store):
    for scope in ("campaign", "tower"):
        store.write_export(store.export_path(scope, "x"), Result(scope, ["a"], []))
    store.wipe_exports({"tower"})
    assert store.export_path("campaign", "x").exists() and not store.export_path("tower", "x").exists()
```

- [ ] **Step 2: Run** `pytest tests/test_store.py -v` — Expected: new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pytest tests/test_store.py -v` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -am "feat: export cache and scoped staleness"`

### Task 6: Fetching and CDN sync

**Files:** Create `blablalink/fetch.py`, `tests/test_fetch.py`

**Interfaces:**
- Consumes: `Store.load_raw/save_raw/load_clears/save_clears` (Task 1).
- Produces:
  - `class AuthError(Exception)`
  - `parse_cookie(header: str) -> dict[str, str]` — accepts with or without a leading `Cookie:`; splits on `;` then first `=`; `ValueError` naming the missing key if `game_token` or `game_openid` absent.
  - `save_cookie(store, header: str) -> None` (validates, writes `config/cookie.txt`), `load_cookie(store) -> dict[str, str]` (`FileNotFoundError` → caller says "run `cookie` first").
  - `campaign_targets(levels: list[dict], stored: set[int]) -> list[dict]` — eligible stages (Global Constraints), not stored, not a quick-clear gap (a stage before the highest stored stage of its `(chapter_mod, chapter_id)`, in file order).
  - `tower_targets(levels: list[dict], stored: set[int]) -> dict[str, list[dict]]` — by `tower_type`, sorted by floor, unstored only.
  - `async fetch_lineup(client: httpx.AsyncClient, url: str, stage_id: int) -> tuple[str, dict | None]` — `("ok", data)` for code 0 with non-empty `data.list`; `("uncleared", None)` for other non-zero codes or empty list; `("failed", None)` after retries; raises `AuthError` on code 300001.
  - `async fetch_clears(store, source: str, client: httpx.AsyncClient, on_progress: Callable[[str, int, int], None] = lambda *a: None, delay: tuple[float, float] = (1.0, 2.0)) -> int` — returns number of new clears; saves raw after **each** `ok`; campaign never stops early; tower stops a tower type at its first `uncleared`; `AuthError` propagates (already-saved clears stay). `on_progress(label, done, total)`.
  - `make_client(cookies: dict[str, str]) -> httpx.AsyncClient` — `HEADERS` + cookies.
  - `async sync_reference(store, client: httpx.AsyncClient) -> dict[str, str]` — reads `config/sources.json`; per name: `"changed"` / `"unchanged"` / `"failed: <reason>"`; a non-200 or non-JSON body never overwrites; compares parsed JSON. CDN headers: `Referer: https://www.blablalink.com/` and the User-Agent from `HEADERS`.

Tests use `httpx.MockTransport` and `delay=(0, 0)`; async tests wrap with `asyncio.run`.

- [ ] **Step 1: Write failing tests**

```python
def test_parse_cookie():
    c = parse_cookie("Cookie: a=1; game_token=t; game_openid=o; x=y=z")
    assert c["game_token"] == "t" and c["x"] == "y=z"
    with pytest.raises(ValueError, match="game_token"): parse_cookie("game_openid=o")

def test_campaign_targets_skips_gaps_and_tutorial(store):
    levels = store.load_raw("campaign_level")
    assert [s["id"] for s in campaign_targets(levels, {6002003})] == [7002001]

def test_tower_stops_at_uncleared_and_saves_each(store):
    seen = []
    def handler(req):
        sid = json.loads(req.content)["stage_id"]; seen.append(sid)
        if sid == 50002: return httpx.Response(200, json={"code": 0, "data": {"cleared_at": "1", "list": [{"slot":1,"tid":433004,"lv":1,"combat":1}]}})
        return httpx.Response(200, json={"code": 1300017, "data": None})
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    assert asyncio.run(fetch_clears(store, "tower", client, delay=(0, 0))) == 1
    assert seen == [50002, 50003, 51001] and "50002" in store.load_clears("tower")

def test_auth_error_keeps_earlier_clears(store):
    def handler(req):
        sid = json.loads(req.content)["stage_id"]
        if sid == 50002: return httpx.Response(200, json={"code": 0, "data": {"cleared_at": "1", "list": [{"slot":1,"tid":1,"lv":1,"combat":1}]}})
        return httpx.Response(200, json={"code": 300001, "msg": "game not login", "data": None})
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    with pytest.raises(AuthError): asyncio.run(fetch_clears(store, "tower", client, delay=(0, 0)))
    assert "50002" in store.load_clears("tower")

def test_sync_reference(store):
    (store.config_dir).mkdir(parents=True, exist_ok=True)
    (store.config_dir / "sources.json").write_text(json.dumps({"nikke": "https://x/n.json", "tower_level": "https://x/t.json"}))
    old_tower = store.load_raw("tower_level")
    def handler(req):
        return httpx.Response(200, json=[{"id": 1}]) if req.url.path == "/n.json" else httpx.Response(200, text="<html>")
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    res = asyncio.run(sync_reference(store, client))
    assert res["nikke"] == "changed" and res["tower_level"].startswith("failed")
    assert store.load_raw("tower_level") == old_tower
```

- [ ] **Step 2: Run** `pytest tests/test_fetch.py -v` — Expected: FAIL.
- [ ] **Step 3: Implement** `blablalink/fetch.py`.
- [ ] **Step 4: Run** `pytest tests/test_fetch.py -v` — Expected: PASS.
- [ ] **Step 5: Commit** `git add blablalink/fetch.py tests/test_fetch.py && git commit -m "feat: unified fetcher, cookie and cdn sync"`

### Task 7: The shell

**Files:** Create `blablalink/cli.py`, `main.py`, `tests/test_cli.py`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `COMMANDS: dict[str, tuple[str, str, list[str]]]` — name → (usage, description, examples) for `fetch, sync, cookie, nikke, stage, floor, date, top, synchro, progress, help, quit`, usage/description text copied from the spec's command list.
  - `@dataclass class Command: name: str; args: list[str]; force: bool`
  - `parse_command(line: str) -> Command` — leading `!` sets `force`; first word resolved by exact name, else **unique prefix** (deviation from the spec's "first letter": `s`/`f` are ambiguous between stage/sync/synchro and fetch/floor, so the shortest unique prefix works: `n`, `st`, `fl`, `fe`, `d`, `t`, `p`, `c`, `h`, `q`, `sync` exact, `synch`); ambiguous/unknown → `QueryError` naming candidates. For `nikke`, args = rest split on `+`, each stripped; otherwise whitespace split.
  - `class App: __init__(self, store: Store, console: rich.console.Console)`; `App.execute(line: str) -> bool` (False on quit). Runs `store.migrate()` (printing its lines) and builds tables on init; writes parsed CSVs if any is missing. Search commands: validate args (`int` chapter/floor, `YYYY-MM-DD[..YYYY-MM-DD]`), compute the export path from the query's scope, reuse via `read_export` unless `force`, else run query, `write_export`, render. Render = rich `Table` + summary + a dim line `"cached · !<cmd> to rebuild"` when reused. All `QueryError`/`ValueError` → one red line. Empty tables → `"no data yet — run sync, then fetch"`.
    - `fetch <campaign|tower|all>` — `load_cookie`, `make_client`, `asyncio.run(fetch_clears(...))` per source with a rich progress bar; on `AuthError` print `"cookie rejected (game not login) — run cookie"`; for sources with ≥1 new clear: rebuild tables, `write_parsed`, `wipe_exports(scopes_to_wipe(fetched=...))`.
    - `sync` — print per-file status; if any changed: rebuild, `write_parsed`, wipe per `scopes_to_wipe(synced=...)`; if a level list changed, print how many stages `campaign_targets`/`tower_targets` now return.
    - `cookie` — prompt (`prompt_toolkit` `prompt(..., is_password=True)`), `save_cookie`.
    - `help [cmd]` — table of usage + description; with a command, also its examples; footer `"prefix any search with ! to rebuild its export"`.
  - `main(root: Path) -> None` — `PromptSession` with `FileHistory(root/"data"/".history")`, a `NestedCompleter` (commands; `nikke` → Nikke names; `floor`/`top` → tower types; `stage` → `normal`, `hard`; `fetch` → `campaign`, `tower`, `all`), `bottom_toolbar` = `"campaign <n> · tower <n> · raw updated <mtime>"`; prints the help table as the menu at start; loop until `execute` returns False; Ctrl+C clears the line, Ctrl+D quits.

`main.py`: `from pathlib import Path; from blablalink.cli import main; main(Path(__file__).parent)`.

- [ ] **Step 1: Write failing tests** (use `Console(record=True, width=200)` and `console.export_text()`)

```python
def test_parse_command():
    c = parse_command("!n crown + anis: star")
    assert (c.name, c.args, c.force) == ("nikke", ["crown", "anis: star"], True)
    assert parse_command("fl tribe 1").name == "floor" and parse_command("sync").name == "sync"
    with pytest.raises(QueryError, match="stage"): parse_command("s hard 2")

def test_bad_args_keep_running(store):
    app, out = make_app(store)        # helper in test file: App(store, Console(record=True, width=200))
    for line in ["stage hard x", "floor moon 3", "date 2026-13-01", "bogus"]:
        assert app.execute(line) is True
    assert "Traceback" not in out.export_text()

def test_search_writes_then_reuses_export(store):
    app, out = make_app(store)
    app.execute("n crown")
    assert store.export_path("all", "nikke_crown").exists()
    app.execute("n crown"); assert "cached" in out.export_text()
    app.execute("!n crown"); assert out.export_text().count("cached") == 1

def test_empty_first_run(tmp_path):
    app, out = make_app(Store(tmp_path))
    assert app.execute("progress") is True and "run sync" in out.export_text()

def test_help_lists_every_command(store):
    app, out = make_app(store); app.execute("help")
    assert all(name in out.export_text() for name in COMMANDS)
```

- [ ] **Step 2: Run** `pytest tests/test_cli.py -v` — Expected: FAIL.
- [ ] **Step 3: Implement** `blablalink/cli.py` and `main.py`.
- [ ] **Step 4: Run** `pytest -v` — Expected: all PASS.
- [ ] **Step 5: Commit** `git add blablalink/cli.py main.py tests/test_cli.py && git commit -m "feat: interactive shell"`

### Task 8: Real-data check and retire old scripts

**Files:** Delete `campaign-fetcher.py`, `tower-fetcher.py`, `process-synchro.py`

- [ ] **Step 1: Run on real data.** `python main.py` in the repo root, then: `progress`, `n crown`, `fl pilgrim 1030`, `synchro`, `help nikke`, `quit`. Expected: migration lines on first start; `data/raw/json/` holds 6 files; `campaign_clears.json` has 3674 keys and `tower_clears.json` 5761; `progress` shows Hard chapter 50 and Pilgrim 1030F (Crown is in the Hard ch. 50 EX clear); `fl pilgrim 1030` shows Anis: Star C2 801.
- [ ] **Step 2: Parity with old output.** `python -c "import csv;print(sum(1 for _ in csv.reader(open('data/parsed/csv/tower_clears.csv',encoding='utf-8-sig')))-1)"` — Expected: `5761`.
- [ ] **Step 3: Live smoke (owner present, needs network + cookie).** `cookie` (paste), `fetch tower`, `sync`. Expected: fetch reports 0 or a few new clears, no auth error; sync reports each file changed/unchanged.
- [ ] **Step 4: Delete old scripts.** They were never tracked, so just delete the three files (no commit). Then `git status --short` — Expected: no untracked `.py` at the root; `blabla.yml`, `test_*` and `data/` not listed (the `test_*` files stay on disk for the owner to delete).
- [ ] **Step 5: Merge.** `git checkout develop && git merge --no-ff feature/cli`
