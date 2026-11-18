# Union Raid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `union>` mode in the blablalink shell that downloads and permanently keeps every Union Raid season the user can reach, and answers recap / hits / missed / normal / top / member / members / growth / boss queries over them, including a live season.

**Architecture:** `union.py` owns union storage, fetching and the flat hit table (`UnionData`), built from raw season files the same way `Store.build_tables` builds clears. `union_queries.py` holds pure functions `UnionData -> Result`. `cli.py` gets a second command table, a mode switch, and `union <cmd>` routing, reusing the existing parser, renderer, export cache and error handling.

**Tech Stack:** Python 3.14, httpx (async), rich, prompt_toolkit, pytest. Run everything with `uv run`.

**Spec:** `docs/superpowers/specs/2026-11-18-union-raid-design.md`

## Global Constraints

- Raw season files: `data/raw/json/union/<season_id>.json` = `{"guild": card, "level": data, "raid": data, "fetched_ts": <int epoch>}`. Raw JSON is the source of truth.
- A season is finished when now > `end_ts`. A season file is **final** when `fetched_ts > end_ts`. A final file is never overwritten by any command.
- A failed call, a non-zero `code`, or a missing `data` never replaces a stored file.
- `sources.json` gets `"raid_list": "raid/raid_list.json"`, stored as `raid_list.json`.
- Raid call body: `{"area_id": 85, "guild_id": "<guild_id>", "season_id": "<season id as string>"}`. GetMyGuildInfo: `POST`, body `{"ignore_toast": true}`, response `data.card` holds `guild_id`, `guild_name`, `guild_member_cnt`.
- URLs: `https://api.blablalink.com/api/game/proxy/Game/GetMyGuildInfo`, `.../Game/GetUnionRaidLevelDataOfGuildSeason`, `.../Game/GetUnionRaidDataOfGuildSeason`. Same `make_client` / headers as the clear fetch. `code 300001` → `AuthError`.
- Season number = `id - 1000000` (`1000046` → `s46`). `day` in data is 0-based; show it 1-based (`D2`).
- `difficulty 1` = normal, `2` = hard. Other difficulties are kept in raw and ignored by queries.
- Hard level 4 = unlimited boss; its `current_hp` is damage dealt. Levels 1–3 `current_hp` is HP left, `max_hp` is the full HP.
- Boss code = last word of the boss's English name with dots removed (`Black Smith H.S.T.A.` → `HSTA`). Boss element from `element_id[0]`: `100001` Fire, `200001` Water, `300001` Wind, `400001` Electronic, `500001` Iron. Weakness: Fire→Water, Water→Electronic, Electronic→Iron, Iron→Wind, Wind→Fire.
- Members keyed by `openid`, shown by their latest `nickname`. "Me" = `game_openid` from the saved cookie.
- Exports go to `data/exports/union/`. Export names include the resolved season (`missed__s46`), so a default season never serves a stale file.
- Test fixtures use made-up nicknames and openids only. Never copy real member data from `blabla.yml` into tests.
- `fetch all` in the main shell does not touch union data.

## Review Focus

1. A season stored while live, later finished: the next `fetch` must download it once more (file not final yet), then never again. → Task 2 test `test_fetch_refreshes_unfinal_then_locks`.
2. A user who renamed between seasons appears as one member under their newest name. → Task 1 test `test_member_keeps_latest_nickname`.
3. Expired cookie or "user not in guild" during `fetch`: a clear message, and no stored file changes. → Task 2 test `test_guild_error_touches_nothing`.
4. `union s46` / `missed` before `sync` or `fetch` ever ran: a plain hint, not a traceback. → Task 5 test `test_union_queries_before_any_data`.
5. `live` re-download must not leave cached exports showing old numbers. → Task 5 test `test_live_wipes_union_exports`.

---

### Task 1: Union data model and parsing

**Files:**
- Create: `src/blablalink/union.py`
- Modify: `src/blablalink/store.py:18` (`SCOPES` gains `"union"`)
- Modify: `config/sources.json` (add `raid_list`)
- Modify: `tests/conftest.py` (union fixture)
- Test: `tests/test_union.py`

