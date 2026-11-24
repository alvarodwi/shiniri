# Shop polish: theme toggle, body font, DESIGN.md

Follow-up to the "merchant's counter" restyle (lacquer shell, account-book pages, vermilion seal).
Owner approved approaches 2B and 3A on 2026-11-24, and asked for a DESIGN.md rewrite.

## Intent

The restyle shipped as an initial draft. Two gaps found while using it:

- Light and dark follow the OS only; the owner wants to switch by hand.
- Zen Antique (serif titles) clashes with the system sans below it, and the `新入り` tag has no
  Japanese font behind it.

Mock mode was also raised. It needs no change: `authStore.signIn()` already signs straight in under
`__MOCK__`, and all 8 routes and 6 pull forms load in mock. An earlier note in this thread said
otherwise; that was wrong.

## Goals

- A light/dark toggle in the header that persists across reloads.
- One body face that sits with Zen Antique, with real Japanese glyphs for `新入り`.

## Non-goals

- No `yan-burst` placement beyond the existing sign-in hero (a future view-only mode will use it).
- No per-page icon placement; the owner does that per feature, using `FieldLabel`.
- No webp shrinking (owner does it).
- Not shipping the full Japanese character set.

## Anti-goals

- The toggle must not flash the wrong theme on load.

## Approaches considered

1. Theme toggle: A three-state System/Light/Dark; **B** two-state light/dark (chosen). The owner
   gave up OS-follow once toggled in exchange for a simpler control.
2. Body font: **A** Zen Kaku Gothic New (chosen); B Zen Maru Gothic (softer, worse for dense
   number entry); C keep system sans.

## Design

**Theme (2B).**
- `uno.config.ts`: `presetWind3({ dark: 'class' })`, so `dark:` utilities key off a `dark` class on
  `<html>`. Dark CSS variables (`--gold`, `--err`) in `src/styles/shop.css` move from the media
  query to `:root.dark`.
- First visit with nothing stored follows the OS (`prefers-color-scheme`), because there is no
  third state to show. After the first tap the stored choice wins.
- An inline script in `index.html` sets the class before first paint from `localStorage`, falling
  back to the OS. Storage access sits in try/catch, like `pullForms.ts`.
- `ui/src/composables/useTheme.ts` (or `utils/theme.ts`): `isDark`, `toggle()`, persists under
  `shiniri.theme`. The header gets a 44px icon button (sun in dark, moon in light) with an
  `aria-label` and `aria-pressed`.
- `color-scheme` follows the class so native inputs and date pickers match.

**Font (3A).**
- Fetch Zen Kaku Gothic New (400, 700) Latin, self-hosted like Zen Antique.
- Japanese: subset only the glyphs in use (`新入り`) through the Google Fonts `text=` parameter,
  self-hosted as a small woff2. Used for the `新入り` tag (and Zen Antique's fallback where
  needed). Adding Japanese copy later means re-subsetting; note this in a comment next to the
  `@font-face`.
- `body` font-family becomes Zen Kaku Gothic New, then the system sans.
- Labels, inputs and body copy stay in the sans. Zen Antique stays on the wordmark and page
  titles; section headings (`h3`) get it only if the owner asks.

**DESIGN.md rewrite (added by the owner).**
- `DESIGN.md` still describes the old flat paper-and-ink ledger ("The Ledger Page", no radius, no
  shadow, salmon-only accent, system font, Yan unplaced). It is stale against the restyle.
- Last task, after the two changes above ship: run `impeccable document`, so the file is
  derived from the built code (tokens in `uno.config.ts` and `src/styles/shop.css`, the shell in
  `App.vue`, `FieldLabel`, the seal button) and not from intentions. This replaces the existing
  file, so show the owner the current file and take the refresh/overwrite/merge choice first, as
  the command requires. It also writes the `.impeccable/design.json` sidecar.
- It must record the new rules: lacquer shell, brass gold, vermilion seal, Zen Antique for
  display only, Zen Kaku Gothic New for body, class-based dark mode with a toggle, Yan in the
  header and the sign-in hero.
- Also update `PRODUCT.md` Evidence on Hand ("No DESIGN.md yet" is wrong). Run `impeccable doctor`
  only if the owner asks; this change does not repair other drift.

## Constraints

- Log data is never stored locally (project rule). `shiniri.theme` is a UI preference, the same
  kind as `shiniri.pullForm`.
- 44px touch targets, `prefers-reduced-motion` respected, contrast ≥ 4.5:1 for body text in both
  themes.

## Verification

- `yarn format && yarn lint && yarn check && yarn build && yarn test` from `ui/`.
- Headless screenshots of one form page in light and dark, plus the sign-in screen, at 390px.
- A small unit test for the theme helper (stored value, OS fallback, blocked storage).
- `DESIGN.md` has token-bearing frontmatter that matches `uno.config.ts`, and
  `.impeccable/design.json` exists.

## Left to the builder

File placement for the theme helper, the exact sun/moon icon names (Phosphor), and the glyph
subset command.
