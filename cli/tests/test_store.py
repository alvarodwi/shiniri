import csv
import json
from datetime import datetime

from blablalink.store import Store, format_dupes


def test_format_dupes():
    assert [format_dupes(0, 0), format_dupes(2, 0), format_dupes(3, 0), format_dupes(3, 7)] == ["LB0", "LB2", "MLB", "C7"]


def test_raw_roundtrip_and_default(tmp_path):
    s = Store(tmp_path)
    assert s.load_clears("tower") == {}
    s.save_clears("tower", {"1": {"cleared_at": "5", "list": []}})
    assert s.load_clears("tower") == {"1": {"cleared_at": "5", "list": []}}
    assert not list(s.raw_dir.glob("*.tmp"))


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
