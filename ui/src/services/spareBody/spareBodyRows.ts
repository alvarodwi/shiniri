import { MAX_COPIES } from '@/config/limits'
import { asText } from '@/services/anomaly/anomalyRows'
import type { Nikke } from '@/services/nikke/nikkeDatabase'
import { ssrPool } from '@/services/nikke/nikkePool'
import type { Cell } from '@/types/sheet'
import { LIBERATION_UNITS, SPARE_SOURCES } from '@/types/spareBody'
import type { SpareBodyEntry } from '@/types/spareBody'

// Whole number 1..MAX_COPIES, or null.
export function parseCopies(s: string): number | null {
  const t = s.trim()
  if (!/^\d+$/.test(t)) return null
  const n = Number(t)
  return n >= 1 && n <= MAX_COPIES ? n : null
}

// The SSRs a spare body source can give; [] when it isn't a source the form offers.
export function spareBodyPool(nikkes: Nikke[], source: string): Nikke[] {
  if (source === 'Gold Mileage') return ssrPool(nikkes, { overspec: true, limited: true })
  if (source === 'Silver Mileage') return ssrPool(nikkes, { overspec: true, limited: false })
  if (source === 'Union Chip') {
    return nikkes.filter(
      (n) => n.rarity === 'SSR' && (LIBERATION_UNITS as readonly string[]).includes(n.name),
    )
  }
  return []
}

// Columns A-D of SpareBody, one row per copy, or null while a field is missing or invalid.
export function toRows(e: SpareBodyEntry): Cell[][] | null {
  const copies = parseCopies(e.copies)
  const target = e.target.trim()
  if (!e.date || !(SPARE_SOURCES as readonly string[]).includes(e.source) || !target || !copies) {
    return null
  }
  return Array.from({ length: copies }, (_, i) => [
    e.date,
    asText(target),
    e.source,
    i === copies - 1 ? asText(e.notes.trim()) : '',
  ])
}
