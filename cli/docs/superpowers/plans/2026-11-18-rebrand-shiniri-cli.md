# Rebrand to shiniri-cli Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the package and command from blablalink to shiniri-cli without touching the website's own name.

**Architecture:** Pure rename. `git mv` the package; source modules use relative imports, so only tests,
`pyproject.toml`, the banner, a docstring and the README change.

**Tech Stack:** Python 3.14, uv, pytest.

**Spec:** `docs/superpowers/specs/2026-11-18-rebrand-shiniri-cli-design.md`

## Global Constraints
- Package `shiniri_cli`, project and command `shiniri-cli`.
- Every `*.blablalink.com` URL and the "can't reach blablalink" error stay byte-for-byte.

## Review Focus
- Stale `.pyc` / old editable install: `uv run shiniri-cli` must start after `uv sync`; `uv run blablalink` is expected to fail.
- `run()` finds the repo root by path depth from the package folder; the depth is unchanged, so `data/` still resolves (covered by existing cli tests).
- A leftover `blablalink.` string in a `monkeypatch.setattr` target (`tests/test_cli.py:248`) fails only at runtime — the full suite catches it.

---

### Task 1: Rename package, command, banner, README

**Files:**
- Move: `src/blablalink/` → `src/shiniri_cli/`
- Modify: `pyproject.toml` (`name`, `[project.scripts]`), `src/shiniri_cli/cli.py:515` banner, `:533` docstring, `README.md:1,14,95`
- Test: every `tests/*.py` import of `blablalink` (incl. `monkeypatch.setattr("blablalink.cli.fetch_union", ...)`)

- [ ] **Step 1:** `git mv src/blablalink src/shiniri_cli`; delete its `__pycache__`.
- [ ] **Step 2:** Replace `blablalink.` / `import blablalink` / `from blablalink` with `shiniri_cli` in `tests/`. Keep `match="can't reach blablalink"`.
- [ ] **Step 3:** `pyproject.toml`: `name = "shiniri-cli"`, `shiniri-cli = "shiniri_cli.cli:run"`. Banner `"[bold magenta]shiniri-cli[/]  "`. Docstring: `` `uv run shiniri-cli` ``, `src/shiniri_cli/`.
- [ ] **Step 4:** README: `# shiniri-cli`, `uv run shiniri-cli`, `src/shiniri_cli/`. Lines 3, 27, 31 keep "blablalink" (the website).
- [ ] **Step 5:** `uv sync` then `uv run pytest -q` → all pass. `grep -rn blablalink src tests README.md pyproject.toml | grep -v "\.blablalink\.com\|can't reach blablalink\|from blablalink$"` → only README lines 3/27/31 and the pyproject description.
- [ ] **Step 6:** Smoke: `echo q | uv run shiniri-cli` shows the `shiniri-cli` banner and exits.
- [ ] **Step 7:** Commit on `feat/rebrand` (`feat: rebrand to shiniri-cli`), merge into `develop` with `--no-ff`.
