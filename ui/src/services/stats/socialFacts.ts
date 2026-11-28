import { NIKKE_DATABASE_TAB, SOCIAL_TAB } from '@/config/sheets'
import type { Columns, Fact } from '@/services/stats/facts'
import { formatCount, formatDate, formatShareOf } from '@/services/stats/format'
import { ANY_PERIOD, dateRange, inRange } from '@/services/stats/ranges'
import { firstMax, flagged, groupByGameDay } from '@/services/stats/rules'

const { tab } = SOCIAL_TAB
const total = (cells: unknown[], rows: number[]) =>
  rows.reduce((sum, i) => sum + Number(cells[i]), 0)

// The indexes of the rows inside the chosen range.
const rowsIn = (cols: Columns, range: string | undefined, today: string) => {
  const within = inRange(range ?? ANY_PERIOD, today)
  return cols[tab].date.flatMap((date, i) => (within(date) ? [i] : []))
}

const range = dateRange((cols) => cols[tab].date)
const reads = (...columns: string[]) => [{ tab: SOCIAL_TAB, columns: ['date', ...columns] }]

export const SOCIAL_FACTS: Fact[] = [
  {
    id: 'social-pulls',
    category: 'Pulls',
    title: 'Social pulls',
    question: 'How many social pulls did I make {range}?',
    filters: [range],
    reads: reads('pulls'),
    compute: (c, v, today) => formatCount(total(c[tab].pulls, rowsIn(c, v.range, today))),
  },
  {
    id: 'social-ssr',
    category: 'Pulls',
    title: 'Social SSRs',
    question: 'How many SSRs did social pulls give me {range}?',
    filters: [range],
    reads: reads('totalSsr'),
    compute: (c, v, today) => formatCount(total(c[tab].totalSsr, rowsIn(c, v.range, today))),
  },
  {
    id: 'social-luck',
    category: 'Pulls',
    title: 'Social luck',
    question: 'What % of my social pulls {range} gave an SSR, against an expected 2?',
    filters: [range],
    reads: reads('pulls', 'totalSsr'),
    compute: (c, v, today) => {
      const rows = rowsIn(c, v.range, today)
      const pulls = total(c[tab].pulls, rows)
      const ssr = total(c[tab].totalSsr, rows)
      return formatShareOf(ssr, pulls)
    },
  },
  {
    id: 'social-biggest-day',
    category: 'Pulls',
    title: 'Biggest social day',
    question: "What is the most social pulls I've made in one day {range}?",
    filters: [range],
    reads: reads('pulls'),
    compute: (c, v, today) => {
      const within = inRange(v.range ?? ANY_PERIOD, today)
      const days = groupByGameDay(c[tab].date)
        .filter(([day]) => within(day))
        .map(([day, rows]) => ({ day, pulls: total(c[tab].pulls, rows) }))
      const best = firstMax(days, (d) => d.pulls)
      return best ? `${formatCount(best.pulls)} (${formatDate(best.day)})` : null
    },
  },
  {
    id: 'social-missing',
    category: 'Pulls',
    title: 'Still missing',
    question: 'How many NIKKE in the social pool have I never pulled from it?',
    reads: [
      { tab: SOCIAL_TAB, columns: ['ssrDetails'] },
      { tab: NIKKE_DATABASE_TAB, columns: ['nikke', 'rarity', 'limited', 'overspec'] },
    ],
    compute: (c) => {
      const db = c[NIKKE_DATABASE_TAB.tab]
      const pool = db.nikke.filter(
        (name, i) =>
          name && db.rarity[i] === 'SSR' && !flagged(db.limited[i]) && !flagged(db.overspec[i]),
      )
      const pulled = new Set(
        c[tab].ssrDetails.flatMap((cell) =>
          String(cell)
            .split(',')
            .map((name) => name.trim()),
        ),
      )
      return pool.length ? formatCount(pool.filter((n) => !pulled.has(String(n))).length) : null
    },
  },
]