**Interfaces:**
- Consumes: `Store.load_raw/save_raw/raw_dir`, `Tables` (for Nikke lookup), `write_csv`.
- Produces:
  - `ELEMENTS: dict[str, str]` (`"100001" → "Fire"` …), `WEAK_TO: dict[str, str]` (`"Fire" → "Water"` …)
  - `boss_code(name: str) -> str`
  - `season_number(season_id) -> int`
  - `@dataclass UnionData: seasons: dict[int, dict]` (number → `{"id", "start_ts", "end_ts", "guild", "level"}`), `hits: list[dict]`, `names: dict[str, str]` (openid → latest nickname), `me: str | None`, `live: int | None` (season number running now, from `raid_list`)
  - hit dict keys: `season, day (1-based), mode ("normal"|"hard"), level, step, boss, code, boss_element, openid, damage (int), final (bool), squad` where `squad` = list of `{slot, tid, name, element, level, cp}` sorted by slot
  - `build_union(store: Store, tables: Tables, me: str | None, now: float) -> UnionData`
  - `write_union_parsed(store: Store, u: UnionData) -> None` → `data/parsed/csv/union_hits.csv`, columns `season, day, mode, level, step, code, boss, member, damage, final, slot1..slot5`

- [ ] **Step 1: Add the fixture to `tests/conftest.py`**

A `union_store` fixture on top of `store` that writes `raid_list.json` and two season files with made-up members (openid `"a"` ALPHA, `"b"` BRAVO, `"c"` CHARLIE, `"d"` DELTA). `raid_list`: s45 `start_ts 100, end_ts 200`, s46 `start_ts 300, end_ts 400` (plus the date strings, any value). Both files `fetched_ts 1000` (final). Every squad is the same two Nikkes from the existing fixture: slot 1 tid 433004 (Crown, Iron), slot 2 tid 301706 (Anis: Star, Electronic).

- s45 (`guild_member_cnt 3`): hard hits on data day 2: ALPHA, BRAVO, CHARLIE 3 hits each, all `40e9` on `Black Smith H.S.T.A.` (element `100001`). BRAVO's s45 nickname is `"BRAVO_OLD"`. Level data: hard level 2, five bosses with `current_hp`/`max_hp` (two at `"0"`).
- s46 (`guild_member_cnt 4`): normal day 0, all on `Obelisk Z.E.U.S.` (`400001`) for `2e9` each: ALPHA 2 hits level 10 (steps 4 and 5, the step 5 one `is_final_hit`), BRAVO 1 hit level 9. Hard day 1: ALPHA 3 hits — HSTA `100e9`, HSTA `50e9`, `Storm Bringer Z.E.U.S.` (`400001`) `30e9`; BRAVO 2 hits `Spread P.S.I.D.` (`200001`) `20e9` each; DELTA 3 hits `Material H D.M.T.R.` (`500001`) `10e9` each. Level data: hard level 4, one boss `Black Smith H.S.T.A.`, `current_hp "1027483050281"`, `max_hp "0"`.

Add a `union` fixture: `build_union(union_store, union_store.build_tables(), me="a", now=1000)`.

- [ ] **Step 2: Write the failing tests in `tests/test_union.py`**

```python
def test_boss_code_and_season_number():
    assert boss_code("Black Smith H.S.T.A.") == "HSTA"
    assert boss_code("Obelisk Z.E.U.S.") == "ZEUS"
    assert season_number("1000046") == 46 and season_number(1000035) == 35

def test_build_union_hits(union):
    assert sorted(union.seasons) == [45, 46]
    s46 = [h for h in union.hits if h["season"] == 46]
    assert len(s46) == 11
    zeus = next(h for h in s46 if h["code"] == "ZEUS" and h["mode"] == "hard")
    assert (zeus["day"], zeus["mode"], zeus["boss_element"], zeus["damage"]) == (2, "hard", "Electronic", 30_000_000_000)
    assert zeus["squad"][0]["name"] == "Crown" and zeus["squad"][0]["element"] == "Iron"
    assert union.me == "a" and union.live is None

def test_member_keeps_latest_nickname(union):
    assert union.names["b"] == "BRAVO"

def test_live_season_from_raid_list(union_store):
    u = build_union(union_store, union_store.build_tables(), me=None, now=350)
    assert u.live == 46

def test_unknown_difficulty_ignored(union_store):
    # append a copy of one s46 hit with "difficulty": 3 to the raw file, then rebuild
    u = build_union(union_store, union_store.build_tables(), me="a", now=1000)
    assert len([h for h in u.hits if h["season"] == 46]) == 11

def test_write_union_parsed(union_store, union):
    write_union_parsed(union_store, union)
    text = (union_store.parsed_dir / "union_hits.csv").read_text(encoding="utf-8-sig")
    assert text.splitlines()[0].startswith("season,day,mode,level,step,code,boss,member,damage,final,slot1")
    assert text.count("\n") == 21  # header + 9 (s45) + 11 (s46)
```

