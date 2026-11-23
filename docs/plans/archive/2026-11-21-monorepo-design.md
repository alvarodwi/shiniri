# Merge shiniri and shiniri-cli into one repo

## Why

The web app (`alvarodwi/shiniri`) and the CLI (`alvarodwi/shiniri-cli`) write to the same Google
Sheet under the same rules: append-only writes, the `AuditLog` row, lowerCamelCase headers, and
sheet strings copied verbatim. Each repo has its own `CLAUDE.md` and `docs/superpowers/`, so every
session has to have that shared context explained again, plus a reminder that "the other repo
needs this too". One repo with one home for shared context saves that explanation.

Duplicated code is accepted. `write_rows` (Python) and `writeTabsAtEnd` (TypeScript) stay
separate ports. The goal is shared context, not shared code.

## Goals

- One repo, `alvarodwi/shiniri`, with `ui/` (web app) and `cli/` (CLI).
- Full git history of both, with paths rewritten, so `git log` and `git blame` on `cli/...` reach
  back past the merge.
- One `docs/superpowers/{specs,plans}/` at the root holding both repos' docs.
- A root `CLAUDE.md` that holds the shared sheet contract and owner workflow once. `ui/CLAUDE.md`
  and `cli/CLAUDE.md` hold only what belongs to each stack.
- A root `README.md` explaining the two parts. `ui/README.md` and `cli/README.md` are updated for
  the new layout.
- The homeserver checks out only `cli/` (sparse clone). Netlify builds from `ui/`.

## Non-goals

- No shared code, no shared package, no codegen of headers across languages.
- No rewriting of old specs and plans. Paths like `src/shiniri_cli/...` in them record what was
  true when written.
- No change to app or CLI behaviour, and no change to the sheet.

## Anti-goals

- The live `watch` on the homeserver stops writing rows, writes a duplicate, or loses
  `config/` or `data/` during the switch.
- The Netlify site breaks or deploys from the wrong directory.
- History gets flattened into one "import" commit.

## Approaches

1. **Monorepo with history (picked).** Rewrite `shiniri-cli` history into `cli/` with
   `git filter-repo`, move the web app into `ui/`, and merge the two histories. Keeps blame and
   log. Costs one merge commit with unrelated histories.
2. **Monorepo, fresh copy.** Copy the files in and archive both old repos. Simpler, but history
   across the move is lost.
3. **No merge, shared context file.** Keep both repos and share a `SHEET.md` or a parent
   `CLAUDE.md`. Cheapest, but specs stay split and contract changes still need two branches.

Submodules were dropped. They keep two repos, which is the problem being removed.

The owner picked 1 because history is cheap to keep now and impossible to get back later.

## Decided

- Reuse the existing `alvarodwi/shiniri` repo. Its files move into `ui/`, which keeps the Netlify
  link. `shiniri-cli` is archived on GitHub once the homeserver runs from the new repo.
- `docs/superpowers/` sits at the root as one flat `specs/` and `plans/`. Neither repo's file
  names collide with the other's (checked).
- The docs move happens first in the order of work, as part of the restructure.

## Target layout

```
shiniri/
  CLAUDE.md            shared: sheet contract, invariants, owner workflow, branches
  README.md            what shiniri is, the two parts, links into each
  netlify.toml         build base ui/, command, publish dir
  CONTRIBUTING.md      branches, commits, release (moved from the web repo, made repo-wide)
  .gitignore           shared ignores only (.codegraph/, .superpowers/, .obsidian/, .DS_Store)
  docs/superpowers/{specs,plans}/
  ui/                  everything the web app had at its root (src, package.json, yarn.lock,
                       .yarn, .yarnrc.yml, vite/uno/ts/eslint/prettier config, .env.example,
                       .env.mock, index.html, .vscode, its own .gitignore), plus CLAUDE.md, README.md
  cli/                 everything shiniri-cli had at its root (src, tests, pyproject.toml, uv.lock,
                       .python-version, config/sources.json, start.sh, stop.sh, blabla.yml ignore
                       rules in its own .gitignore), plus CLAUDE.md, README.md
```

