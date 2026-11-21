# Contributing

This repo holds two parts: `ui/` (web app) and `cli/` (CLI). Branch and commit rules cover both.

## Branches

- `develop` is the integration branch. Branch `feat/<name>` or `fix/<name>` from it and merge back
  into it.
- `main` is production for the web app. Netlify builds and deploys every push to `main` that
  changes `ui/`.
- The CLI ships by the homeserver pulling `develop`. It has no release step.

## Commits

Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.

## Checks

- Web app, from `ui/`: `yarn format && yarn lint && yarn check && yarn build && yarn test`. For
  changes that write to the sheet, also log a few runs against a **copy** of the journal and
  confirm the rows land directly below the existing data, with nothing else changed.
- CLI, from `cli/`: `uv run pytest`.

## Release (web app only)

The steps are in `ui/CLAUDE.md`, under "Release".
