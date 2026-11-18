import pytest
from rich.console import Console

from blablalink.cli import COMMANDS, UNION_COMMANDS, App, parse_command
from blablalink.fetch import save_cookie
from blablalink.queries import QueryError
from blablalink.store import Store


def make_app(store):
    out = Console(record=True, width=200)
    return App(store, out), out


def test_parse_command():
    c = parse_command("!n crown + anis: star")
    assert (c.name, c.args, c.force) == ("nikke", ["crown", "anis: star"], True)
    assert parse_command("fl tribe 1").name == "floor" and parse_command("sync").name == "sync"
    with pytest.raises(QueryError, match="stage"):
        parse_command("s hard 2")


def test_bad_args_keep_running(store):
    app, out = make_app(store)
    for line in ["stage hard x", "floor moon 3", "date 2026-13-01", "bogus", "stage", "n"]:
        assert app.execute(line) is True
    assert "Traceback" not in out.export_text()


def test_search_writes_then_reuses_export(store):
    app, out = make_app(store)
    app.execute("n crown")
    assert store.export_path("all", "nikke__crown").exists()
    app.execute("n crown")
    assert "cached" in out.export_text(clear=False)
    app.execute("!n crown")
    assert out.export_text().count("cached") == 1


def test_parsed_csv_written_on_start(store):
    make_app(store)
    assert (store.parsed_dir / "lineups.csv").exists()


def test_empty_first_run(tmp_path):
    app, out = make_app(Store(tmp_path))
    assert app.execute("progress") is True and "run sync" in out.export_text()


def test_help_lists_every_command(store):
    app, out = make_app(store)
    app.execute("help")
    text = out.export_text()
    assert all(name in text for name in COMMANDS)


def test_quit(store):
    app, _ = make_app(store)
    assert app.execute("quit") is False


def test_utf8_stream_survives_cp1252():
    import io
    from blablalink.cli import utf8
    raw = io.BytesIO()
    stream = utf8(io.TextIOWrapper(raw, encoding="cp1252"))
    stream.write("→ · Anis: Star")
    stream.flush()
    assert raw.getvalue().decode("utf-8") == "→ · Anis: Star"


def test_cookie_never_taken_inline():
    assert parse_command("cookie game_token=t; game_openid=o").args == []


def test_unexpected_errors_keep_shell(store):
    app, out = make_app(store)
    def boom(cmd): raise PermissionError(13, "denied", "x.csv")
    def interrupt(cmd): raise KeyboardInterrupt
    def other(cmd): raise AttributeError("nope")
    for fn in (boom, interrupt, other):
        app.do_progress = fn
        assert app.execute("progress") is True
    text = out.export_text()
    assert "open in Excel" in text and "cancelled" in text and "nope" in text


def test_fetch_failure_still_refreshes(store, monkeypatch):
    import blablalink.cli as cli
    from blablalink.fetch import save_cookie
    save_cookie(store, "game_token=t; game_openid=o")
    app, out = make_app(store)
    app.execute("top tribe")
    assert store.export_path("tower", "top__tribe").exists()

    async def half(store_, source, client, tick=None):
        clears = store_.load_clears(source)
        clears["50002"] = {"cleared_at": "1", "list": [{"slot": 1, "tid": 433004, "lv": 1, "combat": 1}]}
        store_.save_clears(source, clears)
        raise ValueError("Expecting value")
    monkeypatch.setattr(cli, "fetch_clears", half)
    assert app.execute("fetch tower") is True
    assert "tower: +1" in out.export_text()
    assert not store.export_path("tower", "top__tribe").exists()


def test_start_rebuilds_when_raw_newer_than_parsed(store):
    import os
    app, _ = make_app(store)
    app.execute("top tribe")
    lineups = store.parsed_dir / "lineups.csv"
    os.utime(lineups, (1, 1))
    make_app(store)
    assert lineups.stat().st_mtime > 1 and not store.export_path("tower", "top__tribe").exists()


def test_fetch_arg_any_case(store):
    app, out = make_app(store)
    app.execute("fetch Tower")
    assert "no cookie saved" in out.export_text()


def test_reversed_date_range_is_swapped(store):
    app, _ = make_app(store)
    app.execute("date 2026-12-31..2026-10-01")
    rows = store.read_export(store.export_path("all", "date__2026_12_31_2026_10_01")).rows
    assert [r[1] for r in rows] == ["campaign", "tower"]


def test_completer_follows_new_data(store):
    from prompt_toolkit.document import Document
    app, _ = make_app(store)
    def words(text):
        return {c.text for c in app.completer().get_completions(Document(text), None)}
    assert "Crown" in words("nikke cro")
    nikke = store.load_raw("nikke_list_en") + [{"id": 1, "resource_id": 1, "name_localkey": {"name": "Crow Bar"}}]
    store.save_raw("nikke_list_en", nikke)
    app.refresh(synced={"nikke_list_en"})
    assert "Crow Bar" in words("nikke cro")


def test_status_shows_last_fetch_and_sync(store, monkeypatch):
    import blablalink.cli as cli
    from blablalink.fetch import save_cookie
    app, _ = make_app(store)
    assert "fetched never" in app.status() and "synced never" in app.status()

    async def nothing(*a, **k):
        return 0
    monkeypatch.setattr(cli, "fetch_clears", nothing)
    save_cookie(store, "game_token=t; game_openid=o")
    app.execute("fetch tower")
    assert "fetched never" not in app.status()


def test_usage_error_before_empty_hint(tmp_path):
    app, out = make_app(Store(tmp_path))
    app.execute("stage hard x")
    assert "chapter must be a number" in out.export_text()


