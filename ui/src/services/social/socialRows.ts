import { asText } from '@/services/anomaly/anomalyRows'
import type { Cell } from '@/types/sheet'
import type { SocialEntry } from '@/types/social'

// Columns A-E of Social, or null while the date or times is missing or invalid. totalSsr is the
// number of names, so it can never disagree with ssrDetails.
export function toRow(e: SocialEntry): Cell[] | null {
  const times = e.times.trim()
  if (!e.date || !/^\d+$/.test(times) || Number(times) < 1) return null
  return [e.date, Number(times), e.names.length, asText(e.names.join(', ')), asText(e.notes.trim())]
}
