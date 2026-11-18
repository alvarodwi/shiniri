import csv
import json
from datetime import datetime

from shiniri_cli.queries import Result
from shiniri_cli.store import Store, export_name, format_dupes, scopes_to_wipe


def test_format_dupes():
    assert [format_dupes(0, 0), format_dupes(2, 0), format_dupes(3, 0), format_dupes(3, 7)] == ["LB0", "LB2", "MLB", "C7"]


def test_raw_roundtrip_and_default(tmp_path):
    s = Store(tmp_path)
    assert s.load_clears("tower") == {}
    s.save_clears("tower", {"1": {"cleared_at": "5", "list": []}})
    assert s.load_clears("tower") == {"1": {"cleared_at": "5", "list": []}}
    assert not list(s.raw_dir.glob("*.tmp"))


def test_migrate_renames_raw_to_cdn_names(tmp_path):
    s = Store(tmp_path)
    s.save_raw("campaign_level", [{"id": 1}])
    s.save_raw("tower_level", ["old"])
    s.save_raw("tower_list", ["new"])
    assert s.migrate()
    assert s.load_raw("stage_list") == [{"id": 1}] and s.load_raw("campaign_level") is None
    # never overwrite a file already at the new name
    assert s.load_raw("tower_list") == ["new"] and s.load_raw("tower_level") == ["old"]


def test_migrate_converts_legacy(tmp_path):
    (tmp_path / "test_tower_clear_history.json").write_text(json.dumps([{
        "stage_id": 51030, "cleared_at_timestamp": "1794364831", "team_lineup": [
            {"slot": 1, "tid": 301706, "name": "Anis: Star", "level": 801, "combat_power": 776595}]}]), encoding="utf-8")
    (tmp_path / "nikke.json").write_text("[]", encoding="utf-8")
    s = Store(tmp_path)
    assert s.migrate()
    assert s.load_clears("tower") == {"51030": {"cleared_at": "1794364831",
        "list": [{"slot": 1, "tid": 301706, "lv": 801, "combat": 776595}]}}
    assert s.load_raw("nikke_list_en") == [] and not (tmp_path / "nikke.json").exists()
    assert (tmp_path / "test_tower_clear_history.json").exists()
    assert s.migrate() == []


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
    store.save_clears("tower", {"50002": {"cleared_at": "0", "list": [{"slot": 1, "tid": 433004, "lv": 5, "combat": 1}]}})
    assert store.build_tables().clears[-1]["cleared_at"] is None


def test_write_parsed(store):
    store.write_parsed(store.build_tables())
    with open(store.parsed_dir / "lineups.csv", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == 4 and {r["name"] for r in rows} >= {"Crown", "NIKKE_999999"}
    assert (store.parsed_dir / "campaign_clears.csv").exists() and (store.parsed_dir / "tower_clears.csv").exists()


def test_empty_store_builds_empty_tables(tmp_path):
    t = Store(tmp_path).build_tables()
    assert (t.clears, t.lineups, t.nikke_names) == ([], [], [])


def test_export_name_windows_safe():
    assert export_name("nikke", ["crown", "anis: star"]) == "nikke__crown__anis_star"
    assert export_name("date", ["2026-11-01..2026-11-11"]) == "date__2026_11_01_2026_11_11"


def test_export_roundtrip(store):
    p = store.export_path("all", "nikke__crown")
    store.write_export(p, Result("all", ["a", "b"], [[1, "x"]], "1 clears"))
    r = store.read_export(p)
    assert (r.scope, r.columns, r.rows, r.summary) == ("all", ["a", "b"], [["1", "x"]], "1 clears")
    assert store.read_export(store.export_path("all", "missing")) is None


def test_scopes_to_wipe():
    assert scopes_to_wipe(fetched={"tower"}) == {"tower", "all"}
    assert scopes_to_wipe(synced={"nikke_list_en"}) == {"campaign", "tower", "all", "union"}
    assert scopes_to_wipe(synced={"stage_list"}) == {"campaign", "all"}
    assert scopes_to_wipe() == set()
    assert scopes_to_wipe(synced={"raid_list"}) == {"union"}


def test_wipe_only_scope(store):
    for scope in ("campaign", "tower"):
        store.write_export(store.export_path(scope, "x"), Result(scope, ["a"], []))
    store.wipe_exports({"tower"})
    assert store.export_path("campaign", "x").exists() and not store.export_path("tower", "x").exists()


def test_export_name_keeps_args_apart():
    assert export_name("nikke", ["rapi", "red hood"]) != export_name("nikke", ["rapi: red hood"])
