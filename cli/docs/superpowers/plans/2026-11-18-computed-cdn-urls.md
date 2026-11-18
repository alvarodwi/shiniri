# Computed CDN URLs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `sync` computes the hashed CDN URLs from plain paths in `config/sources.json`, so nothing hashed is committed anymore.

**Architecture:** One pure function `cdn_url(path)` in `src/blablalink/fetch.py` re-implements the site's `obfuscatedPath` (non-spine branch). `sync_reference` maps each `sources.json` path through it. No new module and no new dependencies (`hashlib` is stdlib).

**Tech Stack:** Python 3.14, httpx, pytest, uv.

**Spec:** `docs/superpowers/specs/2026-11-18-computed-cdn-urls-design.md`

## Global Constraints

- Host: `https://sg-tools-cdn.blablalink.com/`.
- `PRIMES = [224737, 1000639, 2654435761, 2654435769, 1000621, 4294967291]`, indexed by folder depth.
- djb2: `h = h*33 + ord(c)`, masked to 32 bits, read as **signed** int32. Seed = the prime.
- Folder segment: `r = ((h % p) + p) % p`, then `chr(97 + r//26 % 26) + chr(97 + r % 26) + "-" + str(r % 99).zfill(2)`.
- Filename: `md5(path).hexdigest() + "." + ` everything after the first `.` of the last segment.
- Every hash input is the whole path with its leading `/` stripped.
- Run everything with `uv run`. No `pip`.

## Review Focus

1. A path with a leading `/` (copied from the JS as written): it must give the same URL as one without. Pinned in Task 1.
2. A file name with several dots (`a.b.json`): the extension is everything after the first dot (`b.json`). Pinned in Task 1.
3. A folder hash whose 32-bit value has the top bit set: it must use the signed value. The four known pairs cover this; if one fails, check the signed cast first.
4. A 404 from the CDN after a site change: the sync result must carry the hint, and the stored file must stay untouched. Pinned in Task 2.
5. Network errors that aren't HTTP status errors (timeouts): they keep the plain `failed: <Name>` text, without the scheme hint. Pinned in Task 2.

---

### Task 1: `cdn_url`

**Files:**
- Modify: `src/blablalink/fetch.py` (constants next to `CDN_HEADERS`, function above `sync_reference`)
- Test: `tests/test_fetch.py`

**Interfaces:**
- Produces: `cdn_url(path: str) -> str` returns the full `https://` URL. Module constants are `CDN_HOST` and `PRIMES`.
- Produces, for the later investment feature (nothing calls these yet):
  `ROLEDATA_PATH = "roledata/{resource_id}-v2-en.json"`,
  `CUBE_PATH = "equip/en/cube_{cube_id}.json"`,
  `FAVORITE_PATH = "equip/en/favorite_{favorite_id}.json"`.

- [ ] **Step 1: Write the failing test** (add `cdn_url` to the import in `tests/test_fetch.py`)

```python
KNOWN = {
    "character/en/nikke_list_en_v2.json": "yl-57/hd-03/1bf030193826e243c2e195f951a4be00.json",
    "character/character_id_map.json": "kx-19/bc64a706accd3c7ec1f9a9f2afd8f1bc.json",
    "stage/stage_list.json": "xx-97/b32816a11f83865b09bcf95e67ca83ae.json",
    "tower/tower_list.json": "mx-85/3aa6da781d62528da15bd138504c3955.json",
    "roledata/511-v2-en.json": "oz-20/72fa6824d2d0e69adc7aace692678372.json",
}


@pytest.mark.parametrize("path,hashed", KNOWN.items())
def test_cdn_url_matches_site(path, hashed):
    assert cdn_url(path) == "https://sg-tools-cdn.blablalink.com/" + hashed
    assert cdn_url("/" + path) == cdn_url(path)


def test_cdn_url_keeps_multi_dot_extension():
    assert cdn_url("x/a.atlas.txt").endswith(".atlas.txt")


def test_roledata_template():
    assert cdn_url(ROLEDATA_PATH.format(resource_id=511)).endswith(
        "oz-20/72fa6824d2d0e69adc7aace692678372.json")
```

