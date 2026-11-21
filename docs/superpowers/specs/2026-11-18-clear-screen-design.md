# Clear the screen on every command — design

Date: 2026-11-18

## Intent

The shell prints each result below the last one. Long results such as `synchro`
push everything down and leave the terminal cluttered. The owner uses the shell
like a screen-based app (one view at a time), so every command should start
from a clean screen.

## Goals

- Pressing Enter on a command wipes the screen before its output is printed.
- The command you typed is shown at the top, so you can tell what the screen is showing.

## Non-goals

- A scrollable viewer for results taller than the window (approach B below). It
  can be added later if synchro still feels cramped.
- A full-screen TUI. The original CLI design ruled this out, and it still does.

## Approaches

- **A. Clear before each command (chosen by the owner).** About five lines in the
  prompt loop. A result taller than the window still runs off the top, but
  scrollback is kept, so it can be scrolled to.
- B. Show long results in a scrollable full-screen viewer. Better for synchro,
  but more code, and Windows' `more` only scrolls forward, so it would need a
  custom viewer.
- C. A full-screen app with panes. Ruled out by the original design, and not
  needed for this problem.

## Design

- In `main()`'s prompt loop, after reading a non-empty line: `console.clear()`,
  then print the prompt and the line dimmed (`> synchro`, `union> s45`). Then
  run it as today.
- Pressing Enter on an empty line does nothing and leaves the screen as it is.
- `console.clear()` clears the visible screen only, so scrollback is kept. Rich
  skips the clear when output isn't a terminal, so piped output is unaffected.
- Startup is unchanged: banner, status, and the command menu.
- The clear lives in `main()`, not in `App.execute`, so tests that call
  `execute` keep working.

## Builder's calls

- No new test: the change is a single call in the interactive loop, which has no tests today.
- `quit` also clears before it exits. This is harmless, so it gets no special case.
