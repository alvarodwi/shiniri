# Computed CDN URLs

## Why

`config/sources.json` holds hashed CDN URLs copied from the network tab. The hashes
come from a fixed function of the readable file path (found in the site's JS), so the
CLI can compute them. Then `sources.json` stays readable, and adding a reference
file is one line with its real path instead of another sleuthing session.

## How the site builds a URL

From `obfuscatedPath` in the site bundle (non-`spine/` branch):

- `path` = the logical path without the leading `/`, e.g. `character/en/nikke_list_en_v2.json`.
- Filename: `md5(path)` in hex, plus `.` and everything after the first `.` of the original filename.
- Folder `i`: `r = ((djb2(path, seed=PRIMES[i]) % p) + p) % p`, rendered as
  `chr(97 + r//26%26) + chr(97 + r%26) + "-" + str(r % 99).zfill(2)`.
  djb2 is `h = h*33 + charCode`, masked to 32 bits and read as **signed** int32 (JS `&`).
- `PRIMES = [224737, 1000639, 2654435761, 2654435769, 1000621, 4294967291]`.
- URL = `https://sg-tools-cdn.blablalink.com/` + the result.

## Goals

- `sources.json` maps name to plain path: `{"nikke": "character/en/nikke_list_en_v2.json", ...}`.
- `fetch.py` gets `cdn_url(path)`. `sync_reference` calls it for every entry.
- If a download fails with an HTTP error, the result says the site may have changed its URL
  scheme. The stored copy stays untouched, as it already does.
- A test pins today's four known path to URL pairs. The existing sync test uses paths.
- README line for `sources.json` says "CDN paths", not "CDN URLs".

## Non-goals

- `spine/` paths, images and voice files (not needed by a CLI).
- Reading the constants from the live site JS.
- Fallback to old hashed URLs (it would quietly archive stale data).
- Adding new reference files to `sources.json`. The user chooses those from the list below.
- Keeping old versions of reference files when they change (sync overwrites today). This is
  a separate archiving decision.

## Approaches

1. **Plain paths + computed URL in code** (picked): small, readable config, and a site change shows up as a clear failure.
2. Computed + fallback to old hashed URLs: survives one change, but would quietly archive stale files.
3. Download the site JS at sync and read the constants out of it: brittle regex over minified code, more code.

## Known paths (checked 2026-11-18, `en`, all HTTP 200)

```
archive/en/archive_list_en.json
character/en/character_face_list.json
character/en/nikke_list_en_v2.json          (nikke)
character/AttractiveLevelTable.json
character/CharacterLevelTable.json
character/RecycleResearchStatTable.json
character/character_avatar_map.json
character/character_id_map.json             (historical_roster)
character/character_skill_map.json
character/scene_characeter_list_v2.json     (sic)
equip/ItemEquipTable-en.json
equip/equip_option_table_v2-en.json
equip/favorite_rare_map.json
scene/en/scene_list_en.json
scene/en/sudden_list_en.json
stage/stage_list.json                       (campaign_level)
tower/tower_list.json                       (tower_level)
```

Templates that need an id: `attractscene/{id}-en.json`, `equip/en/cube_{id}.json`,
`equip/en/favorite_{id}.json`, `roledata/{id}-v2-en.json`, `scene/voice_map/{id}.json`,
`scene/en/scene_detail_{id}_en.json`.

`roledata` is the per-Nikke detail page and `{id}` is the Nikke's `resource_id` from the
nikke list: `roledata/511-v2-en.json` (Cinderella) is
`oz-20/72fa6824d2d0e69adc7aace692678372.json`.
