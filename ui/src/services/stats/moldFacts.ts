import { MOLD_TAB, NIKKE_DATABASE_TAB } from '@/config/sheets'
import type { Columns, Fact, Filter, Values } from '@/services/stats/facts'
import {
  formatCount,
  formatDate,
  formatShare,
  formatShareOf,
  formatVsOdds,
} from '@/services/stats/format'
import { ANY_PERIOD, dateRange, inRange } from '@/services/stats/ranges'
import {
  cellGameDay,
  firstMax,
  groupByGameDay,
  longestGap,
  missingFromPool,
  most,
  runs,
  sum,
} from '@/services/stats/rules'
import type { MoldType } from '@/types/molds'

const { tab } = MOLD_TAB
const MAKERS = ['Pilgrim', 'Elysion', 'Missilis', 'Tetra']
const MAKER_TYPES = MAKERS.map((m) => `${m} Mold`)
// The SSR chance of one open, in percent. Typed so a new mold type can't be left out.
const ODDS: Record<MoldType, number> = {
  'Purple Mold': 21,
  'HQ Mold': 61,
  'Yellow Mold': 61, // retired, same odds as HQ
  'Pilgrim Mold': 50,
  'Elysion Mold': 50,
  'Missilis Mold': 50,
  'Tetra Mold': 50,
  'HQ Perfect Mold': 100,
  'Pilgrim Perfect Mold': 100,
  'Elysion Perfect Mold': 100,
  'Missilis Perfect Mold': 100,
  'Tetra Perfect Mold': 100,
}
// A sheet cell may hold no known type; then it is neither.
const odds = (type: string) => ODDS[type as MoldType]
const isPerfect = (type: string) => odds(type) === 100
export const isPlain = (type: string) => odds(type) < 100

const ANY_MOLD = 'any mold'
const ANY_PLAIN = 'any non-Perfect mold'
const ANY_MAKER = 'any manufacturer'
// What each `mold` option matches.
const MOLDS: Record<string, (type: string) => boolean> = {
  [ANY_PLAIN]: isPlain,
  Purple: (t) => t === 'Purple Mold',
  HQ: (t) => t === 'HQ Mold' || t === 'Yellow Mold',
  manufacturer: (t) => MAKER_TYPES.includes(t),
  ...Object.fromEntries(MAKERS.map((m) => [m, (t: string) => t === `${m} Mold`])),
  Perfect: isPerfect,
  [ANY_MOLD]: () => true,
}
const SHARDS_PER_BUST = 12
const SHARDS_PER_PERFECT = 50
const SWEEP_OPENS = 3

// Every dated row with something opened, by game day then row. An undeclared column reads as blank.
export function moldSessions(cols: Columns) {
  const t = cols[tab]
  return t.date
    .flatMap((cell, i) => {
      const day = cellGameDay(cell)
      const opens = Number(t.pulls?.[i] ?? 0)
      if (!day || !opens) return []
      return [
        {
          day,
          type: String(t.moldType?.[i] ?? '').trim(),
          opens,
          ssr: Number(t.totalSsr?.[i] ?? 0),
          names: String(t.ssrDetails?.[i] ?? '')
            .split(',')
            .map((name) => name.trim())
            .filter(Boolean),
        },
      ]
    })
    .sort((a, b) => a.day.localeCompare(b.day))
}
type Session = ReturnType<typeof moldSessions>[number]

const opened = (list: Session[]) => sum(list, (s) => s.opens)
const ssrs = (list: Session[]) => sum(list, (s) => s.ssr)
// Times 100 to stay in whole numbers.
export const expectedX100 = (list: Session[]) => sum(list, (s) => s.opens * odds(s.type))

// The sessions in the chosen range.
function select(cols: Columns, { range = ANY_PERIOD }: Values, today: string) {
  const within = inRange(range, today)
  return moldSessions(cols).filter((s) => within(s.day))
}
const ofMold = (list: Session[], { mold }: Values) => list.filter((s) => MOLDS[mold](s.type))
// The same, for the facts about chance: a Perfect mold is skipped and breaks nothing.
const chanceSessions = (list: Session[], values: Values) =>
  ofMold(list, values).filter((s) => isPlain(s.type))
// The manufacturer 50/50s of the chosen {maker}.
const fifties = (list: Session[], maker = ANY_MAKER) =>
  list.filter((s) =>
    maker === ANY_MAKER ? MAKER_TYPES.includes(s.type) : s.type === `${maker} Mold`,
  )

// A sitting wins or loses its 50/50s; a mixed one does neither.
const outcome = (s: Session) => (s.ssr === s.opens ? 'win' : s.ssr ? 'mixed' : 'lose')

const longestRun = (list: Session[], match: (s: Session) => boolean) =>
  list.length
    ? most(
        runs(list, match, (s) => s.opens),
        (r) => `from ${formatDate(r.day)}`,
      )
    : null

