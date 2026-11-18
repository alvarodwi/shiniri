import pytest
from rich.console import Console

from blablalink.cli import COMMANDS, App, parse_command
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
