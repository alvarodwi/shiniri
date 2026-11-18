# Full Damage Numbers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Union damage prints `100.234.567.789 (100.2B)`; boss HP in the "stopped" recap line stays short.

**Architecture:** Split `fmt_dmg` in `src/blablalink/union_queries.py` into `short_dmg` (old behaviour) and `fmt_dmg` (full + short). Only `_hard_result`'s stopped branch switches to `short_dmg`.

**Tech Stack:** Python, pytest.

**Spec:** docs/superpowers/specs/2026-11-18-full-damage-numbers-design.md

## Global Constraints
- Thousands separator is `.`; short form keeps current rounding (2 decimals below 10, else 1).
- Below 1M: full number only, no parentheses.

## Review Focus
- Float input (growth median) → rounded int, no `.0` leaking into the full part.
- Values under 1M → `812.300`, no `( )`.
- Recap lv4 "cleared" line → expanded; "stopped" line HP → short.

---

### Task 1: full + short damage format

**Files:**
- Modify: `src/blablalink/union_queries.py` (`fmt_dmg`, `_hard_result`)
- Test: `tests/test_union_queries.py`

**Interfaces:**
- Produces: `short_dmg(n) -> str` (old `fmt_dmg`), `fmt_dmg(n) -> str` (full + short)

- [ ] **Step 1: Update tests**

```python
def test_fmt_dmg():
    assert [fmt_dmg(x) for x in (1027483050281, 9051890653, 100e9, 812_300_000, 812_300, 40e9 + 0.5)] == [
        "1.027.483.050.281 (1.03T)", "9.051.890.653 (9.05B)", "100.000.000.000 (100.0B)",
        "812.300.000 (812.3M)", "812.300", "40.000.000.000 (40.0B)"]
    assert short_dmg(160433126788) == "160.4B"
```
Plus: `test_recap` expects `cleared · 1.027.483.050.281 (1.03T) on` and still `ZEUS 39.0B/226.3B`; other
expected damage strings (`hits`, `normal`, `member`, `growth`, `boss`) take the full form.

- [ ] **Step 2: Run `pytest tests/test_union_queries.py`** — expect FAIL (`short_dmg` missing).
- [ ] **Step 3: Implement** — `fmt_dmg`: `n = round(n)`; `f"{n:,}".replace(",", ".")`, append ` ({short_dmg(n)})` when `abs(n) >= 1e6`.
- [ ] **Step 4: Run full `pytest`** — expect PASS.
- [ ] **Step 5: Commit** `feat: union damage shows the full number with the short form in parentheses`
