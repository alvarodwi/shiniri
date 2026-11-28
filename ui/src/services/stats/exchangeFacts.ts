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
export const ANY_EXCHANGE = 'any exchange'
export const MILEAGE = ['Gold Mileage', 'Silver Mileage']

// The rows from `wanted`, in row order, dated or not. An undeclared column reads as blank.
function exchanges(cols: Columns, wanted: string) {
  const t = cols[tab]
  return t.source.flatMap((cell, i) => {
    if (wanted !== ANY_EXCHANGE && String(cell).trim() !== wanted) return []
    const nikke = String(t.nikke?.[i] ?? '').trim()
    return [{ day: cellGameDay(t.date?.[i]), nikke }]
  })
}
// The dated ones, oldest first: what the gaps run between.
const dated = (cols: Columns, wanted: string) =>
  exchanges(cols, wanted)
    .flatMap(({ day, nikke }) => (day ? [{ day, nikke }] : []))
    .sort((a, b) => a.day.localeCompare(b.day))

const sourceFilter = (options: string[]): Filter => ({
  id: 'source',
  label: 'Exchanged with',
  options,
})
const reads = (...columns: string[]) => [{ tab: EXCHANGE_TAB, columns: ['source', ...columns] }]

export const EXCHANGE_FACTS: Fact[] = [
  {
    id: 'exchange-longest-liberation-wait',
    category: 'Pulls',
    title: 'Longest liberation wait',
    question: 'What was my longest wait between two liberations?',
    reads: reads('date', 'nikke'),
    compute: (c) => {
      const list = dated(c, 'Liberation')
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
    filters: [sourceFilter([ANY_EXCHANGE, ...MILEAGE, 'Union Chip', 'Bonus Recruit'])],
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
    filters: [sourceFilter(MILEAGE)],
    reads: reads('date'),
    compute: (c, v, today) =>
      longestGap(
        dated(c, v.source).map((e) => e.day),
        today,
      ),
  },
]
