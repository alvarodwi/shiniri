import { NIKKE_DATABASE_TAB, ORDINARY_TAB } from '@/config/sheets'
import type { Columns, Fact, Filter, Values } from '@/services/stats/facts'
import { formatCount, formatDate, formatPlural, formatShareOf } from '@/services/stats/format'
import { ANY_PERIOD, dateRange, inRange } from '@/services/stats/ranges'
import {
  cellGameDay,
  daysBetween,
  groupByGameDay,
  missingFromPool,
  most,
  namesWhere,
  sum,
} from '@/services/stats/rules'

const { tab } = ORDINARY_TAB
const CURRENCIES = ['gems', 'tickets', 'pulls'] as const
type Currency = (typeof CURRENCIES)[number]
const GEMS_PER_MILEAGE = 300

// Every dated row, by game day then row. A column the fact did not declare reads as blank.
function sessions(cols: Columns) {
  const t = cols[tab]
  return t.date
    .flatMap((cell, i) => {
      const day = cellGameDay(cell)
      if (!day) return []
      return [
        {
          day,
          gems: Number(t.gems?.[i] ?? 0),
          tickets: Number(t.tickets?.[i] ?? 0),
          pulls: Number(t.pulls?.[i] ?? 0),
          totalSsr: Number(t.totalSsr?.[i] ?? 0),
          names: String(t.ssrDetails?.[i] ?? '')
            .split(',')
            .map((name) => name.trim())
            .filter(Boolean),
        },
      ]
    })
    .sort((a, b) => a.day.localeCompare(b.day))
}
type Session = ReturnType<typeof sessions>[number]
type Amount = Currency | 'totalSsr'

const total = (list: Session[], column: Amount) => sum(list, (s) => s[column])

// The sessions in the chosen range.
function select(cols: Columns, { range = ANY_PERIOD }: Values, today: string) {
  const within = inRange(range, today)
  return sessions(cols).filter((s) => within(s.day))
}
const gemSessions = (list: Session[]) => list.filter((s) => s.gems > 0)

const hasOne = (s: Session, names: Set<string>) => s.names.some((n) => names.has(n))

const currency: Filter = { id: 'currency', label: 'Currency', options: [...CURRENCIES] }
const range = dateRange((cols) => cols[tab].date)

const reads = (...columns: string[]) => [{ tab: ORDINARY_TAB, columns: ['date', ...columns] }]
const withDb = (ordinary: string[], db: string[]) => [
  ...reads(...ordinary),
  { tab: NIKKE_DATABASE_TAB, columns: ['nikke', ...db] },
]

