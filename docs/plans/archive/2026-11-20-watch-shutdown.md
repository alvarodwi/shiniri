# Watch Shutdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ctrl+C or SIGTERM stops `shiniri-cli watch` with one `stopped` log line, no traceback, and exit code 0.

**Architecture:** `profile.watch` catches `KeyboardInterrupt` around its loop and prints `<WIB timestamp> stopped`. On the watch path only, `cli.run` installs a SIGTERM handler that raises `KeyboardInterrupt`, so both signals reach the same exit.

**Tech Stack:** Python stdlib `signal`, pytest.

**Spec:** `docs/superpowers/specs/2026-11-20-watch-shutdown-design.md`

## Global Constraints

- The log line format is `f"{wib_timestamp(clock())} stopped"`, printed with `flush=True` like the other watch lines.
- The interactive shell (`cli.main`) keeps its own Ctrl+C handling unchanged.
- `once=True` behaves as before.

## Review Focus

- Ctrl+C during a check (inside `_check`, not only during sleep): `except Exception` does not catch `KeyboardInterrupt`, so it must still reach the outer handler and print `stopped`. The test raises it from the check.
- The SIGTERM handler must not be installed when `run()` starts the shell. The existing `test_run_dispatches_watch` covers the dispatch, and the handler goes inside the watch branch.

---

### Task 1: Clean stop for watch

**Files:**
- Modify: `src/shiniri_cli/profile.py:204-214` (`watch`)
- Modify: `src/shiniri_cli/cli.py:416-423` (`run`)
- Test: `tests/test_cli.py` (next to `test_watch_logs_missing_config_and_keeps_going`)

**Interfaces:**
- Consumes: `watch(store, *, sleep, clock, once)`, unchanged signature.
- Produces: none.

- [ ] **Step 1: Write the failing tests**

```python
def test_watch_stops_cleanly_on_interrupt(store, capsys, monkeypatch):
    from datetime import datetime

    from shiniri_cli import profile
    clock = lambda: datetime(2026, 11, 20, 12, tzinfo=profile.WIB)

    def stop(_):
        raise KeyboardInterrupt
    profile.watch(store, sleep=stop, clock=clock)  # interrupted while sleeping
    monkeypatch.setattr(profile, "_check", lambda s, now: stop(0))
    profile.watch(store, clock=clock)  # interrupted mid-check
    lines = capsys.readouterr().out.splitlines()
    assert lines[-1] == "2026-11-20 12:00:00 stopped"
    assert lines.count("2026-11-20 12:00:00 stopped") == 2
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `uv run pytest tests/test_cli.py::test_watch_stops_cleanly_on_interrupt -v`
Expected: FAIL with `KeyboardInterrupt`

- [ ] **Step 3: Implement**
- `watch`: wrap the `while True` loop in `try/except KeyboardInterrupt`. The handler prints the stopped line and returns. Add `stopped on Ctrl+C or SIGTERM` to the docstring.
- `run`: in the watch branch, before `profile.watch(...)`, add `signal.signal(signal.SIGTERM, _interrupt)`. Define `_interrupt(signum, frame)` at module level in `cli.py`; it raises `KeyboardInterrupt`. Add a one-line comment: `# stop.sh sends SIGTERM; make it log "stopped" like Ctrl+C`.

- [ ] **Step 4: Run the full suite**

Run: `uv run pytest -q`
Expected: all pass

- [ ] **Step 5: Manual check**

Run `uv run shiniri-cli watch`, wait for the first line, then press Ctrl+C.
Expected: a `... stopped` line with no traceback. (Run `echo $?` in Git Bash and expect `0`.)

- [ ] **Step 6: Commit**

```bash
git add src/shiniri_cli/profile.py src/shiniri_cli/cli.py tests/test_cli.py
git commit -m "feat: watch stops cleanly on Ctrl+C and SIGTERM"
```