def test_damaged_export_is_rebuilt(store):
    app, out = make_app(store)
    path = store.export_path("all", "progress")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("", encoding="utf-8")
    app.execute("progress")
    assert "Tribe" in out.export_text() and store.read_export(path).rows


def test_stage_entry_and_missing_entry(store):
    app, out = make_app(store)
    app.execute("stage normal 2-3")
    assert store.export_path("campaign", "stage__normal__2_3").exists()
    app.execute("stage normal 2-9")
    assert "try: stage normal 2" in out.export_text()
    app.execute("stage normal x-3")
    assert "chapter must be a number" in out.export_text()


def test_spread_command(store):
    app, out = make_app(store)
    app.execute("sp")
    assert store.export_path("all", "spread").exists() and "N/A" in out.export_text()
    app.execute("spread 10")
    assert store.export_path("all", "spread__10").exists()
    app.execute("spread 0")
    assert "step must be at least 1" in out.export_text()


def test_union_mode_and_back(union_store):
    app, out = make_app(union_store)
    app.execute("union")
    assert app.prompt() == "union> " and "missed" in out.export_text()
    app.execute("s46")
    assert "1.03T" in out.export_text()
    assert app.execute("quit") is True and app.mode == "main" and app.prompt() == "> "


def test_union_one_shot_and_help(union_store):
    app, out = make_app(union_store)
    app.execute("union s46")
    assert app.mode == "main" and "1.03T" in out.export_text(clear=False)
    out.export_text()
    app.execute("help union")
    text = out.export_text()
    assert all(name in text for name in UNION_COMMANDS)


def test_union_parse():
    assert parse_command("s45 x", UNION_COMMANDS).name == "season"
    assert parse_command("s45", UNION_COMMANDS).args == ["s45"]
    assert parse_command("mi s44", UNION_COMMANDS).args == ["s44"]
    assert parse_command("growth alpha + bravo two", UNION_COMMANDS).args == ["alpha", "bravo two"]
    assert parse_command("member bravo two", UNION_COMMANDS).args == ["bravo two"]


def test_union_export_names_season(union_store):
    app, _ = make_app(union_store)
    app.execute("union missed")
    assert union_store.export_path("union", "missed__s46").exists()


def test_union_queries_before_any_data(tmp_path):
    app, out = make_app(Store(tmp_path))
    for line in ["union s46", "union missed", "union member", "union members", "union boss hsta"]:
        assert app.execute(line) is True
    text = out.export_text()
    assert "Traceback" not in text and "run sync" in text


def test_union_bad_args_keep_running(union_store):
    app, out = make_app(union_store)
    for line in ["union hits zzz", "union s99", "union boss xyz", "union top s1", "union bogus", "union growth zzz"]:
        assert app.execute(line) is True
    assert "Traceback" not in out.export_text()


def test_live_wipes_union_exports(union_store, monkeypatch):
    app, _ = make_app(union_store)
    app.execute("union missed s46")
    path = union_store.export_path("union", "missed__s46")
    assert path.exists()
    save_cookie(union_store, "game_token=t; game_openid=a")

    async def fake(*a, **k):
        return {46: "saved"}
    monkeypatch.setattr("blablalink.cli.fetch_union", fake)
    app.execute("union live")
    assert not path.exists()


def test_union_fetch_needs_season_list(store):
    app, out = make_app(store)
    save_cookie(store, "game_token=t; game_openid=a")
    app.execute("union fetch")
    assert "run sync first" in out.export_text()


def test_help_keeps_brackets_and_names_with_brackets(union_store):
    app, out = make_app(union_store)
    app.execute("help union")
    app.execute("help")
    raw = union_store.load_raw("union/1000046")
    for h in raw["raid"]["participate_data"]:
        if h["openid"] == "d":
            h["nickname"] = "[red]DELTA"
    union_store.save_raw("union/1000046", raw)
    app._load_union()
    app.execute("union missed s46")
    app.execute("union hits s46 red")
    text = out.export_text()
    assert "hits [sN]" in text and "help [cmd]" in text and "[red]DELTA" in text


def test_union_exports_keyed_by_member_not_name(union_store):
    raw = union_store.load_raw("union/1000046")
    for h in raw["raid"]["participate_data"]:
        h["nickname"] = {"a": "ゆき", "b": "はる", "d": "なつ"}[h["openid"]]
    union_store.save_raw("union/1000046", raw)
    save_cookie(union_store, "game_token=t; game_openid=a")
    app, out = make_app(union_store)
    app.execute("union member ゆき")
    out.export_text()
    app.execute("union member はる")
    text = out.export_text()
    assert "cached" not in text and "はる" in text
    app.execute("union hits s46 me")
    assert "5 hits" in out.export_text()


def test_q_leaves_union_mode(union_store):
    app, _ = make_app(union_store)
    app.execute("union")
    assert app.execute("q") is True and app.mode == "main"


def test_hits_quoted_and_forced_member_names(union_store):
    assert parse_command('hits "bravo two" @hard', UNION_COMMANDS).args == ["bravo two", "@hard"]
    raw = union_store.load_raw("union/1000046")
    for h in raw["raid"]["participate_data"]:
        h["nickname"] = {"a": "hard", "b": "BRA VO", "d": "DELTA"}[h["openid"]]
    union_store.save_raw("union/1000046", raw)
    app, out = make_app(union_store)
    app.execute("union hits s46 @hard")
    assert "5 hits" in out.export_text()
    app.execute('union hits s46 "bra vo"')
    assert "3 hits" in out.export_text()
    app.execute('union hits "unbalanced')
    assert "unbalanced quote" in out.export_text(clear=False)
    assert "Traceback" not in out.export_text()
