# Watch shutdown design

**Intent.** Ctrl+C on `shiniri-cli watch` prints a `KeyboardInterrupt` traceback that looks like a crash, but it isn't one. `./stop.sh` (SIGTERM) kills the process without logging anything. Stopping should look like stopping. This is a cosmetic change.

**Goals.**
- Ctrl+C: no traceback. Print one `<WIB timestamp> stopped` line and exit cleanly (code 0).
- SIGTERM (`stop.sh`): same behaviour, so `data/watch.log` ends with `stopped` and a deliberate stop can be told apart from a crash.

**Non-goals.** Waiting for a running check to finish before exiting. A check cut off partway is abandoned, and the next start runs it again. The sheet's "day already written" guard prevents a duplicate Profile row.

**Constraints.** The interactive shell's own Ctrl+C handling (`cli.main`) stays unchanged.

**Approaches.**
1. *Picked:* `watch` catches `KeyboardInterrupt` and prints `stopped`. `run()`, on the watch path only, installs a SIGTERM handler that raises `KeyboardInterrupt`. Both signals then take one exit path.
2. Finish the current check before exiting (a stop flag checked between checks, plus an interruptible sleep). Rejected: more code, and checks are short and safe to re-run.
3. Do nothing and document that the traceback is harmless. Rejected: the log still looks like a crash.

**Test.** A fake `sleep` that raises `KeyboardInterrupt`. `watch` must return normally, and its output must end with `stopped`.
