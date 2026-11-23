# Cloudflare Pages Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Netlify from the repo and document Cloudflare Pages as the `ui/` host.

**Architecture:** Cloudflare Pages git integration is configured in the dashboard by the owner, so the repo only loses `netlify.toml` and gets its docs reworded. No app code changes.

**Tech Stack:** Markdown docs only. The UI builds with Yarn 4, Vite and Vue.

**Spec:** `docs/superpowers/specs/2026-11-23-cloudflare-pages-design.md`

## Global Constraints

- Production branch: `main`. Root directory: `ui`. Build command: `yarn build`. Output directory: `dist`.
- No new repo files for deployment: no `wrangler.toml`, no workflow, no secrets.
- No custom domain; the host is `*.pages.dev`.
- Do not commit unless the owner asks.

## Review Focus

- Leftover "Netlify" text in any tracked file outside `docs/superpowers/` (checked by the grep in Task 1).
- The OAuth origin: sign-in breaks on the new site if the `*.pages.dev` origin is missing from the Google OAuth client (manual task, Task 2).
- Yarn 4 build failing on Cloudflare's image (Task 2, step 2).

---

### Task 1: Remove Netlify from the repo

**Files:**
- Delete: `netlify.toml`
- Modify: `CLAUDE.md:5`
- Modify: `ui/CLAUDE.md:5-6` and `ui/CLAUDE.md:45`

- [ ] **Step 1: Delete `netlify.toml`**

Run: `git rm netlify.toml`. The file only holds `base = "ui"`, `command = "yarn build"`, `publish = "dist"`, which move to the dashboard.

- [ ] **Step 2: Edit `CLAUDE.md:5`**

Change `deployed by Netlify` to `deployed by Cloudflare Pages`.

- [ ] **Step 3: Edit `ui/CLAUDE.md:5-6`**

Replace "Netlify deploys from `main`, with build settings in `../netlify.toml`." with "Cloudflare Pages deploys from `main`, with build settings in the Pages dashboard (root directory `ui`, build command `yarn build`, output directory `dist`)."

- [ ] **Step 4: Edit `ui/CLAUDE.md:45`**

Change "Netlify deploys from `main`." to "Cloudflare Pages deploys from `main`."

- [ ] **Step 5: Verify**

Run: `grep -rIn -i netlify --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=docs .`
Expected: no output. Also `git status` shows `netlify.toml` deleted.

### Task 2: Owner's manual steps (not done by Claude)

Order matters. Do these before pushing the doc changes to `main`.

- [ ] **Step 1: Create the Pages project.** Cloudflare dashboard, Workers & Pages, Create, Pages, connect the repo. Use the Global Constraints values. Run the first build.
- [ ] **Step 2: If the build fails on Yarn 4,** set the Corepack build variable in the dashboard. Claude checks the exact variable name against the docs at that point.
- [ ] **Step 3: Add the `https://<project>.pages.dev` origin** to the Google OAuth client's authorized JavaScript origins. Keep the Netlify origin for now.
- [ ] **Step 4: Verify.** Open the new site, sign in, and confirm one read from the sheet.
- [ ] **Step 5: Shut down the Netlify site** once Step 4 passes.

## Update 2026-11-23

Cloudflare's git setup now deploys through Workers static assets, not classic Pages, and has no output-directory field. The site is live at <https://shiniri.varoa-dwi.workers.dev/> with no wrangler file in the repo, so the "no new repo files" constraint holds. The OAuth origin is the `workers.dev` URL, not `*.pages.dev`. Wording above that says Pages, `pages.dev` or an output directory is superseded by this note; the repo docs are the current record.
