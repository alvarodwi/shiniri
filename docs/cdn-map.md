# blablalink CDN map

What the shiftyspad site loads from its tools CDN, taken from a scan of every JS chunk the
site ships (466 chunks, 2026-11-21). "Checked" means it returned HTTP 200 with the expected type
on that date. It is as complete as the site code: a file the site never asks for is not here.

## Host and scheme

`https://sg-tools-cdn.blablalink.com/` + the hashed form of a plain path, computed by `cdn_url`
in `cli/src/shiniri_cli/fetch.py` (scheme in `docs/superpowers/specs/2026-11-18-computed-cdn-urls-design.md`).
Paths under `spine/` use a different branch of the site's `obfuscatedPath` that `cdn_url` does
not implement (so `spine/spine-layers.json` 404s through it).

Placeholders: `{lang}` is the site language (`en`). Korean drops `_ko` suffixes. Images exist as
both `.png` and `.webp`. `cli/tools/assets.py` keeps the CDN webp for `si`, and re-encodes the
`full` png at 512px, which is smaller than the CDN's 2048px webp.

## Fixed JSON

| path | checked | holds |
|---|---|---|
| `archive/{lang}/archive_list_{lang}.json` | 2026-11-18 | archive (story records) list |
| `boss/ai_lineup_boss.json` | 2026-11-21 | 172 boss waves (solo raid etc.), names in 4 languages, `bosses[].element_id` |
| `character/{lang}/character_face_list.json` | 2026-11-18 | face list |
| `character/{lang}/nikke_list_{lang}_v2.json` | 2026-11-18 | all Nikkes (207): `resource_id`, class, corp, element, burst |
| `character/AttractiveLevelTable.json` | 2026-11-18 | bond levels |
| `character/CharacterLevelTable.json` | 2026-11-18 | character levels |
| `character/RecycleResearchStatTable.json` | 2026-11-18 | recycle room stats |
| `character/character_avatar_map.json` | 2026-11-18 | 398 avatar ids to `resource_id` + `costume_index` |
| `character/character_id_map.json` | 2026-11-18 | `resource_id` to `name_code` |
| `character/character_skill_map.json` | 2026-11-21 | 213 rows: `resource_id`, `skill1_icon`, `skill2_icon`, `ulti_skill_icon` |
| `character/scene_characeter_list_v2.json` (sic) | 2026-11-18 | scene characters |
| `equip/ItemEquipTable-{lang}.json` | 2026-11-21 | gear: `records[].resource_id` is the icon name |
| `equip/equip_option_table_v2-{lang}.json` | 2026-11-18 | gear option lines |
| `equip/favorite_rare_map.json` | 2026-11-21 | favorite item ids by rarity (R, SR, SSR) |
| `guild/guild_emblem.json` | 2026-11-21 | 78 union emblems: `id`, `grade`, `resource_id` |
| `raid/raid_list.json` | 2026-11-21 | solo raid seasons |
| `scene/{lang}/scene_list_{lang}.json` | 2026-11-18 | scenes |
| `scene/{lang}/sudden_list_{lang}.json` | 2026-11-18 | sudden events |
| `stage/stage_list.json` | 2026-11-18 | campaign stages |
| `tower/tower_list.json` | 2026-11-18 | tribe tower floors |
| `spine/spine-layers.json` | no (spine scheme) | spine layer config |

## Id templates (JSON)

| path | checked | id comes from |
|---|---|---|
| `roledata/{resource_id}-v2-{lang}.json` | 2026-11-21 (511) | nikke list `resource_id`. Full Nikke detail: skills, costumes, materials |
| `equip/{lang}/cube_{id}.json` | 2026-11-21 (1000301) | harmony cube id; holds `resource_id` for the icon |
| `equip/{lang}/favorite_{id}.json` | 2026-11-21 (200101) | `favorite_rare_map.json`; holds `icon_resource_id` |
| `attractscene/{id}-{lang}.json` | no | bond scene id |
| `scene/{lang}/scene_detail_{id}_{lang}.json` | no | scene list id |
| `scene/voice_map/{id}.json` | no | scene id |

## Image templates

Each `icon/<path>/<name>` comes from the site's `ICONS_URL({path, name})`.

