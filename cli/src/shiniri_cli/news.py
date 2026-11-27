"""Official NIKKE news: raw responses under data/raw/json/news/ (the source of truth), a Markdown copy of
each under data/parsed/news/, and each costume's first release date read from the patch notes."""

import asyncio
import re
from datetime import date, datetime
from pathlib import Path

import httpx
from markdownify import markdownify

from .roledata import costume_entries, raw_name, resource_ids
from .store import Store, atomic_write, write_csv

BASE = "https://na-community.playerinfinite.com/api/gpts.information_feeds_svr.InformationFeedsSvr/"
HEADERS = {
    "Content-Type": "application/json;charset=utf-8",
    "X-GameId": "16",
    "X-AreaId": "na",
    "X-Source": "pc_web",
    "X-Language": "en",
    "Origin": "https://nikke-en.com",
    "Referer": "https://nikke-en.com/",
}
LABELS = ((308, 494), (309, 496), (309, 892))  # IMPORTANT, NEWS, NOTICE
PAGE = 50
MONTHS = (
    "january february march april may june july august september october november december"
).split()
MONTH = f"({'|'.join(MONTHS)})"
PATCH_NOTE = re.compile(rf"\s*update on {MONTH} (\d{{1,2}})")
# The first date after "duration:", never the end date after " to ".
START = re.compile(
    rf"duration ?:(?:(?! to ).){{0,60}}?\b{MONTH} (\d{{1,2}})(?!\d)(?:, (\d{{4}}))?"
)
MISSION_START = re.compile(r"update at \d\d:\d\d (\d\d)/(\d\d)")  # 2022 notes
HEADING = re.compile(r"(?m)^(?=\d{1,2}\.)")


def markdown_dir(store: Store) -> Path:
    return store.root / "data" / "parsed" / "news"


def _markdown(article: dict) -> str:
    html = re.sub(r"(?is)<(head|style|script)\b.*?</\1>", "", article.get("content") or "")
    return f"# {article.get('title', '')}\n\n{markdownify(html, heading_style='ATX')}"


def stored_articles(store: Store) -> list[dict]:
    paths = sorted((store.raw_dir / "news").glob("*.json"))
    return [store.load_raw(f"news/{p.stem}") for p in paths]


async def _post(client: httpx.AsyncClient, name: str, body: dict) -> dict:
    resp = await client.post(BASE + name, json=body, headers=HEADERS, timeout=30.0)
    resp.raise_for_status()
    answer = resp.json()
    if answer.get("code") != 0 or not isinstance(answer.get("data"), dict):
        raise ValueError(f"{name}: code {answer.get('code')} {answer.get('msg', '')}")
    return answer["data"]


async def _listed_ids(client: httpx.AsyncClient, pause: float) -> list[str]:
    ids: dict[str, None] = {}
    for primary, secondary in LABELS:
        offset, total = 0, 1
        while offset < total:
            data = await _post(
                client,
                "GetContentByLabel",
                {
                    "language": ["en"],
                    "gameid": "16",
                    "offset": offset,
                    "get_num": PAGE,
                    "ext_info_type_list": [0, 1, 2],
                    "primary_label_id": primary,
                    "secondary_label_id": secondary,
                },
            )
            items = data.get("info_content") or []
            if not items:
                break
            ids.update((str(i["content_id"]), None) for i in items)
            offset += len(items)
            total = int(data["total_num"])
            await asyncio.sleep(pause)
    return list(ids)


async def update(
    store: Store,
    client: httpx.AsyncClient,
    *,
    force: bool = False,
    pause: float = 0.3,
    progress=None,
) -> tuple[int, int]:
    """Download the articles not stored yet (all when `force`); (saved, failed). A failed list call raises."""
    ids = await _listed_ids(client, pause)
    if not ids:
        raise ValueError("the news list is empty")
    todo = [i for i in ids if force or store.load_raw(f"news/{i}") is None]
    saved = failed = 0
    for n, id_ in enumerate(todo, 1):
        try:
            if not re.fullmatch(r"\w+", id_):  # it becomes a file name
                raise ValueError(f"bad content id {id_!r}")
            data = await _post(client, "GetContentInfoById", {"father_content_id": id_})
            int(data["pub_timestamp"]), data["title"], data["content"]
            store.save_raw(f"news/{id_}", data)
            saved += 1
        except httpx.HTTPError, ValueError, KeyError, TypeError:
            failed += 1
        if progress:
            progress(n, len(todo))
        await asyncio.sleep(pause)
    # Converted from the stored files, so an interrupted run is caught up here.
    for path in (store.raw_dir / "news").glob("*.json"):
        md = markdown_dir(store) / f"{path.stem}.md"
        if force or not md.exists() or md.stat().st_mtime < path.stat().st_mtime:
            atomic_write(md, _markdown(store.load_raw(f"news/{path.stem}")))
    return saved, failed


