# Rebrand to shiniri-cli

## Intent
The tool is becoming **shiniri-cli**. A web UI tied to the user's own Google Sheet is planned later as a
separate project; for now this Python shell is the useful part, so it carries the new name.

## Goals
- Package `src/blablalink/` → `src/shiniri_cli/` (via `git mv`, history kept); all test imports follow.
- `pyproject.toml`: project name `shiniri-cli`, command `shiniri-cli = "shiniri_cli.cli:run"`; `uv.lock` regenerated.
- Startup banner reads `shiniri-cli`.
- README: title, run command, code path.

## Non-goals
- blablalink stays wherever it names the website: API/CDN URLs, `blabla.yml`, cookie instructions,
  the "can't reach blablalink" error, the pyproject description's "from blablalink".
- `data/` and `config/` carry no name: nothing to migrate.
- No `blablalink` command alias.
- Repo folder and any GitHub repo name: renamed by the user.

## Approaches
- Full rename to `shiniri_cli` (picked): one name everywhere in the code.
- Shared `shiniri` package for a future web part (rejected): the web UI will be a separate project.
- Rename only the command (rejected): two names in the code for no gain.