| path | checked | name comes from |
|---|---|---|
| `character/si/si_c{rid:03}_{skin:02}_s` | 2026-11-21 | small icon. `resource_id`, skin (`costume_index` in avatar map) |
| `character/mi/mi_c{rid:03}_{skin:02}_s` | 2026-11-21 | medium 256x512 |
| `character/full/c{rid:03}_{skin:02}` | 2026-11-21 (skin 00, 01) | full 2048x2048 |
| `icon/skill/char_skill/<icon>` | 2026-11-21 | `character_skill_map.json`, or roledata `skill1_detail.icon` etc. |
| `icon/equip/<resource_id>` | 2026-11-21 | `ItemEquipTable` `resource_id` (e.g. `icn_equipment_head_attacker_t9_3`) |
| `icon/equip/ie_<resource_id>` | 2026-11-21 | harmony cube `resource_id` (e.g. `ie_10001`) |
| `icon/favoriteitem/<icon_resource_id>` | 2026-11-21 | favorite item file `icon_resource_id` |
| `icon/material/<resource_id>` | 2026-11-21 | roledata material `resource_id` (e.g. `icn_material_characterskill_b_ssr`). Some ids (`icn_oldtales`) 404 here |
| `icon/emblem/ig_<resource_id>` | 2026-11-21 | `guild_emblem.json` `resource_id` |
| `icon/tier/ti_<n>` | 2026-11-21 (105) | arena rank: 001 beginner, 100 bronze .. 105 challenger |
| `icon/atlas_common_class/icn_class_<class>` | 2026-11-21 | nikke list `class`, lowercased |
| `icon/atlas_common_class/<element_icon>` | 2026-11-21 | nikke list `element_id.element.element_icon` (e.g. `icn_element_fire`) |
| `icon/atlas_common_class/icn_burst_0<n>`, `icn_burst_all` | 2026-11-21 | `use_burst_skill` `StepN` gives n; `AllStep` gives `all` |
| `icon/atlas_common_corp/icn_corp_<nn>` | 2026-11-21 | elysion 01, missilis 02, tetra 03, pilgrim 04, abnormal 05 |
| `icon/atlas_common_corp/img_logo_<corp>` | 2026-11-21 | corporation, lowercased |
| `icon/atlas_common_grade/ele_grade_icon_<nnn>` | 2026-11-21 | r 001, sr 002, ssr 003 |
| `icon/monster_full/full_<icon_id>` | no | union raid boss `icon_id` (from the union API, not the CDN) |
| `icon/archive_bg/<name>` | no | archive list `record_slot_bg_addressable` / `record_unlock_bg_addressable` |
| `icon/album/chapter/<name>`, `icon/album/outpost/<name>` | no | scene `sub_category_thumbnail` |
| `icon/Logo/pass/<banner>` | no | season pass banner |
| `schedule/banner/<banner>` | no | event schedule banner |
| `background/<path>/<name>` | no | `BG_URL({path, name})` |
| `voice/<cv_lang>/<speech_id>.<format or wav>` | no | voice lines |
| `spine/...` | no (spine scheme) | live2d, out of scope |

## Site assets (not CDN)

Plain files on `https://www.blablalink.com/assets/nikke/version/default/shiftysassets/images/`.
An unknown name returns **200 with an HTML page**, so check the content type.

| file | checked | holds |
|---|---|---|
| `icon-res-pic{1..8}.png` | 2026-11-21 | 1 gems, 2 credits, 3 gold mileage, 4 silver mileage, 5 battle data, 6 core dust, 7 recruit voucher, 8 advanced recruit voucher |
| `icon-weapon-<weapon>.png` | 2026-11-21 (assault_rifle) | assault_rifle, machine_gun, shot_gun, rocket_launcher, sub_machine_gun, sniper_rifle |
| `icon-manufacturer-<corp>.png` | 2026-11-21 (elysion) | corporation, lowercased |
| `icon-job-<class>.png` | 2026-11-21 (attacker) | class, lowercased |
| `icon-code-<element>.png` | 2026-11-21 (fire) | element, lowercased |
| `nikkes/nikke-equip-bg.png` | 2026-11-21 | gear slot background |

## Id sources

- **Nikke `resource_id`**: `nikke_list_{lang}_v2.json`, also `character_id_map.json` (to
  `name_code`) and `character_avatar_map.json` (avatar id to `resource_id` + skin).
- **Skins**: roledata `character_costume_list`, avatar map `costume_index`.
- **Skill icons**: `character_skill_map.json` or roledata `*_detail.icon`.
- **Gear icons**: `ItemEquipTable-{lang}.json` `records[].resource_id`.
- **Cube icons**: `cube_{id}.json` `resource_id`, with an `ie_` prefix.
- **Favorite item icons**: `favorite_rare_map.json` ids, then `favorite_{id}.json` `icon_resource_id`.
- **Union emblem**: `guild_emblem.json`, matched on `id`.
