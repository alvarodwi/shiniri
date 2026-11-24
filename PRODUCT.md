# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A single owner, the developer, logging NIKKE (gacha game) farming progress, mostly on a phone and sometimes on desktop. No other users today.

## Product Purpose

shiniri turns NIKKE progress into rows in one Google Sheet. The web app (`ui/`) is the input surface: fast forms for pulls, anomaly runs, gear, molds, levels, spending, social, solo raid and more. The Python CLI (`cli/`) covers the same sheet from a homeserver. Success is fast, correct entry with the sheet staying the source of truth.

## Positioning

A personal, backend-less logger: browser OAuth writes straight to the owner's own sheet through an append-only, audit-logged writer. No hosted copy of the data exists.

## Operating Context

- Vue 3 SPA, hash routing, no backend, deployed by Cloudflare from `main`.
- Writes go to Google Sheets via browser OAuth. In dev, `yarn dev:mock` runs against a fake in-memory sheet.
- Used between or during game sessions, usually one-handed on a phone.

## Capabilities and Constraints

- The Google Sheet is the only source of truth. No local cache of log data (no localStorage or IndexedDB rows).
- Append-only writes through `writeTabsAtEnd`; sheet strings (tab names, headers) must match the sheet verbatim.
- Phone-first, uncluttered pages, every input labeled, sheet links hidden on small screens, no long lists of logged items.
- Stack: Vue 3, Vite, UnoCSS, Pinia, Phosphor icons.

## Brand Commitments

- The mascot Yan (`ui/public/img/yan-*.webp`) is part of the app's identity.
- NIKKE item, boss and costume art is used as data imagery.

## Evidence on Hand

- Yan mascot images, item/boss/icon art under `ui/public/img/`.
- Existing pages and state docs in `docs/state/`. No DESIGN.md yet.

## Product Principles

- The sheet is truth; the UI never becomes a second store.
- Entry speed on a phone beats feature breadth.
- Never risk existing logged data: append-only, check before write.
- Keep pages sparse; browsing history belongs to a future dashboard.

## Accessibility & Inclusion

- One-handed phone use: thumb-reachable controls, fast entry.
- Dark mode supported.
- Respect `prefers-reduced-motion`.
