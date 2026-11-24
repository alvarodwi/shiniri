# Shop polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a light/dark toggle, swap the body font for Zen Kaku Gothic New with a `新入り` glyph subset, then rewrite `DESIGN.md` from the built result.

**Architecture:** Dark mode moves from the OS media query to a `dark` class on `<html>`, set before first paint by an inline script and flipped by a header button backed by a small `utils/theme.ts`. The font is self-hosted woff2 loaded through `src/styles/shop.css`. `DESIGN.md` is written last by `impeccable document`.

**Tech Stack:** Vue 3, UnoCSS (`presetWind3` dark option), Vitest + happy-dom, Phosphor icons via `presetIcons`.

**Spec:** `docs/plans/2026-11-24-shop-polish-design.md`

## Global Constraints

- Run from `ui/`: `yarn format && yarn lint && yarn check && yarn build && yarn test`.
- `localStorage` key is `shiniri.theme`; values `light` | `dark`. Storage access is wrapped in try/catch (see `src/services/gacha/pullForms.ts`).
- 44px touch targets; honor `prefers-reduced-motion`; body text contrast ≥ 4.5:1 in both themes.
- Real log data is never stored locally; the theme key is a UI preference only.
- Japanese glyph subset covers only `新入り`; leave a comment saying new Japanese copy needs a re-subset.
- Do not commit unless the owner asks (user rule). The commit steps below are for the owner's go-ahead.

## Review Focus

- Stored value is garbage (`"blue"`): falls back to the OS preference, never throws.
- `localStorage` access throws (blocked site data): toggle still flips for the session.
- OS is dark, nothing stored: page renders dark on first paint, no light flash.
- Toggle pressed twice returns to the start theme and writes `light`/`dark` each time.
- `新入り` renders in the subset font, not a fallback box, in both themes.

---

### Task 1: Theme toggle

**Files:**
- Create: `ui/src/utils/theme.ts`, `ui/src/utils/theme.test.ts`
- Modify: `ui/uno.config.ts`, `ui/src/styles/shop.css`, `ui/index.html`, `ui/src/App.vue`

**Interfaces:**
- Produces in `utils/theme.ts`:
  - `export type Theme = 'light' | 'dark'`
  - `export function readTheme(prefersDark: boolean, storage?: Pick<Storage, 'getItem'>): Theme`
  - `export function saveTheme(theme: Theme, storage?: Pick<Storage, 'setItem'>): void`
  - `export function applyTheme(theme: Theme, root?: HTMLElement): void` (toggles the `dark` class on `root`, default `document.documentElement`)
  - `export function useTheme(): { theme: Ref<Theme>; toggle: () => void }`

- [ ] **Step 1: Write failing tests in `utils/theme.test.ts`**
  - `readTheme` returns `'dark'` for a stored `'dark'` even when `prefersDark` is false.
  - `readTheme(true, { getItem: () => null })` returns `'dark'`; `readTheme(false, ...)` returns `'light'`.
  - `readTheme(true, { getItem: () => 'blue' })` returns `'dark'` (garbage falls back to the OS).
  - `readTheme(false, { getItem: () => { throw new Error('blocked') } })` returns `'light'`.
  - `saveTheme('dark', { setItem: () => { throw new Error('blocked') } })` does not throw.
  - `applyTheme('dark', el)` adds the `dark` class; `applyTheme('light', el)` removes it.
