"""Union Raid searches: pure functions from UnionData to a Result."""

import re
from collections import Counter, defaultdict
from datetime import datetime
from statistics import median

from .queries import QueryError, Result
from .union import CODES, WEAK_TO, UnionData, boss_code

SIZE_TRUST = 7 * 86400  # the guild card is today's; past this it says nothing about that season


def short_dmg(n) -> str:
    for size, unit in ((1e12, "T"), (1e9, "B"), (1e6, "M")):
        if abs(n) >= size:
            v = n / size
            return f"{v:.2f}{unit}" if v < 10 else f"{v:.1f}{unit}"
    return str(int(n))


def fmt_dmg(n) -> str:
    """Full number with dot separators, short form in parentheses: 100.234.567.789 (100.2B)."""
    n = round(n)
    full = f"{n:,}".replace(",", ".")
    return f"{full} ({short_dmg(n)})" if abs(n) >= 1e6 else full


def _dmg(hs: list[dict]) -> str:
    """Summed damage, or '-' when that mode wasn't played at all."""
    return fmt_dmg(sum(h["damage"] for h in hs)) if hs else "-"


def pick_season(u: UnionData, arg: str | None) -> int:
    if not u.seasons:
        raise QueryError("no union data yet — run sync, then union fetch")
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
                f"{short_dmg(int(b.get('current_hp') or 0))}/{short_dmg(int(b.get('max_hp') or 0))}"
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


def _size(u: UnionData, n: int) -> int | None:
    """Union size from the stored guild card, only when it was downloaded close to that season."""
    s = u.seasons[n]
    cnt, fetched, end = s["guild"].get("guild_member_cnt"), s.get("fetched_ts"), s.get("end_ts")
    if cnt and fetched and end is not None and fetched <= end + SIZE_TRUST:
        return int(cnt)
    return None


def _seen(u: UnionData, n: int) -> int:
    return len({h["openid"] for h in _season_hits(u, n)})


def _date(ts) -> str:
    return datetime.fromtimestamp(ts).strftime("%Y-%m-%d") if ts else "?"


def _hard_day_line(u: UnionData, n: int, day: int, short: list[list], hitters: int, size: int | None) -> str:
    if size:  # every member owes 3 hits, so never-hitters count too
        made = sum(1 for h in _season_hits(u, n, "hard") if h["day"] == day)
        return f"D{day} · {hitters} of {size} hit · {max(size * 3 - made, 0)} missed"
    return f"D{day} · {hitters} hit · {sum(3 - c for _, c in short)} missed"


def recap(u: UnionData, n: int) -> Result:
    s = u.seasons[n]
    guild = s["guild"]
    day, short, hitters = _missing(u, n)
    size = _size(u, n)
    totals = Counter()
    for h in _season_hits(u, n):
        totals[h["mode"]] += h["damage"]
    per_member = Counter()
    for h in _season_hits(u, n, "hard"):
        per_member[h["openid"]] += h["damage"]
    rows = [
        ["season", f"s{n} · {_date(s['start_ts'])} → {_date(s['end_ts'])}"],
        ["union", f"{guild.get('guild_name', '?')} · " + (f"{size} members" if size else f"{_seen(u, n)} seen")],
        ["normal cleared", _normal_cleared(u, n)],
        ["hard", _hard_result(u, n)],
        ["normal damage", fmt_dmg(totals["normal"])],
        ["hard damage", fmt_dmg(totals["hard"])],
        ["hard day", _hard_day_line(u, n, day, short, hitters, size) if day else "not reached"],
    ]
    rows += [[f"top {i}", f"{u.names[o]} · {fmt_dmg(d)}"] for i, (o, d) in enumerate(per_member.most_common(5), 1)]
    return Result("union", ["", ""], rows)


def is_filter(f: str) -> bool:
    """A hits token that isn't a member name."""
    fl = f.lower()
    return fl in ("normal", "hard") or bool(re.fullmatch(r"(lv|d)\d+", fl)) or fl.upper() in CODES


def hits(u: UnionData, n: int, filters: list[str]) -> Result:
    """Filters: normal/hard, lv<n>, d<n>, a boss code, or a member (openid or name)."""
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
            keep.append(lambda h, o=f if f in u.names else resolve_member(u, f): h["openid"] == o)
    found = sorted((h for h in _season_hits(u, n) if all(k(h) for k in keep)), key=lambda h: -h["damage"])
    rows = [[f"D{h['day']}", h["mode"], h["level"], h["code"], u.names[h["openid"]], fmt_dmg(h["damage"]),
             "✓" if h["final"] else "", _squad(h)] for h in found]
    return Result("union", ["day", "mode", "lv", "boss", "member", "damage", "final", "squad"], rows,
                  f"{len(found)} hits · {fmt_dmg(sum(h['damage'] for h in found))}")


def missed(u: UnionData, n: int) -> Result:
    day, short, hitters = _missing(u, n)
    if day is None:
        return Result("union", ["member", "hits"], [], "hard mode not reached yet")
    size = _size(u, n)
    if not size:
        return Result("union", ["member", "hits"], short, f"{hitters} members hit on hard day D{day}")
    never = size - _seen(u, n)
    return Result("union", ["member", "hits"], short, f"{hitters} of {size} members hit on hard day D{day}"
                  + (f" · {never} never hit" if never > 0 else ""))


