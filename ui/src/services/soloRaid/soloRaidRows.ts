import { SOLO_RAID_MAX_PLACE } from '@/config/limits'
import { asText } from '@/services/anomaly/anomalyRows'
import type { Cell } from '@/types/sheet'
import type { RankMode, RaidEntry } from '@/types/soloRaid'

// Last filled season in column A (row 1 is the header) + 1. Null when it isn't a number,
// so the owner types the season instead of the app guessing.
export function nextSeason(colA: string[]): number | null {
  let i = colA.length - 1
  while (i >= 1 && !colA[i].trim()) i--
  if (i < 1) return 1
  const last = Number(colA[i].trim())
  return Number.isInteger(last) ? last + 1 : null
}

// Distinct bosses from column C, most recent first, for the boss field's suggestions.
export const pastBosses = (colC: string[]): string[] => [
  ...new Set(
    colC
      .slice(1)
      .map((b) => b.trim())
      .filter(Boolean)
      .reverse(),
  ),
]

// Damage is typed with whatever thousands separator the phone keyboard offers. Only one separator
// splitting whole groups of three counts, so a slip like 12.5 is refused instead of saved as 125.
export function parseDamage(s: string): number | null {
  const v = s.trim()
  if (!/^\d+$/.test(v) && !/^\d{1,3}([,. _])\d{3}(\1\d{3})*$/.test(v)) return null
  const n = Number(v.replace(/\D/g, ''))
  return n > 0 && Number.isSafeInteger(n) ? n : null
}

// Text either way (leading '), so % and # ranks share one plain-text column.
export function rankText(mode: RankMode, s: string): string | null {
  const v = s.trim()
  if (mode === 'percent') {
    // Two decimals at most, never rounded; an Indonesian keyboard types the decimal as a comma.
    if (!/^\d+([.,]\d{1,2})?$/.test(v)) return null
    const x = Number(v.replace(',', '.'))
    return x > 0 && x <= 100 ? `'${x.toFixed(2)}%` : null
  }
  if (!/^\d+$/.test(v)) return null
  const n = Number(v)
  return n >= 1 && n <= SOLO_RAID_MAX_PLACE ? `'#${n}` : null
}

// Columns A-G of SoloRaid, or null while any required part is missing or invalid.
export function toRow(e: RaidEntry): Cell[] | null {
  const damage = parseDamage(e.damage)
  const rank = rankText(e.rankMode, e.rank)
  const boss = e.boss.trim()
  const { season, date, weakness } = e
  if (season === null || !Number.isInteger(season) || season <= 0) return null
  if (!date || !boss || !weakness || damage === null || rank === null) return null
  return [season, date, asText(boss), weakness, damage, rank, asText(e.comments.trim())]
}
