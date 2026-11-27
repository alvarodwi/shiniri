"""Summarise patch notes with Claude Code, one `claude -p` call per note, newest first.

    uv run python tools/summarize.py [--limit N] [--force]

Run `news` in the shell first. Summaries go to data/summaries/ under the note's file name; a note that has one
is skipped unless --force. The structure is tools/summary_prompt.md."""

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

from shiniri_cli import news
from shiniri_cli.store import Store, atomic_write

ROOT = Path(__file__).resolve().parents[1]
PROMPT = Path(__file__).with_name("summary_prompt.md")
# The note is text from the web: no tools, and none of this machine's plugins, hooks or CLAUDE.md.
CLAUDE = ["claude", "-p", "--safe-mode", "--tools", "", "--no-session-persistence"]


def patch_notes(store: Store) -> list[tuple[str, dict]]:
    """(file name, article), newest update first; of two notes for one date only the later published."""
    articles = news.stored_articles(store)
    names = news.markdown_names(articles)
    latest = {}
    for a in sorted(articles, key=lambda a: (int(a["pub_timestamp"]), a["content_id"])):
        if day := news.update_date(a):
            latest[day] = (names[a["content_id"]], a)
    return [latest[day] for day in sorted(latest, reverse=True)]


def summarize(
    store: Store, *, limit: int = 10, force: bool = False, run=subprocess.run
) -> int:
    """Write the missing summaries (`limit` at most); how many failed."""
    out = store.root / "data" / "summaries"
    todo = [n for n in patch_notes(store) if force or not (out / n[0]).exists()]
    print(f"{len(todo)} to do, running {min(limit, len(todo))}")
    system = PROMPT.read_text(encoding="utf-8")
    failed = 0
    for name, article in todo[:limit]:
        with tempfile.TemporaryDirectory() as empty:
            done = run(
                [*CLAUDE, "--system-prompt", system],
                input=f"Update date: {news.update_date(article)}\n\n{news.markdown(article)}",
                capture_output=True,
                text=True,
                encoding="utf-8",
                timeout=900,
                cwd=empty,
            )
        text = done.stdout.strip()
        # Not written: an existing file is never redone, so a bad one would stick.
        if done.returncode or not text.startswith("# "):
            failed += 1
            print(f"FAILED {name}: {(done.stderr.strip() or text)[:200]}")
        else:
            atomic_write(out / name, text + "\n")
            print(name)
    return failed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--limit", type=int, default=10, help="batch size (default 10)")
    parser.add_argument("--force", action="store_true", help="redo existing summaries")
    args = parser.parse_args()
    if args.limit < 1:
        parser.error("--limit must be 1 or more")
    sys.exit(1 if summarize(Store(ROOT), limit=args.limit, force=args.force) else 0)


if __name__ == "__main__":
    main()
