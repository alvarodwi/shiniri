import { cellToIsoDate } from '@/services/anomaly/anomalyRows'

// Range presets resolve against the game day (`today`, YYYY-MM-DD from gameDay): weeks start on
// Monday, months are calendar months. Cells are sheet serial numbers or ISO text; both work.
export const RANGE_PRESETS = ['this week', 'last week', 'this month', 'last month']
export const ANY_TIME = 'any time'

const DAY = 86_400_000
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

function presetBounds(preset: string, today: string): [string, string] {
  const t = Date.parse(today)
  const d = new Date(t)
  const monday = t - ((d.getUTCDay() + 6) % 7) * DAY
  const [y, m] = [d.getUTCFullYear(), d.getUTCMonth()]
  switch (preset) {
    case 'this week':
      return [iso(monday), iso(monday + 6 * DAY)]
    case 'last week':
      return [iso(monday - 7 * DAY), iso(monday - DAY)]
    case 'this month':
      return [iso(Date.UTC(y, m, 1)), iso(Date.UTC(y, m + 1, 0))]
    case 'last month':
      return [iso(Date.UTC(y, m - 1, 1)), iso(Date.UTC(y, m, 0))]
    default:
      throw new Error(`Unknown range preset "${preset}".`)
  }
}

// Predicate over a raw date cell. Blank cells are never in range, "any time" included.
export function inRange(preset: string, today: string): (cell: unknown) => boolean {
  const [from, to] = preset === ANY_TIME ? ['', '￿'] : presetBounds(preset, today)
  return (cell) => {
    if (cell === '' || cell == null) return false
    const day = cellToIsoDate(String(cell))
    return /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= from && day <= to
  }
}
