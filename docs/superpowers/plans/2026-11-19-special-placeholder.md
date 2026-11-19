# Special Placeholder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A display-only `/special` page with a frozen banner and a disabled form.

**Architecture:** One page component, one route, one nav link. No store, no sheet access.

**Tech Stack:** Vue 3, UnoCSS.

**Spec:** `docs/superpowers/specs/2026-11-19-special-placeholder-design.md`

## Global Constraints

- Banner copy and field labels exactly as in the spec. Every control `disabled`.
- Checks: `yarn format && yarn lint && yarn check && yarn build && yarn test`.

## Review Focus

- The page must not import any store or sheet service (it can never write). Checked by review; no
  logic exists to unit-test.

---

### Task 1: Special page

**Files:** Create `src/pages/Special.vue`; modify `src/router/index.ts` (`/special`), `src/App.vue`
(nav link "Special" after Gear).

- [ ] Page follows `Gear.vue` layout: heading, banner (`role="note"`), a `<fieldset disabled>` with
      labelled inputs (date, boss, T9 equipment, modules, T9 manufacturer, empty), disabled "Frozen"
      button in the fixed bar.
- [ ] Run full checks → PASS.
