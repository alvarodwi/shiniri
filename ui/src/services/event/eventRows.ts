import { asText } from '@/services/anomaly/anomalyRows'
import { RATE_UP_TYPES } from '@/types/event'
import type { EventEntry } from '@/types/event'
import type { Cell } from '@/types/sheet'

// A blank currency counts as 0, so filling just gems or just tix is enough; both blank gives 0 pulls.
const amount = (s: string): number | null =>
  s.trim() === '' ? 0 : /^\d+$/.test(s.trim()) ? Number(s) : null

// The line under the currency inputs: the pull count, or why the entry can't be saved yet.
export function pullsHint(e: EventEntry): string {
  if (!e.gems.trim() && !e.tix.trim()) return '300 gems = 1 voucher = 1 pull'
  const gems = amount(e.gems)
  const tix = amount(e.tix)
  if (gems === null || tix === null) return 'Gems and tix are whole numbers'
  if (gems % 300 !== 0) return 'Gems come in multiples of 300'
  const times = tix + gems / 300
  return times < 1 ? 'Under 1 pull' : `${times} pulls`
}

// Columns A-I of Event, or null while a field is missing or invalid. times is what the sheet's own
// formula gives (300 gems = 1 voucher = 1 pull), always a whole number; totalSsr is the number of names,
// so it can never disagree with ssrDetails.
export function toRow(e: EventEntry): Cell[] | null {
  const gems = amount(e.gems)
  const tix = amount(e.tix)
  if (!e.date || gems === null || tix === null) return null
  if (gems % 300 !== 0) return null // a pull costs one whole voucher, 300 gems
  if (!(RATE_UP_TYPES as readonly string[]).includes(e.rateUpType)) return null
  const times = tix + gems / 300
  if (times < 1) return null
  return [
    e.date,
    asText(e.rateUpName.trim()),
    e.rateUpType,
    gems,
    tix,
    times,
    e.names.length,
    asText(e.names.join(', ')),
    asText(e.notes.trim()),
  ]
}
