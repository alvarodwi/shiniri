"""Paths, raw JSON storage, and everything derived from it."""

import csv
import io
import json
import os
import re
from dataclasses import dataclass
from datetime import datetime
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


LINEUP_KEYS = ("source", "stage_id", "mode", "chapter", "floor", "cleared_at", "slot", "tid", "name",
               "dupe", "level", "cp", "element", "weapon", "burst", "manufacturer")


@dataclass
class Tables:
    clears: list[dict]
    lineups: list[dict]
    nikke_names: list[str]


def _local_time(ts) -> datetime | None:
    if ts in (None, "", "0", 0):
        return None
    try:
        return datetime.fromtimestamp(int(ts)).astimezone()
    except (TypeError, ValueError, OSError):
        return None


def _fmt(dt: datetime | None) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S") if dt else ""


def export_name(command: str, args: list[str]) -> str:
    # only [a-z0-9_] so names like "anis: star" are valid Windows filenames;
    # "__" between parts (never produced inside one) keeps "rapi + red hood" apart from "rapi: red hood"
    return "__".join(re.sub(r"[^a-z0-9]+", "_", p.lower()).strip("_") for p in [command, *args])


def scopes_to_wipe(fetched: set[str] = frozenset(), synced: set[str] = frozenset()) -> set[str]:
    if synced & {"nikke", "historical_roster"}:
        return set(SCOPES)
    out = set(fetched)
    if "campaign_level" in synced:
        out.add("campaign")
    if "tower_level" in synced:
        out.add("tower")
    return out | {"all"} if out else set()


