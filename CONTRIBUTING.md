# Contributing

## Branches

- `develop` is the integration branch. Branch `feat/<name>` or `fix/<name>` from it and merge back
  into it.
- `main` is production. Netlify builds and deploys every push to `main`.

## Commits

Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.

## Checks

`yarn format && yarn lint && yarn check && yarn build && yarn test`. For changes that write to the
sheet, also log a few runs against a **copy** of the journal and confirm the rows land directly
below the existing data, with nothing else changed.

## Release

1. Run the checks on `develop`, then push `develop`.
2. Merge `develop` into `main`.
3. Bump `version` in `package.json` and commit `chore: bump to version X.Y.Z`.
4. Push `main`. Netlify deploys from it.
5. Merge `main` back into `develop` and push it, so both carry the bump.
6. Delete merged branches, local and remote.
