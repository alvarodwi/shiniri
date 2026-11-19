# Shell groups: clear becomes a nested menu like union

## Why

The shell's data falls into four groups (the folders in `blabla.yml`): **clear**, **union**, **profile**, **investment**. Union already has its own nested mode. The clear-data commands, though, sit loose on the main menu, so there's no room for the other groups. This change moves clear into its own nested group and gives every group one shared mechanism, so profile and investment can be added later as a table entry plus their handlers.

## Goals

- The main menu lists only the groups plus shared commands: `clear`, `union`, `sync`, `cookie`, `help`, `quit`.
- Every group works in two ways, as union does today:
  - `clear` enters the group, shows its help and sets the prompt to `clear> `.
  - `clear progress` is a one-off: it runs and stays on main. `!` carries through (`!clear top`).
- Inside a group, `back` or any prefix of `quit` (`q`) returns to main. Unique prefixes work, as before.
- `help` lists the main commands. `help clear` and `help union` show a group's commands, and `help clear nikke` shows one command in detail.
- Union behaviour stays identical, including `s45` as the season shortcut.

## Non-goals

- Profile and investment commands. They aren't listed on main until they exist.
- Any change to the search logic, export file names or folders, parsed CSVs or stored data. The cached exports stay valid.

## Anti-goals

- No fallback that runs clear commands typed directly at main. That would bring the clutter back. `n crown` at main errors with "unknown command — try clear n crown".

## Approaches

- **A. Copy the union wiring for clear.** This is the smallest diff today. But each new group re-touches `execute`, `prompt`, `completer` and `help`, and the union-only special cases keep spreading.
- **B. One shared `GROUPS` table (chosen).** Each entry maps a group name to its command table, help footer and handler prefix (`c_`, `u_`). Mode is the group name, or `"main"`. `execute`, `prompt`, `completer`, `help` and the one-shot form all read from the table. Union moves onto it.

The user picked B.

## Design

- `COMMANDS` (main): `clear`, `union`, `sync`, `cookie`, `help`, `quit`.
- `CLEAR_COMMANDS`: `fetch campaign|tower|all`, `nikke`, `stage`, `floor`, `date`, `top`, `synchro`, `spread`, `progress`, `help`, `back`. Usage strings and examples come over from today's entries.
- `UNION_COMMANDS`: unchanged.
- `GROUPS = {"clear": (CLEAR_COMMANDS, CLEAR_FOOTER, "c_"), "union": (UNION_COMMANDS, UNION_FOOTER, "u_")}`.
- The handlers keep their bodies and are renamed: `do_nikke`…`do_progress` and `do_fetch` become `c_*`. `do_sync`, `do_cookie` and `do_help` stay on main.
- `parse_command` already takes a command table. The `s\d+` special case stays keyed to `UNION_COMMANDS`.
- The completer is built once per group from the existing nested dicts (the clear dict is today's main one). Main nests each group's dict under its name, so `clear n<Tab>` completes.
- Empty-data hints say `clear fetch` instead of `fetch`.

## Notes

- `c` alone is ambiguous at main (`clear`/`cookie`), so you type `cl`. `u` stays unique to union.
- `tests/test_cli.py` calls clear commands from main in about 18 places. They gain the `clear ` prefix, and new tests cover entering/leaving clear, the one-shot form and `help clear`.

## Left to the builder

- How handlers are looked up (a prefix string versus storing bound methods), and the exact footer wording.