def normal(u: UnionData, n: int) -> Result:
    found = _season_hits(u, n, "normal")
    count, dmg = Counter(), Counter()
    for h in found:
        count[h["openid"]] += 1
        dmg[h["openid"]] += h["damage"]
    rows = [[u.names[o], count[o], fmt_dmg(d)] for o, d in dmg.most_common()]
    return Result("union", ["member", "hits", "damage"], rows,
                  f"{len(rows)} members · {len(found)} hits · {fmt_dmg(sum(dmg.values()))}")


def top(u: UnionData, season: int | None, member: str | None) -> Result:
    counts = Counter(s["name"] for h in u.hits
                     if (season is None or h["season"] == season) and (member is None or h["openid"] == member)
                     for s in h["squad"])
    rows = sorted(([name, c] for name, c in counts.items()), key=lambda r: (-r[1], r[0]))
    return Result("union", ["name", "hits"], rows)


def member(u: UnionData, openid: str) -> Result:
    mine = [h for h in u.hits if h["openid"] == openid]
    rows = []
    for n in sorted({h["season"] for h in mine}):
        hs = [h for h in mine if h["season"] == n]
        nrm, hrd = [h for h in hs if h["mode"] == "normal"], [h for h in hs if h["mode"] == "hard"]
        rows.append([f"s{n}", len(hs), len(nrm), len(hrd), _dmg(nrm), _dmg(hrd)])
    hard = [h for h in mine if h["mode"] == "hard"]
    bosses = Counter(h["code"] for h in hard)
    groups = Counter((h["season"], h["day"], h["code"]) for h in hard)
    weak = [sum(s["element"] == WEAK_TO.get(h["boss_element"]) for s in h["squad"]) for h in hard]
    favs = sorted(Counter(s["name"] for h in mine for s in h["squad"]).items(), key=lambda x: (-x[1], x[0]))[:5]
    summary = "\n".join([
        f"{u.names.get(openid, openid)}",
        "bosses: " + ", ".join(f"{c} {k}" for c, k in sorted(bosses.items(), key=lambda x: (-x[1], x[0]))),
        f"same boss twice in a day: {sum(1 for c in groups.values() if c >= 2)}",
        f"weakness Nikkes per squad: {sum(weak) / len(weak):.1f}" if weak else "weakness Nikkes per squad: -",
        "favourites: " + ", ".join(f"{name} {c}" for name, c in favs),
    ])
    return Result("union", ["season", "hits", "normal", "hard", "normal dmg", "hard dmg"], rows, summary)


def members(u: UnionData) -> Result:
    by_member = defaultdict(set)
    for h in u.hits:
        by_member[h["openid"]].add(h["season"])
    rows = sorted(([u.names[o], f"s{min(s)}", f"s{max(s)}", len(s)] for o, s in by_member.items()),
                  key=lambda r: (-int(r[2][1:]), r[0].lower()))
    lines, prev = [], None
    for n in sorted(u.seasons):
        now = {o for o, s in by_member.items() if n in s}
        live = n == u.live  # members who haven't hit yet aren't gone
        if prev is not None and (now - prev or (prev - now and not live)):
            change = [f"+{u.names[o]}" for o in sorted(now - prev, key=u.names.get)]
            if live:
                change.append("(live: departures not known yet)")
            else:
                change += [f"−{u.names[o]}" for o in sorted(prev - now, key=u.names.get)]
            lines.append(f"s{n}: {' '.join(change)}")
        prev = now
    return Result("union", ["member", "first", "last", "seasons"], rows, "\n".join(lines))


def growth(u: UnionData, openids: list[str]) -> Result:
    if not openids:
        rows = [[f"s{n}", _hard_result(u, n), fmt_dmg(sum(h["damage"] for h in _season_hits(u, n, "hard"))),
                 _normal_cleared(u, n)] for n in sorted(u.seasons)]
        return Result("union", ["season", "hard result", "hard damage", "normal cleared"], rows)
    rows = []
    for n in sorted(u.seasons):
        per = Counter()
        for h in _season_hits(u, n, "hard"):
            per[h["openid"]] += h["damage"]
        rows.append([f"s{n}", fmt_dmg(median(per.values())) if per else "-",
                     *(fmt_dmg(per[o]) if o in per else "-" for o in openids)])
    return Result("union", ["season", "union median", *(u.names[o] for o in openids)], rows)


def boss(u: UnionData, code: str) -> Result:
    c = code.upper()
    if c not in CODES:
        raise QueryError(f"boss codes are {', '.join(CODES)}, not '{code}'")
    rows = []
    for n in sorted(u.seasons):
        hs = [h for h in _season_hits(u, n) if h["code"] == c]
        if not hs:
            continue
        by = {m: [h for h in hs if h["mode"] == m] for m in ("hard", "normal")}
        mine = {m: [h for h in by[m] if h["openid"] == u.me] for m in by}
        rows.append([f"s{n}", hs[0]["boss"], _dmg(by["hard"]), _dmg(by["normal"]),
                     *((_dmg(mine["hard"]), _dmg(mine["normal"])) if u.me else ("-", "-"))])
    return Result("union", ["season", "boss", "union hard", "union normal", "me hard", "me normal"], rows)