(Also add `ROLEDATA_PATH` to the import.)

- [ ] **Step 2: Run it and check that it fails**

Run: `uv run pytest tests/test_fetch.py -k cdn_url -v`
Expected: ImportError on `cdn_url`.

- [ ] **Step 3: Implement `cdn_url(path: str) -> str`** in `src/blablalink/fetch.py`, following the Global Constraints. Keep the djb2 step in a private helper `_djb2(s: str, seed: int) -> int`. Add one comment on the signed cast: `# JS & yields a signed int32`.

- [ ] **Step 4: Run it and check that it passes**

Run: `uv run pytest tests/test_fetch.py -k cdn_url -v`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/blablalink/fetch.py tests/test_fetch.py
git commit -m "feat: compute hashed CDN URLs from plain paths"
```

### Task 2: sync from plain paths

**Files:**
- Modify: `src/blablalink/fetch.py` (`sync_reference`)
- Modify: `config/sources.json`
- Modify: `README.md` (the `config/sources.json` line under "Where things live")
- Test: `tests/test_fetch.py::test_sync_reference`

**Interfaces:**
- Consumes: `cdn_url(path: str) -> str` from Task 1.
- Produces: `sync_reference` keeps its signature and return values (`"changed"`, `"unchanged"`, `"failed: <ExceptionName>"`). The new value is `"failed: HTTPStatusError (site may have changed its URL scheme)"`.

- [ ] **Step 1: Update the test.** `sources.json` in the test becomes `{"nikke": "n/n.json", "tower_level": "t/t.json"}`. The mock handler serves JSON when `str(req.url) == cdn_url("n/n.json")`, returns `httpx.Response(404)` for `cdn_url("t/t.json")`, and raises `httpx.ConnectTimeout("x")` for anything else. Add a third entry `"slow": "s/s.json"`. Assertions:

```python
assert res["nikke"] == "changed"
assert res["tower_level"] == "failed: HTTPStatusError (site may have changed its URL scheme)"
assert res["slow"] == "failed: ConnectTimeout"
assert store.load_raw("tower_level") == old_tower
```

Keep the existing second-run `"unchanged"` assertion.

- [ ] **Step 2: Run it and check that it fails**

Run: `uv run pytest tests/test_fetch.py::test_sync_reference -v`
Expected: FAIL. `nikke` fails because the raw path is requested, not the hashed URL.

- [ ] **Step 3: Change `sync_reference`.** Loop `for name, path in sources.items()` and request `cdn_url(path)`. In the `except`, append the hint only when `isinstance(e, httpx.HTTPStatusError)`.

- [ ] **Step 4: Rewrite `config/sources.json`.**

```json
{
  "nikke": "character/en/nikke_list_en_v2.json",
  "historical_roster": "character/character_id_map.json",
  "campaign_level": "stage/stage_list.json",
  "tower_level": "tower/tower_list.json"
}
```

In the README, change the line to `config/sources.json      CDN paths of the reference files (committed)`.

- [ ] **Step 5: Run the full suite**

Run: `uv run pytest`
Expected: all pass.

- [ ] **Step 6: Live check** (4 GETs to the CDN, no cookie needed)

Run: `uv run python -c "import asyncio,httpx; from pathlib import Path; from blablalink.store import Store; from blablalink.fetch import sync_reference; print(asyncio.run(sync_reference(Store(Path('.')), httpx.AsyncClient())))"`
Expected: all four entries are `"unchanged"`, because the computed URLs fetch the same files already stored.

- [ ] **Step 7: Commit**

```bash
git add src/blablalink/fetch.py tests/test_fetch.py config/sources.json README.md
git commit -m "feat: sources.json holds plain CDN paths"
```