export const ORDINARY_FACTS: Fact[] = [
  {
    id: 'ordinary-pulls',
    category: 'Pulls',
    title: 'Ordinary pulls',
    question: 'How many {currency} did I spend on ordinary pulls {range}?',
    filters: [currency, range],
    reads: reads(...CURRENCIES),
    compute: (c, v, today) => formatCount(total(select(c, v, today), v.currency as Currency)),
  },
  {
    id: 'ordinary-ssr',
    category: 'Pulls',
    title: 'Ordinary SSRs',
    question: 'How many SSRs did ordinary pulls give me {range}?',
    filters: [range],
    reads: reads('totalSsr'),
    compute: (c, v, today) => formatCount(total(select(c, v, today), 'totalSsr')),
  },
  {
    id: 'ordinary-luck',
    category: 'Pulls',
    title: 'Ordinary luck',
    question: 'What % of my ordinary pulls {range} gave an SSR, against an expected 4?',
    filters: [range],
    reads: reads('pulls', 'totalSsr'),
    compute: (c, v, today) => {
      const list = select(c, v, today)
      return formatShareOf(total(list, 'totalSsr'), total(list, 'pulls'))
    },
  },
  {
    id: 'ordinary-biggest-day',
    category: 'Pulls',
    title: 'Biggest ordinary day',
    question: "What is the most {currency} I've spent on ordinary pulls in one day {range}?",
    filters: [currency, range],
    reads: reads(...CURRENCIES),
    compute: (c, v, today) => {
      const list = select(c, v, today)
      const days = groupByGameDay(list.map((s) => s.day)).map(([day, rows]) => ({
        day,
        n: sum(rows, (i) => list[i][v.currency as Currency]),
      }))
      return most(days, (d) => formatDate(d.day))
    },
  },
  {
    id: 'ordinary-missing',
    category: 'Pulls',
    title: 'Ordinary still missing',
    question: 'How many NIKKE in the ordinary pool have I never pulled from it?',
    reads: withDb(['ssrDetails'], ['rarity', 'limited']),
    compute: (c) =>
      missingFromPool(
        c,
        sessions(c).flatMap((s) => s.names),
      ),
  },
  {
    id: 'ordinary-pilgrim-share',
    category: 'Pulls',
    title: 'Pilgrim share',
    question: 'What % of my SSRs from ordinary pulls {range} were Pilgrim?',
    filters: [range],
    reads: withDb(['ssrDetails'], ['overspec']),
    compute: (c, v, today) => {
      const names = select(c, v, today).flatMap((s) => s.names)
      const overspec = namesWhere(c, 'overspec') // what a Pilgrim means here
      return formatShareOf(names.filter((n) => overspec.has(n)).length, names.length)
    },
  },
  {
    id: 'ordinary-pilgrim-drought',
    category: 'Pulls',
    title: 'Current Pilgrim dry run',
    question: 'How many ordinary pulls have I made since my last Pilgrim?',
    reads: withDb(['pulls', 'ssrDetails'], ['overspec']),
    // Whole sessions: the one that gave the Pilgrim counts none of its pulls.
    compute: (c) => {
      const list = sessions(c)
      const overspec = namesWhere(c, 'overspec') // what a Pilgrim means here
      const last = list.map((s) => hasOne(s, overspec)).lastIndexOf(true)
      return last < 0 ? null : formatCount(total(list.slice(last + 1), 'pulls'))
    },
  },
  {
    id: 'ordinary-pilgrim-dry-run',
    category: 'Pulls',
    title: 'Longest Pilgrim dry run',
    question: 'What is the most ordinary pulls in a row without a Pilgrim {range}?',
    filters: [range],
    reads: withDb(['pulls', 'ssrDetails'], ['overspec']),
    compute: (c, v, today) => {
      const list = select(c, v, today)
      if (!list.length) return null // no sessions, as opposed to a run of 0
      const overspec = namesWhere(c, 'overspec') // what a Pilgrim means here
      const runs = [{ day: '', n: 0 }]
      for (const s of list) {
        const run = runs[runs.length - 1]
        if (hasOne(s, overspec)) runs.push({ day: '', n: 0 })
        else {
          run.day ||= s.day
          run.n += s.pulls
        }
      }
      return most(runs, (r) => `from ${formatDate(r.day)}`)
    },
  },
  {
    id: 'ordinary-splurges',
    category: 'Pulls',
    title: 'Gem splurges',
    question: 'On how many days did I spend gems on ordinary pulls {range}?',
    filters: [range],
    reads: reads('gems'),
    compute: (c, v, today) =>
      formatCount(new Set(gemSessions(select(c, v, today)).map((s) => s.day)).size),
  },
  {
    id: 'ordinary-last-splurge',
    category: 'Pulls',
    title: 'Since last splurge',
    question: 'How long has it been since I spent gems on ordinary pulls?',
    reads: reads('gems'),
    compute: (c, _, today) => {
      const last = gemSessions(sessions(c)).at(-1)
      if (!last) return null
      return `${formatPlural(daysBetween(last.day, today), 'day')} (${formatDate(last.day)})`
    },
  },
  {
    id: 'ordinary-mileage-forgone',
    category: 'Pulls',
    title: 'Gold mileage forgone',
    question:
      'How much gold mileage would the gems I spent on ordinary pulls {range} have earned on event banners?',
    filters: [range],
    reads: reads('gems'),
    compute: (c, v, today) =>
      formatCount(Math.floor(total(select(c, v, today), 'gems') / GEMS_PER_MILEAGE)),
  },
  {
    id: 'ordinary-gem-luck',
    category: 'Pulls',
    title: 'Gem luck',
    question: 'What % of my pulls in gem sessions {range} gave an SSR, against an expected 4?',
    filters: [range],
    reads: reads('gems', 'pulls', 'totalSsr'),
    compute: (c, v, today) => {
      const list = gemSessions(select(c, v, today))
      return formatShareOf(total(list, 'totalSsr'), total(list, 'pulls'))
    },
  },
]
