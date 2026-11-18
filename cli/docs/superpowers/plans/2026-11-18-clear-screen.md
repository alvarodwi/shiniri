# Clear Screen Per Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every non-empty command clears the screen and echoes the typed command before its output.

**Architecture:** One change in the prompt loop of `main()` in `src/blablalink/cli.py`. `App.execute` is untouched.

**Tech Stack:** Python 3.14, prompt_toolkit, rich.

**Spec:** `docs/superpowers/specs/2026-11-18-clear-screen-design.md`

## Global Constraints

- `console.clear()` only. Never clear scrollback (`ESC[3J`).
- Startup output is unchanged: banner, status, help menu.

## Review Focus

- Empty Enter: the screen must stay as it is (no clear, no echo).
- Union mode: the echo must show `union> `, the prompt that was active when the line was typed, not the prompt after the mode changed (e.g. after `union` or `back`).
- Output that isn't a terminal: rich skips the clear by itself, so nothing is needed.
- Markup in the typed line (e.g. `hits [x]`): echo it with `escape()` so rich doesn't swallow it.

These are covered by the manual check in Step 2. The interactive loop has no tests, and the spec says not to add one.

---

### Task 1: Clear and echo in the prompt loop

**Files:**
- Modify: `src/blablalink/cli.py` — `main()`, the `while True` loop (about lines 518-525)

**Interfaces:**
- Consumes: `app.prompt() -> str`, `console: rich.console.Console`, `escape` (already imported from `rich.markup`)
- Produces: nothing new

- [ ] **Step 1: Implement**

Capture the prompt with `p = app.prompt()` before `session.prompt(p)`. After the line is read, if `line.strip()` is non-empty: `console.clear()`, then `console.print(f"[dim]{escape(p + line)}[/]")`. Then call `app.execute(line)` as before.

- [ ] **Step 2: Verify**

Run `uv run pytest -q`. Expected: all pass, unchanged count.

Run `uv run blablalink` by hand:
- `synchro`: the screen is wiped, `> synchro` shows dimmed at the top, the table follows, and scrolling up still reaches the earlier output.
- Empty Enter: nothing changes.
- `union`, then `s45`: the echo reads `union> s45`.
- `back`, then `quit`: the shell exits.

- [ ] **Step 3: Commit**

```bash
git add src/blablalink/cli.py
git commit -m "feat: clear the screen before each command"
```
