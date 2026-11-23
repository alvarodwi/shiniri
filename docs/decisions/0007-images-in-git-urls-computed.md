# 0007 Images committed to git, CDN URLs computed

## Context
The UI shows NIKKE, costume and resource icons. The game CDN hashes its URLs.

## Decision
- A Python tool (`cli/tools/assets.py`) downloads the images and commits them as WebP under
  `ui/public/img/`. Only the small `si` icon per NIKKE and the `mi` costume image are kept.
- URLs are computed from plain paths (`cdn_url`) with no fallback to old hashed URLs, so a site change
  fails loudly instead of quietly keeping stale data.

## Rejected
- Downloading images during the deploy build (every deploy would depend on the CDN) and loading them
  from the CDN at runtime (CDN load, and a TypeScript port of `cdn_url`).
- Reading the hash constants from the site's minified JS (brittle).
- Committing only owned costumes: each ticked `owned` would need a tool run and a deploy.
- Full-art images: shelved.
