import { asText } from '@/services/anomaly/anomalyRows'
import type { Nikke } from '@/services/nikke/nikkeDatabase'
import { ssrPool } from '@/services/nikke/nikkePool'
import type { MoldsEntry, MoldType } from '@/types/molds'
import type { Cell } from '@/types/sheet'

const MAKERS = ['pilgrim', 'missilis', 'elysion', 'tetra']

export const isPerfect = (t: MoldType): boolean => t.includes('Perfect')

// The SSRs a mold can give: one manufacturer's for the manufacturer molds, else the mixed pool.
export function moldPool(nikkes: Nikke[], t: MoldType): Nikke[] {
  const maker = t.split(' ')[0].toLowerCase()
  if (!MAKERS.includes(maker)) return ssrPool(nikkes, { pilgrim: false, abnormal: false })
  return nikkes.filter((n) => n.rarity === 'SSR' && n.manufacturer.toLowerCase() === maker)
}

// Columns A-F of Molds, or null while a field is missing or invalid. ssr is the number of names, so
// it can never disagree with result.
export function toRow(e: MoldsEntry): Cell[] | null {
  const amount = e.amount.trim()
  if (!e.date || !e.moldType || !/^\d+$/.test(amount)) return null
  const n = Number(amount)
  if (n < 1 || e.names.length > n) return null
  if (isPerfect(e.moldType) && e.names.length !== n) return null
  return [
    e.date,
    asText(e.moldType),
    n,
    e.names.length,
    asText(e.names.join(', ')),
    asText(e.notes.trim()),
  ]
}
