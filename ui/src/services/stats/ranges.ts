import type { Columns, Filter } from '@/services/stats/facts'
import { formatDate } from '@/services/stats/format'
import { cellGameDay } from '@/services/stats/rules'

// Range presets resolve against the game day (`today`, YYYY-MM-DD from gameDay): weeks start on
// Monday, months are calendar months. cellGameDay places a cell.
export const RANGE_PRESETS = ['this week', 'last week', 'this month', 'last month']
export const ANY_PERIOD = 'any period'

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

// A date range value is ANY_PERIOD, a preset, `in <year>`, or a custom `from..to`. An empty `to`
// means today.
const CUSTOM = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})?$/

export const customRange = (from: string, to: string, today: string) =>
  `${from}..${to < today ? to : ''}`

function bounds(range: string, today: string): [string, string] {
  if (range === ANY_PERIOD) return ['', '￿']
  const year = range.match(/^in (\d{4})$/)?.[1]
  if (year) return [`${year}-01-01`, `${year}-12-31`]
  const [, from, to] = range.match(CUSTOM) ?? []
  return from ? [from, to ?? today] : presetBounds(range, today)
}

// Predicate over a raw date cell. Blank cells are never in range, "any period" included.
export function inRange(range: string, today: string): (cell: unknown) => boolean {
  const [from, to] = bounds(range, today)
  return (cell) => {
    const day = cellGameDay(cell)
    return day !== null && day >= from && day <= to
  }
}

function rangeText(range: string): string {
  if (range === ANY_PERIOD) return ''
  const [, from, to] = range.match(CUSTOM) ?? []
  if (!from) return range
  return to ? `from ${formatDate(from)} to ${formatDate(to)}` : `since ${formatDate(from)}`
}

// The Date range filter. `dates` picks the fact's date cells, which give the years; `quick: false`
// hides the presets (finished history).
export const dateRange = (dates: (cols: Columns) => unknown[], { quick = true } = {}): Filter => ({
  id: 'range',
  label: 'Date range',
  kind: 'dateRange',
  say: rangeText,
  options: (cols) => {
    const years = new Set(dates(cols).flatMap((c) => cellGameDay(c)?.slice(0, 4) ?? []))
    return [ANY_PERIOD, ...(quick ? RANGE_PRESETS : []), ...[...years].sort().map((y) => `in ${y}`)]
  },
})
