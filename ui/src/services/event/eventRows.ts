import { asText } from '@/services/anomaly/anomalyRows'
import { pulls } from '@/services/gacha/pulls'
import { RATE_UP_TYPES } from '@/types/event'
import type { EventEntry } from '@/types/event'
import type { Cell } from '@/types/sheet'

// Columns A-I of Event, or null while a field is missing or invalid. times is what the sheet's own
// formula gives (300 gems = 1 voucher = 1 pull), always a whole number; totalSsr is the number of names,
// so it can never disagree with ssrDetails.
export function toRow(e: EventEntry): Cell[] | null {
  const p = pulls(e)
  if (!e.date || !p) return null
  if (!(RATE_UP_TYPES as readonly string[]).includes(e.rateUpType)) return null
  return [
    e.date,
    asText(e.rateUpName.trim()),
    e.rateUpType,
    p.gems,
    p.tix,
    p.times,
    e.names.length,
    asText(e.names.join(', ')),
    asText(e.notes.trim()),
  ]
}