def write_csv(path: Path, header: list[str], rows: list[list]) -> None:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    w.writerows(rows)
    atomic_write(path, buf.getvalue(), encoding="utf-8-sig")


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

    def build_tables(self) -> "Tables":
        """Join raw clears with the reference files into flat rows."""
        roster = {r["id"]: r for r in self.load_raw("historical_roster", []) if "id" in r}
        by_rid, by_id = {}, {}
        for n in self.load_raw("nikke", []):
            if isinstance(n, dict):
                by_rid.setdefault(n.get("resource_id"), n)
                by_id.setdefault(n.get("id"), n)
        stages = {}
        for s in self.load_raw("campaign_level", []):
            stages[("campaign", s["id"])] = {
                "mode": s.get("chapter_mod", ""), "chapter": s.get("chapter_id", 1) - 1, "floor": None,
                "stage_name": (s.get("name_localkey") or {}).get("name", ""),
                "recommended_cp": s.get("standard_battle_power", 0)}
        for s in self.load_raw("tower_level", []):
            stages[("tower", s["stage_id"])] = {
                "mode": str(s.get("tower_type", "")).capitalize(), "chapter": None, "floor": s.get("floor"),
                "stage_name": f"{s.get('floor')}F", "recommended_cp": s.get("standard_battle_power", 0)}

        clears, lineups = [], []
        for source in SOURCES:
            raw = self.load_clears(source)
            for key in sorted(raw, key=int):
                stage_id = int(key)
                meta = stages.get((source, stage_id), {
                    "mode": "", "chapter": None, "floor": None, "stage_name": "", "recommended_cp": 0})
                cleared_at = _local_time(raw[key].get("cleared_at"))
                base = {"source": source, "stage_id": stage_id, "mode": meta["mode"],
                        "chapter": meta["chapter"], "floor": meta["floor"], "cleared_at": cleared_at}
                team = []
                for u in sorted(raw[key].get("list") or [], key=lambda u: u.get("slot", 0)):
                    tid = u.get("tid")
                    r = roster.get(tid)
                    n = by_rid.get(r.get("resource_id")) if r else None
                    n = n or by_id.get(tid) or {}
                    team.append({**base, "slot": u.get("slot"), "tid": tid,
                                 "name": (n.get("name_localkey") or {}).get("name") or f"NIKKE_{tid}",
                                 "dupe": format_dupes(r.get("grade", 0), r.get("core", 0)) if r else "N/A",
                                 "level": u.get("lv"), "cp": u.get("combat") or 0,
                                 "element": ((n.get("element_id") or {}).get("element") or {}).get("element"),
                                 "weapon": ((n.get("shot_id") or {}).get("element") or {}).get("weapon_type"),
                                 "burst": n.get("use_burst_skill"), "manufacturer": n.get("corporation")})
                levels = [u["level"] for u in team if u["level"] is not None]
                synchro = str(levels[0]) if levels and len(set(levels)) == 1 else ", ".join(map(str, levels))
                clears.append({**base, "stage_name": meta["stage_name"],
                               "recommended_cp": meta["recommended_cp"],
                               "team_cp": sum(u["cp"] for u in team), "synchro_level": synchro, "team": team})
                lineups.extend(team)
        names = sorted({(n.get("name_localkey") or {}).get("name") for n in by_id.values()} - {None})
        return Tables(clears, lineups, names)

    def write_parsed(self, tables: "Tables") -> None:
        # shortcut: rebuilds all three CSVs every time (~10k rows, sub-second); split per source if it gets slow.
        for source, place in (("campaign", "chapter"), ("tower", "floor")):
            header = ["stage_id", "mode", place, "stage_name", "date_cleared", "recommended_cp",
                      "team_cp", "synchro_level", "slot1", "slot2", "slot3", "slot4", "slot5"]
            rows = []
            for c in tables.clears:
                if c["source"] != source:
                    continue
                slots = {u["slot"]: u["name"] for u in c["team"]}
                rows.append([c["stage_id"], c["mode"], c[place], c["stage_name"], _fmt(c["cleared_at"]),
                             c["recommended_cp"], c["team_cp"], c["synchro_level"],
                             *(slots.get(i, "") for i in range(1, 6))])
            write_csv(self.parsed_dir / f"{source}_clears.csv", header, rows)
        write_csv(self.parsed_dir / "lineups.csv", list(LINEUP_KEYS),
                  [[_fmt(u[k]) if k == "cleared_at" else u[k] for k in LINEUP_KEYS] for u in tables.lineups])

    def export_path(self, scope: str, name: str) -> Path:
        return self.exports_dir / scope / f"{name}.csv"

    def write_export(self, path: Path, result) -> None:
        write_csv(path, result.columns, result.rows)
        if result.summary:
            atomic_write(path.with_suffix(".summary.txt"), result.summary)

    def read_export(self, path: Path):
        from .queries import Result  # queries imports store
        if not path.exists():
            return None
        with open(path, encoding="utf-8-sig", newline="") as f:
            header, *rows = list(csv.reader(f))
        summary = path.with_suffix(".summary.txt")
        return Result(path.parent.name, header, rows,
                      summary.read_text(encoding="utf-8") if summary.exists() else "")

    def wipe_exports(self, scopes: set[str]) -> None:
        for scope in scopes:
            for f in (self.exports_dir / scope).glob("*"):
                f.unlink()

    def migrate(self) -> list[str]:
        """One-time move of the old root-level files into data/raw/json."""
        done = []
        for name in REFERENCE:
            old, new = self.root / f"{name}.json", self.raw_dir / f"{name}.json"
            if old.exists() and not new.exists():
                new.parent.mkdir(parents=True, exist_ok=True)
                os.replace(old, new)
                done.append(f"moved {old.name} → data/raw/json/")
        for source in SOURCES:
            legacy = self.root / f"test_{source}_clear_history.json"
            if not legacy.exists() or (self.raw_dir / f"{source}_clears.json").exists():
                continue
            records = json.loads(legacy.read_text(encoding="utf-8"))
            clears = {
                str(r["stage_id"]): {
                    "cleared_at": r.get("cleared_at_timestamp"),
                    "list": [{"slot": u.get("slot"), "tid": u.get("tid"), "lv": u.get("level"),
                              "combat": u.get("combat_power")} for u in r["team_lineup"]],
                }
                for r in records if r.get("team_lineup")
            }
            self.save_clears(source, clears)
            done.append(f"converted {legacy.name} → {source}_clears.json ({len(clears)} clears)")
        return done
