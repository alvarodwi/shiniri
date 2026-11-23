# Move UI deployment from Netlify to Cloudflare Pages

## Intent

Netlify's free tier now puts a watermark on the deployed site. Cloudflare Pages' free tier has no such banner. Move the `ui/` deployment there.

## Goals

- `ui/` deploys to Cloudflare Pages when `main` is pushed, as it does on Netlify today.
- The release flow in `ui/CLAUDE.md` keeps its shape.
- Google sign-in works on the new `*.pages.dev` origin.

## Non-goals

- No custom domain.
- No server logic, Workers, or Cloudflare features beyond static hosting.
- No change to the sheet contract or to `cli/`.

## Constraints

- The app is a hash-routed SPA (`createWebHashHistory`), so no redirect or rewrite rules are needed. No `_redirects` or `_headers` file exists.
- The UI uses Yarn 4 (`packageManager: yarn@4.18.1`). The Cloudflare build may need Corepack enabled.
- Releases are web-only and go through `main`.

## Approaches

1. **Pages with git integration (chosen).** Connect the repo in the dashboard. No repo code, workflow, or secret is added.
2. Workers static assets, git-connected. Adds a `wrangler.toml` for a SPA that needs no server logic. Rejected as extra config.
3. GitHub Action plus `wrangler pages deploy`. Adds a workflow file and an API token secret for no gain over option 1. Rejected.

## Design

Dashboard settings for the Pages project (manual, done by the owner):

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | `ui` |
| Build command | `yarn build` |
| Output directory | `dist` |

Repo changes:

- Delete `netlify.toml`.
- Reword the Netlify mentions in `CLAUDE.md` (line 5) and `ui/CLAUDE.md` (line 5, and Release step 3) to say Cloudflare Pages deploys from `main`, with build settings in the dashboard.

Manual steps, in order:

1. Create the Pages project and run the first build. If the Yarn 4 build fails, set the Corepack build variable in the dashboard. The exact variable name is checked against the docs at that point.
2. Add the new `https://<project>.pages.dev` origin to the Google OAuth client's authorized JavaScript origins. Do this on the real project before release. Keep the Netlify origin until Netlify is shut down.
3. Open the new site, sign in, and confirm one read from the sheet.
4. Once the new site works, disable or delete the Netlify site.

## Left to the builder

- Exact Corepack variable name, if the first build fails.
- Wording of the doc edits.

## Update 2026-11-23

Cloudflare's git setup now deploys through Workers static assets, not classic Pages, and has no output-directory field. The site is live at <https://shiniri.varoa-dwi.workers.dev/> with no wrangler file in the repo, so the "no new repo files" constraint holds. The OAuth origin is the `workers.dev` URL, not `*.pages.dev`. Wording above that says Pages, `pages.dev` or an output directory is superseded by this note; the repo docs are the current record.
