# Image Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dev-only script that caches Nikke and resource icons as webp files in `ui/public/img/`, plus a reference map of the blablalink CDN.

**Architecture:** `cli/tools/assets.py` builds a list of download jobs (URL, destination, optional cwebp args), downloads them a few at a time with `httpx`, re-encodes with the system `cwebp` where needed, and writes each file atomically. It reuses `cdn_url` and `CDN_HEADERS` from `shiniri_cli.fetch` and is not part of the package.

**Tech Stack:** Python 3.14, uv, httpx, pytest, system `cwebp`.

**Spec:** `docs/superpowers/specs/2026-11-21-image-assets-design.md`

## Global Constraints

- Output root: `ui/public/img/`, resolved as `Path(__file__).resolve().parents[2] / "ui" / "public" / "img"`.
- Nikke ids: `resource_id` zero-padded to 3 (`c090`), skin `00` only.
- `si`: CDN `character/si/si_c{id:03}_00_s.webp` saved as-is, to `nikke/si/c{id:03}.webp`.
- Items: `cli/tools/items.json` (name to URL), to `item/<name>.webp`. A non-webp goes through `cwebp -q 82 -m 6`. A webp is saved as-is.
- Saved only when the status is 2xx and `Content-Type` starts with `image/`.
- Existing destination means skipped, with no request made.
- No new dependencies. No commits until the owner says so (repo rule): the plan has no commit steps.

## Review Focus

- The nikke list download fails (CDN down, scheme changed): the run stops with one clear line naming the path, and nothing is written.
- Two list entries share a `resource_id`: one job per destination, with no concurrent writes to the same file.
- `cwebp` exits non-zero on a broken image: only that file fails, and no `.webp` or `.tmp` is left.
- `Content-Type: image/png; charset=binary` or other parameters: still counts as an image.
- `items.json` is missing or not a JSON object of strings: the run stops before downloading, with a message.

---

### Task 1: Download core

**Files:**
- Create: `cli/tools/assets.py`
- Modify: `cli/pyproject.toml` (`[tool.pytest.ini_options]` adds `pythonpath = ["tools"]`)
- Test: `cli/tests/test_assets.py`

**Interfaces:**
- Produces:
  - `Job = NamedTuple("Job", url: str, dest: Path, args: tuple[str, ...] | None)`
  - `QUALITY = ("-q", "82", "-m", "6")`
  - `def cwebp(data: bytes, args: tuple[str, ...]) -> bytes`: writes `data` to a temp dir, runs `cwebp <args> in -o out`, returns the output bytes, and raises `RuntimeError` with cwebp's stderr on a non-zero exit.
  - `async def download(client: httpx.AsyncClient, job: Job, encode=cwebp) -> str`: returns `"new"`, `"skipped"` or `"failed: <reason>"`. Encode args are `job.args`, or `QUALITY` when `job.args is None` and the content type isn't `image/webp`, else none (raw bytes). It writes `dest.webp.tmp`, then `os.replace`s it. On any failure it removes the tmp file. It sends `CDN_HEADERS`.
  - `async def run(client, jobs: list[Job], encode=cwebp, limit: int = 4) -> dict[str, list[Path]]`: dedupes jobs by `dest` (first wins), runs them under an `asyncio.Semaphore(limit)`, and returns `{"new": [...], "skipped": [...], "failed": [(dest, reason)]}`.

- [ ] **Step 1: Write failing tests** in `cli/tests/test_assets.py`, with `import assets` and a `fake_encode = lambda data, args: b"WEBP" + data`:
  - `test_html_200_is_not_saved`: the handler returns 200 `text/html`. Result starts with `"failed"`, `not dest.exists()`, and no `*.tmp` in `tmp_path`.
  - `test_existing_file_is_skipped_without_request`: dest pre-written. Result `"skipped"`, the handler's call count is 0, and the content is unchanged.
  - `test_webp_saved_as_is`: 200 `image/webp` body `b"RAW"`, `args=None`. The file reads `b"RAW"`.
  - `test_png_is_encoded`: 200 `image/png; charset=binary` body `b"P"`, `args=None`. The file reads `b"WEBPP"`, and `fake_encode` got `QUALITY`.
  - `test_encode_failure_leaves_nothing`: the encoder raises `RuntimeError("bad")`. Result `"failed: bad"`, with no dest and no tmp.
  - `test_one_failure_does_not_stop_others`: `run` over 3 jobs where the middle one returns 404. `len(new) == 2`, `len(failed) == 1`.
  - `test_duplicate_dest_runs_once`: `run` over two jobs with the same dest. The handler is called once.
- [ ] **Step 2: Run** `uv run pytest tests/test_assets.py -v` from `cli/`. Expected: ImportError / FAIL.
- [ ] **Step 3: Implement** the Task 1 interfaces in `cli/tools/assets.py`, plus the pyproject `pythonpath` line. `sys.path` needs no hacks; `shiniri_cli` is installed in the uv env.
- [ ] **Step 4: Run** `uv run pytest tests/test_assets.py -v`. Expected: all PASS.

### Task 2: Jobs and entry point

