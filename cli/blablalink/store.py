"""Paths, raw JSON storage, and everything derived from it."""

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

SOURCES = ("campaign", "tower")
REFERENCE = ("nikke", "historical_roster", "campaign_level", "tower_level")
SCOPES = ("campaign", "tower", "all")


def format_dupes(grade: int, core: int) -> str:
    if grade < 3:
        return f"LB{grade}"
    return "MLB" if core == 0 else f"C{core}"


def atomic_write(path: Path, text: str, encoding: str = "utf-8") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(text, encoding=encoding, newline="")
    os.replace(tmp, path)


@dataclass
class Store:
    root: Path

    @property
    def raw_dir(self) -> Path:
        return self.root / "data" / "raw" / "json"

    @property
    def parsed_dir(self) -> Path:
        return self.root / "data" / "parsed" / "csv"

    @property
    def exports_dir(self) -> Path:
        return self.root / "data" / "exports"

    @property
    def config_dir(self) -> Path:
        return self.root / "config"

    def load_raw(self, name: str, default: Any = None) -> Any:
        path = self.raw_dir / f"{name}.json"
        if not path.exists():
            return default
        return json.loads(path.read_text(encoding="utf-8"))

    def save_raw(self, name: str, obj: Any) -> None:
        atomic_write(self.raw_dir / f"{name}.json", json.dumps(obj, ensure_ascii=False, indent=1))

    def load_clears(self, source: str) -> dict[str, dict]:
        return self.load_raw(f"{source}_clears", {})

    def save_clears(self, source: str, clears: dict) -> None:
        self.save_raw(f"{source}_clears", clears)
