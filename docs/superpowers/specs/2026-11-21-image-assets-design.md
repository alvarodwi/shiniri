# Image assets (cli tool, ui assets)

## Why

The Gacha Tracker pages come next. They look bare with text only and need small Nikke icons and
resource icons. A live roster with full art is out: nikkehub.com already does it from the same
blablalink API, so only the small `si` icon is cached. The images are cached in the repo, so the
web app never calls the blablalink CDN and a change to the CDN URL scheme can't break a deploy.

This change only gets the images into `ui/public/img/`. No UI uses them yet.

## Facts checked 2026-11-21

- Image paths use the same `obfuscatedPath` branch as JSON paths, so `cdn_url` already computes
  them. `character/si/si_c511_00_s.webp`, `character/mi/mi_c511_00_s.png` and
  `character/full/c511_00.png` all return 200.
- The CDN doesn't check Referer (same response for blablalink, a foreign site and none).
- CDN webp beats re-encoding the png at q82: `si` 5.5 KB vs 6.3 KB.
- The nikke list has 207 entries, each with a `resource_id`. The site pads it to 3 digits
  (`c090`) and the skin index to 2 (`_00`).
- Resource icons are not on the CDN. They are 8 plain site files:
  `https://www.blablalink.com/assets/nikke/version/default/shiftysassets/images/icon-res-pic{n}.png`,
  n = 1..8. An unknown n (`pic9`) returns **200 with an HTML page**, so a status check alone is
  not enough.

## Goals

- `cli/tools/assets.py`, run on the dev machine from `cli/` as `uv run python tools/assets.py`.
  It imports `cdn_url` and `CDN_HEADERS` from `shiniri_cli.fetch` and uses `httpx`. It is outside
  the `shiniri_cli` package, and `watch` never imports it.
- It writes to `ui/public/img/`, a path resolved from the script's own location. The owner
  commits what it writes. The homeserver's sparse clone of `cli/` never holds the images.
- Nikkes: fetch `character/en/nikke_list_en_v2.json` fresh from the CDN. For each `resource_id`,
  default skin `00`:
  - `img/nikke/si/c{id:03}.webp`: CDN `character/si/si_c{id:03}_00_s.webp`, saved as-is.
- Items: `cli/tools/items.json` is a hand-edited map from name to URL. A png or jpg goes through
  `cwebp -q 82 -m 6`. A webp is saved as-is. It is saved as `img/item/<name>.webp`. It starts with:

  | name | pic |
  |---|---|
  | `gems` (free and charged) | 1 |
  | `credits` | 2 |
  | `goldMileage` | 3 |
  | `silverMileage` | 4 |
  | `battleData` | 5 |
  | `coreDust` | 6 |
  | `recruitVoucher` | 7 |
  | `advRecruitVoucher` | 8 |

- Rules:
  - A file that already exists is skipped, and nothing is downloaded for it.
  - A response that isn't 2xx or whose `Content-Type` isn't `image/*` fails that file, and
    nothing is written.
  - Each failure only fails its own file.
  - Writes are atomic (temp file, then rename), so an interrupted run leaves no half file that a
    later run would skip.
  - The run ends with counts of new, skipped and failed files, and names each failure.
  - If `cwebp` isn't on `PATH`, the run stops before any download, with a clear message.
- Tests in `cli/tests/` with `httpx.MockTransport`: only `image/*` gets saved (the `pic9` case),
  existing files are skipped, and one failure doesn't stop the rest.
- `docs/cdn-map.md`: the reference map of the CDN. It lists the fixed JSON paths, the id
  templates, the image path templates (`si`, `mi`, `full`, `icon/<path>/<name>`,
  `background/<path>/<name>`, schedule and pass banners, `voice/`) and which JSON field supplies
  each id. It also covers the 8 site resource icons. It is filled by one scan of the site bundle
  for every `getGameJsonResource` call and `*_URL` builder, so it is as complete as the site code
  allows. Every path in it is marked as checked (HTTP 200) or not checked.

## Non-goals

- Skins other than `00`, `mi` and `full` images, spine, voice, backgrounds and banners.
- Gear and equipment icons, which come with the gear and roster work.
- Any UI that shows the images, or a TS port of `cdn_url`.
- Deleting images for Nikkes that leave the list, or re-downloading changed art. Delete a file
  by hand to refetch it.
- Running it in Netlify builds or on the homeserver.

## Approaches

Where the images live:

1. **Committed to git** (picked): deploys never touch the CDN. Cost: the repo grows by about
   8 KB per Nikke (about 1.7 MB today).
2. Downloaded during the Netlify build: clean repo, but every deploy depends on the CDN.
3. Loaded from the CDN at runtime: the owner ruled it out because of load on the CDN, and it
   needs a TS port of `cdn_url`.

Where the downloader lives:

1. **Python script in `cli/tools/`** (picked by the owner): it reuses `cdn_url` and `httpx`, with
   no port and no new dependency.
2. Node script in `ui/scripts/`: it sits next to the folder it fills, but `cdn_url` would need a
   port.

## Left to the builder

- How the test imports `tools/assets.py` (it's not a package).
- How concurrent the downloads are. Keep it gentle: a few at a time.
- Whether the script prints per-file lines or only the summary plus failures.
