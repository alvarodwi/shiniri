import asyncio
import json
from datetime import UTC, datetime

import httpx
import pytest

from shiniri_cli import news


def article(title, body, published="2026-03-16", id_="a1"):
    ts = int(datetime.fromisoformat(published).replace(tzinfo=UTC).timestamp())
    return {"content_id": id_, "title": title, "pub_timestamp": str(ts), "content": body}


def date_of(articles, nikke="Viper", costume="Punky Street"):
    return news.release_dates(articles, [(1, nikke, costume)])[1]


def p(*lines):
    return "".join(f"<p>{x}</p>" for x in lines)


LISTED = p("2. New Costumes", "2.3 Limited Costume: Viper - Punky Street")


def test_title_date():
    notes = [article("Update on March 19", LISTED)]
    assert date_of(notes) == ("2026-03-19", "Update on March 19")


def test_stated_start_date_wins():
    body = LISTED + p(
        "9.3 PUNKY STREET PASS",
        "* Event duration: From March 26, 2026, 5:00:00 to April 16, 2026 (UTC+9)",
        "Obtain Viper&#8217;s limited costume,&nbsp;Punky Street, at the maximum level.",
        "9.4 April Mission Pass",
        "* Sale duration: From April 1, 2026 to April 30, 2026",
    )
    assert date_of([article("Update on March 19", body)])[0] == "2026-03-26"


@pytest.mark.parametrize(
    "line",
    [
        "Sale duration: Jan 1, 2023 to Jan 31, 2023",
        "Opening Time: from 00:00:00, January 1, 2023",
    ],
)
def test_other_ways_of_stating_the_start(line):
    body = LISTED + p("9.3 PUNKY STREET PASS", line, "Viper - Punky Street")
    notes = [article("Update on December 29", body, "2022-12-25")]
    assert date_of(notes)[0] == "2023-01-01"


def test_first_release_not_rerun():
    notes = [
        article("Update on May 14", LISTED, "2026-05-11", "b"),
        article("Update on March 19", LISTED, "2026-03-16", "a"),
    ]
    assert date_of(notes)[0] == "2026-03-19"


def test_year_rolls_over():
    notes = [article("Update on January 1", LISTED, "2025-12-29")]
    assert date_of(notes)[0] == "2026-01-01"


def test_first_mention_outside_patch_note_is_blank():
    notes = [
        article("Developer's Note", LISTED, "2026-03-01", "d"),
        article("Update on March 19", LISTED),
    ]
    assert date_of(notes) == ("", "Developer's Note")


def test_an_earlier_unclear_mention_blanks_the_date():
    fix = p("Fixed the wrong shoes of Viper in the Punky Street costume.")
    notes = [
        article("Update on January 15", fix, "2026-01-12", "f"),
        article("Update on March 19", LISTED),  # so this one is a rerun
    ]
    assert date_of(notes) == ("", "Update on January 15")


def test_name_and_costume_matched_together():
    notes = [article("Update on March 19", p("Viper is back.", "A punky street."))]
    assert date_of(notes) == ("", "")
    other = [article("Update on March 19", p("Special Costume: Sora - Punky Street"))]
    assert date_of(other) == ("", "")


def test_surname_and_plural():
    notes = [
        article(
            "Update on March 19",
            p("2.1 Asuka Shikinami Langley: Wille – Ocean’s Lament", "Exia - Gamers"),
        )
    ]
    assert date_of(notes, "Asuka: WILLE", "Ocean's Lament")[0] == "2026-03-19"
    assert date_of(notes, "Exia", "Gamer")[0] == "2026-03-19"
    full = [article("Update on March 19", p("Queen (Makoto Niijima) - Pajamas"))]
    assert date_of(full, "Queen (Makoto)", "Pajamas")[0] == "2026-03-19"


def feed(details, calls, broken=()):
    def handler(req):
        body = json.loads(req.content)
        if req.url.path.endswith("GetContentByLabel"):
            page = list(details)[body["offset"] : body["offset"] + 1]  # one per page
            data = {
                "total_num": str(len(details)),
                "info_content": [{"content_id": i} for i in page],
            }
        else:
            id_ = body["father_content_id"]
            calls.append(id_)
            if id_ in broken:
                return httpx.Response(500)
            data = details[id_]
        return httpx.Response(200, json={"code": 0, "data": data})

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def update(store, client, **kw):
    return asyncio.run(news.update(store, client, pause=0, **kw))


DETAILS = {
    "a1": article("Update on March 19", LISTED, id_="a1"),
    "b2": article("Notice", p("Hello <strong>there</strong>"), id_="b2"),
}


def test_update_downloads_unseen_once_and_writes_markdown(store):
    calls = []
    assert update(store, feed(DETAILS, calls)) == (2, 0)
    assert sorted(calls) == ["a1", "b2"]  # three labels, one download each
    assert "**there**" in (news.markdown_dir(store) / "b2.md").read_text("utf-8")
    assert update(store, feed(DETAILS, calls)) == (0, 0) and len(calls) == 2
    assert update(store, feed(DETAILS, calls), force=True) == (2, 0)


def test_update_counts_a_failed_article_and_keeps_the_rest(store):
    assert update(store, feed(DETAILS, [], broken={"a1"})) == (1, 1)
    assert [a["title"] for a in news.stored_articles(store)] == ["Notice"]


def test_update_rejects_an_id_that_is_not_a_file_name(store):
    assert update(store, feed({"../x": DETAILS["a1"]}, [])) == (0, 1)


def test_csv_lists_every_costume(store):
    store.save_raw(
        "nikke_list_en", [{"resource_id": 19, "name_localkey": {"name": "Viper"}}]
    )
    costumes = [
        {"id": i, "resource_id": 19, "costume_index": i, "costume_name_locale": n}
        for i, n in ((1, "Punky Street"), (2, "Unheard Of"))
    ]
    store.save_raw("roledata/19", {"character_costume_list": costumes})
    update(store, feed(DETAILS, []))
    path = news.write_release_csv(store)
    assert path.read_text("utf-8-sig").splitlines() == [
        "costumeId,costumeName,releaseDate,articleTitle",
        "1,Punky Street,2026-03-19,Update on March 19",
        "2,Unheard Of,,",
    ]
