import type { Nikke } from '@/services/nikke/nikkeDatabase'
import type { EventEntry } from '@/types/event'

// The banner types whose pool carries over limited units of earlier years: released in these months,
// overspec or not.
const SEASONS: Record<string, { months: number[]; overspec: boolean }> = {
  'Winter Limited': { months: [12], overspec: false },
  'Summer Limited': { months: [6, 7, 8], overspec: false },
  'Summer Pilgrim Limited': { months: [6, 7, 8], overspec: true },
}

// Whether the banner being logged can give this SSR: any non-limited one, its own
// rate-up, or an old unit of its season.
export function canDrop(n: Nikke, e: EventEntry): boolean {
  if (!n.limited || n.name === e.rateUpName) return true
  const season = SEASONS[e.rateUpType]
  const [year, month] = n.releaseDate.split('-').map(Number)
  return (
    !!season &&
    n.manufacturer.toLowerCase() !== 'abnormal' &&
    n.overspec === season.overspec &&
    season.months.includes(month) &&
    year < Number(e.date.slice(0, 4))
  )
}
