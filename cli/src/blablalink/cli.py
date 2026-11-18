"""The interactive shell: command parsing, help, rendering, prompt loop."""

import asyncio
import re
import time
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import httpx
from rich.console import Console
from rich.markup import escape
from rich.progress import Progress
from rich.table import Table

from . import queries
from . import union_queries as uq
from .fetch import (AuthError, campaign_targets, fetch_clears, load_cookie, make_client, save_cookie,
                    sync_reference, tower_targets)
from .queries import QueryError, Result
from .store import LEVELS, SCOPES, SOURCES, Store, export_name, scopes_to_wipe
from .union import CODES, UnionError, build_union, fetch_union, write_union_parsed

COMMANDS: dict[str, tuple[str, str, list[str]]] = {
    "fetch": ("fetch campaign|tower|all", "get new clears (needs cookie)", ["fetch tower", "fe all"]),
    "sync": ("sync", "re-download CDN reference files", ["sync"]),
    "cookie": ("cookie", "paste your Cookie header", ["cookie"]),
    "nikke": ("nikke <name> [+ <name>]", "clears that used a Nikke (both, if two)", ["nikke crown", "n crown + anis: star"]),
    "stage": ("stage <normal|hard> <ch>[-<stage>]", "campaign chapter, or one stage", ["stage hard 50", "st hard 50-36"]),
    "floor": ("floor <tower> <n>", "tower floor clear", ["floor tribe 1030", "fl pilgrim 500"]),
    "date": ("date <from>[..<to>]", "clears in a date range", ["date 2026-11-11", "d 2026-11-01..2026-11-11"]),
    "top": ("top [tower|mode]", "most-used Nikkes", ["top", "top pilgrim", "t hard"]),
    "synchro": ("synchro", "synchro level timeline", ["synchro"]),
    "spread": ("spread [step]", "synchro levels in bands (default 5): first/last day at each", ["spread", "sp 10"]),
    "progress": ("progress", "highest chapter / floor per mode", ["progress"]),
    "union": ("union [cmd]", "union raid mode — help union lists its commands", ["union", "union s45", "union missed s44"]),
    "help": ("help [cmd]", "list commands, or show one in detail", ["help", "help nikke"]),
    "quit": ("quit", "leave", ["quit"]),
}
UNION_COMMANDS: dict[str, tuple[str, str, list[str]]] = {
    "fetch": ("fetch", "download seasons not stored yet (needs cookie)", ["fetch"]),
    "live": ("live", "re-download the running season", ["live"]),
    "season": ("sN | season [sN]", "season recap", ["s45", "season"]),
    "hits": ("hits [sN] [normal|hard] [lv<n>] [d<n>] [boss] [member]", "every hit, filtered, biggest first",
             ["hits hard hsta", "hits s45 d2 alpha"]),
    "missed": ("missed [sN]", "members under 3 hits on the hard-mode day", ["missed", "mi s44"]),
    "normal": ("normal [sN]", "who hit normal mode", ["normal s45"]),
    "top": ("top [sN|all] [member]", "most-used Nikkes in hits", ["top", "top all", "top s45 alpha"]),
    "member": ("member [name]", "one member across seasons, with tendencies (no name = you)", ["member", "member alpha"]),
    "members": ("members", "roster history: first/last season, arrivals and departures", ["members"]),
    "growth": ("growth [name [+ name]]", "per season damage; with names, next to the union median",
               ["growth", "growth me + alpha"]),
    "boss": ("boss <code>", "one boss across seasons (HSTA PSID ZEUS DMTR ANMI)", ["boss hsta"]),
    "help": ("help [cmd]", "list union commands, or show one in detail", ["help", "help hits"]),
    "back": ("back", "return to the main shell", ["back"]),
}
UNION_FOOTER = "sN alone shows that season's recap · no season = live, else latest · ! rebuilds an export"
MAIN_FOOTER = "any unique prefix works (n, st, fl) · prefix a search with ! to rebuild its export"
FIXED_SCOPE = {"nikke": "all", "stage": "campaign", "floor": "tower", "date": "all", "synchro": "all", "spread": "all", "progress": "all"}


