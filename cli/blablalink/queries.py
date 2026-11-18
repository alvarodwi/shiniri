"""The fixed searches: pure functions from Tables to a Result."""

from collections import Counter
from dataclasses import dataclass
from datetime import date

from .store import Tables

CAMPAIGN_MODES = ("Normal", "Hard")


@dataclass
class Result:
    scope: str
    columns: list[str]
    rows: list[list]
    summary: str = ""


class QueryError(ValueError):
    pass


def _when(c) -> str:
    return c["cleared_at"].strftime("%Y-%m-%d %H:%M") if c["cleared_at"] else ""


def _place(c) -> str:
    return f"{c['chapter']} · {c['stage_name']}" if c["source"] == "campaign" else c["stage_name"]


def _team(c) -> str:
    return ", ".join(f"{u['name']} ({u['dupe']} {u['level']})" for u in c["team"])


def _towers(tables: Tables) -> dict[str, str]:
    return {c["mode"].lower(): c["mode"] for c in tables.clears if c["source"] == "tower" and c["mode"]}


def resolve_nikke(tables: Tables, query: str) -> str:
    names = set(tables.nikke_names) | {u["name"] for u in tables.lineups}
    q = query.strip().lower()
    exact = [n for n in names if n.lower() == q]
    if exact:
        return exact[0]
    hits = sorted(n for n in names if q in n.lower())
    if not hits:
        raise QueryError(f"no Nikke matches '{query}'")
    if len(hits) > 1:
        raise QueryError(f"'{query}' matches several Nikkes: {', '.join(hits[:10])}")
    return hits[0]


def nikke(tables: Tables, names: list[str]) -> Result:
    wanted = [resolve_nikke(tables, n) for n in names]
    rows, times = [], []
    for c in tables.clears:
        by_name = {u["name"]: u for u in c["team"]}
        if all(w in by_name for w in wanted):
            u = by_name[wanted[0]]
            rows.append([c["source"], c["mode"], _place(c), _when(c), u["dupe"], u["level"], u["cp"]])
            if c["cleared_at"]:
                times.append(c["cleared_at"])
    summary = f"{len(rows)} clears"
    if times:
        summary += f" · first {min(times):%Y-%m-%d} · last {max(times):%Y-%m-%d}"
    return Result("all", ["source", "mode", "stage", "date", "dupe", "level", "cp"], rows, summary)


def _stage_rows(clears) -> list[list]:
    return [[_place(c), _when(c), c["team_cp"], c["recommended_cp"], _team(c)] for c in clears]


STAGE_COLUMNS = ["stage", "date", "team_cp", "recommended_cp", "team"]


def stage(tables: Tables, mode: str, chapter: int) -> Result:
    m = next((x for x in CAMPAIGN_MODES if x.lower() == mode.lower()), None)
    if not m:
        raise QueryError(f"mode must be normal or hard, not '{mode}'")
    hits = [c for c in tables.clears if c["source"] == "campaign" and c["mode"] == m and c["chapter"] == chapter]
    return Result("campaign", STAGE_COLUMNS, _stage_rows(hits))


def floor(tables: Tables, tower: str, n: int) -> Result:
    towers = _towers(tables)
    t = towers.get(tower.lower())
    if not t:
        raise QueryError(f"unknown tower '{tower}' (have: {', '.join(sorted(towers)) or 'none'})")
    hits = [c for c in tables.clears if c["source"] == "tower" and c["mode"] == t and c["floor"] == n]
    return Result("tower", STAGE_COLUMNS, _stage_rows(hits))


def date_range(tables: Tables, start: date, end: date) -> Result:
    hits = sorted((c for c in tables.clears if c["cleared_at"] and start <= c["cleared_at"].date() <= end),
                  key=lambda c: c["cleared_at"])
    return Result("all", ["time", "source", "mode", "stage", "team_cp"],
                  [[_when(c), c["source"], c["mode"], _place(c), c["team_cp"]] for c in hits])


def top(tables: Tables, filter: str | None) -> Result:
    if filter is None:
        scope, keep = "all", lambda c: True
    elif filter.lower() in _towers(tables):
        t = _towers(tables)[filter.lower()]
        scope, keep = "tower", lambda c: c["source"] == "tower" and c["mode"] == t
    elif filter.lower() in ("normal", "hard"):
        m = filter.capitalize()
        scope, keep = "campaign", lambda c: c["source"] == "campaign" and c["mode"] == m
    else:
        raise QueryError(f"top takes a tower name or normal/hard, not '{filter}'")
    counts = Counter(u["name"] for c in tables.clears if keep(c) for u in c["team"])
    rows = sorted(([name, n] for name, n in counts.items()), key=lambda r: (-r[1], r[0]))
    return Result(scope, ["name", "clears"], rows)


def compress_synchro(daily: dict[date, int]) -> list[tuple[date, int]]:
    """Keep the first and last day of each run of equal levels."""
    days = sorted(daily)
    out, i = [], 0
    while i < len(days):
        j = i
        while j + 1 < len(days) and daily[days[j + 1]] == daily[days[i]]:
            j += 1
        out.append((days[i], daily[days[i]]))
        if j > i:
            out.append((days[j], daily[days[j]]))
        i = j + 1
    return out


def synchro(tables: Tables) -> Result:
    daily: dict[date, int] = {}
    for c in tables.clears:
        lvl = c["synchro_level"]
        # comma-separated levels predate the synchro device; below 200 is not synchro
        if not c["cleared_at"] or not lvl.isdigit() or int(lvl) < 200:
            continue
        d = c["cleared_at"].date()
        daily[d] = max(daily.get(d, 0), int(lvl))
    return Result("all", ["date", "synchro_level"], [[d.isoformat(), lvl] for d, lvl in compress_synchro(daily)])


def progress(tables: Tables) -> Result:
    rows = []
    for m in CAMPAIGN_MODES:
        hits = [c for c in tables.clears if c["source"] == "campaign" and c["mode"] == m]
        if hits:
            best = max(hits, key=lambda c: (c["chapter"], c["stage_id"]))
            rows.append([m, _place(best)])
    for t in sorted(set(_towers(tables).values())):
        best = max((c for c in tables.clears if c["source"] == "tower" and c["mode"] == t), key=lambda c: c["floor"] or 0)
        rows.append([t, best["stage_name"]])
    return Result("all", ["mode", "highest"], rows)
