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
    assert store.export_path("all", "nikke_crown").exists()
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
