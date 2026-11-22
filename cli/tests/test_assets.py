import asyncio

import assets
import httpx
import pytest
from assets import QUALITY, Job


def fake_encode(data, args):
    fake_encode.args = args
    return b"WEBP" + data


def client_for(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def reply(ctype, body=b"X", status=200):
    return lambda req: httpx.Response(
        status, content=body, headers={"content-type": ctype}
    )


def leftovers(root):
    return list(root.rglob("*.tmp"))


def test_html_200_is_not_saved(tmp_path):
    dest = tmp_path / "item" / "x.webp"
    result = asyncio.run(
        assets.download(
            client_for(reply("text/html")),
            Job("https://x/a.png", dest, None),
            fake_encode,
        )
    )
    assert result.startswith("failed")
    assert not dest.exists() and not leftovers(tmp_path)


def test_existing_file_is_skipped_without_request(tmp_path):
    dest = tmp_path / "a.webp"
    dest.write_bytes(b"OLD")
    calls = []

    def handler(req):
        calls.append(req)
        return httpx.Response(
            200, content=b"NEW", headers={"content-type": "image/webp"}
        )

    result = asyncio.run(
        assets.download(
            client_for(handler), Job("https://x/a.webp", dest, None), fake_encode
        )
    )
    assert result == "skipped" and calls == [] and dest.read_bytes() == b"OLD"


def test_webp_saved_as_is(tmp_path):
    dest = tmp_path / "a.webp"
    result = asyncio.run(
        assets.download(
            client_for(reply("image/webp", b"RAW")),
            Job("https://x/a.webp", dest, None),
            fake_encode,
        )
    )
    assert result == "new" and dest.read_bytes() == b"RAW"


def test_png_is_encoded(tmp_path):
    dest = tmp_path / "a.webp"
    result = asyncio.run(
        assets.download(
            client_for(reply("image/png; charset=binary", b"P")),
            Job("https://x/a.png", dest, None),
            fake_encode,
        )
    )
    assert (
        result == "new"
        and dest.read_bytes() == b"WEBPP"
        and fake_encode.args == QUALITY
    )


def test_encode_failure_leaves_nothing(tmp_path):
    def bad(data, args):
        raise RuntimeError("bad")

    dest = tmp_path / "a.webp"
    result = asyncio.run(
        assets.download(
            client_for(reply("image/png")), Job("https://x/a.png", dest, None), bad
        )
    )
    assert result == "failed: RuntimeError: bad"
    assert not dest.exists() and not leftovers(tmp_path)


def test_one_failure_does_not_stop_others(tmp_path):
    def handler(req):
        if req.url.path == "/b.webp":
            return httpx.Response(404)
        return httpx.Response(200, content=b"W", headers={"content-type": "image/webp"})

    jobs = [Job(f"https://x/{n}.webp", tmp_path / f"{n}.webp", None) for n in "abc"]
    out = asyncio.run(assets.run(client_for(handler), jobs, fake_encode))
    assert len(out["new"]) == 2 and len(out["failed"]) == 1
    assert out["failed"][0][0] == tmp_path / "b.webp"


def test_duplicate_dest_runs_once(tmp_path):
    calls = []

    def handler(req):
        calls.append(req)
        return httpx.Response(200, content=b"W", headers={"content-type": "image/webp"})

    dest = tmp_path / "a.webp"
    jobs = [Job("https://x/1.webp", dest, None), Job("https://x/2.webp", dest, None)]
    asyncio.run(assets.run(client_for(handler), jobs, fake_encode))
    assert len(calls) == 1


def test_nikke_jobs_paths(tmp_path):
    from shiniri_cli.fetch import cdn_url

    assert assets.nikke_jobs([{"resource_id": 90}], tmp_path) == (
        [
            Job(
                cdn_url("character/si/si_c090_00_s.webp"),
                tmp_path / "nikke/si/c090.webp",
                None,
            ),
        ],
        [],
    )


def test_nikke_jobs_skips_bad_entries(tmp_path):
    jobs, bad = assets.nikke_jobs(
        [{"resource_id": 1}, {}, {"resource_id": "x"}, "s", {"resource_id": True}],
        tmp_path,
    )
    assert [j.dest.name for j in jobs] == ["c001.webp"]
    assert bad == [
        "nikke list entry 1: bad resource_id",
        "nikke list entry 2: bad resource_id",
        "nikke list entry 3: bad resource_id",
        "nikke list entry 4: bad resource_id",
    ]


def test_item_jobs_paths(tmp_path):
    assert assets.item_jobs({"gems": "https://x/pic1.png"}, tmp_path) == [
        Job("https://x/pic1.png", tmp_path / "item/gems.webp", None)
    ]


@pytest.mark.parametrize("text", [None, "not json", "[]", '{"a": 1}'])
def test_load_items_rejects_bad_shapes(tmp_path, text):
    path = tmp_path / "items.json"
    if text is not None:
        path.write_text(text)
    with pytest.raises(SystemExit):
        assets.load_items(path)


def test_items_file_is_valid():
    items = assets.load_items(assets.ITEMS_FILE)
    assert len(items) == 8 and items["gems"].endswith("icon-res-pic1.png")


@pytest.mark.parametrize(
    "handler",
    [
        lambda req: httpx.Response(404),
        reply("text/html", b"<html>"),
        reply("application/json", b'{"a": 1}'),
    ],
)
def test_nikke_list_failure_writes_nothing(tmp_path, monkeypatch, capsys, handler):
    monkeypatch.setattr(assets.shutil, "which", lambda name: "/usr/bin/cwebp")
    code = asyncio.run(assets.main_async(client_for(handler), tmp_path))
    out = capsys.readouterr().out
    assert code == 1 and list(tmp_path.iterdir()) == []
    assert out.count("\n") == 1 and f"nikke list failed: {assets.NIKKE_LIST}" in out


def test_failure_reason_is_one_named_line(tmp_path):
    def timeout(req):
        raise httpx.ReadTimeout("")

    result = asyncio.run(
        assets.download(
            client_for(timeout), Job("https://x/a.webp", tmp_path / "a.webp", None)
        )
    )
    assert result == "failed: ReadTimeout: "
    result = asyncio.run(
        assets.download(
            client_for(lambda req: httpx.Response(404)),
            Job("https://x/a.webp", tmp_path / "a.webp", None),
        )
    )
    assert result.startswith("failed: HTTPStatusError: ") and "\n" not in result


def test_invalid_url_fails_only_that_file(tmp_path):
    jobs = [
        Job("https://x/a.webp", tmp_path / "a.webp", None),
        Job("http://a:notaport/x", tmp_path / "b.webp", None),
    ]
    out = asyncio.run(assets.run(client_for(reply("image/webp")), jobs, fake_encode))
    assert len(out["new"]) == 1 and out["failed"][0][0] == tmp_path / "b.webp"


def test_missing_cwebp_stops_before_download(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(assets.shutil, "which", lambda name: None)
    calls = []
    code = asyncio.run(
        assets.main_async(client_for(lambda req: calls.append(req)), tmp_path)
    )
    assert code == 1 and calls == [] and "cwebp not found" in capsys.readouterr().out
