import { SPENDING_TAB } from '@/config/sheets'
import { distinct } from '@/services/stats/anomalyFacts'
import type { Columns, Fact, Filter, Values } from '@/services/stats/facts'
import {
  formatCount,
  formatDate,
  formatMoney,
  formatMonth,
  formatPercent,
} from '@/services/stats/format'
import { ANY_PERIOD, dateRange, inRange } from '@/services/stats/ranges'
import {
  addDays,
  cellGameDay,
  daysBetween,
  firstMax,
  longestGap,
  sum,
} from '@/services/stats/rules'
import { SPENDING_TYPES } from '@/types/spending'
import type { SpendingType } from '@/types/spending'

const { tab } = SPENDING_TAB
const ANY_TYPE = 'any type'
const LAUNCH = '2022-11-04'
const COSTUME_TYPES: string[] = [
  'Costume',
  'Costume Gacha',
  'Event Pass',
  'Mission Pass',
] satisfies SpendingType[]
const PASS_DAYS = 30

const text = (cell: unknown) => String(cell ?? '').trim()

// Rows with any content, in row order. An undeclared column reads as blank.
function purchases(cols: Columns) {
  const t = cols[tab]
  const length = Math.max(0, ...Object.values(t).map((column) => column.length))
  return Array.from({ length }, (_, i) => ({
    date: t.date?.[i],
    day: cellGameDay(t.date?.[i]) ?? '',
    name: text(t.packageName?.[i]),
    type: text(t.type?.[i]),
    idr: Number(t.priceIdr?.[i] ?? 0),
    usd: Number(t.priceUsd?.[i] ?? 0),
    platform: text(t.platform?.[i]),
  })).filter((p) => p.type || p.idr)
}
type Purchase = ReturnType<typeof purchases>[number]

// The chosen type (all under "any type" or without the filter) inside the chosen range.
function select(cols: Columns, { type = ANY_TYPE, range }: Values, today: string) {
  const inside = range === undefined ? () => true : inRange(range, today)
  return purchases(cols).filter((p) => (type === ANY_TYPE || p.type === type) && inside(p.date))
}
const costumes = (cols: Columns, values: Values, today: string) =>
  select(cols, values, today).filter((p) => COSTUME_TYPES.includes(p.type))

// The dated purchase days, oldest first.
const days = (list: Purchase[]) => list.flatMap((p) => p.day || []).sort()

const money = (list: Purchase[], per = 1) =>
  formatMoney(sum(list, (p) => p.idr) / per, sum(list, (p) => p.usd) / per)

// The group that cost the most rupiah; pass the rows in the order ties should go.
function priciestGroup(list: Purchase[], key: (p: Purchase) => string) {
  const groups = new Map<string, Purchase[]>()
  for (const p of list) {
    const k = key(p)
    if (!k) continue
    const group = groups.get(k)
    if (group) group.push(p)
    else groups.set(k, [p])
  }
  return firstMax([...groups], ([, rows]) => sum(rows, (p) => p.idr))
}

const oldestFirst = (cols: Columns) =>
  purchases(cols)
    .filter((p) => p.day)
    .sort((a, b) => a.day.localeCompare(b.day))

const typeFilter = (options: string[], anyText = ''): Filter => ({
  id: 'type',
  label: 'Purchase type',
  options,
  say: (v) => (v === ANY_TYPE ? anyText : v),
})
const anyTypeOr = (anyText?: string) => typeFilter([ANY_TYPE, ...SPENDING_TYPES], anyText)
const anyType = anyTypeOr()
const range = dateRange((cols) => cols[tab].date)

const reads = (...columns: string[]) => [{ tab: SPENDING_TAB, columns }]
const prices = ['priceIdr', 'priceUsd']

