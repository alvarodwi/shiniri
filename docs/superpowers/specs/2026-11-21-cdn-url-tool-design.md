# cdn URL tool (cli)

Small change. Decided with the owner on 2026-11-21.

## Why

The owner wants the hashed blablalink CDN URL for a plain asset path (for example a medium Nikke
image, for CostumeGallery later) without downloading anything. The hashing already exists as
`cdn_url()` in `src/shiniri_cli/fetch.py`.

## What

`tools/cdn.py`, a dev-only script like `tools/names.py`:

```
uv run python tools/cdn.py character/mi/mi_c010_00_s.webp [more paths...]
```

- It prints one URL per path, in the order given. `cdn_url()` already strips a leading `/`.
- With no paths it prints its usage line and exits 2.
- No network calls. It doesn't check that the URL works.

## Approaches

- **A. A script in `tools/` (picked).** It's a dev convenience, and `tools/` is where those live.
  `watch` never imports it.
- B. A `shiniri` shell command: more surface to keep for something only used at a desk.
- C. A flag on `tools/assets.py`: that script downloads and encodes files, which isn't what's
  wanted here.

## Checks

None of its own (my call): it's a few lines around `cdn_url()`, which `tests/test_fetch.py`
already covers. Run it once by hand on a known path from `tools/assets.py`
(`character/si/si_<code>_00_s.webp`) and compare with the URL that script fetches.
