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
