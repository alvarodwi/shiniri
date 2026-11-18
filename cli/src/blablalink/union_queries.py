"""Union Raid searches: pure functions from UnionData to a Result."""

import re
from collections import Counter, defaultdict
from datetime import datetime
from statistics import median

from .queries import QueryError, Result
from .union import CODES, WEAK_TO, UnionData, boss_code


def fmt_dmg(n) -> str:
    for size, unit in ((1e12, "T"), (1e9, "B"), (1e6, "M")):
        if abs(n) >= size:
            v = n / size
            return f"{v:.2f}{unit}" if v < 10 else f"{v:.1f}{unit}"
    return str(int(n))


def pick_season(u: UnionData, arg: str | None) -> int:
    if not u.seasons:
        raise QueryError("no union data yet — run sync, then fetch")
    if arg is None:
        return u.live if u.live in u.seasons else max(u.seasons)
    m = re.fullmatch(r"s?(\d+)", arg.lower())
    if not m:
        raise QueryError(f"seasons look like s45, not '{arg}'")
    n = int(m.group(1))
    if n not in u.seasons:
        raise QueryError(f"s{n} isn't stored — stored: {', '.join(f's{s}' for s in sorted(u.seasons))}")
    return n


def resolve_member(u: UnionData, query: str) -> str:
    q = query.strip().lower()
    exact = [o for o, name in u.names.items() if name.lower() == q]
    if exact:
        return exact[0]
    hits_ = sorted((name, o) for o, name in u.names.items() if q in name.lower())
    if not hits_:
        raise QueryError(f"no member matches '{query}'")
    if len(hits_) > 1:
        raise QueryError(f"'{query}' matches several members: {', '.join(n for n, _ in hits_[:10])}")
    return hits_[0][1]


def _season_hits(u: UnionData, n: int, mode: str | None = None) -> list[dict]:
    return [h for h in u.hits if h["season"] == n and (mode is None or h["mode"] == mode)]


def _squad(h) -> str:
    return ", ".join(s["name"] for s in h["squad"])


def _normal_cleared(u: UnionData, n: int) -> str:
    days = [h["day"] for h in _season_hits(u, n, "normal") if h["level"] == 10 and h["step"] == 5 and h["final"]]
    return f"D{min(days)}" if days else "not cleared"


def _hard_result(u: UnionData, n: int) -> str:
    info = (u.seasons[n]["level"].get("level_info") or [{}])[0]
    level, bosses = info.get("level"), info.get("boss_info") or []
    if info.get("difficulty") == 2 and level == 4 and bosses:
        b = bosses[0]
        return f"cleared · {fmt_dmg(int(b.get('current_hp') or 0))} on {(b.get('name_localvalues') or {}).get('en', '')}"
    if info.get("difficulty") == 2:
        left = [f"{boss_code((b.get('name_localvalues') or {}).get('en', ''))} "
                f"{fmt_dmg(int(b.get('current_hp') or 0))}/{fmt_dmg(int(b.get('max_hp') or 0))}"
                for b in bosses if int(b.get("current_hp") or 0) > 0]
        return f"stopped at hard lv{level} · HP left: {', '.join(left)}"
    return f"normal lv{level}" if level else "unknown"


def _missing(u: UnionData, n: int) -> tuple[int | None, list[list], int]:
    """(hard day, [[member, hard hits]] for members under 3, members who hit hard)."""
    hard = _season_hits(u, n, "hard")
    if not hard:
        return None, [], 0
    day = min(h["day"] for h in hard)
    counts = Counter(h["openid"] for h in hard if h["day"] == day)
    seen = {h["openid"] for h in _season_hits(u, n)}
    short = sorted(([u.names[o], counts.get(o, 0)] for o in seen if counts.get(o, 0) < 3),
                   key=lambda r: (r[1], r[0].lower()))
    return day, short, len(counts)


def _date(ts) -> str:
    return datetime.fromtimestamp(ts).strftime("%Y-%m-%d") if ts else "?"


def recap(u: UnionData, n: int) -> Result:
    s = u.seasons[n]
    guild = s["guild"]
    day, short, hitters = _missing(u, n)
    totals = Counter()
    for h in _season_hits(u, n):
        totals[h["mode"]] += h["damage"]
    per_member = Counter()
    for h in _season_hits(u, n, "hard"):
        per_member[h["openid"]] += h["damage"]
    rows = [
        ["season", f"s{n} · {_date(s['start_ts'])} → {_date(s['end_ts'])}"],
        ["union", f"{guild.get('guild_name', '?')} · {guild.get('guild_member_cnt', '?')} members"],
        ["normal cleared", _normal_cleared(u, n)],
        ["hard", _hard_result(u, n)],
        ["normal damage", fmt_dmg(totals["normal"])],
        ["hard damage", fmt_dmg(totals["hard"])],
        ["hard day", f"D{day} · {hitters} members hit · {sum(3 - c for _, c in short)} hits missed" if day else "not reached"],
    ]
    rows += [[f"top {i}", f"{u.names[o]} · {fmt_dmg(d)}"] for i, (o, d) in enumerate(per_member.most_common(5), 1)]
    return Result("union", ["", ""], rows)


def hits(u: UnionData, n: int, filters: list[str]) -> Result:
    keep = []
    for f in filters:
        fl = f.lower()
        if fl in ("normal", "hard"):
            keep.append(lambda h, m=fl: h["mode"] == m)
        elif m := re.fullmatch(r"lv(\d+)", fl):
            keep.append(lambda h, lv=int(m.group(1)): h["level"] == lv)
        elif m := re.fullmatch(r"d(\d+)", fl):
            keep.append(lambda h, d=int(m.group(1)): h["day"] == d)
        elif fl.upper() in CODES:
            keep.append(lambda h, c=fl.upper(): h["code"] == c)
        else:
            keep.append(lambda h, o=resolve_member(u, f): h["openid"] == o)
    found = sorted((h for h in _season_hits(u, n) if all(k(h) for k in keep)), key=lambda h: -h["damage"])
    rows = [[f"D{h['day']}", h["mode"], h["level"], h["code"], u.names[h["openid"]], fmt_dmg(h["damage"]),
             "✓" if h["final"] else "", _squad(h)] for h in found]
    return Result("union", ["day", "mode", "lv", "boss", "member", "damage", "final", "squad"], rows,
                  f"{len(found)} hits · {fmt_dmg(sum(h['damage'] for h in found))}")


def missed(u: UnionData, n: int) -> Result:
    day, short, hitters = _missing(u, n)
    if day is None:
        return Result("union", ["member", "hits"], [], "hard mode not reached yet")
    size = u.seasons[n]["guild"].get("guild_member_cnt", "?")
    return Result("union", ["member", "hits"], short, f"{hitters} of {size} members hit on hard day D{day}")


def normal(u: UnionData, n: int) -> Result:
    found = _season_hits(u, n, "normal")
    count, dmg = Counter(), Counter()
    for h in found:
        count[h["openid"]] += 1
        dmg[h["openid"]] += h["damage"]
    rows = [[u.names[o], count[o], fmt_dmg(d)] for o, d in dmg.most_common()]
    return Result("union", ["member", "hits", "damage"], rows,
                  f"{len(rows)} members · {len(found)} hits · {fmt_dmg(sum(dmg.values()))}")
