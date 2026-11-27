# New patch checklist

What to do by hand after each patch. A patch brings 3 new NIKKEs at most.

`watch` on the homeserver appends the new `NikkeDatabase` and `CostumeDatabase` rows by itself. Wait for
those rows before step 2. Commands run from `cli/` on the dev machine.

## 1. Fetch the patch

1. `uv run shiniri-cli`, then `sync` (reference files and roledata) and `news` (patch notes).
2. `uv run python tools/summarize.py` (needs a signed-in Claude Code). The summary lands in
   `data/summaries/<update date> <title>.md`.

## 2. NikkeDatabase

For each new row:

- `nikke`: rename it if the game data name isn't the one you want, as with collab names. Do this early,
  because later rows in other tabs copy the name from here.
- `releaseDate`: the `start` column of `New Nikkes` in the summary. This is the start of the NIKKE's own
  banner or event, which can be later than the update date (see **Release date** in `../GLOSSARY.md`).
  If `start` is `-` (a free or Liberation NIKKE, for example), check the patch note in `data/parsed/news/`.
- `limited`: Abnormal NIKKEs are already `TRUE`. Set a seasonal limited one to `TRUE` yourself.

## 3. CostumeDatabase

Check each new row against the `Costumes` table in the summary:

- `source`: fill it if blank, with the exact text used by other rows.
- `releaseDate`: fill it if blank. A rerun never changes it.
- `priceUsd` is a formula. Never type in that column; fix `source` instead.

## 4. Images

`uv run python tools/assets.py` (needs `cwebp`), then commit the new files in `ui/public/img/`. The live
web app shows them after the next release (`../ui/CLAUDE.md`).

## 5. Check names (optional)

`uv run python tools/names.py` lists names in the gacha tabs that aren't in `NikkeDatabase`. It sweeps the
sheet in `config/sheets.json`; pass the real spreadsheet id to check that one.
