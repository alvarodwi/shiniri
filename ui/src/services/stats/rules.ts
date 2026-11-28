import { SHEETS_EPOCH, cellToIsoDate } from '@/services/anomaly/anomalyRows'
import { formatDate, formatPlural } from '@/services/stats/format'
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

// The instant of a raw WIB timestamp cell (text, or a serial with a time); NaN for anything else,
// a plain date included.
export function cellTime(cell: unknown): number {
  if (typeof cell === 'number' && !Number.isInteger(cell))
    return SHEETS_EPOCH + Math.round(cell * 86_400) * 1000 - 7 * 3_600_000
  const [, day, time] =
    String(cell ?? '')
      .trim()
      .match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}(?::\d{2})?)$/) ?? []
  return day ? Date.parse(`${day}T${time}+07:00`) : NaN // a hand-typed "25:00" is NaN too
}

// The game day of a raw date cell. A plain date (text or serial) already is one; a WIB timestamp is
// converted. Anything else is null.
export function cellGameDay(cell: unknown): string | null {
  if (cell === '' || cell == null) return null
  const at = cellTime(cell)
  if (!Number.isNaN(at)) return gameDay(new Date(at))
  if (typeof cell === 'number' && !Number.isInteger(cell)) return null
  return cellToIsoDate(String(cell)).match(/^\d{4}-\d{2}-\d{2}$/)?.[0] ?? null
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

const DAY = 86_400_000
export const daysBetween = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / DAY
export const addDays = (day: string, n: number) =>
  new Date(Date.parse(day) + n * DAY).toISOString().slice(0, 10)

// "6 days, from 3 Oct 2023": the longest run of consecutive calendar dates that match.
export function streak<T extends { day: string }>(
  list: T[],
  match: (d: T) => boolean,
): string | null {
  const streaks: { from: string; length: number }[] = []
  let next = NaN // the date that would extend the current streak
  for (const d of list) {
    if (!match(d)) continue
    const at = Date.parse(d.day)
    if (at === next) streaks[streaks.length - 1].length++
    else streaks.push({ from: d.day, length: 1 })
    next = at + DAY
  }
  const best = firstMax(streaks, (s) => s.length)
  return best ? `${formatPlural(best.length, 'day')}, from ${formatDate(best.from)}` : null
}