def _norm(text: str) -> str:
    text = text.replace("\\", "").replace("*", "").replace("’", "'").replace("‘", "'")
    text = re.sub("[–—－]", "-", text).lower()
    # \s covers the non-breaking spaces
    return "\n".join(" ".join(line.split()) for line in text.split("\n") if line.strip())


def _mention(nikke: str, costume: str) -> re.Pattern:
    """The NIKKE and the costume named together: "Nikke - Costume" or "Nikke's limited costume, Costume".
    The notes add surnames the game data lacks ("Jill Valentine", "Asuka Shikinami Langley: Wille")."""
    name, costume = _norm(nikke), _norm(costume)
    head = re.split(r"(?=:| \()", name)[0]
    # "Queen (Makoto)" is "Queen (Makoto Niijima)" in the notes
    tail = re.escape(name[len(head) :]).replace(r"\)", r"(?: [a-z]+)?\)")
    who = rf"(?<!\w){re.escape(head)}(?: [a-z]+){{0,2}}?{tail}"
    link = (
        r"(?: ?[-:] ?|'s (?:(?:new|limited|special|permanent) ){0,2}costumes?,? ?\[?)"
    )
    return re.compile(rf"{who}{link}{re.escape(costume)}s?(?!\w)")


def _date(month: str | int, day: str, year: str | None, near: date) -> date:
    month = month if isinstance(month, int) else MONTHS.index(month) + 1
    if year:
        return date(int(year), month, int(day))
    # A December note can announce a January date, and the other way round.
    candidates = [date(near.year + d, month, int(day)) for d in (-1, 0, 1)]
    return min(candidates, key=lambda c: abs((c - near).days))


def _released(text: str, mention: re.Pattern, noted: date) -> date:
    """The start date stated in a section that names the costume, else the note's own date."""
    starts = []
    for block in HEADING.split(text):
        if not mention.search(block):
            continue
        if m := START.search(block):
            starts.append(_date(m[1], m[2], m[3], noted))
        for line in block.split("\n"):
            if mention.search(line) and (m := MISSION_START.search(line)):
                starts.append(_date(int(m[1]), m[2], None, noted))
    # Earlier than the note means the section is about something already running.
    return min((s for s in starts if s >= noted), default=noted)


def release_dates(
    articles: list[dict], costumes: list[tuple[int, str, str]]
) -> dict[int, tuple[str, str]]:
    """(costumeId, nikke, costumeName) -> {costumeId: (releaseDate, articleTitle)}. The first article with
    both names on one line decides. Blank when it is not a patch note, or does not announce the costume
    (a bug fix, say): any later announcement would be a rerun."""
    docs = []
    for a in sorted(articles, key=lambda a: int(a["pub_timestamp"])):
        docs.append((a, _norm(_markdown(a))))
    out = {}
    for id_, nikke, costume in costumes:
        out[id_] = ("", "")
        if not nikke or not costume:
            continue
        mention, needle = _mention(nikke, costume), _norm(costume)
        who = re.compile(rf"(?<!\w){re.escape(re.split(r'(?=:| \()', _norm(nikke))[0])}(?!\w)")
        what = re.compile(rf"(?<!\w){re.escape(needle)}s?(?!\w)")
        for a, text in docs:
            if needle not in text or not any(
                what.search(line) and who.search(line) for line in text.split("\n")
            ):
                continue
            title = " ".join(a["title"].split())
            released = ""
            if (m := PATCH_NOTE.match(title.lower())) and mention.search(text):
                published = datetime.fromtimestamp(int(a["pub_timestamp"])).date()
                try:
                    noted = _date(m[1], m[2], None, published)
                    released = _released(text, mention, noted).isoformat()
                except ValueError:  # an impossible date such as June 31
                    pass
            out[id_] = (released, title)
            break
    return out


def stored_costumes(store: Store) -> list[tuple[int, str, str]]:
    """(costumeId, game nikke name, costumeName) of every costume in the stored roledata, by id."""
    names = {
        n.get("resource_id"): (n.get("name_localkey") or {}).get("name") or ""
        for n in store.load_raw("nikke_list_en", [])
        if isinstance(n, dict)
    }
    found = {}
    for rid in resource_ids(store):
        for c in costume_entries(store.load_raw(raw_name(rid), {})):
            found.setdefault(
                c["id"], (c["id"], names.get(rid, ""), c.get("costume_name_locale") or "")
            )
    return [found[i] for i in sorted(found)]


def write_release_csv(store: Store) -> Path:
    costumes = stored_costumes(store)
    dates = release_dates(stored_articles(store), costumes)
    path = store.exports_dir / "costume_release_dates.csv"
    write_csv(
        path,
        ["costumeId", "costumeName", "releaseDate", "articleTitle"],
        [[id_, costume, *dates[id_]] for id_, _, costume in costumes],
    )
    return path