const filter = (id: string, label: string, options: string[], say?: Filter['say']): Filter => ({
  id,
  label,
  options,
  say,
})
const sayMold = (v: string) => (v === ANY_MOLD ? '' : v === ANY_PLAIN ? 'non-Perfect' : v)
const plainMolds = Object.keys(MOLDS).filter((m) => m !== ANY_MOLD && m !== 'Perfect')
const plainMold = filter('mold', 'Mold', plainMolds, sayMold)
const anyMold = filter('mold', 'Mold', Object.keys(MOLDS), sayMold)
const maker = filter('maker', 'Manufacturer', [ANY_MAKER, ...MAKERS], (v) =>
  v === ANY_MAKER ? '' : v,
)
const result = filter('result', 'Result', ['win', 'lose'])
const range = dateRange((cols) => cols[tab].date)

const reads = (...columns: string[]) => [{ tab: MOLD_TAB, columns: ['date', ...columns] }]
const typedReads = reads('moldType', 'pulls', 'totalSsr')

export const MOLD_FACTS: Fact[] = [
  {
    id: 'mold-opened',
    category: 'Pulls',
    title: 'Molds opened',
    question: 'How many {mold} molds did I open {range}?',
    filters: [anyMold, range],
    reads: reads('moldType', 'pulls'),
    compute: (c, v, today) => formatCount(opened(ofMold(select(c, v, today), v))),
  },
  {
    id: 'mold-ssr',
    category: 'Pulls',
    title: 'Mold SSRs',
    question: 'How many SSRs did {mold} molds give me {range}?',
    filters: [anyMold, range],
    reads: typedReads,
    compute: (c, v, today) => formatCount(ssrs(ofMold(select(c, v, today), v))),
  },
  {
    id: 'mold-luck',
    category: 'Pulls',
    title: 'Mold luck',
    question: "What % of my {mold} opens {range} gave an SSR, against what's expected?",
    filters: [plainMold, range],
    reads: typedReads,
    compute: (c, v, today) => {
      const list = chanceSessions(select(c, v, today), v)
      const share = formatShareOf(ssrs(list), opened(list))
      return share && `${share}, expected ${formatShare(expectedX100(list), opened(list) * 100)}`
    },
  },
  {
    id: 'mold-biggest-day',
    category: 'Pulls',
    title: 'Biggest mold day',
    question: "What is the most molds I've opened in one day {range}?",
    filters: [range],
    reads: reads('pulls'),
    compute: (c, v, today) => {
      const list = select(c, v, today)
      const days = groupByGameDay(list.map((s) => s.day)).map(([day, rows]) => ({
        day,
        n: sum(rows, (i) => list[i].opens),
      }))
      return most(days, (d) => formatDate(d.day))
    },
  },
  {
    id: 'mold-bust-run',
    category: 'Pulls',
    title: 'Longest bust run',
    question: "What is the most {mold} molds I've busted in a row {range}?",
    filters: [plainMold, range],
    reads: typedReads,
    // Only SSR-less rows count.
    compute: (c, v, today) => longestRun(chanceSessions(select(c, v, today), v), (s) => !s.ssr),
  },
  {
    id: 'mold-current-bust',
    category: 'Pulls',
    title: 'Current bust run',
    question: 'How many {mold} molds have I opened since my last SSR from one?',
    filters: [plainMold],
    reads: typedReads,
    compute: (c, v) => {
      const list = chanceSessions(moldSessions(c), v)
      const last = list.map((s) => s.ssr > 0).lastIndexOf(true)
      return last < 0 ? null : formatCount(opened(list.slice(last + 1)))
    },
  },
  {
    id: 'mold-ssr-wait',
    category: 'Pulls',
    title: 'Mold SSR wait',
    question: "What is the longest I've waited between mold SSRs?",
    reads: typedReads,
    compute: (c, _, today) =>
      longestGap(
        moldSessions(c)
          .filter((s) => isPlain(s.type) && s.ssr)
          .map((s) => s.day),
        today,
      ),
  },
  {
    id: 'mold-hoard',
    category: 'Pulls',
    title: 'Mold hoard',
    question: "What is the longest I've gone without opening a mold?",
    reads: reads('pulls'),
    compute: (c, _, today) =>
      longestGap(
        moldSessions(c).map((s) => s.day),
        today,
      ),
  },
  {
    id: 'mold-missing',
    category: 'Pulls',
    title: 'Mold still missing',
    question: 'How many NIKKE in the mold pool have I never got from a mold?',
    reads: [
      ...reads('pulls', 'ssrDetails'),
      { tab: NIKKE_DATABASE_TAB, columns: ['nikke', 'rarity', 'limited'] },
    ],
    compute: (c) =>
      missingFromPool(
        c,
        moldSessions(c).flatMap((s) => s.names),
      ),
  },
  {
    id: 'mold-win-streak',
    category: 'Pulls',
    title: '50/50 winning streak',
    question: "What is the most {maker} 50/50s I've won in a row {range}?",
    filters: [maker, range],
    reads: typedReads,
    compute: (c, v, today) =>
      longestRun(fifties(select(c, v, today), v.maker), (s) => outcome(s) === 'win'),
  },
  {
    id: 'mold-loss-streak',
    category: 'Pulls',
    title: '50/50 losing streak',
    question: "What is the most {maker} 50/50s I've lost in a row {range}?",
    filters: [maker, range],
    reads: typedReads,
    compute: (c, v, today) =>
      longestRun(fifties(select(c, v, today), v.maker), (s) => outcome(s) === 'lose'),
  },
  {
    id: 'mold-current-streak',
    category: 'Pulls',
    title: 'Current 50/50 streak',
    question: 'Am I winning or losing my {maker} 50/50s, and for how many?',
    filters: [maker],
    reads: typedReads,
    compute: (c, v) => {
      const list = fifties(moldSessions(c), v.maker)
      const last = list.at(-1)
      if (!last) return null
      const now = outcome(last)
      if (now === 'mixed') return '0 (the last sitting was mixed)'
      const { n } = runs(
        list,
        (s) => outcome(s) === now,
        (s) => s.opens,
      ).at(-1)!
      return `${now === 'win' ? 'winning' : 'losing'}, ${formatCount(n)} in a row`
    },
  },
  {
    id: 'mold-luckiest-maker',
    category: 'Pulls',
    title: 'Luckiest manufacturer',
    question: 'Which manufacturer mold wins me the most {range}?',
    filters: [range],
    reads: typedReads,
    // By share won, not by count; a tie goes to the manufacturer opened first.
    compute: (c, v, today) => {
      const list = fifties(select(c, v, today))
      const best = firstMax(
        [...new Set(list.map((s) => s.type))].map((type) => {
          const own = list.filter((s) => s.type === type)
          return { type, won: ssrs(own), n: opened(own) }
        }),
        (m) => m.won / m.n,
      )
      if (!best) return null
      const name = best.type.replace(' Mold', '')
      return `${name}, ${formatShare(best.won, best.n)}% (${formatCount(best.won)} of ${formatCount(best.n)})`
    },
  },
  {
    id: 'mold-hq-pity',
    category: 'Pulls',
    title: 'HQ pity',
    question: 'How many HQ Perfect Molds have my HQ busts earned?',
    reads: typedReads,
    // HQ Mold rows only: a Yellow bust gave no shards.
    compute: (c) => {
      const list = moldSessions(c).filter((s) => s.type === 'HQ Mold')
      if (!list.length) return null
      const shards = (opened(list) - ssrs(list)) * SHARDS_PER_BUST
      const toward = shards % SHARDS_PER_PERFECT
      return `${formatCount(Math.floor(shards / SHARDS_PER_PERFECT))} (${toward} of ${SHARDS_PER_PERFECT} shards toward the next)`
    },
  },
  {
    id: 'mold-vs-odds',
    category: 'Pulls',
    title: 'Ahead or behind',
    question: 'How many SSRs am I above or below the odds on {mold} molds {range}?',
    filters: [plainMold, range],
    reads: typedReads,
    compute: (c, v, today) => {
      const list = chanceSessions(select(c, v, today), v)
      if (!list.length) return null
      return formatVsOdds(ssrs(list), expectedX100(list))
    },
  },
  {
    id: 'mold-packed-session',
    category: 'Pulls',
    title: 'Mold packed session',
    question: 'What is the most SSRs one sitting of {mold} molds gave me {range}?',
    filters: [plainMold, range],
    reads: typedReads,
    // A row is one mold type in one sitting.
    compute: (c, v, today) =>
      most(
        chanceSessions(select(c, v, today), v).map((s) => ({ day: s.day, n: s.ssr })),
        (s) => formatDate(s.day),
      ),
  },
  {
    id: 'mold-sweeps',
    category: 'Pulls',
    title: '50/50 sweeps',
    question: 'On how many days did I {result} every 50/50 {range}?',
    filters: [result, range],
    reads: typedReads,
    compute: (c, v, today) => {
      const list = fifties(select(c, v, today))
      const swept = groupByGameDay(list.map((s) => s.day)).filter(([, rows]) => {
        const day = rows.map((i) => list[i])
        return opened(day) >= SWEEP_OPENS && day.every((s) => outcome(s) === v.result)
      })
      return formatCount(swept.length)
    },
  },
  {
    id: 'mold-perfect-share',
    category: 'Pulls',
    title: 'Guaranteed share',
    question: 'What % of my mold SSRs {range} came from Perfect molds?',
    filters: [range],
    reads: typedReads,
    compute: (c, v, today) => {
      const list = select(c, v, today)
      return formatShareOf(ssrs(list.filter((s) => isPerfect(s.type))), ssrs(list))
    },
  },
]
