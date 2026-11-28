import { EXCHANGE_TAB } from '@/config/sheets'
import type { Columns, Fact, Filter } from '@/services/stats/facts'
import { formatPlural } from '@/services/stats/format'
import {
  cellGameDay,
  daysBetween,
  firstMax,
  longestGap,
  topWithCount,
} from '@/services/stats/rules'

const { tab } = EXCHANGE_TAB
const ANY_EXCHANGE = 'any exchange'
const MILEAGE = ['Gold Mileage', 'Silver Mileage']

// Every dated row from `source`, by game day then row. An undeclared column reads as blank.
function exchanges(cols: Columns, source: string) {
  const t = cols[tab]
  return t.date
    .flatMap((cell, i) => {
      const day = cellGameDay(cell)
      const from = String(t.source[i] ?? '').trim()
      if (!day || (source !== ANY_EXCHANGE && from !== source)) return []
      return [{ day, nikke: String(t.nikke?.[i] ?? '').trim() }]
    })
    .sort((a, b) => a.day.localeCompare(b.day))
}

const source = (options: string[]): Filter => ({ id: 'source', label: 'Exchanged with', options })
const reads = (...columns: string[]) => [
  { tab: EXCHANGE_TAB, columns: ['date', 'source', ...columns] },
]

export const EXCHANGE_FACTS: Fact[] = [
  {
    id: 'exchange-longest-liberation-wait',
    category: 'Pulls',
    title: 'Longest liberation wait',
    question: 'What was my longest wait between two liberations?',
    reads: reads('nikke'),
    compute: (c) => {
      const list = exchanges(c, 'Liberation')
      const waits = list.slice(1).map((e, i) => ({ ...e, n: daysBetween(list[i].day, e.day) }))
      const best = firstMax(waits, (w) => w.n)
      return best ? `${formatPlural(best.n, 'day')}, ended by ${best.nikke}` : null
    },
  },
  {
    id: 'exchange-most-exchanged-nikke',
    category: 'Pulls',
    title: 'Most exchanged NIKKE',
    question: 'Which NIKKE have I got the most copies of from {source}?',
    filters: [source([ANY_EXCHANGE, ...MILEAGE, 'Union Chip', 'Bonus Recruit'])],
    reads: reads('nikke'),
    compute: (c, v) =>
      topWithCount(
        exchanges(c, v.source).map((e) => e.nikke),
        'copy',
        'copies',
      ),
  },
  {
    id: 'exchange-longest-mileage-saving',
    category: 'Pulls',
    title: 'Longest mileage saving',
    question: "What is the longest I've gone without spending {source}?",
    filters: [source(MILEAGE)],
    reads: reads(),
    compute: (c, v, today) =>
      longestGap(
        exchanges(c, v.source).map((e) => e.day),
        today,
      ),
  },
]
