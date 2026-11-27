import { SHEETS_EPOCH, cellToIsoDate } from '@/services/anomaly/anomalyRows'
import { formatPlural } from '@/services/stats/format'
import { gameDay } from '@/utils/gameDay'

// Rules that recur across facts.

// Highest score; a tie goes to the earliest item, so pass items in row order. Negate for lowest.
export function firstMax<T>(items: T[], score: (item: T) => number): T | undefined {
  let best: T | undefined
  for (const item of items) if (best === undefined || score(item) > score(best)) best = item
  return best
}

// "Tetra, 14 drops": the most frequent non-blank cell; no answer when all are blank.
export function topWithCount(cells: unknown[], unit: string, plural?: string): string | null {
  const counts = new Map<string, number>()
  for (const c of cells)
    if (c !== '' && c != null) counts.set(String(c), (counts.get(String(c)) ?? 0) + 1)
  const top = firstMax([...counts], ([, n]) => n)
  return top ? `${top[0]}, ${formatPlural(top[1], unit, plural)}` : null
}

// The game day of a raw date cell. A plain date (text or serial) already is one; a WIB timestamp
// (text, or a serial with a time) is converted. Anything else is null.
export function cellGameDay(cell: unknown): string | null {
  if (cell === '' || cell == null) return null
  if (typeof cell === 'number' && !Number.isInteger(cell)) {
    const wib = SHEETS_EPOCH + Math.round(cell * 86_400) * 1000
    return gameDay(new Date(wib - 7 * 3_600_000))
  }
  const text = cellToIsoDate(String(cell))
  const [, day, time] = text.match(/^(\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}(?::\d{2})?))?$/) ?? []
  if (!day) return null
  if (!time) return day
  const at = new Date(`${day}T${time}+07:00`)
  return Number.isNaN(at.getTime()) ? null : gameDay(at) // a hand-typed "25:00" must not throw
}

// [day, row indexes] per game day, oldest first, so ties between days go to the earliest.
export function groupByGameDay(cells: unknown[]): [string, number[]][] {
  const days = new Map<string, number[]>()
  cells.forEach((cell, i) => {
    const day = cellGameDay(cell)
    if (!day) return
    const rows = days.get(day)
    if (rows) rows.push(i)
    else days.set(day, [i])
  })
  return [...days].sort(([a], [b]) => a.localeCompare(b))
}
