import { asText } from '@/services/anomaly/anomalyRows'
import type { Nikke } from '@/services/nikke/nikkeDatabase'
import { ssrPool } from '@/services/nikke/nikkePool'
import { parseCopies } from '@/services/spareBody/spareBodyRows'
import { FREE_PULLS, GUARANTEED, OTHER_TYPES } from '@/types/other'
import type { OtherEntry } from '@/types/other'
import type { Cell } from '@/types/sheet'

// Abnormal comes only from collab banners and gold mileage, never from Extra's sources.
export const otherPool = (nikkes: Nikke[]): Nikke[] =>
  ssrPool(nikkes, { overspec: true, abnormal: false })

// Columns A-I of Other, or null while a field is missing or invalid. Only fields the type uses are
// written, so stale form state never reaches the sheet.
export function toRows(e: OtherEntry): Cell[][] | null {
  const type = e.sourceType
  if (!e.date || !(OTHER_TYPES as readonly string[]).includes(type)) return null
  const info = e.sourceInfo.trim()
  const notes = asText(e.notes.trim())

  if (type === GUARANTEED) {
    const times = e.times.trim()
    const gems = e.gems.trim()
    if (!info || !e.names.length || !/^\d+$/.test(times) || Number(times) < 1) return null
    if (gems && !/^\d+$/.test(gems)) return null
    return [
      [
        e.date,
        type,
        asText(info),
        '',
        gems ? Number(gems) : '',
        Number(times),
        e.names.length,
        asText(e.names.join(', ')),
        notes,
      ],
    ]
  }

  const free = type === FREE_PULLS
  const rateUp = e.rateUpName.trim()
  // A free pull is one pull a day, so each hit is its own save.
  const copies = free ? 1 : parseCopies(e.copies)
  if (e.names.length !== 1 || !copies || (free ? !rateUp : !info)) return null
  return Array.from({ length: copies }, (_, i) => [
    e.date,
    type,
    free ? '' : asText(info),
    free ? asText(rateUp) : '',
    '',
    1,
    1,
    asText(e.names[0]),
    i === copies - 1 ? notes : '',
  ])
}