- [ ] **Step 3: Run `uv run pytest tests/test_union.py -v`.** Expected: FAIL, `ModuleNotFoundError: blablalink.union`.

- [ ] **Step 4: Implement `union.py` with the interfaces above, and update `SCOPES` and `sources.json`.**

Season files are read with `sorted((store.raw_dir / "union").glob("*.json"))`. The Nikke lookup for squads reuses the roster → nikke join from `Store.build_tables`. Extract it into a `Store` method `nikke_lookup() -> Callable[[int], dict]` (returns `{"name", "element"}`, falling back to `NIKKE_<tid>`) and have `build_tables` use it too, so the join lives in one place. `names` is filled in season order, so the newest season wins.

- [ ] **Step 5: Run `uv run pytest -v`.** Expected: all PASS (existing tests included).

- [ ] **Step 6: Commit** — `feat: union raid data model built from raw season files`

---

### Task 2: Fetching seasons with the lock rule

**Files:**
- Modify: `src/blablalink/union.py`
- Test: `tests/test_union.py`

**Interfaces:**
- Consumes: `make_client`, `AuthError`, `AUTH_CODE`, `AREA_ID` from `fetch.py`. `raid_list` raw.
- Produces:
  - `class UnionError(Exception)` (message = the server's `msg`, e.g. `"user not in guild"`)
  - `is_final(stored: dict | None, season: dict) -> bool` (`stored` present and `stored["fetched_ts"] > season["end_ts"]`)
  - `async fetch_union(store: Store, client: httpx.AsyncClient, now: float, live_only: bool = False) -> dict[int, str]` → season number → `"saved"`, `"kept"`, `"failed: <reason>"`. Seasons with `start_ts > now` are skipped (not in the result). With `live_only`, only the season where `start_ts <= now <= end_ts` is fetched, and the result is empty when none is running.

Flow: GetMyGuildInfo first (`AuthError` on 300001, `UnionError(msg)` on any other non-zero code or missing `card`). Then for each season in `raid_list` order: final → `"kept"` (no request). Otherwise call both raid endpoints. Only when both return `code 0` with a dict `data` is the file written (`fetched_ts = int(now)`), otherwise `"failed: <msg or HTTP status>"` and the old file stays. Use one retry on HTTP errors, the same way `fetch_lineup` does. A 0.5–1.0 s random pause between seasons.

- [ ] **Step 1: Write the failing tests** (httpx `MockTransport`, as in `tests/test_fetch.py`)

```python
def test_fetch_saves_missing_and_keeps_final(union_store): ...
    # raid_list has s45, s46 (both final in fixture) + add s47 start 900 end 1100; now=1200
    # → {45: "kept", 46: "kept", 47: "saved"}; only s47 requests sent; s47 file fetched_ts == 1200

def test_fetch_refreshes_unfinal_then_locks(union_store): ...
    # s46 file fetched_ts = 350 (stored while live), now=1000 → 46 "saved"; second run → 46 "kept"

def test_failed_call_never_replaces(union_store): ...
    # s46 un-final, raid endpoint returns {"code": 1, "msg": "boom"} → "failed: boom", file bytes unchanged

def test_guild_error_touches_nothing(union_store): ...
    # GetMyGuildInfo → {"code": 1303028, "msg": "user not in guild"} → raises UnionError("user not in guild"); no raid requests
    # code 300001 → raises AuthError

def test_live_only(union_store): ...
    # now=350 → only s46 fetched (even though stored), result == {46: "saved"}; now=1000 → {}
```

- [ ] **Step 2: Run `uv run pytest tests/test_union.py -v`.** Expected: the new tests FAIL (`fetch_union` missing).
- [ ] **Step 3: Implement `UnionError`, `is_final`, `fetch_union` in `union.py`.**
- [ ] **Step 4: Run `uv run pytest -v`.** Expected: all PASS.
- [ ] **Step 5: Commit** — `feat: fetch union raid seasons, finished seasons locked`

---

### Task 3: Season queries — recap, hits, missed, normal

**Files:**
- Create: `src/blablalink/union_queries.py`
- Test: `tests/test_union_queries.py`

**Interfaces:**
- Consumes: `UnionData`, hit dict keys, `WEAK_TO` (Task 1); `Result`, `QueryError` from `queries.py`.
- Produces (every `Result` has `scope="union"`):
  - `fmt_dmg(n: int) -> str` — unit T / B / M, two decimals when the value in that unit is below 10, else one: `1027483050281 → "1.03T"`, `160433126788 → "160.4B"`, `9051890653 → "9.05B"`, `100e9 → "100.0B"`, `812_300_000 → "812.3M"`
  - `pick_season(u, arg: str | None) -> int` — `"s45"`/`"45"` → 45; `None` → `u.live` if stored, else the newest stored; errors: `QueryError("no union data yet — run sync, then fetch")`, `QueryError("s44 isn't stored — stored: s45, s46")`
  - `resolve_member(u, query: str) -> str` (openid) — exact nickname (any case) first, then unique substring, else `QueryError` listing matches, like `resolve_nikke`
  - `recap(u, n: int) -> Result` columns `["", ""]`
  - `hits(u, n: int, filters: list[str]) -> Result` columns `["day", "mode", "lv", "boss", "member", "damage", "final", "squad"]`
  - `missed(u, n: int) -> Result` columns `["member", "hits"]`
  - `normal(u, n: int) -> Result` columns `["member", "hits", "damage"]`

Rules:
- Normal cleared on: the day of the normal hit with `level 10`, `step 5`, `final`; else `"not cleared"`.
- Hard result from `seasons[n]["level"]["level_info"][0]`: hard level 4 → `"cleared · 1.03T on Black Smith H.S.T.A."`; hard level ≤ 3 → `"stopped at hard lv2 · HP left: ZEUS 38.97B/226.26B, …"` (bosses with HP left > 0 only); normal → `"normal lv<n>"`.
- Hard day = the day of the hard hits. `missed` lists members with a hard hit count below 3 on that day, sorted by hits then name. Summary: `"3 of 4 members hit on hard day D2"`. No hard hits → no rows, summary `"hard mode not reached yet"`.
- `hits` filters (any order, case-insensitive): `normal`/`hard`, `lv<n>`, `d<n>` (1-based), a boss code, otherwise a member name via `resolve_member`. Sorted by damage, highest first. Squad shown as `"Crown, Anis: Star"`. Summary: `"<count> hits · <fmt total>"`.
- `normal`: one row per member who hit normal mode, sorted by damage. Summary: `"<members> members · <hits> hits · <fmt total>"`.

- [ ] **Step 1: Write the failing tests**

```python
def test_fmt_dmg():
    assert [fmt_dmg(x) for x in (1027483050281, 160433126788, 9051890653, 812_300_000)] == ["1.03T", "160.4B", "9.05B", "812.3M"]

def test_pick_season(union):
    assert pick_season(union, "s45") == 45 and pick_season(union, None) == 46
    with pytest.raises(QueryError, match="stored: s45, s46"): pick_season(union, "s44")

def test_recap(union):
    text = str(recap(union, 46).rows)
    assert "cleared · 1.03T on Black Smith H.S.T.A." in text and "D1" in text  # normal cleared day
    assert "stopped at hard lv2" in str(recap(union, 45).rows)

def test_hits_filters(union):
    r = hits(union, 46, ["hard", "hsta"])
    assert [row[5] for row in r.rows] == ["100.0B", "50.0B"]
    assert len(hits(union, 46, ["d1"]).rows) == 3 and len(hits(union, 46, ["delta"]).rows) == 3
    assert len(hits(union, 46, ["normal", "lv10"]).rows) == 2

def test_missed(union):
    r = missed(union, 46)
    assert r.rows == [["BRAVO", 2]] and r.summary == "3 of 4 members hit on hard day D2"

def test_missed_before_hard(union):  # drop s46 hard hits from union.hits
    ...  # rows == [] and summary == "hard mode not reached yet"

def test_normal(union):
    assert [row[0] for row in normal(union, 46).rows] == ["ALPHA", "BRAVO"]

def test_resolve_member_ambiguous(union):
    with pytest.raises(QueryError, match="ALPHA"):  # "a" matches ALPHA, BRAVO, CHARLIE, DELTA
        resolve_member(union, "a")
```

- [ ] **Step 2: Run `uv run pytest tests/test_union_queries.py -v`.** Expected: FAIL (module missing).
- [ ] **Step 3: Implement the functions above in `union_queries.py`.**
- [ ] **Step 4: Run `uv run pytest -v`.** Expected: all PASS.
- [ ] **Step 5: Commit** — `feat: union recap, hits, missed and normal queries`

---

### Task 4: Cross-season queries — top, member, members, growth, boss

**Files:**
- Modify: `src/blablalink/union_queries.py`
- Test: `tests/test_union_queries.py`

**Interfaces:**
- Consumes: Task 3 helpers.
- Produces:
  - `top(u, season: int | None, member: str | None) -> Result` columns `["name", "hits"]` (`season None` = all seasons; `member` is an openid)
  - `member(u, openid: str) -> Result` columns `["season", "hits", "normal", "hard", "damage"]`
  - `members(u) -> Result` columns `["member", "first", "last", "seasons"]`
  - `growth(u, openids: list[str]) -> Result`
  - `boss(u, code: str) -> Result` columns `["season", "boss", "union", "me"]`

Rules:
- `member` summary, one line each: `bosses: HSTA 5, ZEUS 1` · `same boss twice in a day: <n>` (count of member-day-boss groups with ≥ 2 hits) · `weakness Nikkes per squad: <avg, 1 decimal>` (squad Nikkes whose element equals `WEAK_TO[boss_element]`, hard hits only) · `favourites: Crown 4, …` (top 5).
- `members`: sorted by last season desc, then name. Summary: one line per season after the first, `s46: +DELTA −CHARLIE` (skipped when nobody arrived or left).
- `growth` with no openids: columns `["season", "hard result", "hard damage", "normal cleared"]`. With openids: `["season", "union median", <nickname>…]`, where each value is that member's hard damage that season (`"-"` if absent), and the median is over members with hard hits that season.
- `boss`: one row per season whose hits include that code. `union` = all hits on it, `me` = `u.me`'s hits (`"-"` without `me`). Unknown code → `QueryError` listing `HSTA, PSID, ZEUS, DMTR, ANMI`.

- [ ] **Step 1: Write the failing tests**

```python
def test_top(union):
    assert top(union, None, None).rows == [["Anis: Star", 20], ["Crown", 20]]  # ties sorted by name
    assert top(union, 46, "d").rows == [["Anis: Star", 3], ["Crown", 3]]

def test_member_tendencies(union):
    r = member(union, "a")
    assert [row[0] for row in r.rows] == ["s45", "s46"]
    assert "bosses: HSTA 5, ZEUS 1" in r.summary            # hard hits only
    assert "same boss twice in a day: 2" in r.summary       # HSTA ×3 in s45, HSTA ×2 in s46
    assert "weakness Nikkes per squad: 0.2" in r.summary    # Crown (Iron) vs ZEUS once in 6 hard hits

def test_members_arrivals(union):
    assert "s46: +DELTA −CHARLIE" in members(union).summary

def test_growth(union):
    assert growth(union, []).rows[1][2] == "250.0B"         # s46 hard: 180 + 40 + 30
    r = growth(union, ["a", "b"])
    assert r.columns == ["season", "union median", "ALPHA", "BRAVO"]
    assert r.rows[1] == ["s46", "40.0B", "180.0B", "40.0B"]

def test_boss(union):
    r = boss(union, "hsta")
    assert [row[0] for row in r.rows] == ["s45", "s46"]
    assert r.rows[0][2:] == ["360.0B", "120.0B"] and r.rows[1][2:] == ["150.0B", "150.0B"]
    with pytest.raises(QueryError, match="HSTA, PSID"):
        boss(union, "xyz")
```

- [ ] **Step 2: Run `uv run pytest tests/test_union_queries.py -v`.** Expected: the new tests FAIL.
- [ ] **Step 3: Implement the five functions.**
- [ ] **Step 4: Run `uv run pytest -v`.** Expected: all PASS.
- [ ] **Step 5: Commit** — `feat: union top, member, members, growth and boss queries`

---

### Task 5: Union mode in the shell

**Files:**
- Modify: `src/blablalink/cli.py`
- Modify: `README.md` (union section)
- Test: `tests/test_cli.py`

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces:
  - `parse_command(line: str, commands: dict = COMMANDS) -> Command`. With `UNION_COMMANDS`, a first word matching `^s\d+$` → `Command("season", [word, *rest], force)`. `growth` args split on `+` (like `nikke`), `member` takes the rest of the line as one name.
  - `UNION_COMMANDS` (same tuple shape as `COMMANDS`): `fetch, live, season, hits, missed, normal, top, member, members, growth, boss, help, back`, with usage and examples from the spec table.
  - `COMMANDS["union"] = ("union [cmd]", "union raid mode — help union lists its commands", ["union", "union s45", "union missed s44"])`
  - `App.mode: str` (`"main"`/`"union"`), `App.prompt() -> str` (`"> "` / `"union> "`), `App.union: UnionData`

Behaviour:
- `execute` parses with the table of the current mode. In union mode, `back` and `quit` return to the main mode (the shell keeps running).
- `do_union`: no args → switch to union mode and print the union help. With args → run `("!" if force else "") + " ".join(args)` as one union-mode line, then stay in the main mode.
- `help union` in the main mode and `help` in union mode print the same `UNION_COMMANDS` table. Its footer: `"sN alone shows that season's recap · no season = live, else latest · ! rebuilds an export"`.
- Union searches go through the same export cache as `search`. Extract the cache-and-render part of `search` into `_show(scope: str, name: str, args: list[str], force: bool, run)` and use it from both. Union exports use scope `"union"` and `export_name(cmd, [f"s{season}", *other args])`.
- `render`: when `rows` is empty and there's a `summary`, print only the summary.
- Union `fetch`/`live`: same cookie and error handling as `do_fetch` (`AuthError` → "cookie rejected", `UnionError` → print its message in red), need `raid_list` (else "no season list yet — run sync first"). Print one line per season (`s46: saved`). If anything was saved: rebuild `self.union`, `write_union_parsed`, wipe the `"union"` exports. `live` with an empty result prints "no union raid running right now".
- `App.__init__` and `refresh` build `self.union` (me from `load_cookie(...)["game_openid"]`, ignoring a missing cookie; `now=time.time()`) and write `union_hits.csv`. A raw union file newer than `union_hits.csv` at start → rewrite it and wipe `"union"` exports, like the clear check.
- Completion follows the mode: in union mode the commands, plus boss codes for `hits`/`boss`, stored `sN` values, and member nicknames for `member`/`hits`.
- Main loop: `session.prompt(app.prompt)` (prompt_toolkit accepts a callable).

- [ ] **Step 1: Write the failing tests** (use `union_store` and `make_app`)

```python
def test_union_mode_and_back(union_store):
    app, out = make_app(union_store)
    app.execute("union")
    assert app.prompt() == "union> " and "missed" in out.export_text()
    assert app.execute("quit") is True and app.mode == "main"

def test_union_one_shot_and_help(union_store):
    app, out = make_app(union_store)
    app.execute("union s46")
    assert app.mode == "main" and "1.03T" in out.export_text(clear=False)
    app.execute("help union")
    assert all(name in out.export_text() for name in UNION_COMMANDS)

def test_union_parse():
    assert parse_command("s45 x", UNION_COMMANDS).name == "season"
    assert parse_command("mi s44", UNION_COMMANDS).args == ["s44"]

def test_union_export_names_season(union_store):
    app, _ = make_app(union_store)
    app.execute("union missed")
    assert union_store.export_path("union", "missed__s46").exists()

def test_union_queries_before_any_data(tmp_path):
    app, out = make_app(Store(tmp_path))
    for line in ["union s46", "union missed", "union member"]:
        assert app.execute(line) is True
    assert "Traceback" not in out.export_text() and "run sync" in out.export_text()

def test_live_wipes_union_exports(union_store, monkeypatch):
    app, _ = make_app(union_store)
    app.execute("union missed s46")
    path = union_store.export_path("union", "missed__s46")
    assert path.exists()
    save_cookie(union_store, "game_token=t; game_openid=a")
    async def fake(*a, **k): return {46: "saved"}
    monkeypatch.setattr("blablalink.cli.fetch_union", fake)
    app.execute("union live")
    assert not path.exists()
```

- [ ] **Step 2: Run `uv run pytest tests/test_cli.py -v`.** Expected: the new tests FAIL.
- [ ] **Step 3: Implement the changes in `cli.py`.** Keep all existing tests passing (`parse_command(line)` keeps working with one argument).
- [ ] **Step 4: Add a README section** "Union raid": enter with `union`, the command table, that finished seasons are locked and `live` re-downloads the running one, and that the data can't be fetched again after leaving the union.
- [ ] **Step 5: Run `uv run pytest -v`.** Expected: all PASS.
- [ ] **Step 6: Manual check against the real data:** `uv run blablalink`, then `sync`, `union`, `fetch`, `s46`, `missed s46`, `member`. Expected: s46 recap shows `cleared · 1.03T on Black Smith H.S.T.A.`, and seasons 35–46 are listed as saved.
- [ ] **Step 7: Commit** — `feat: union mode in the shell`
