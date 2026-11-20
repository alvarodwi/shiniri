"""The interactive shell: command parsing, help, rendering, prompt loop."""

import asyncio
import re
import shlex
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import httpx
from prompt_toolkit.completion import NestedCompleter, WordCompleter
from prompt_toolkit.document import Document
from rich.console import Console
from rich.markup import escape
from rich.table import Table

from . import union_queries as uq
from .fetch import AuthError, load_cookie, make_client, save_cookie, sync_reference
from .store import Store, export_name, scopes_to_wipe
from .union import CODES, UnionError, build_union, fetch_union, write_union_parsed
from .union_queries import QueryError, Result

COMMANDS: dict[str, tuple[str, str, list[str]]] = {
    "union": ("union [cmd]", "union raid mode — help union lists its commands", ["union", "union s45", "union missed s44"]),
    "sync": ("sync", "re-download CDN reference files", ["sync"]),
    "cookie": ("cookie", "paste your Cookie header", ["cookie"]),
    "help": ("help [group] [cmd]", "list commands, or show a group or one command in detail", ["help", "help union", "help union hits"]),
    "quit": ("quit", "leave", ["quit"]),
}
UNION_COMMANDS: dict[str, tuple[str, str, list[str]]] = {
    "fetch": ("fetch", "download seasons not stored yet (needs cookie)", ["fetch"]),
    "live": ("live", "re-download the running season", ["live"]),
    "season": ("sN | season [sN]", "season recap", ["s45", "season"]),
    "hits": ("hits [sN] [normal|hard] [lv<n>] [d<n>] [boss] [member]",
             "every hit, filtered, biggest first · quote names with spaces, @name for a name like a filter",
             ["hits hard hsta", "hits s45 d2 alpha", 'hits "two words"', "hits @hard"]),
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
MAIN_FOOTER = "a group name alone enters it · add a command for a one-off (union s45) · any unique prefix works"
GROUPS: dict[str, tuple[dict, str, str]] = {  # name -> (commands, help footer, handler method prefix)
    "union": (UNION_COMMANDS, UNION_FOOTER, "u_"),
}


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
    elif name == "hits":
        try:
            args = shlex.split(rest)  # "two words" for names with spaces
        except ValueError:
            raise QueryError("unbalanced quote") from None
    elif name == "cookie":
        args = []  # only via the hidden prompt, so the token never lands in history
    else:
        args = rest.split()
    return Command(name, args, force)


class PrefixCompleter(NestedCompleter):
    """NestedCompleter that also follows a unique prefix (`cl n cro`), the way parse_command does."""

    def get_completions(self, document, complete_event):
        text = document.text_before_cursor.lstrip()
        first = text.split()[0] if " " in text else ""
        if first and first not in self.options:
            hits = [k for k in self.options if k.startswith(first.lower())]
            if len(hits) == 1:
                text = hits[0] + text[len(first):]
                document = Document(text, len(text))  # completions are relative to the cursor, so this is safe
        yield from super().get_completions(document, complete_event)


class App:
    def __init__(self, store: Store, console: Console):
        self.store, self.out = store, console
        self.mode = "main"
        for line in store.migrate():
            self.out.print(f"[cyan]{line}[/]")
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
        groups = {"union": union}
        self._group_completers = {g: PrefixCompleter.from_nested_dict(d) for g, d in groups.items()}
        return PrefixCompleter.from_nested_dict({
            **{name: None for name in COMMANDS}, **groups,
            "help": {g: set(cmds) for g, (cmds, _, _) in GROUPS.items()} | {c: None for c in COMMANDS if c not in GROUPS},
        })

    def completer(self):
        return self._group_completers.get(self.mode, self._completer)

    def prompt(self) -> str:
        return f"{self.mode}> " if self.mode in GROUPS else "> "

    # --- plumbing -------------------------------------------------------
    def refresh(self, synced: set[str] = frozenset()) -> None:
        scopes = scopes_to_wipe(synced=set(synced))
        if not scopes:
            return
        self._load_union()
        write_union_parsed(self.store, self.union)
        self.store.wipe_exports(scopes)
        self._completer = self._build_completer()
        self.out.print(f"[dim]rebuilt parsed csv · cleared exports: {', '.join(sorted(scopes))}[/]")

    def status(self) -> str:
        return f"synced {self.store.state().get('sync', 'never')}"

    def execute(self, line: str) -> bool:
        if not line.strip().lstrip("!").strip():  # a bare ! is as empty as a blank line
            return True
        try:
            if self.mode in GROUPS:
                commands, _, prefix = GROUPS[self.mode]
                word = line.strip().lower()
                if word and "quit".startswith(word):
                    self.mode = "main"
                    return True
                cmd = parse_command(line, commands)
                if cmd.name == "back":
                    self.mode = "main"
                else:
                    getattr(self, prefix + cmd.name)(cmd)
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
            self.out.print("[yellow]no matching rows[/]")
        else:
            table = Table(*result.columns, header_style="bold magenta")
            for row in result.rows:
                table.add_row(*(escape(str(v)) for v in row))
            self.out.print(table)
        if result.summary:
            self.out.print(f"[bold]{escape(result.summary)}[/]")

    # --- actions --------------------------------------------------------
    def do_help(self, cmd: Command) -> None:
        group = parse_command(cmd.args[0]).name if cmd.args else None
        if group in GROUPS:
            commands, footer, _ = GROUPS[group]
            self._help(commands, cmd.args[1:], footer)
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

    # --- groups ---------------------------------------------------------
    def _enter_group(self, cmd: Command) -> None:
        """`clear` enters the group; `clear progress` runs one command and stays on main."""
        commands, footer, prefix = GROUPS[cmd.name]
        if not cmd.args:
            self.mode = cmd.name
            self._help(commands, [], footer)
            return
        if cmd.args[0].lower() == "quit":
            return
        sub = parse_command(("!" if cmd.force else "") + " ".join(cmd.args), commands)
        if sub.name != "back":
            getattr(self, prefix + sub.name)(sub)

    do_union = _enter_group

    def u_help(self, cmd: Command) -> None:
        self._help(UNION_COMMANDS, cmd.args, UNION_FOOTER)

    def _member(self, name: str) -> str:
        if name.lower() == "me" and self.union.me:
            return self.union.me
        return uq.resolve_member(self.union, name)

    def union_search(self, cmd: Command) -> None:
        u, a, name = self.union, cmd.args, cmd.name
        if not u.seasons:
            raise QueryError("no union data yet — run sync, then union fetch")
        season_arg = a[0] if a and re.fullmatch(r"s\d+", a[0].lower()) and name != "member" else None
        rest = a[1:] if season_arg else a
        if name in ("season", "missed", "normal") and rest:
            raise QueryError("usage: " + UNION_COMMANDS[name][0])
        if name == "hits":  # members as openids: export names keep only [a-z0-9], so CJK names would collide
            rest = [self._member(f[1:]) if f.startswith("@") else f.lower() if uq.is_filter(f) else self._member(f)
                    for f in rest]
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
            self.out.print(f"[red]{escape(str(e))}[/]")
        except KeyboardInterrupt:
            self.out.print("[yellow]fetch interrupted — seasons so far are saved[/]")
            interrupted = True
        finally:
            for n, status in sorted(results.items()):
                colour = fetch_colour(status)
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

def fetch_colour(status: str) -> str:
    """`union fetch` status colour: every "kept …" variant is a success, not a failure."""
    return "green" if status == "saved" else "dim" if status.startswith("kept") else "red"


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
    console.print("[bold magenta]shiniri-cli[/]  " + app.status())
    app.do_help(Command("help", [], False))
    while True:
        try:
            p = app.prompt()
            line = session.prompt(p)
        except KeyboardInterrupt:
            continue
        except EOFError:
            break
        if line.strip():
            console.clear()  # visible screen only; scrollback keeps long results reachable
            console.print(f"[dim]{escape(p + line)}[/]")
        if not app.execute(line):
            break


def _interrupt(signum, frame):
    raise KeyboardInterrupt


def run() -> None:
    """`uv run shiniri-cli [watch]` entry point. Data lives in the repo root, two levels above src/shiniri_cli/."""
    root = Path(__file__).resolve().parents[2]
    if sys.argv[1:] == ["watch"]:
        import signal

        from . import profile
        signal.signal(signal.SIGTERM, _interrupt)  # stop.sh sends SIGTERM; make it log "stopped" like Ctrl+C
        profile.watch(Store(root))
    else:
        main(root)
