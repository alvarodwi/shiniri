import { EXTRA_TAB } from '@/config/sheets'
import type { Columns, Fact, Values } from '@/services/stats/facts'
import { formatCount } from '@/services/stats/format'
import { ANY_PERIOD, dateRange, inRange } from '@/services/stats/ranges'
import { sum } from '@/services/stats/rules'
import { FREE_PULLS, GUARANTEED } from '@/types/other'
import type { OtherType } from '@/types/other'

const { tab } = EXTRA_TAB
const FREEBIES: OtherType[] = ['Welfare Unit', 'Welfare Pass']

// The indexes of the rows from one of `sources`.
const from = (cols: Columns, ...sources: OtherType[]) =>
  cols[tab].source.flatMap((cell, i) =>
    (sources as string[]).includes(String(cell).trim()) ? [i] : [],
  )
// SSRs from those sources inside the chosen range.
const ssrsIn = (
  cols: Columns,
  { range = ANY_PERIOD }: Values,
  today: string,
  ...sources: OtherType[]
) => {
  const within = inRange(range, today)
  const rows = from(cols, ...sources).filter((i) => within(cols[tab].date[i]))
  return formatCount(sum(rows, (i) => Number(cols[tab].totalSsr[i])))
}

const range = dateRange((cols) => cols[tab].date)
const reads = (...columns: string[]) => [{ tab: EXTRA_TAB, columns: ['source', ...columns] }]

export const EXTRA_FACTS: Fact[] = [
  {
    id: 'extra-free-hits',
    category: 'Pulls',
    title: 'Free pull hits',
    question: 'How many SSRs have free pulls given me {range}?',
    filters: [range],
    reads: reads('date', 'totalSsr'),
    compute: (c, v, today) => ssrsIn(c, v, today, FREE_PULLS),
  },
  {
    id: 'extra-free-rate-ups',
    category: 'Pulls',
    title: 'Free rate-ups',
    question: 'How many times has a free pull given me the rate-up?',
    reads: reads('rateUpName', 'ssrDetails'),
    compute: (c) => {
      const t = c[tab]
      const hits = from(c, FREE_PULLS).filter((i) => {
        const name = String(t.rateUpName[i] ?? '').trim()
        return name !== '' && String(t.ssrDetails[i] ?? '').trim() === name
      })
      return formatCount(hits.length)
    },
  },
  {
    id: 'extra-freebie-haul',
    category: 'Pulls',
    title: 'Freebie haul',
    question: 'How many free copies have I been handed {range}?',
    filters: [range],
    reads: reads('date', 'totalSsr'),
    compute: (c, v, today) => ssrsIn(c, v, today, ...FREEBIES),
  },
  {
    id: 'extra-bonus-guests',
    category: 'Pulls',
    title: 'Bonus guests',
    question: 'How many SSRs beyond the guarantee have guaranteed recruits given me?',
    reads: reads('totalSsr'),
    // A row is one recruit with one guarantee.
    compute: (c) =>
      formatCount(sum(from(c, GUARANTEED), (i) => Math.max(Number(c[tab].totalSsr[i]) - 1, 0))),
  },
]