- [ ] **Step 2: Run** `yarn vitest run src/utils/theme.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `utils/theme.ts`** per the interfaces. `useTheme` seeds `theme` from `readTheme(matchMedia('(prefers-color-scheme: dark)').matches)`, applies it, and `toggle()` flips, applies and saves.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Switch dark mode to a class.** In `uno.config.ts` use `presetWind3({ dark: 'class' })`. In `shop.css` move the `--gold` / `--err` dark values from the `@media (prefers-color-scheme: dark)` block into `:root.dark`, and set `color-scheme: light` on `:root` and `color-scheme: dark` on `:root.dark`.
- [ ] **Step 6: Pre-paint script.** In `index.html`, add an inline `<script>` in `<head>` that reads `localStorage.shiniri.theme` (in try/catch), falls back to `matchMedia('(prefers-color-scheme: dark)')`, and adds the `dark` class to `documentElement`. Comment that it mirrors `readTheme`.
- [ ] **Step 7: Header button in `App.vue`.** Add a 44px button before Sign out: `aria-label="Switch to dark theme"` / `"Switch to light theme"` (matches the current state), icon `i-ph-moon-duotone` in light and `i-ph-sun-duotone` in dark, shown also when signed out (it must work on the sign-in screen). Place it so it does not collide with the Yan portrait at 390px.
- [ ] **Step 8: Verify.** `yarn check && yarn lint && yarn build && yarn test`; `yarn dev:mock`, toggle, reload, confirm it sticks. Screenshot `#/journal/gear` at 390px in both themes with `impeccable shot` (set the class by toggling, not the OS).
- [ ] **Step 9: Commit (when asked)** `feat: add light/dark theme toggle`.

---

### Task 2: Body font with Japanese glyphs

**Files:**
- Create: `ui/src/assets/fonts/zen-kaku-gothic-new-*.woff2` (latin 400, latin 700, ja subset)
- Modify: `ui/src/styles/shop.css`

**Interfaces:**
- Consumes: the `body` rule and `.shop-title` in `shop.css`.
- Produces: `font-family: 'Zen Kaku Gothic New'` as the body face; `新入り` renders from the subset.

- [ ] **Step 1: Fetch Latin.** From `ui/`: `impeccable font-fetch "Zen Kaku Gothic New" --weights 400,700 --out src/assets/fonts`, then add the printed `@font-face` rules to `shop.css`, `src` paths as `@/assets/fonts/...` like Zen Antique's.
- [ ] **Step 2: Fetch the `新入り` subset.** Request `https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;700&text=%E6%96%B0%E5%85%A5%E3%82%8A` with a modern browser User-Agent, download the returned woff2 file(s) into `src/assets/fonts/`, and add `@font-face` rules with `unicode-range: U+65B0, U+5165, U+308A`. Comment: only these glyphs ship; re-subset when adding Japanese copy.
- [ ] **Step 3: Apply.** `body { font-family: 'Zen Kaku Gothic New', system-ui, sans-serif }`. The `新入り` span in `App.vue` keeps `lang="ja"`.
- [ ] **Step 4: Verify.** `yarn build`; screenshot a form page and the header at 390px; confirm the tag shows real glyphs and labels read cleanly at 14px, and numeric inputs keep tabular figures.
- [ ] **Step 5: Commit (when asked)** `feat: use Zen Kaku Gothic New for body text`.

---

### Task 3: Rewrite DESIGN.md

**Files:**
- Modify: `DESIGN.md` (repo root), `PRODUCT.md` (Evidence on Hand line), `.impeccable/design.json`

- [ ] **Step 1: Show the owner the current `DESIGN.md`** and ask refresh, overwrite or merge (required by `impeccable document`). Recommend overwrite: the file describes the discarded flat ledger.
- [ ] **Step 2: Run `impeccable document`** per its reference, after Tasks 1 and 2 are merged into the working tree, so it reads the built code.
- [ ] **Step 3: Check the result.** Frontmatter tokens match `uno.config.ts` (cream, charcoal, lacquer, seal, gold, accent); it records: lacquer shell, brass gold, vermilion seal, Zen Antique display only, Zen Kaku Gothic New body, class-based dark mode with toggle, Yan in the header and sign-in hero, `FieldLabel` coin icons, the "no hard offset shadow" decision (seal uses a thick bottom border instead). `.impeccable/design.json` exists.
- [ ] **Step 4: Fix `PRODUCT.md`** Evidence on Hand: replace "No DESIGN.md yet." with a pointer to `DESIGN.md`.
- [ ] **Step 5: Commit (when asked)** `docs: rewrite DESIGN.md for the merchant's counter`.
