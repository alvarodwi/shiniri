import { SOLO_RAID_TAB } from '@/config/sheets'
import { distinct } from '@/services/stats/anomalyFacts'
import type { Columns, Fact, Filter, Values } from '@/services/stats/facts'
import {
  formatCount,
  formatLarge,
  formatMonth,
  formatPlural,
  formatSigned,
} from '@/services/stats/format'
import { dateRange, inRange } from '@/services/stats/ranges'
import { cellGameDay, firstMax } from '@/services/stats/rules'
import { WEAKNESSES } from '@/types/soloRaid'

const { tab } = SOLO_RAID_TAB
const ANY_WEAKNESS = 'any weakness'

// `pct` is the top percentage; a placement counts as 0 and keeps its number in `place`. Takes "x%"
// and "#n" text, and a percent-formatted cell, which reads as a fraction.
function parseRank(cell: unknown): { pct: number; place?: number } | null {
  if (typeof cell === 'number') return { pct: Math.round(cell * 10_000) / 100 }
  const text = String(cell ?? '').trim()
  const place = text.match(/^#(\d+)$/)?.[1]
  if (place) return { pct: 0, place: Number(place) }
  const pct = text.match(/^(\d+(?:\.\d+)?)%$/)?.[1]
  return pct ? { pct: Number(pct) } : null
}

const day = ({ month }: { month: unknown }) => cellGameDay(month) ?? ''

// Oldest season first (by month when `season` is not declared), so ties go to the earliest. A
// declared but blank season is no row. Columns a fact did not declare read as blank; an empty or "-" damage is not tracked.
function seasons(cols: Columns) {
  const t = cols[tab]
  const text = (name: string, i: number) => String(t[name]?.[i] ?? '')
  return t[t.season ? 'season' : 'month']
    .flatMap((_, i) => {
      if (t.season && !text('season', i)) return []
      const damage = Number(t.damage?.[i])
      return [
        {
          season: Number(t.season?.[i]),
          month: t.month?.[i],
          boss: text('boss', i),
          weakness: text('weakness', i),
          damage: damage > 0 ? damage : null,
          rank: parseRank(t.rank?.[i]),
        },
      ]
    })
    .sort((a, b) => a.season - b.season || day(a).localeCompare(day(b)))
}
type Season = ReturnType<typeof seasons>[number]
type Ranked = Season & { rank: NonNullable<Season['rank']> }

// The seasons in range, against the chosen weakness when the fact has one.
function select(
  cols: Columns,
  { weakness = ANY_WEAKNESS, range }: Values,
  today: string,
): Season[] {
  const within = range === undefined ? null : inRange(range, today)
  return seasons(cols).filter(
    (s) => (!within || within(s.month)) && (weakness === ANY_WEAKNESS || s.weakness === weakness),
  )
}
const ranked = (list: Season[]) => list.filter((s): s is Ranked => s.rank !== null)

// 1, 2 or 3, by final rank.
const tier = ({ pct }: { pct: number }) => (pct <= 3 ? 3 : pct <= 10 ? 2 : 1)
// Higher is better; every placement beats every percentage.
const rankScore = ({ rank }: Ranked) => (rank.place === undefined ? -rank.pct : 1e6 - rank.place)
const showRank = ({ rank }: Ranked) =>
  rank.place === undefined ? `${rank.pct.toFixed(2)}%` : `#${rank.place}`

const monthOf = (s: Season) => (day(s) ? formatMonth(day(s)) : null)
const showSeason = (s: Season) =>
  `${s.boss} (${[`season ${s.season}`, monthOf(s)].filter(Boolean).join(', ')})`

const mean = (numbers: number[]) => numbers.reduce((a, b) => a + b, 0) / numbers.length
const showAverage = (list: Ranked[]) =>
  `${mean(list.map((s) => s.rank.pct)).toFixed(2)}% over ${formatPlural(list.length, 'season')}`

// "in 2026" or "in H1 2026", with the period before it.
const periodsOf = (day: string) => {
  const year = day.slice(0, 4)
  return [`in H${day.slice(5, 7) <= '06' ? 1 : 2} ${year}`, `in ${year}`]
}
const periodBefore = (period: string) => {
  const [, half, year] = period.match(/^in (?:H([12]) )?(\d{4})$/)!
  if (!half) return `in ${Number(year) - 1}`
  return half === '2' ? `in H1 ${year}` : `in H2 ${Number(year) - 1}`
}
// The damages per period.
function damages(cols: Columns) {
  const map = new Map<string, number[]>()
  for (const s of seasons(cols)) {
    if (!day(s) || s.damage === null) continue
    for (const p of periodsOf(day(s))) map.set(p, [...(map.get(p) ?? []), s.damage])
  }
  return map
}
const comparable = (map: Map<string, number[]>, period: string) =>
  map.has(period) && (map.get(periodBefore(period))?.length ?? 0) >= 2

const frame: Filter = { id: 'frame', label: 'Frame', options: ['tier 3', 'tier 2', 'tier 1'] }
const weakness: Filter = {
  id: 'weakness',
  label: 'Weakness',
  options: [ANY_WEAKNESS, ...WEAKNESSES],
}
const boss: Filter = {
  id: 'boss',
  label: 'Boss',
  options: (cols) => distinct(ranked(seasons(cols)).map((s) => s.boss)),
}
const period: Filter = {
  id: 'period',
  label: 'Period',
  options: (cols) => {
    const map = damages(cols)
    // by year, then H1, H2, the whole year
    const key = (p: string) => `${p.slice(-4)} ${p.length > 7 ? p : 'in W'}`
    return [...map.keys()]
      .filter((p) => comparable(map, p))
      .sort((a, b) => key(a).localeCompare(key(b)))
  },
}
// Seasons are monthly, so a preset says little.
const range = dateRange((cols) => cols[tab].month, { quick: false })

const reads = (...columns: string[]) => [{ tab: SOLO_RAID_TAB, columns }]
const RESULT = ['season', 'month', 'boss', 'rank']

export const SOLO_RAID_FACTS: Fact[] = [
  {
    id: 'soloraid-frames',
    category: 'Raids',
    title: 'Frame count',
    question: 'How many {frame} frames have I got {range}?',
    filters: [frame, range],
    reads: reads('month', 'rank'),
    compute: (c, v, today) =>
      formatCount(
        ranked(select(c, v, today)).filter((s) => `tier ${tier(s.rank)}` === v.frame).length,
      ),
  },
  {
    id: 'soloraid-last-frame',
    category: 'Raids',
    title: 'Last frame',
    question: 'When did I last get a {frame} frame against {weakness}?',
    filters: [frame, weakness],
    reads: reads(...RESULT, 'weakness'),
    compute: (c, v, today) => {
      const last = ranked(select(c, v, today))
        .filter((s) => `tier ${tier(s.rank)}` === v.frame)
        .at(-1)
      return last ? showSeason(last) : null
    },
  },
  {
    id: 'soloraid-near-miss',
    category: 'Raids',
    title: 'Closest miss',
    question: 'How close have I come to a tier 3 frame without getting it {range}?',
    filters: [range],
    reads: reads(...RESULT),
    compute: (c, v, today) => {
      const best = firstMax(
        ranked(select(c, v, today)).filter((s) => tier(s.rank) < 3),
        rankScore,
      )
      return best ? `${showRank(best)}, ${showSeason(best)}` : null
    },
  },
  {
    id: 'soloraid-drought',
    category: 'Raids',
    title: 'Tier 3 drought',
    question: "What is the most seasons in a row I've gone without a tier 3 frame?",
    reads: reads('season', 'rank'),
    compute: (c) => {
      let current = 0
      let longest = 0
      for (const s of ranked(seasons(c))) {
        current = tier(s.rank) === 3 ? 0 : current + 1
        longest = Math.max(longest, current)
      }
      return formatCount(longest)
    },
  },
  {
    id: 'soloraid-average-rank',
    category: 'Raids',
    title: 'Average rank',
    question: 'What is my average rank against {weakness} {range}?',
    filters: [weakness, range],
    reads: reads('month', 'weakness', 'rank'),
    compute: (c, v, today) => {
      const list = ranked(select(c, v, today))
      return list.length ? showAverage(list) : null
    },
  },
  {
    id: 'soloraid-best-weakness',
    category: 'Raids',
    title: 'Best weakness',
    question: 'Which weakness do I rank best against {range}?',
    filters: [range],
    reads: reads('month', 'weakness', 'rank'),
    compute: (c, v, today) => {
      const groups = new Map<string, Ranked[]>()
      for (const s of ranked(select(c, v, today)))
        if (s.weakness) groups.set(s.weakness, [...(groups.get(s.weakness) ?? []), s])
      const best = firstMax([...groups], ([, list]) => -mean(list.map((s) => s.rank.pct)))
      return best ? `${best[0]}, ${showAverage(best[1])}` : null
    },
  },
  {
    id: 'soloraid-best-rank',
    category: 'Raids',
    title: 'Best rank',
    question: 'What is my best rank against {weakness} {range}?',
    filters: [weakness, range],
    reads: reads(...RESULT, 'weakness'),
    compute: (c, v, today) => {
      const best = firstMax(ranked(select(c, v, today)), rankScore)
      return best ? `${showRank(best)}, ${showSeason(best)}` : null
    },
  },
  {
    id: 'soloraid-top-damage',
    category: 'Raids',
    title: 'Highest damage',
    question: 'What is my highest damage against {weakness} {range}?',
    filters: [weakness, range],
    reads: reads('season', 'month', 'boss', 'weakness', 'damage'),
    compute: (c, v, today) => {
      const best = firstMax(
        select(c, v, today).filter((s) => s.damage !== null),
        (s) => s.damage!,
      )
      return best ? `${formatLarge(best.damage!)}, ${showSeason(best)}` : null
    },
  },
  {
    id: 'soloraid-last-boss',
    category: 'Raids',
    title: 'Last boss result',
    question: 'How did I rank the last time I fought {boss}?',
    filters: [boss],
    reads: reads(...RESULT),
    compute: (c, v) => {
      const last = ranked(seasons(c))
        .filter((s) => s.boss === v.boss)
        .at(-1)
      if (!last) return null
      const month = monthOf(last)
      return `${showRank(last)}, season ${last.season}${month ? ` (${month})` : ''}`
    },
  },
  {
    id: 'soloraid-power-creep',
    category: 'Raids',
    title: 'Power creep',
    question: 'How much has my average damage grown {period} over the period before?',
    filters: [period],
    reads: reads('month', 'damage'),
    compute: (c, v) => {
      const map = damages(c)
      if (!comparable(map, v.period)) return null
      const before = mean(map.get(periodBefore(v.period))!)
      const now = mean(map.get(v.period)!)
      const growth = Math.round(((now - before) / before) * 100)
      return `${formatSigned(growth)} (${formatLarge(before)} to ${formatLarge(now)})`
    },
  },
]
