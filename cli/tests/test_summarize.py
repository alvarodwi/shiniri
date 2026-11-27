import subprocess
from datetime import UTC, datetime

import summarize


def seed(store, id_, title, published):
    ts = int(datetime.fromisoformat(published).replace(tzinfo=UTC).timestamp())
    store.save_raw(
        f"news/{id_}",
        {
            "content_id": id_,
            "title": title,
            "pub_timestamp": str(ts),
            "content": f"<p>body {id_}</p>",
        },
    )


def seed_all(store):
    seed(store, "a", "Update on March 15", "2023-03-13")
    seed(store, "b", "Update on March 15", "2023-03-14")  # replaces a
    seed(store, "c", "Update on April 13", "2023-04-11")
    seed(store, "d", "Developer's Note", "2023-04-11")


def fake(calls, out="# Update on x\n", code=0):
    def run(cmd, **kw):
        calls.append(kw["input"])
        return subprocess.CompletedProcess(cmd, code, out, "boom")

    return run


def test_newest_first_one_per_update_date_no_dev_notes(store):
    seed_all(store)
    calls = []
    assert summarize.summarize(store, run=fake(calls)) == 0
    assert ["body c" in calls[0], "body b" in calls[1], len(calls)] == [True, True, 2]
    assert sorted(p.name for p in (store.root / "data" / "summaries").iterdir()) == [
        "2023-03-15 Update on March 15 (2).md",
        "2023-04-13 Update on April 13.md",
    ]


def test_limit_takes_the_next_batch_on_rerun(store):
    seed_all(store)
    calls = []
    summarize.summarize(store, limit=1, run=fake(calls))
    summarize.summarize(store, limit=1, run=fake(calls))
    assert ["body c" in calls[0], "body b" in calls[1]] == [True, True]
    summarize.summarize(store, limit=1, run=fake(calls))
    assert len(calls) == 2
    summarize.summarize(store, limit=1, force=True, run=fake(calls))
    assert len(calls) == 3


def test_a_bad_answer_writes_nothing(store):
    seed_all(store)
    assert summarize.summarize(store, run=fake([], code=1)) == 2
    assert summarize.summarize(store, run=fake([], out="Sure, here it is")) == 2
    assert not (store.root / "data" / "summaries").exists()
