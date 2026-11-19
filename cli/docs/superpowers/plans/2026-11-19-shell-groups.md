# Shell Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the clear-data commands into a nested `clear` group, and drive both clear and union through one shared `GROUPS` table.

**Architecture:** `cli.py` gets `CLEAR_COMMANDS` plus a `GROUPS` dict mapping each group name to `(commands, footer, handler_prefix)`. `App.mode` holds `"main"` or a group name. `execute`, `prompt`, `completer`, `do_help` and a single `_enter_group` handler (used by both `do_clear` and `do_union`) read from `GROUPS`.

**Tech Stack:** Python, rich, prompt_toolkit, pytest (`uv run pytest`).

**Spec:** `docs/superpowers/specs/2026-11-19-shell-groups-design.md`

## Global Constraints

- The main `COMMANDS` table holds exactly `clear`, `union`, `sync`, `cookie`, `help` and `quit`.
- Union's behaviour doesn't change, including the `s\d+` shortcut, which applies to `UNION_COMMANDS` only.
- Export names and scopes don't change (`FIXED_SCOPE` and `_scope` stay as they are).
- There's no fallback: clear commands typed at main raise "unknown command 'n' — try clear n crown".

## Review Focus

- `!clear top` must force the rebuild. The `!` has to carry into the one-shot form, as it does for union.
- `help clear nikke` shows the detail for `nikke`, and `help union hits` shows the detail for `hits`.
- `clear back` and `clear quit` as one-shots are no-ops. They must not quit the app.
- `n crown` at main gives a helpful error, not a crash.
- `clear n cro<Tab>` completes Nikke names from main, and `n cro<Tab>` completes them inside `clear>`.

---

### Task 1: Groups mechanism with clear moved into it

**Files:**
- Modify: `src/shiniri_cli/cli.py` (tables at lines 25-60, `App._build_completer`/`completer`/`prompt`/`execute`, `do_help`, `do_union`, handler names)
- Test: `tests/test_cli.py`

**Interfaces:**
- Produces: `CLEAR_COMMANDS: dict`, `CLEAR_FOOTER: str`, and `GROUPS: dict[str, tuple[dict, str, str]]` (the prefixes are `"c_"` and `"u_"`). It also produces the clear handlers `App.c_nikke … c_progress, c_fetch, c_help` and `App.do_clear = App.do_union = App._enter_group`.

- [ ] **Step 1: Update the existing tests and add new ones**

Prefix every clear command in the existing tests with `clear ` (`test_bad_args_keep_running`, `test_search_writes_then_reuses_export` (`!n crown` → `!clear n crown`), `test_empty_first_run`, `test_unexpected_errors_keep_shell` (patch `app.c_progress`), fetch tests, date, completer (`"clear nikke cro"`), stage, spread and damaged-export). Then add:

```python
def test_clear_mode_and_back(store):
    app, out = make_app(store)
    app.execute("clear")
    assert app.prompt() == "clear> " and "progress" in out.export_text()
    app.execute("progress")
    assert store.export_path("all", "progress").exists()
    assert app.execute("back") is True and app.mode == "main"
    app.execute("cl"); assert app.execute("q") is True and app.mode == "main"

def test_clear_one_shot_and_force(store):
    app, out = make_app(store)
    app.execute("clear progress"); app.execute("!clear progress")
    assert app.mode == "main" and "cached" not in out.export_text()
    assert app.execute("clear quit") is True and app.execute("clear back") is True and app.mode == "main"

def test_main_rejects_clear_commands(store):
    app, out = make_app(store)
    app.execute("n crown")
    assert "unknown command 'n'" in out.export_text()

def test_help_groups(union_store):
    app, out = make_app(union_store)
    app.execute("help clear"); text = out.export_text()
    assert all(n in text for n in ("nikke", "spread", "back"))
    app.execute("help clear nikke"); assert "n crown" in out.export_text()
    app.execute("help union hits"); assert "hits hard hsta" in out.export_text()

def test_completer_in_clear_mode(store):
    from prompt_toolkit.document import Document
    app, _ = make_app(store)
    app.execute("clear")
    assert "Crown" in {c.text for c in app.completer().get_completions(Document("nikke cro"), None)}
```

Also update `test_parse_command` so it parses with `CLEAR_COMMANDS`, and add `parse_command("cl").name == "clear"` and `parse_command("u").name == "union"`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `uv run pytest tests/test_cli.py -q`
Expected: the new and updated tests FAIL (unknown command 'clear', no `CLEAR_COMMANDS`).

- [ ] **Step 3: Implement the change in `cli.py`**

- Split `COMMANDS`. The clear entries plus `fetch` go to `CLEAR_COMMANDS`, along with `help` ("list clear commands, or show one in detail") and `back`. Main gets `clear` ("clear data mode — help clear lists its commands", examples `["clear", "clear progress", "cl n crown"]`).
- `CLEAR_FOOTER` takes today's `MAIN_FOOTER` text. The new `MAIN_FOOTER` reads: "a group name alone enters it · add a command for a one-off (clear progress) · any unique prefix works".
- `execute`: when `self.mode in GROUPS`, keep today's union logic (quit-prefix/back leaves the mode), but dispatch through `getattr(self, prefix + cmd.name)`. At main, an unknown word that's a `CLEAR_COMMANDS` name or prefix raises `QueryError(f"unknown command '{word}' — try clear {line.strip().lstrip('!')}")`. Do this in `execute` or in a catch around `parse_command`. Don't put it in `parse_command`.
- `_enter_group(cmd)`: is today's `do_union`, generalised using `GROUPS[cmd.name]`. `do_clear = do_union = _enter_group`.
- `do_help`: if `args[0]` resolves to a group, call `_help(group_commands, args[1:], footer)`. `c_help` and `u_help` call `_help` with their own table.
- Rename `do_nikke…do_progress` and `do_fetch` to `c_*`. Usage strings in errors read from `CLEAR_COMMANDS`. Change the empty hint to "no data yet — run sync, then clear fetch".
- Completer: keep a `self._group_completers: dict[str, NestedCompleter]` keyed by group. The clear dict is today's main dict without the main-only keys, plus `"help": set(CLEAR_COMMANDS)`. The main completer nests `"clear"` and `"union"` dicts, and its `help` offers `set(COMMANDS)`. `completer()` returns `self._group_completers.get(self.mode, self._completer)`. `prompt()` returns `f"{self.mode}> "` in a group.

- [ ] **Step 4: Run all the tests and confirm they pass**

Run: `uv run pytest -q`
Expected: all PASS.

- [ ] **Step 5: Update the README if it documents the commands, then commit**

```bash
git add src/shiniri_cli/cli.py tests/test_cli.py README.md
git commit -m "feat: clear becomes a nested group; shared groups mechanism"
```