**Files:**
- Modify: `cli/tools/assets.py`
- Create: `cli/tools/items.json`
- Test: `cli/tests/test_assets.py`

**Interfaces:**
- Consumes: `Job`, `run` from Task 1; `cdn_url`, `CDN_HEADERS` from `shiniri_cli.fetch`.
- Produces:
  - `IMG_ROOT: Path` (Global Constraints value), `ITEMS_FILE = Path(__file__).with_name("items.json")`, `NIKKE_LIST = "character/en/nikke_list_en_v2.json"`.
  - `def nikke_jobs(nikkes: list[dict], root: Path) -> list[Job]`: one `si` job per entry per the Global Constraints.
  - `def item_jobs(items: dict[str, str], root: Path) -> list[Job]`: `args=None`, dest `root/"item"/f"{name}.webp"`.
  - `def load_items(path: Path) -> dict[str, str]`: raises `SystemExit("items.json: ...")` if the file is missing, isn't valid JSON, or isn't an object of string to string.
  - `async def main_async() -> int` and `if __name__ == "__main__": sys.exit(asyncio.run(main_async()))`.

- [ ] **Step 1: Write failing tests**:
  - `test_nikke_jobs_paths`: `nikke_jobs([{"resource_id": 90}], root)` equals `[Job(cdn_url("character/si/si_c090_00_s.webp"), root/"nikke/si/c090.webp", None)]`.
  - `test_item_jobs_paths`: `{"gems": "https://x/pic1.png"}` gives `[Job("https://x/pic1.png", root/"item/gems.webp", None)]`.
  - `test_load_items_rejects_bad_shapes`: parametrize over a missing file, `"not json"`, `[]` and `{"a": 1}`. Each raises `SystemExit`.
- [ ] **Step 2: Run** `uv run pytest tests/test_assets.py -v`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the Task 2 interfaces. `main_async`, in order:
  1. If `shutil.which("cwebp")` is None, print `cwebp not found on PATH (install the webp package)` and return 1.
  2. `load_items(ITEMS_FILE)`.
  3. Fetch `cdn_url(NIKKE_LIST)` with `CDN_HEADERS`. On an HTTP error or bad JSON, print `nikke list failed: <reason> (site may have changed its URL scheme)` and return 1.
  4. `run` the `nikke_jobs` and `item_jobs`.
  5. Print `new N, skipped N, failed N`, then one line per failure (`<dest relative to IMG_ROOT>: <reason>`).
  6. Return 1 if anything failed, else 0.
- [ ] **Step 4: Write `cli/tools/items.json`** with the 8 entries from the spec table. Each is `https://www.blablalink.com/assets/nikke/version/default/shiftysassets/images/icon-res-pic{n}.png`, in spec order.
- [ ] **Step 5: Run** `uv run pytest` from `cli/`. Expected: the whole suite PASSES.

### Task 3: Real run

- [ ] **Step 1:** From `cli/`: `uv run python tools/assets.py`. Expected: `new 215, skipped 0, failed 0` (207 Nikkes + 8). Any failures get investigated, not ignored.
- [ ] **Step 2:** Run it again. Expected: `new 0, skipped 215, failed 0`.
- [ ] **Step 3:** `du -sh ../ui/public/img` is about 1.7 MB. `file ../ui/public/img/nikke/si/c090.webp` and `item/gems.webp` report a RIFF WebP.
- [ ] **Step 4:** From `ui/`, run `yarn build`. Expected: it passes, and `dist/img/` holds the files.

### Task 4: CDN map

**Files:**
- Create: `docs/cdn-map.md`

- [ ] **Step 1:** Find the shiftyspad bundle URL(s) in the built-in browser's network tab on `https://www.blablalink.com/shiftyspad`, then download them into the scratchpad.
- [ ] **Step 2:** List every path literal passed to `getGameJsonResource` / `getIngameResourceUrl` and every `*_URL` builder. Note which JSON field feeds each id (e.g. `character_avatar_map.json` `resource_id`/`costume_index` feeds `si`).
- [ ] **Step 3:** Probe each fixed path and one sample per template with `cdn_url` + curl. Mark each 200 / not checked.
- [ ] **Step 4:** Write `docs/cdn-map.md` with these sections:
  - **Host and scheme**: a pointer to `cdn_url` and the spec of 2026-11-18.
  - **Fixed JSON**
  - **Id templates (JSON)**
  - **Image templates**
  - **Site assets (not CDN)**: the 8 resource icons.
  - **Id sources**

  Each row is: path, checked, what it holds.

### Task 5: Docs and checks

- [ ] **Step 1:** Add a short "Image assets" section to `cli/README.md`. Cover the command, that it needs `cwebp`, that it writes `../ui/public/img/` for committing, and that deleting a file refetches it. Also add one line under Specifics in `cli/CLAUDE.md`: `tools/` is dev-only and never imported by `watch`.
- [ ] **Step 2:** From `cli/`, run `uv run pytest`. From `ui/`, run `yarn format && yarn lint && yarn check && yarn build && yarn test`. Expected: all pass.
