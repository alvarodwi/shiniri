---
name: Shiniri
description: A merchant's counter for logging NIKKE progress: lacquer shell, account-book pages, a vermilion seal for Save.
colors:
  cream: "#f6eedd"
  charcoal: "#241719"
  lacquer: "#170d0f"
  seal: "#c23a24"
  seal-edge: "#8e2514"
  seal-text: "#fff6e6"
  gold-on-paper: "#8f6410"
  gold-on-lacquer: "#e3b347"
  error-on-paper: "#b3301c"
  error-on-lacquer: "#ff9078"
  accent: "#d48275"
typography:
  display:
    fontFamily: "Zen Antique, Noto Serif JP, serif"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "0.025em"
  wordmark:
    fontFamily: "Zen Antique, Noto Serif JP, serif"
    fontSize: "1.875rem"
    fontWeight: 400
    lineHeight: 1
  body:
    fontFamily: "Zen Kaku Gothic New, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.4
  title:
    fontFamily: "Zen Kaku Gothic New, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1.4
  label:
    fontFamily: "Zen Kaku Gothic New, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.33
rounded:
  none: "0px"
  seal: "6px"
  coin: "9999px"
spacing:
  sm: "8px"
  md: "12px"
  lg: "16px"
components:
  button-seal:
    backgroundColor: "{colors.seal}"
    textColor: "{colors.seal-text}"
    rounded: "{rounded.seal}"
    height: "48px"
  button-seal-disabled:
    backgroundColor: "{colors.seal}"
    textColor: "{colors.seal-text}"
  header-shell:
    backgroundColor: "{colors.lacquer}"
    textColor: "{colors.cream}"
  coin-icon:
    textColor: "{colors.gold-on-paper}"
    rounded: "{rounded.coin}"
    size: "28px"
  tap-selected:
    backgroundColor: "{colors.seal}"
    textColor: "{colors.cream}"
    size: "44px"
  cell-picked:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.charcoal}"
---

# Design System: Shiniri

## Overview

**Creative North Star: "The Merchant's Counter"**

Shiniri is a shop counter at night. The shell is black lacquer with a brass rule under it and Yan, the in-game merchant, behind the counter. The pages below it are account-book paper in light mode and dark lacquer in dark mode, ruled in brass. Every save is a vermilion seal pressed into the book. The name is Yan's word for the player, 新入り (rookie), and the tag sits beside the wordmark.

The app is still an Operate surface: one column, labels above inputs, 44px targets, a Save bar pinned to the bottom of the screen. The world enters through color, type, icons and one signature move (the seal), never through layout or controls.

Yan is a binding brand commitment (PRODUCT.md). She appears as a bust-up portrait in the header and as the smiling banner on the sign-in screen. The wider `yan-burst` art is reserved for a future view-only mode.

**Key Characteristics:**
- Lacquer shell, paper pages, brass rules, one vermilion seal.
- Zen Antique for display only; Zen Kaku Gothic New for everything people read and type.
- Light and dark are both first-class, switched by a header button; dark is the lantern-lit shop.
- Icons sit on gold-ringed coins beside short labels; the text stays for screen readers.
- Phone-first single column, `max-w-xl` centered on desktop.

## Colors

Two grounds, one shell, one seal. Paper and lacquer swap with the theme; the header never does.

