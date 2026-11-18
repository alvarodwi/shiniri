# Split union damage — plan

Spec: `docs/superpowers/specs/2026-11-18-split-union-damage-design.md`

1. `union_queries.py`: add `_dmg(hs)` → `fmt_dmg(sum damage)` or `-` when `hs` is empty.
2. `member`: columns `season, hits, normal, hard, normal dmg, hard dmg`; per season split hits by mode.
3. `boss`: columns `season, boss, union hard, union normal, me hard, me normal`; `me` columns `-` without a cookie.
4. Update `test_member_tendencies` and `test_boss` to the new columns; add a `-` case.
5. Run the full test suite; commit on `feat/split-damage`; merge into `develop` with `--no-ff`.
