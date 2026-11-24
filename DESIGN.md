---
name: Shiniri
description: Stark paper-and-ink phone forms for logging NIKKE progress into a Google Sheet.
colors:
  cream: "#fdfcf9"
  charcoal: "#27262a"
  accent: "#d48275"
  accent-ink: "#c14e3c"
typography:
  display:
    fontFamily: "system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.4
  body:
    fontFamily: "system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.33
rounded:
  none: "0px"
spacing:
  sm: "8px"
  md: "12px"
  lg: "16px"
components:
  button-primary:
    backgroundColor: "{colors.charcoal}"
    textColor: "{colors.cream}"
    rounded: "{rounded.none}"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.charcoal}"
    rounded: "{rounded.none}"
    height: "44px"
  tap-selected:
    backgroundColor: "{colors.charcoal}"
    textColor: "{colors.cream}"
    size: "44px"
  cell-picked:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.charcoal}"
---

# Design System: Shiniri

## Overview

**Creative North Star: "The Ledger Page"**

Shiniri looks like a printed ledger: cream paper, charcoal ink, hairline rules, square corners. Nothing decorates; every control is an outlined box you can hit with a thumb. The sheet is the product, so the UI stays out of its way and reads as a form someone filled in by hand.

Density is low and vertical. One column, labels above inputs, a pinned Save bar at the bottom. Dark mode swaps paper and ink rather than introducing new colors. Salmon appears only to mark a picked grid cell or an error.

The Yan mascot is a binding brand commitment (PRODUCT.md) but is not yet placed in any shipped screen; where it lands is undecided.

**Key Characteristics:**
- Two-tone paper/ink with one salmon accent used sparingly.
- Square corners, 1px borders, no shadows.
- 44px minimum touch targets; 48px for Save.
- System font stack, small type (14px body), bold for page titles.
- Phone-first single column, `max-w-xl` centered on desktop.

## Colors

A cream-and-charcoal pair carries the whole app; salmon is a rare signal.

### Primary
- **Charcoal Ink** (#27262a): all text, borders, primary button fill, selected tap fill. In dark mode it becomes the page background.

### Secondary
- **Salmon Fill** (#d48275): background of a picked cell in gear and class-slot grids, paired with charcoal text and a Brick Ink border.
- **Brick Ink** (#c14e3c): error and hint text, and the border of a picked cell.

### Neutral
- **Warm Cream** (#fdfcf9): page background and secondary button fill. In dark mode it becomes the text color.
- **Soft Ink** (charcoal at 75% / 20%): secondary text and hairline rules.

### Named Rules
**The Swap Rule.** Dark mode inverts cream and charcoal through the `paper`/`ink` shortcuts. Never add a third dark surface color.
**The Rare Salmon Rule.** Salmon marks selection in a grid or an error, nothing else. It is never a button fill or decoration.

## Typography

**Display Font:** system sans (reset default; renders Noto Sans on Linux)
**Body Font:** same
**Label/Mono Font:** none

**Character:** Plain and utilitarian. Hierarchy comes from weight and size only.

### Hierarchy
- **Display** (700, 1.25rem): page title (`Anomaly`, `Log`) and `Shiniri` wordmark at 1.125rem.
- **Title** (600, 0.875rem): section labels, active nav link (underlined).
- **Body** (400, 0.875rem): inputs, labels, list rows.
- **Label** (400, 0.75rem): version tag, hints, error hints, grid column headers.

### Named Rules
**The Underline Is Active Rule.** The current nav item is semibold and underlined; inactive items are soft ink. No pills or tabs.

## Layout

Single column, `max-w-xl` centered, 16px side padding. Header wraps: wordmark, version, group nav, Sign out pushed right. A second nav row lists the group's pages. Section blocks separate with hairline rules, not cards. The Save button is pinned to the bottom of the viewport on form pages. Spacing steps in use: 8, 12, 16px. Sheet links are hidden on small screens.

## Elevation & Depth

Flat. No shadows. Depth is conveyed only by 1px charcoal outlines on interactive controls and 20% hairlines on structure. The mock banner is a solid charcoal strip.

### Named Rules
**The Flat Rule.** No shadow, blur or gradient anywhere. State changes are fills (selected) or a 1px press nudge.

## Shapes

Square everywhere: 0 radius on buttons, inputs, selects, taps and grid cells. Borders are 1px solid charcoal (`rule-ink`) on controls and charcoal at 20% (`rule`) on dividers. Tap groups are 44px squares, 8px apart.

## Components

### Buttons
- **Shape:** square, 1px charcoal border for secondary.
- **Primary:** charcoal fill, cream text, full width, min-height 48px, semibold; disabled at 40% opacity (Save bar).
- **Secondary:** cream fill, charcoal border, min-height 44px, 12px horizontal padding (Sign out, Refresh).
- **Hover / Focus:** 2px offset charcoal (cream in dark) outline on `:focus-visible`; active state nudges down 1px over 150ms, disabled under reduced motion.

### Tap groups (module count, manufacturer)
- **Style:** 44px square outlined buttons, `aria-pressed`; selected inverts to charcoal fill with cream text.

### Grid cells (gear, class slots)
- **State:** empty is outlined; picked is Salmon Fill with charcoal text and Brick Ink border.

### Inputs / Fields
- **Style:** cream fill, 1px charcoal border, min-height 44px, labels above in 14px. Selects and date inputs are native controls.
- **Focus:** the shared 2px offset outline.
- **Error:** Brick Ink hint text (12px) below the field, linked by `aria-describedby`.

### Navigation
- Two text-link rows, 44px tall, no backgrounds; active is underlined semibold.

### Mock banner
- Full-width charcoal strip, cream centered 14px text. Appears only under `dev:mock`.

## Do's and Don'ts

### Do:
- **Do** use the `paper`, `ink`, `ink-soft`, `rule`, `rule-ink`, `focus`, `press` shortcuts from `uno.config.ts` for every surface.
- **Do** keep touch targets at 44px or more and Save at 48px.
- **Do** keep pages sparse: one column, labels above inputs.
- **Do** honor `prefers-reduced-motion` (`motion-reduce:transition-none`).

### Don't:
- **Don't** add border radius, shadows, gradients or blur.
- **Don't** use salmon as a button fill or decoration.
- **Don't** introduce a third surface color in dark mode.
- **Don't** list logged history on form pages; that belongs to a future dashboard.
