import pytest
from rich.console import Console

from shiniri_cli.cli import COMMANDS, UNION_COMMANDS, App, parse_command
from shiniri_cli.fetch import save_cookie
from shiniri_cli.union_queries import QueryError
from shiniri_cli.store import Store


def make_app(store):
    out = Console(record=True, width=200)
    return App(store, out), out


def test_parse_command():
    c = parse_command("!mi s44", UNION_COMMANDS)
    assert (c.name, c.args, c.force) == ("missed", ["s44"], True)
    assert parse_command("sync").name == "sync" and parse_command("u").name == "union"
    with pytest.raises(QueryError, match="unknown command"):
        parse_command("cl")


def test_bad_args_keep_running(store):
    app, out = make_app(store)
    for line in ["bogus", "clear", "clear n crown", "help bogus"]:
        assert app.execute(line) is True
    assert "Traceback" not in out.export_text()


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
    from shiniri_cli.cli import utf8
    raw = io.BytesIO()
    stream = utf8(io.TextIOWrapper(raw, encoding="cp1252"))
    stream.write("→ · Anis: Star")
    stream.flush()
    assert raw.getvalue().decode("utf-8") == "→ · Anis: Star"


def test_cookie_never_taken_inline():
    assert parse_command("cookie game_token=t; game_openid=o").args == []


def test_unexpected_errors_keep_shell(union_store):
    app, out = make_app(union_store)
    def boom(cmd): raise PermissionError(13, "denied", "x.csv")
    def interrupt(cmd): raise KeyboardInterrupt
    def other(cmd): raise AttributeError("nope")
    for fn in (boom, interrupt, other):
        app.u_members = fn
        assert app.execute("union members") is True
    text = out.export_text()
    assert "open in Excel" in text and "cancelled" in text and "nope" in text


def test_status_shows_last_sync(store):
    app, _ = make_app(store)
    assert app.status() == "synced never"
    store.mark("sync")
    assert "synced never" not in app.status()


def test_damaged_export_is_rebuilt(union_store):
    app, out = make_app(union_store)
    path = union_store.export_path("union", "missed__s46")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("", encoding="utf-8")
    app.execute("union missed s46")
    assert "cached" not in out.export_text() and union_store.read_export(path) is not None


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
    assert "Traceback" not in text and "run sync, then union fetch" in text


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
    monkeypatch.setattr("shiniri_cli.cli.fetch_union", fake)
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


def test_clear_is_gone(store):
    app, out = make_app(store)
    app.execute("clear")
    app.execute("n crown")
    text = out.export_text()
    assert "unknown command 'clear'" in text and "unknown command 'n'" in text and app.mode == "main"


def test_help_groups(union_store):
    app, out = make_app(union_store)
    app.execute("help union")
    text = out.export_text()
    assert all(n in text for n in ("missed", "back"))
    app.execute("help union hits")
    assert "hits hard hsta" in out.export_text()


def test_completer_resolves_prefixes(union_store):
    from prompt_toolkit.document import Document
    app, _ = make_app(union_store)
    def words(text):
        return {c.text for c in app.completer().get_completions(Document(text), None)}
    assert "s46" in words("u missed ") and "s46" in words("union mi ")
    app.execute("union")
    assert "s46" in words("mi ")


def test_bare_bang_is_blank(store):
    app, out = make_app(store)
    for line in ["!", "!!", " ! "]:
        assert app.execute(line) is True
    app.execute("union")
    assert app.execute("!") is True
    assert "unknown command" not in out.export_text()


def test_run_dispatches_watch(monkeypatch):
    import sys

    from shiniri_cli import cli
    called = []
    monkeypatch.setattr(sys, "argv", ["shiniri-cli", "watch"])
    monkeypatch.setattr("shiniri_cli.profile.watch", lambda store, **kw: called.append(store))
    monkeypatch.setattr("shiniri_cli.cli.main", lambda root: called.append("shell"))
    handlers = {}
    monkeypatch.setattr("signal.signal", lambda sig, h: handlers.__setitem__(sig, h))
    cli.run()
    assert len(called) == 1 and called[0] != "shell"
    import signal
    with pytest.raises(KeyboardInterrupt):  # SIGTERM takes the same clean exit as Ctrl+C
        handlers[signal.SIGTERM](signal.SIGTERM, None)


def test_watch_logs_missing_config_and_keeps_going(store, capsys):
    from datetime import datetime

    from shiniri_cli.profile import WIB, watch
    watch(store, once=True, clock=lambda: datetime(2026, 11, 20, 12, tzinfo=WIB))
    out = capsys.readouterr().out
    assert out.startswith("2026-11-20 12:00:00 ") and "cookie.txt" in out


def test_watch_stops_cleanly_on_interrupt(store, capsys, monkeypatch):
    from datetime import datetime

    from shiniri_cli import profile
    clock = lambda: datetime(2026, 11, 20, 12, tzinfo=profile.WIB)

    def stop(_):
        raise KeyboardInterrupt
    profile.watch(store, sleep=stop, clock=clock)  # interrupted while sleeping
    monkeypatch.setattr(profile, "_check", lambda s, now: stop(0))
    profile.watch(store, clock=clock)  # interrupted mid-check
    lines = capsys.readouterr().out.splitlines()
    assert lines[-1] == "2026-11-20 12:00:00 stopped"
    assert lines.count("2026-11-20 12:00:00 stopped") == 2


def test_fetch_status_colours():
    from shiniri_cli.cli import fetch_colour
    assert fetch_colour("saved") == "green"
    assert fetch_colour("kept") == fetch_colour("kept (+roster)") == fetch_colour("kept (other union)") == "dim"
    assert fetch_colour("failed: boom") == "red"