@dataclass
class Command:
    name: str
    args: list[str]
    force: bool


def parse_command(line: str, commands: dict = COMMANDS) -> Command:
    line = line.strip()
    force = line.startswith("!")
    word, _, rest = line.lstrip("!").strip().partition(" ")
    word = word.lower()
    if commands is UNION_COMMANDS and re.fullmatch(r"s\d+", word):
        return Command("season", [word, *rest.split()], force)
    if word in commands:
        name = word
    else:
        hits = [c for c in commands if c.startswith(word)] if word else []
        if len(hits) != 1:
            raise QueryError(f"'{word}' could be: {', '.join(hits)}" if hits else f"unknown command '{word}' — try help")
        name = hits[0]
    if name in ("nikke", "growth"):
        args = [a.strip() for a in rest.split("+") if a.strip()]
    elif name == "member":
        args = [rest.strip()] if rest.strip() else []
    elif name == "cookie":
        args = []  # only via the hidden prompt, so the token never lands in history
    else:
        args = rest.split()
    return Command(name, args, force)


def _int(text: str, what: str) -> int:
    try:
        return int(text)
    except ValueError:
        raise QueryError(f"{what} must be a number, not '{text}'") from None


def _date(text: str) -> date:
    try:
        return date.fromisoformat(text)
    except ValueError:
        raise QueryError(f"dates look like 2026-11-11, not '{text}'") from None


