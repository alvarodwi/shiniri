"""Dev-only: cache Nikke and resource icons as webp in ui/public/img/ for committing.

Run from cli/: `uv run python tools/assets.py`. Needs `cwebp` on PATH. Existing files are
skipped; delete one to refetch it. Not part of shiniri_cli, and `watch` never imports it.
"""

import asyncio
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import NamedTuple

import httpx

from shiniri_cli.fetch import CDN_HEADERS, cdn_url


class Job(NamedTuple):
    url: str
    dest: Path
    args: (
        tuple[str, ...] | None
    )  # cwebp args; None = keep a webp as-is, encode anything else


QUALITY = ("-q", "82", "-m", "6")
IMG_ROOT = Path(__file__).resolve().parents[2] / "ui" / "public" / "img"
ITEMS_FILE = Path(__file__).with_name("items.json")
NIKKE_LIST = "character/en/nikke_list_en_v2.json"


def cwebp(data: bytes, args: tuple[str, ...]) -> bytes:
    with tempfile.TemporaryDirectory() as d:
        src, out = Path(d) / "in", Path(d) / "out.webp"
        src.write_bytes(data)
        done = subprocess.run(
            ["cwebp", "-quiet", *args, str(src), "-o", str(out)],
            capture_output=True,
            text=True,
        )
        if done.returncode != 0:
            raise RuntimeError(f"cwebp: {done.stderr.strip() or done.returncode}")
        return out.read_bytes()


def reason(e: Exception) -> str:
    """One line: httpx errors can be empty (timeouts) or two lines (status errors)."""
    return f"{type(e).__name__}: {(str(e).splitlines() or [''])[0]}"


async def download(client: httpx.AsyncClient, job: Job, encode=cwebp) -> str:
    if job.dest.exists():
        return "skipped"
    tmp = job.dest.with_name(job.dest.name + ".tmp")
    try:
        resp = await client.get(job.url, headers=CDN_HEADERS, timeout=30.0)
        resp.raise_for_status()
        ctype = resp.headers.get("content-type", "").split(";")[0].strip().lower()
        if not ctype.startswith(
            "image/"
        ):  # the site answers unknown paths with 200 + HTML
            return f"failed: not an image ({ctype or 'no content-type'})"
        args = (
            job.args
            if job.args is not None
            else (None if ctype == "image/webp" else QUALITY)
        )
        data = (
            resp.content
            if args is None
            else await asyncio.to_thread(encode, resp.content, args)
        )
        job.dest.parent.mkdir(parents=True, exist_ok=True)
        tmp.write_bytes(data)
        os.replace(tmp, job.dest)
        return "new"
    except (httpx.HTTPError, httpx.InvalidURL, RuntimeError, OSError) as e:
        return f"failed: {reason(e)}"
    finally:
        tmp.unlink(missing_ok=True)


async def run(
    client: httpx.AsyncClient, jobs: list[Job], encode=cwebp, limit: int = 4
) -> dict[str, list]:
    unique: dict[Path, Job] = {}
    for job in jobs:
        unique.setdefault(
            job.dest, job
        )  # one job per file, so no two writers race on it
    gate = asyncio.Semaphore(limit)

    async def one(job):
        async with gate:
            return job.dest, await download(client, job, encode)

    out = {"new": [], "skipped": [], "failed": []}
    for dest, result in await asyncio.gather(*(one(j) for j in unique.values())):
        if result.startswith("failed: "):
            out["failed"].append((dest, result.removeprefix("failed: ")))
        else:
            out[result].append(dest)
    return out


def nikke_jobs(nikkes: list, root: Path) -> tuple[list[Job], list[str]]:
    """Jobs for every entry, plus one message per entry without a usable `resource_id`."""
    jobs, bad = [], []
    for i, n in enumerate(nikkes):
        rid = n.get("resource_id") if isinstance(n, dict) else None
        if not isinstance(rid, int) or isinstance(rid, bool):
            bad.append(f"nikke list entry {i}: bad resource_id")
            continue
        c = f"c{rid:03}"  # the site pads the id to 3 digits, the skin to 2
        jobs.append(
            Job(
                cdn_url(f"character/si/si_{c}_00_s.webp"),
                root / "nikke" / "si" / f"{c}.webp",
                None,
            )
        )
    return jobs, bad


def item_jobs(items: dict[str, str], root: Path) -> list[Job]:
    return [
        Job(url, root / "item" / f"{name}.webp", None) for name, url in items.items()
    ]


def load_items(path: Path) -> dict[str, str]:
    try:
        items = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise SystemExit(f"items.json: {e}")
    if not isinstance(items, dict) or not all(
        isinstance(k, str) and isinstance(v, str) for k, v in items.items()
    ):
        raise SystemExit("items.json: must be an object of name to URL strings")
    return items


async def main_async(
    client: httpx.AsyncClient | None = None, root: Path = IMG_ROOT
) -> int:
    if shutil.which("cwebp") is None:
        print("cwebp not found on PATH (install the webp package)")
        return 1
    items = load_items(ITEMS_FILE)
    async with client or httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                cdn_url(NIKKE_LIST), headers=CDN_HEADERS, timeout=30.0
            )
            resp.raise_for_status()
            nikkes = resp.json()
            if not isinstance(nikkes, list):
                raise ValueError(f"expected a list, got {type(nikkes).__name__}")
        except (httpx.HTTPError, ValueError) as e:
            print(
                f"nikke list failed: {NIKKE_LIST}: {reason(e)} (site may have changed its URL scheme)"
            )
            return 1
        jobs, bad = nikke_jobs(nikkes, root)
        out = await run(client, jobs + item_jobs(items, root))
    failed = [f"{dest.relative_to(root)}: {why}" for dest, why in out["failed"]] + bad
    print(f"new {len(out['new'])}, skipped {len(out['skipped'])}, failed {len(failed)}")
    for line in failed:
        print(f"  {line}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main_async()))
