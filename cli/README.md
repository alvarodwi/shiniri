# blablalink

An interactive shell that fetches your NIKKE clear history from blablalink
(campaign and tower lineups, plus the CDN reference files) and lets you search it.

## Requirements

**[uv](https://docs.astral.sh/uv/) is required.** The project, its Python version
(`.python-version`) and its dependencies (`uv.lock`) are managed by uv only.
There is no `requirements.txt`, so don't use `pip` or a hand-made venv.

```sh
uv sync                 # installs Python 3.14 and the locked dependencies into .venv
uv run blablalink       # starts the shell
uv run pytest           # runs the tests
```

Works the same on Windows, macOS and Linux, in any normal terminal.

Windows only: Git Bash's default terminal (mintty) isn't a Windows console, so the prompt
won't start there. Use PowerShell, cmd or Windows Terminal, or run it through `winpty`.

## First run

```
> sync          download the reference files (no login needed)
> cookie        paste the Cookie header from blablalink (input is hidden)
> fetch all     fetch new campaign + tower clears
```

To get the cookie: open blablalink while logged in, open the browser devtools,
open the Network tab, and copy the `Cookie` request header from any `api.blablalink.com` request.

## Commands

Type `help` for the list, or `help <command>` for details. Any unique prefix
works (`n`, `st`, `fl`, `sp`).

| Command | What it shows |
|---|---|
| `fetch campaign\|tower\|all` | get new clears (needs cookie) |
| `sync` | re-download the CDN reference files |
| `cookie` | save your Cookie header |
| `nikke <name> [+ <name>]` | clears that used a Nikke (both, if two) |
| `stage <normal\|hard> <ch>[-<stage>]` | a campaign chapter, or one stage (`stage hard 50-36`) |
| `floor <tower> <n>` | one tower floor |
| `date <from>[..<to>]` | clears in a date range |
| `top [tower\|mode]` | most-used Nikkes |
| `synchro` | synchro level timeline |
| `spread [step]` | synchro levels in bands (default 5), first/last day at each |
| `progress` | highest chapter / floor per mode |

Every search prints a table and saves a CSV under `data/exports/`. Running the same
search again reuses that file. Prefix a search with `!` to rebuild it (`!synchro`).
A `fetch` or `sync` that changes the data clears the affected exports automatically.

## Where things live

```
config/sources.json      CDN paths of the reference files (committed)
config/cookie.txt        your cookie (git-ignored)
data/raw/json/           what the server sent: the source of truth
data/parsed/csv/         campaign_clears.csv, tower_clears.csv, lineups.csv (rebuilt from raw)
data/exports/            one CSV per search, grouped into campaign/, tower/ and all/
src/blablalink/          the code: store, queries, fetch, cli
```

`data/` and `config/cookie.txt` hold personal data and are never committed.
