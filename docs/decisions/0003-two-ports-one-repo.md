# 0003 One repo, two deliberate ports of the writer

## Context
The web app (TypeScript) and the CLI (Python) write to the same sheet under one contract.

## Decision
One monorepo (`ui/`, `cli/`) with the CLI's history kept (`git filter-repo` into `cli/`). The two
writers, `writeTabsAtEnd` and `write_rows`, stay separate ports and are changed together.

## Rejected
- A fresh copy of the CLI: loses blame.
- Shared context only, two repos: specs stay split and every contract change needs two branches.
- Git submodules.
- One shared writer: the languages differ, so the duplication is accepted on purpose.

Deploy: Cloudflare builds `main` from the dashboard with no repo config files; no wrangler file,
workflow or secret was added (`CONTRIBUTING.md`).