### Primary
- **Vermilion Seal** (#c23a24): the Save button, sign-in button, selected taps and the saved stamp. It carries the action on a screen and is not used as decoration.
- **Seal Edge** (#8e2514): the seal's border, thicker on the bottom edge.
- **Seal Ink** (#fff6e6): text on the seal.

### Secondary
- **Brass Gold** (#8f6410 on paper, #e3b347 on lacquer): rules under titles and the header, the Save bar's top rule, coin rings, the active nav item and the 新入り tag. It is a CSS variable (`--gold`) that follows the theme.
- **Salmon Fill** (#d48275): a picked cell in the gear and class-slot grids, with charcoal text.

### Neutral
- **Account-Book Cream** (#f6eedd): the page in light mode; text in dark mode.
- **Charcoal Ink** (#241719): text in light mode; the page in dark mode.
- **Lacquer Black** (#170d0f): the header band in both themes.
- **Error** (#b3301c on paper, #ff9078 on lacquer): hint and error text, via `--err`.

### Named Rules
**The Seal Is The Action Rule.** Vermilion marks the one primary action or a selected state. If two vermilion things compete on a screen, one of them is wrong.
**The Brass Is Structure Rule.** Gold draws rules, rings and the active item. It is never a text fill for body copy.
**The Swap Rule.** Dark mode swaps cream and charcoal through the `paper` / `ink` shortcuts and flips `--gold` and `--err`. It adds no third page color. The header stays lacquer in both themes.

## Typography

**Display Font:** Zen Antique (with Noto Serif JP, serif)
**Body Font:** Zen Kaku Gothic New (with system-ui, sans-serif)

**Character:** an antique signboard over a clean gothic. The serif is a signboard voice, used sparingly, and the gothic does the reading and typing. Both ship as self-hosted woff2. Body ships Latin plus a glyph subset for 新入り only; adding Japanese copy means re-subsetting.

### Hierarchy
- **Wordmark** (400, 1.875rem, 1): "Shiniri" in the header.
- **Display** (400, 1.5rem, 1.25, +0.025em): page titles, with a brass rule beneath (`page-title`).
- **Title** (700, 0.875rem): section labels such as "Rate-up" and "SSR pulled".
- **Body** (400, 0.875rem, 1.4): inputs, labels, list rows.
- **Label** (400, 0.75rem): hints and grid column headers.

### Named Rules
**The Signboard Rule.** Zen Antique names things (the app, a page). It never sets a label, an input or a sentence.
**The Tabular Rule.** Numeric inputs use tabular figures so columns of counts line up.

## Layout

Single column, `max-w-xl` centered, 16px side padding, spacing steps 8, 12 and 16px. The header is a full-width lacquer band whose content is held to the same column: wordmark, 新入り, theme button, a group nav row and a section nav row. The Yan portrait sits at the top right of that column. Section blocks separate with hairline rules, not cards. The Save bar is fixed to the bottom with a brass top rule. On phones the version number is hidden to leave the theme button clear of Yan.

## Elevation & Depth

Flat. Depth is borders and rules, not shadows. The seal is the one thing with weight: a 5px bottom border that flattens to 2px and nudges down 3px on press. Yan's portrait fades out at its cropped bottom edge with a mask.

### Named Rules
**The Chop Rule.** Weight comes from a thicker border edge, never from a drop shadow. No blur, no hard offset shadow.

## Shapes

Controls are square: inputs, selects, taps and grid cells have no radius and a 1px border at 70% ink. The seal is the exception, with a 6px radius. Icons sit on round coins (28px, 1.5px brass ring).

## Components

### Seal button
- **Shape:** 6px radius, 2px seal-edge border with a 5px bottom edge, full width, 48px tall, semibold with slight tracking.
- **States:** pressing flattens the bottom edge and nudges the button 3px down; disabled drops to 45% opacity; focus is a 2px offset outline (seal on paper, gold on lacquer).
- **Saved:** the "Saved to…" line shows a seal-check icon and a stamp-in animation, skipped under reduced motion.

### Header and navigation
- **Shell:** lacquer band, brass bottom rule, cream text. The group nav and section nav are icon plus label; the active group is gold with a 2px gold underline, the active section is cream and semibold with a gold icon.
- **Sign out and theme:** icon-only 44px buttons with `aria-label`s.
- **Yan portrait:** `yan-default.webp` cropped to bust-up, decorative (`alt=""`), faded at the bottom.

### Coin icons (FieldLabel)
A Phosphor duotone icon in a gold-ringed coin before a label. `hideText` hides the text visually and keeps it for screen readers. Which fields get an icon is decided per form by the owner.

### Inputs / Fields
- **Style:** paper fill, 1px 70%-ink border, square, 44px minimum height, labels above in 14px.
- **Focus:** the shared 2px offset outline. **Error:** hint text in the error color, linked by `aria-describedby`.

### Tap groups and grid cells
- **Taps:** 44px square outlined buttons; selected fills vermilion with cream text.
- **Cells:** empty is outlined; picked is salmon with charcoal text.

### Sign-in screen
The smiling `yan-burst-smile.webp` as a 16:9 banner, a short welcome line in Zen Antique, and a seal button with the Google icon.

## Do's and Don'ts

### Do:
- **Do** use the `paper`, `ink`, `ink-soft`, `rule`, `rule-ink`, `focus`, `press`, `tap-on`, `btn-save`, `savebar` and `page-title` shortcuts from `uno.config.ts`.
- **Do** keep touch targets at 44px or more and Save at 48px.
- **Do** keep pages sparse: one column, labels above inputs.
- **Do** honor `prefers-reduced-motion`, and keep text beside every icon in the markup.
- **Do** check any new color in both themes; gold and error have separate light and dark values.

### Don't:
- **Don't** use Zen Antique for labels, inputs or running text.
- **Don't** add drop shadows, blur or gradients for depth; use a border edge.
- **Don't** use vermilion as decoration or on more than one primary action per screen.
- **Don't** introduce a third page color in dark mode.
- **Don't** list logged history on form pages; that belongs to a future dashboard.
