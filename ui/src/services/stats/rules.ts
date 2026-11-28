import { NIKKE_DATABASE_TAB } from '@/config/sheets'
import { SHEETS_EPOCH, cellToIsoDate } from '@/services/anomaly/anomalyRows'
import type { Columns } from '@/services/stats/facts'
import { formatCount, formatDate, formatPlural } from '@/services/stats/format'
import { gameDay } from '@/utils/gameDay'

// Rules that recur across facts.

// A hand-filled TRUE/FALSE cell, e.g. NikkeDatabase's `limited`.
export const flagged = (cell: unknown) => String(cell).trim().toUpperCase() === 'TRUE'

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

export const sum = <T>(list: T[], of: (item: T) => number) =>
  list.reduce((n, item) => n + of(item), 0)

// Back-to-back items that match, as the amounts they add up to and the day each run started. A
// non-match ends a run; the last one is the run still going.
export function runs<T extends { day: string }>(
  list: T[],
  match: (item: T) => boolean,
  amount: (item: T) => number,
) {
  const out = [{ day: '', n: 0 }]
  for (const item of list) {
    const run = out[out.length - 1]
    if (!match(item)) out.push({ day: '', n: 0 })
    else {
      run.day ||= item.day
      run.n += amount(item)
    }
  }
  return out
}

// "300 (1 Jan 2026)": the highest `n` with what it was; a highest of 0 is just "0".
export function most<T extends { n: number }>(list: T[], name: (item: T) => string): string | null {
  const best = firstMax(list, (x) => x.n)
  if (!best) return null
  return best.n ? `${formatCount(best.n)} (${name(best)})` : '0'
}

// How many of the non-limited SSRs, overspec included, `got` never names; null for an empty pool.
export function missingFromPool(cols: Columns, got: string[]) {
  const db = cols[NIKKE_DATABASE_TAB.tab]
  const pool = db.nikke.filter(
    (name, i) => name && db.rarity[i] === 'SSR' && !flagged(db.limited[i]),
  )
  const have = new Set(got)
  return pool.length ? formatCount(pool.filter((n) => !have.has(String(n))).length) : null
}

// The NikkeDatabase names whose `column` is TRUE.
export const namesWhere = (cols: Columns, column: string) => {
  const db = cols[NIKKE_DATABASE_TAB.tab]
  return new Set(db.nikke.filter((_, i) => flagged(db[column][i])).map(String))
}
