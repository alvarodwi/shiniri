import type { Nikke } from '@/services/nikke/nikkeDatabase'
import { isAbnormal } from '@/services/nikke/nikkePool'
import type { EventEntry, RateUpType } from '@/types/event'

// The banner types whose pool carries over limited units of earlier years: released in these months,
// overspec or not.
const SEASONS: Partial<Record<RateUpType, { months: number[]; overspec: boolean }>> = {
  'Winter Limited': { months: [12], overspec: false },
  'Summer Limited': { months: [6, 7, 8], overspec: false },
  'Summer Pilgrim Limited': { months: [6, 7, 8], overspec: true },
}

// Whether the banner being logged can give this SSR: any non-limited one, its own
// rate-up, or an old unit of its season.
export function canDrop(n: Nikke, e: EventEntry): boolean {
  if (!n.limited || n.name === e.rateUpName) return true
  const season = SEASONS[e.rateUpType as RateUpType]
  const [year, month] = n.releaseDate.split('-').map(Number)
  // A date input emits '' or a year like 0002 while being typed; no unit is too new for that.
  const entryYear = e.date >= '2022' ? Number(e.date.slice(0, 4)) : Infinity
  return (
    !!season &&
    !isAbnormal(n) &&
    n.overspec === season.overspec &&
    season.months.includes(month) &&
    year < entryYear
  )
}
