import { asText } from '@/services/anomaly/anomalyRows'
import { pulls } from '@/services/gacha/pulls'
import type { Cell } from '@/types/sheet'
import type { OrdinaryEntry } from '@/types/ordinary'

// Columns A-G of Ordinary, or null while a field is missing or invalid. totalSsr is the number of
// names, so it can never disagree with ssrDetails.
export function toRow(e: OrdinaryEntry): Cell[] | null {
  const p = pulls(e)
  if (!e.date || !p) return null
  return [
    e.date,
    p.gems,
    p.tix,
    p.times,
    e.names.length,
    asText(e.names.join(', ')),
    asText(e.notes.trim()),
  ]
}
