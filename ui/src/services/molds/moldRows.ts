import { asText } from '@/services/anomaly/anomalyRows'
import type { Nikke } from '@/services/nikke/nikkeDatabase'
import { ssrPool } from '@/services/nikke/nikkePool'
import type { MoldsEntry, MoldType } from '@/types/molds'
import type { Cell } from '@/types/sheet'

const MAKERS = ['missilis', 'elysion', 'tetra']

export const isPerfect = (t: MoldType): boolean => t.includes('Perfect')

// The SSRs a mold can give: every overspec one for Pilgrim, one manufacturer's non-overspec for the
// other manufacturer molds, else the mixed pool.
export function moldPool(nikkes: Nikke[], t: MoldType): Nikke[] {
  const maker = t.split(' ')[0].toLowerCase()
  if (maker === 'pilgrim') return nikkes.filter((n) => n.rarity === 'SSR' && n.overspec)
  const plain = ssrPool(nikkes, { overspec: false, abnormal: false })
  if (!MAKERS.includes(maker)) return plain
  return plain.filter((n) => n.manufacturer.toLowerCase() === maker)
}

// Columns A-F of Molds, or null while a field is missing or invalid. ssr is the number of names, so
// it can never disagree with result.
export function toRow(e: MoldsEntry): Cell[] | null {
  const amount = e.amount.trim()
  if (!e.date || !e.moldType || !/^\d+$/.test(amount)) return null
  const n = Number(amount)
  if (n < 1 || e.names.length > n) return null
  if (isPerfect(e.moldType) && e.names.length !== n) return null
  return [e.date, e.moldType, n, e.names.length, asText(e.names.join(', ')), asText(e.notes.trim())]
}