export const SPENDING_FACTS: Fact[] = [
  {
    id: 'spending-total',
    category: 'Spending',
    title: 'Money spent',
    question: 'How much have I spent on {type} {range}?',
    filters: [anyTypeOr('anything'), range],
    reads: reads('date', 'type', ...prices),
    compute: (c, v, today) => money(select(c, v, today)),
  },
  {
    id: 'spending-daily',
    category: 'Spending',
    title: 'Daily cost',
    question: 'How much has this game cost me per day?',
    reads: reads(...prices),
    compute: (c, _, today) => {
      const list = purchases(c)
      return list.length ? money(list, daysBetween(LAUNCH, today) + 1) : null
    },
  },
  {
    id: 'spending-count',
    category: 'Spending',
    title: 'Purchase count',
    question: 'How many {type} purchases have I made {range}?',
    filters: [anyType, range],
    reads: reads('date', 'type'),
    compute: (c, v, today) => formatCount(select(c, v, today).length),
  },
  {
    id: 'spending-share',
    category: 'Spending',
    title: 'Money share',
    question: 'What % of my money went to {type} {range}?',
    filters: [typeFilter([...SPENDING_TYPES]), range],
    reads: reads('date', 'type', 'priceIdr'),
    compute: (c, v, today) => {
      const list = select(c, { range: v.range ?? ANY_PERIOD }, today)
      return formatPercent(
        sum(
          list.filter((p) => p.type === v.type),
          (p) => p.idr,
        ),
        sum(list, (p) => p.idr),
      )
    },
  },
  {
    id: 'spending-priciest',
    category: 'Spending',
    title: 'Priciest purchase',
    question: 'What was my priciest {type} purchase {range}?',
    filters: [anyType, range],
    reads: reads('date', 'packageName', 'type', ...prices),
    compute: (c, v, today) => {
      const best = firstMax(select(c, v, today), (p) => p.idr)
      return best ? `${best.name}, ${money([best])}` : null
    },
  },
  {
    id: 'spending-worst-month',
    category: 'Spending',
    title: 'Priciest month',
    question: 'Which month did I spend the most?',
    reads: reads('date', ...prices),
    compute: (c) => {
      const best = priciestGroup(oldestFirst(c), (p) => p.day.slice(0, 7))
      return best ? `${formatMonth(best[0])}, ${money(best[1])}` : null
    },
  },
  {
    id: 'spending-worst-day',
    category: 'Spending',
    title: 'Priciest day',
    question: 'Which day did I spend the most?',
    reads: reads('date', ...prices),
    compute: (c) => {
      const best = priciestGroup(oldestFirst(c), (p) => p.day)
      return best ? `${formatDate(best[0])}, ${money(best[1])}` : null
    },
  },
  {
    id: 'spending-since-last',
    category: 'Spending',
    title: 'Days since buying',
    question: 'How many days since my last {type} purchase?',
    filters: [anyType],
    reads: reads('date', 'type'),
    // Purchases are dated by calendar day, which is ahead of the game day until 03:00.
    compute: (c, v, today) => {
      const last = days(select(c, v, today)).at(-1)
      return last ? formatCount(Math.max(0, daysBetween(last, today))) : null
    },
  },
  {
    id: 'spending-dry-spell',
    category: 'Spending',
    title: 'Longest restraint',
    question: "What's the longest I've gone without buying {type}?",
    filters: [anyTypeOr('anything')],
    reads: reads('date', 'type'),
    compute: (c, v, today) => {
      const bought = days(select(c, v, today))
      const last = bought.at(-1) ?? ''
      // A purchase can be dated past the game day (see since-last), so the stretch ends no earlier.
      return longestGap(bought, last > today ? last : today)
    },
  },
  {
    id: 'spending-pass-lapse',
    category: 'Spending',
    title: 'Pass lapses',
    question: 'How many days have I gone without a monthly pass since my first one?',
    reads: reads('date', 'type'),
    compute: (c, _, today) => {
      const bought = days(select(c, { type: 'Monthly Pass' }, today))
      if (!bought.length) return null
      let uncovered = bought[0] // the first day no pass covers yet
      let lapsed = 0
      for (const day of bought) {
        if (day > uncovered) lapsed += daysBetween(uncovered, day)
        uncovered = addDays(day > uncovered ? day : uncovered, PASS_DAYS)
      }
      if (today >= uncovered) lapsed += daysBetween(uncovered, today) + 1
      return formatCount(lapsed)
    },
  },
  {
    id: 'spending-inflation',
    category: 'Spending',
    title: 'Dollar inflation',
    question: 'By what percent has a dollar on {platform} risen from its cheapest?',
    filters: [
      { id: 'platform', label: 'Platform', options: (c) => distinct(c[tab].platform.map(text)) },
    ],
    reads: reads('date', ...prices, 'platform'),
    compute: (c, v) => {
      const rates = oldestFirst(c)
        .filter((p) => p.platform === v.platform && p.idr && p.usd)
        .map((p) => p.idr / p.usd)
      if (!rates.length) return null
      const cheapest = Math.min(...rates)
      return formatPercent(rates[rates.length - 1] - cheapest, cheapest)
    },
  },
  {
    id: 'spending-costume-total',
    category: 'Spending',
    title: 'Costume money',
    question: 'How much have I spent on costumes {range}?',
    filters: [range],
    reads: reads('date', 'type', ...prices),
    compute: (c, v, today) => money(costumes(c, v, today)),
  },
  {
    id: 'spending-costume-average',
    category: 'Spending',
    title: 'Average costume price',
    question: 'What do I pay per costume purchase on average {range}?',
    filters: [range],
    reads: reads('date', 'type', ...prices),
    compute: (c, v, today) => {
      const list = costumes(c, v, today)
      return list.length ? money(list, list.length) : null
    },
  },
  {
    id: 'spending-victim',
    category: 'Spending',
    title: 'Biggest weakness',
    question: 'Which NIKKE have I spent the most on {range}?',
    filters: [range],
    reads: reads('date', 'packageName', 'type', ...prices),
    // The NIKKE is what precedes the type in packageName.
    compute: (c, v, today) => {
      const best = priciestGroup(costumes(c, v, today), (p) =>
        p.name.slice(0, Math.max(0, p.name.lastIndexOf(` ${p.type}`))),
      )
      return best ? `${best[0]}, ${money(best[1])}` : null
    },
  },
]