Each part keeps its own `.gitignore` in its folder, since git applies nested ignore files to that
subtree.

## How

1. **Restructure on `feat/monorepo` in `shiniri`.** `git mv` every tracked web file except
   `docs/` into `ui/`.
2. **Import the CLI.** Make a fresh clone of `shiniri-cli` (`develop` only;
   `feat/profile-tracking` is already merged into `develop`). Run
   `uvx git-filter-repo --to-subdirectory-filter cli` on it. In `shiniri`, fetch it and
   `git merge --allow-unrelated-histories`.
3. **Unify docs.** `git mv cli/docs/superpowers/specs/* docs/superpowers/specs/`, and the same
   for `plans/`. Remove the empty `cli/docs/`.
4. **Split `CLAUDE.md`.**
   - Root, **the sheet contract**: the sheet is the single source of truth. Append-only writes and
     the `AuditLog` batch, naming both `ui/src/services/sheets/tabWriter.ts` and
     `cli/src/shiniri_cli/sheets.py`. No hardcoded rows. The owner edits the sheet by hand. Sheet
     strings are copied verbatim. Headers are lowerCamelCase. Each part skips rows the sheet
     already has.
   - Root, **the development flow**, defined once for both parts:
     1. Branch `feat/<name>` or `fix/<name>` from `develop`.
     2. Brainstorm.
     3. Short design doc in `docs/superpowers/specs/`, then a plan in `docs/superpowers/plans/`.
        Doc names say which part they touch.
     4. Implement in-session ("natively"), not with a subagent per task. Don't ask which
        execution style.
     5. Run each touched part's checks (named in its `CLAUDE.md`).
     6. One fresh reviewer checks the whole branch. Fix all of its findings on the branch, minor
        ones included.
     7. Give the owner the exact pre-merge checks for each touched part. The owner runs them and
        reports back.
     8. Wait for "commit and merge", then fast-forward `develop` and delete the branch. No push
        unless asked.
     9. Anything found after the merge becomes a new branch.

     A change to the sheet contract (write behaviour, headers, tab names) updates `ui/` and
     `cli/` on the same branch under one spec. Say plainly when a change needs a manual sheet
     step. Releases are web-only and point to `ui/CLAUDE.md`.
   - `ui/CLAUDE.md`: Vue stack, OAuth in the browser, `.env.local` pointing at the sheet copy,
     adding a form, phone-first UI, mock review, release steps, the checks
     (`yarn format && yarn lint && yarn check && yarn build && yarn test`), and the pre-merge
     check: log runs against the sheet copy.
   - `cli/CLAUDE.md`: uv only, Python 3.14, the service account in `config/`, `watch` on the
     homeserver via `start.sh` / `stop.sh` and `data/watch.log`, `FakeSheets` and
     `httpx.MockTransport` in tests, the checks (`uv run pytest`), and the pre-merge check: a
     `watch` run on the homeserver or shell commands.
   - Neither part's `CLAUDE.md` repeats the flow or the sheet contract. Each section lives in one
     place only. The old cross-repo lines ("same change in `../shiniri`", "port of the web app's
     `tabWriter.ts`" as a pointer to another repo) become in-repo paths.
5. **READMEs.**
   - Root `README.md`: one paragraph on shiniri (NIKKE progress logged into one Google Sheet),
     the two parts with one line each, the layout, the Netlify badge and live URL, and links to
     `ui/README.md` and `cli/README.md`.
   - `ui/README.md`: today's web README with commands run from `ui/` and the Deploy section set
     to base directory `ui`.
   - `cli/README.md`: today's CLI README with a homeserver install section using a sparse clone
     (below). "The shiniri web app" becomes a link to `../ui/`.
6. **Netlify.** Commit a root `netlify.toml` with the restructure:

   ```toml
   [build]
     base = "ui"
     command = "yarn build"
     publish = "dist"
   ```

   The file travels with each commit, so `main`, `develop` and any branch deploy each build with
   the layout they actually have. There is no cutover moment. Clear the base, build and publish
   fields in the Netlify UI so the file is the only source; that is a manual step for the owner.
   Netlify skips a build when nothing under the base directory changed, so CLI-only pushes don't
   redeploy. Confirm that on the first CLI-only push.
7. **Homeserver switch (manual, owner, after merge to `develop` and push).** Only `start.sh` runs
   there. There is no cron, systemd unit or pull job.
   1. `./stop.sh` in the old `shiniri-cli` checkout.
   2. Next to the old checkout:
      `git clone --filter=blob:none --sparse https://github.com/alvarodwi/shiniri && cd shiniri && git sparse-checkout set cli && git checkout develop`.
   3. Copy into `shiniri/cli/`:
      - `data/raw/json/` (the source of truth; `union/` is the only copy of past seasons)
      - `config/service-account.json`, `config/sheets.json` and `config/cookie.txt`. These are
        not in `data/` and can't be rebuilt without redoing the Google setup.

      Then `chmod 600` the key. Everything else in `data/` rebuilds itself: parsed CSVs come from
      raw, and exports from searches. `daily.json` resets, and the sheet's column-A check stops a
      second row for the day.
   4. Point ambil's `cookieExportPath` at the new `cli/config/cookie.txt`.
   5. `cd cli && ./start.sh`, then check that `data/watch.log` shows a check with no errors.
   6. Once a full game day has logged in the new checkout, the owner deletes the old one.
8. **Local machine.** Move the untracked `.env.local` into `ui/`, run `yarn install` in `ui/`,
   and delete the old root `node_modules/` and `dist/`. Re-index CodeGraph at the root. The old
   `~/files/git/shiniri-cli` folder is kept until the homeserver switch is confirmed.
9. **Archive.** After the homeserver switch, add a one-line pointer to the new repo in
   `shiniri-cli`'s README and archive it on GitHub.

## Constraints

- Paths in the CLI resolve relative to the package (`cli.py`: data lives two levels above
  `src/shiniri_cli/`), and `start.sh` does `cd "$(dirname "$0")"`. Both work unchanged under
  `cli/`. Running all checks after the move proves it.
- Checks after the move: `cd ui && yarn format && yarn lint && yarn check && yarn build && yarn test`,
  and `cd cli && uv run pytest`.
- Owner rules still hold: no commit until the owner says so, no push unless asked.

## Calls made (owner can override)

- **Three commits, approved by the owner for this branch only.** History needs a merge commit,
  so "one commit on the feature branch" can't hold here. The commits are: (1) restructure into
  `ui/`; (2) the unrelated-history merge of `cli/`; (3) docs moved to the root, plus `CLAUDE.md`,
  READMEs, `CONTRIBUTING.md`, `netlify.toml` and the root `.gitignore`. Then `develop`
  fast-forwards to the branch. The fresh reviewer reads commits 1 and 3. Commit 2 is a pure
  import, so they check it only by running `cd cli && uv run pytest` and diffing the tree against
  the old repo.
- **The homeserver keeps tracking `develop`,** as it does today. `main` and releases stay
  web-only.
- **`CONTRIBUTING.md` moves to the root.** Its branch and commit rules now cover both parts. Its
  checks and release steps say they are for `ui/`.
- **`.codegraph/`, `.superpowers/` and `.obsidian/` are ignored at the root.**
- **`netlify.toml` at the root instead of a manual base-directory change.** It removes the timing
  problem between `main` and `develop` layouts.
- **The restructure ships to `main` right after the merge, as a patch release** (`0.3.2`), so
  `main` and `develop` don't sit on different layouts.
- **Prettier covers `ui/` only.** `yarn format` and `yarn check` run from `ui/`, so root docs
  and Markdown are no longer formatted. That keeps the imported CLI specs untouched, as the
  non-goal requires. Root `CLAUDE.md` and `CONTRIBUTING.md` say so.

## Left to the builder

- Exact wording of the split `CLAUDE.md` files and READMEs, within the split above.
- Whether `git mv` happens before or after the CLI merge, as long as the result matches the
  target layout.
