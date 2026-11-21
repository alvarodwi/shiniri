# Full damage numbers in union output

## Intent
Union raid damage prints only the short form (`100.2B`). The exact number matters, so damage shows it in full with
dot thousands separators, keeping the short form in parentheses: `100.234.567.789 (100.2B)`.

## Goals
- Every damage figure (hits, normal, member, growth, boss tables, recap, summaries) prints full + short.
- Recap "cleared" line on hard lv4: that number is the total damage the union dealt, so it is expanded.

## Non-goals
- Boss HP left / max HP in the recap "stopped at hard lvN" line stays short (`ZEUS 39.0B/226.3B`) — it is HP, not damage.
- No automatic wipe of cached exports in `data/exports/union/`; they show the old format until rebuilt with `!command`.

## Approaches
Only one considered sensible: the single formatter `fmt_dmg` is split into `short_dmg` (the old short form) and
`fmt_dmg` (full + short). All callers keep `fmt_dmg`; only the HP-left line switches to `short_dmg`.
Per-call-site formatting was rejected — it would duplicate the rule in nine places.

## Details
- Below 1M there is no short form, so no parentheses: `812.300`.
- Floats (growth median) are rounded to an int before formatting.