class App:
    def __init__(self, store: Store, console: Console):
        self.store, self.out = store, console
        self.mode = "main"
        for line in store.migrate():
            self.out.print(f"[cyan]{line}[/]")
        self.tables = store.build_tables()
        parsed = [store.parsed_dir / f for f in ("campaign_clears.csv", "tower_clears.csv", "lineups.csv")]
        raw_times = [f.stat().st_mtime for f in store.raw_dir.glob("*.json")]
        if not all(p.exists() for p in parsed):
            store.write_parsed(self.tables)
        elif raw_times and max(raw_times) > min(p.stat().st_mtime for p in parsed):
            # raw changed without a clean refresh (crash, hand edit): nothing derived can be trusted
            store.write_parsed(self.tables)
            store.wipe_exports(set(SCOPES))
            self.out.print("[dim]raw data changed since last run · rebuilt parsed csv · cleared exports[/]")
        self._load_union()
        union_csv = store.parsed_dir / "union_hits.csv"
        union_times = [f.stat().st_mtime for f in (store.raw_dir / "union").glob("*.json")]
        if not union_csv.exists():
            write_union_parsed(store, self.union)
        elif union_times and max(union_times) > union_csv.stat().st_mtime:
            write_union_parsed(store, self.union)
            store.wipe_exports({"union"})
        self._completer = self._build_completer()

    def _load_union(self) -> None:
        try:
            me = load_cookie(self.store).get("game_openid")
        except (FileNotFoundError, ValueError):
            me = None
        self.union = build_union(self.store, me, time.time())

    def _build_completer(self):
        from prompt_toolkit.completion import NestedCompleter, WordCompleter
        towers = {c["mode"].lower() for c in self.tables.clears if c["source"] == "tower"}
        seasons = {f"s{n}" for n in self.union.seasons}
        names = sorted(set(self.union.names.values()))
        codes = {c.lower() for c in CODES}
        union = {
            **{name: None for name in UNION_COMMANDS}, **{s: None for s in seasons},
            "hits": seasons | codes | {"normal", "hard"} | set(names),
            "member": WordCompleter(names, ignore_case=True, sentence=True),
            "growth": WordCompleter(names, ignore_case=True, sentence=True),
            "top": seasons | {"all"}, "missed": seasons, "normal": seasons, "season": seasons,
            "boss": codes, "help": set(UNION_COMMANDS),
        }
        self._union_completer = NestedCompleter.from_nested_dict(union)
        return NestedCompleter.from_nested_dict({
            **{name: None for name in COMMANDS},
            "nikke": WordCompleter(self.tables.nikke_names, ignore_case=True, sentence=True),
            "floor": towers,
            "top": towers | {"normal", "hard"},
            "stage": {"normal", "hard"},
            "fetch": {"campaign", "tower", "all"},
            "help": set(COMMANDS),
            "union": union,
        })

    def completer(self):
        return self._union_completer if self.mode == "union" else self._completer

    def prompt(self) -> str:
        return "union> " if self.mode == "union" else "> "

    # --- plumbing -------------------------------------------------------
    def refresh(self, fetched: set[str] = frozenset(), synced: set[str] = frozenset()) -> None:
        scopes = scopes_to_wipe(fetched=set(fetched), synced=set(synced))
        if not scopes:
            return
        self.tables = self.store.build_tables()
        self.store.write_parsed(self.tables)
        self._load_union()
        write_union_parsed(self.store, self.union)
        self.store.wipe_exports(scopes)
        self._completer = self._build_completer()
        self.out.print(f"[dim]rebuilt parsed csv · cleared exports: {', '.join(sorted(scopes))}[/]")

    def status(self) -> str:
        counts = {s: sum(1 for c in self.tables.clears if c["source"] == s) for s in SOURCES}
        state = self.store.state()
        fetched, synced = (state.get(k, "never") for k in ("fetch", "sync"))
        return f"campaign {counts['campaign']} · tower {counts['tower']} · fetched {fetched} · synced {synced}"

    def execute(self, line: str) -> bool:
        if not line.strip():
            return True
        try:
            if self.mode == "union":
                if line.strip().lower() == "quit":
                    self.mode = "main"
                    return True
                cmd = parse_command(line, UNION_COMMANDS)
                if cmd.name == "back":
                    self.mode = "main"
                else:
                    getattr(self, f"u_{cmd.name}")(cmd)
                return True
            cmd = parse_command(line)
            if cmd.name == "quit":
                return False
            getattr(self, f"do_{cmd.name}")(cmd)
        except (QueryError, ValueError) as e:
            self.out.print(f"[red]{e}[/]")
        except OSError as e:
            self.out.print(f"[red]can't use {e.filename or 'a file'} — is it open in Excel? ({e.strerror or e})[/]")
        except KeyboardInterrupt:
            self.out.print("[yellow]cancelled[/]")
        except Exception as e:
            self.out.print(f"[red]{type(e).__name__}: {e}[/]")
        return True

    # --- searches -------------------------------------------------------
    def _prepare(self, cmd: Command):
        """Validate arguments; return a callable that runs the search on the current tables."""
        a = cmd.args
        match cmd.name:
            case "nikke":
                if not a:
                    raise QueryError("usage: " + COMMANDS["nikke"][0])
                return lambda: queries.nikke(self.tables, a)
            case "stage":
                if len(a) != 2:
                    raise QueryError("usage: " + COMMANDS["stage"][0])
                chapter = _int(a[1].split("-")[0], "chapter")
                label = a[1] if "-" in a[1] else None
                return lambda: queries.stage(self.tables, a[0], chapter, label)
            case "floor":
                if len(a) != 2:
                    raise QueryError("usage: " + COMMANDS["floor"][0])
                n = _int(a[1], "floor")
                return lambda: queries.floor(self.tables, a[0], n)
            case "date":
                if len(a) != 1:
                    raise QueryError("usage: " + COMMANDS["date"][0])
                start, _, end = a[0].partition("..")
                lo, hi = sorted((_date(start), _date(end or start)))
                return lambda: queries.date_range(self.tables, lo, hi)
            case "top":
                return lambda: queries.top(self.tables, a[0] if a else None)
            case "synchro":
                return lambda: queries.synchro(self.tables)
            case "spread":
                if len(a) > 1:
                    raise QueryError("usage: " + COMMANDS["spread"][0])
                step = _int(a[0], "step") if a else 5
                if step < 1:
                    raise QueryError("step must be at least 1")
                return lambda: queries.spread(self.tables, step)
            case "progress":
                return lambda: queries.progress(self.tables)

    def _scope(self, cmd: Command) -> str:
        if cmd.name != "top":
            return FIXED_SCOPE[cmd.name]
        if not cmd.args:
            return "all"
        return "campaign" if cmd.args[0].lower() in ("normal", "hard") else "tower"

    def search(self, cmd: Command) -> None:
        run = self._prepare(cmd)
        if not self.tables.clears:
            self.out.print("[yellow]no data yet — run sync, then fetch[/]")
            return
        self._show(self._scope(cmd), cmd.name, cmd.args, cmd.force, run)

    def _show(self, scope: str, name: str, args: list[str], force: bool, run) -> None:
        """Serve the search from its export file, or run it and write one."""
        path = self.store.export_path(scope, export_name(name, args))
        cached = None if force else self.store.read_export(path)
        result = cached or run()
        if not cached:
            self.store.write_export(path, result)
        self.render(result)
        rel = path.relative_to(self.store.root)
        self.out.print(f"[dim]{'cached · !' + name + ' to rebuild · ' if cached else ''}{rel}[/]")

    def render(self, result: Result) -> None:
        if not result.rows and result.summary:
            pass  # the summary says why it's empty
        elif not result.rows:
            self.out.print("[yellow]no matching clears[/]")
        else:
            table = Table(*result.columns, header_style="bold magenta")
            for row in result.rows:
                table.add_row(*(escape(str(v)) for v in row))
            self.out.print(table)
        if result.summary:
            self.out.print(f"[bold]{escape(result.summary)}[/]")

    do_nikke = do_stage = do_floor = do_date = do_top = do_synchro = do_spread = do_progress = search

    # --- actions --------------------------------------------------------
    def do_help(self, cmd: Command) -> None:
        if cmd.args and parse_command(cmd.args[0]).name == "union":
            self._help(UNION_COMMANDS, [], UNION_FOOTER)
        else:
            self._help(COMMANDS, cmd.args, MAIN_FOOTER)

    def _help(self, commands: dict, args: list[str], footer: str) -> None:
        if args:
            usage, desc, examples = commands[parse_command(args[0], commands).name]
            self.out.print(f"[bold]{escape(usage)}[/]\n  {desc}")
            for ex in examples:
                self.out.print(f"  [green]> {ex}[/]")
            return
        table = Table(show_header=False, box=None)
        for usage, desc, _ in commands.values():
            table.add_row(f"[bold]{escape(usage)}[/]", desc)
        self.out.print(table)
        self.out.print(f"[dim]{footer}[/]")

    # --- union mode -----------------------------------------------------
    def do_union(self, cmd: Command) -> None:
        if not cmd.args:
            self.mode = "union"
            self._help(UNION_COMMANDS, [], UNION_FOOTER)
            return
        sub = parse_command(("!" if cmd.force else "") + " ".join(cmd.args), UNION_COMMANDS)
        if sub.name not in ("back", "quit"):
            getattr(self, f"u_{sub.name}")(sub)

    def u_help(self, cmd: Command) -> None:
        self._help(UNION_COMMANDS, cmd.args, UNION_FOOTER)

    def _member(self, name: str) -> str:
        if name.lower() == "me" and self.union.me:
            return self.union.me
        return uq.resolve_member(self.union, name)

    def union_search(self, cmd: Command) -> None:
        u, a, name = self.union, cmd.args, cmd.name
        if not u.seasons:
            raise QueryError("no union data yet — run sync, then fetch")
        season_arg = a[0] if a and re.fullmatch(r"s\d+", a[0].lower()) and name != "member" else None
        rest = a[1:] if season_arg else a
        if name in ("season", "missed", "normal") and rest:
            raise QueryError("usage: " + UNION_COMMANDS[name][0])
        if name == "hits":  # members as openids: export names keep only [a-z0-9], so CJK names would collide
            rest = [f.lower() if uq.is_filter(f) else self._member(f) for f in rest]
        if name in ("season", "missed", "normal", "hits"):
            n = uq.pick_season(u, season_arg)
            key = [f"s{n}", *rest]
            run = {"season": lambda: uq.recap(u, n), "missed": lambda: uq.missed(u, n),
                   "normal": lambda: uq.normal(u, n), "hits": lambda: uq.hits(u, n, rest)}[name]
        elif name == "top":
            everything = bool(rest) and rest[0].lower() == "all"
            rest = rest[1:] if everything else rest
            n = None if everything else uq.pick_season(u, season_arg)
            who = self._member(" ".join(rest)) if rest else None
            key = ["all" if n is None else f"s{n}", *([who] if who else [])]
            run = lambda: uq.top(u, n, who)
        elif name == "member":
            if a:
                who = self._member(a[0])
            elif u.me:
                who = u.me
            else:
                raise QueryError("no cookie saved, so I don't know which member is you — give a name")
            key = [who]
            run = lambda: uq.member(u, who)
        elif name == "members":
            key, run = [], lambda: uq.members(u)
        elif name == "growth":
            who = [self._member(x) for x in a]
            key, run = who, lambda: uq.growth(u, who)
        else:  # boss
            if len(a) != 1:
                raise QueryError("usage: " + UNION_COMMANDS["boss"][0])
            key, run = a, lambda: uq.boss(u, a[0])
        self._show("union", name, key, cmd.force, run)

    u_season = u_hits = u_missed = u_normal = u_top = u_member = u_members = u_growth = u_boss = union_search

    def u_fetch(self, cmd: Command) -> None:
        self._union_fetch(live_only=False)

    def u_live(self, cmd: Command) -> None:
        self._union_fetch(live_only=True)

    def _union_fetch(self, live_only: bool) -> None:
        if self.store.load_raw("raid_list") is None:
            raise QueryError("no season list yet — run sync first")
        try:
            cookies = load_cookie(self.store)
        except FileNotFoundError:
            raise QueryError("no cookie saved — run cookie first") from None

        async def run():
            async with make_client(cookies) as client:
                return await fetch_union(self.store, client, time.time(), live_only)
        results, interrupted = {}, False
        try:
            with self.out.status("fetching union seasons…"):
                results = asyncio.run(run())
        except AuthError:
            self.out.print("[red]cookie rejected (game not login) — run cookie[/]")
        except UnionError as e:
            self.out.print(f"[red]union info refused: {e}[/]")
        except KeyboardInterrupt:
            self.out.print("[yellow]fetch interrupted — seasons so far are saved[/]")
            interrupted = True
        finally:
            for n, status in sorted(results.items()):
                colour = {"saved": "green", "kept": "dim"}.get(status, "red")
                self.out.print(f"[{colour}]s{n}: {status}[/]")
            if live_only and not results and not interrupted:
                self.out.print("[yellow]no union raid running right now[/]")
            if interrupted or "saved" in results.values():
                self._load_union()
                write_union_parsed(self.store, self.union)
                self.store.wipe_exports({"union"})
                self._completer = self._build_completer()

    def do_cookie(self, cmd: Command) -> None:
        from prompt_toolkit import prompt
        header = prompt("paste the Cookie header: ", is_password=True)
        save_cookie(self.store, header)
        self.out.print("[green]cookie saved to config/cookie.txt[/]")

    def do_fetch(self, cmd: Command) -> None:
        which = cmd.args[0].lower() if len(cmd.args) == 1 else ""
        if which not in ("campaign", "tower", "all"):
            raise QueryError("usage: " + COMMANDS["fetch"][0])
        sources = SOURCES if which == "all" else (which,)
        if any(self.store.load_raw(LEVELS[s]) is None for s in sources):
            raise QueryError("no level list yet — run sync first")
        try:
            cookies = load_cookie(self.store)
        except FileNotFoundError:
            raise QueryError("no cookie saved — run cookie first") from None
        before = {s: len(self.store.load_clears(s)) for s in sources}
        try:
            asyncio.run(self._fetch(sources, cookies))
        except AuthError:
            self.out.print("[red]cookie rejected (game not login) — run cookie[/]")
        except KeyboardInterrupt:
            self.out.print("[yellow]fetch interrupted — clears so far are saved[/]")
        except Exception as e:
            self.out.print(f"[red]fetch stopped: {type(e).__name__}: {e} — clears so far are saved[/]")
        finally:
            # whatever stopped the fetch, clears already saved must reach the parsed csv and wipe exports
            added = {s: len(self.store.load_clears(s)) - before[s] for s in sources}
            self.store.mark("fetch")
            self.out.print(" · ".join(f"{s}: +{n}" for s, n in added.items()))
            self.refresh(fetched={s for s, n in added.items() if n})

    async def _fetch(self, sources, cookies) -> None:
        async with make_client(cookies) as client:
            with Progress(console=self.out, transient=True) as bar:
                for source in sources:
                    task = bar.add_task(source, total=None)
                    def tick(label, done, total, task=task, source=source):
                        bar.update(task, description=f"{source} · {label}", completed=done, total=total)
                    await fetch_clears(self.store, source, client, tick)

    def do_sync(self, cmd: Command) -> None:
        async def run():
            async with httpx.AsyncClient() as client:
                return await sync_reference(self.store, client)
        results = asyncio.run(run())
        if any(not s.startswith("failed") for s in results.values()):
            self.store.mark("sync")
        for name, status in results.items():
            colour = {"changed": "green", "unchanged": "dim"}.get(status, "red")
            self.out.print(f"[{colour}]{name}: {status}[/]")
        changed = {n for n, s in results.items() if s == "changed"}
        self.refresh(synced=changed)
        for source in SOURCES:
            if LEVELS[source] in changed:
                stored = {int(k) for k in self.store.load_clears(source)}
                levels = self.store.load_raw(LEVELS[source], [])
                n = (len(campaign_targets(levels, stored)) if source == "campaign"
                     else sum(map(len, tower_targets(levels, stored).values())))
                self.out.print(f"{source}: {n} stages to check on next fetch {source}")


def utf8(stream):
    # Windows falls back to cp1252 when output isn't a UTF-8 terminal; it can't print → or ·
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")
    return stream


def main(root: Path) -> None:
    import sys

    from prompt_toolkit import PromptSession
    from prompt_toolkit.completion import DynamicCompleter
    from prompt_toolkit.history import FileHistory

    console = Console(file=utf8(sys.stdout))
    store = Store(root)
    app = App(store, console)
    history = root / "data" / ".history"
    history.parent.mkdir(parents=True, exist_ok=True)
    session = PromptSession(history=FileHistory(str(history)), completer=DynamicCompleter(app.completer),
                            bottom_toolbar=lambda: app.status())
    console.print("[bold magenta]blablalink[/]  " + app.status())
    app.do_help(Command("help", [], False))
    while True:
        try:
            line = session.prompt(app.prompt)
        except KeyboardInterrupt:
            continue
        except EOFError:
            break
        if not app.execute(line):
            break


def run() -> None:
    """`uv run blablalink` entry point. Data lives in the repo root, two levels above src/blablalink/."""
    main(Path(__file__).resolve().parents[2])
