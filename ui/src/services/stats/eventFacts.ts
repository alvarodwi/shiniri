import { EVENT_TAB, NIKKE_DATABASE_TAB } from '@/config/sheets'
import { distinct } from '@/services/stats/anomalyFacts'
import type { Columns, Fact, Filter, Values } from '@/services/stats/facts'
import { formatCount, formatDate, formatPlural, formatShareOf } from '@/services/stats/format'
import { ANY_PERIOD, dateRange, inRange } from '@/services/stats/ranges'
import {
  cellGameDay,
  daysBetween,
  firstMax,
  flagged,
  groupByGameDay,
  most,
  namesWhere,
  sum,
  topWithCount,
} from '@/services/stats/rules'

const { tab } = EVENT_TAB
const DB = NIKKE_DATABASE_TAB.tab
const ANY_TYPE = 'any banner type'
const ANY_RATE_UP = 'any rate-up'
const PILGRIM_BANNERS = ['Pilgrim Limited', 'Summer Pilgrim Limited']
const CURRENCIES = ['gems', 'tickets', 'pulls'] as const
type Currency = (typeof CURRENCIES)[number]
// A banner lasts at most about a month: a longer gap starts a new chase, and a chase that starts
// later than this after the release is a rerun.
const BANNER_DAYS = 30
const SPARK_PULLS = 200
// Copies of the rate-up each goal takes.
export const GOALS: Record<string, number> = { 'first copy': 1, MLB: 4, 'core 7': 11 }

// Every dated row, by game day then row. A column the fact did not declare reads as blank.
function sessions(cols: Columns) {
  const t = cols[tab]
  const text = (name: string, i: number) => String(t[name]?.[i] ?? '').trim()
  return t.date
    .flatMap((cell, i) => {
      const day = cellGameDay(cell)
      if (!day) return []
      return [
        {
          day,
          rateUp: text('rateUpName', i),
          type: text('rateUpType', i),
          gems: Number(text('gems', i)),
          tickets: Number(text('tickets', i)),
          pulls: Number(text('pulls', i)),
          totalSsr: Number(text('totalSsr', i)),
          names: text('ssrDetails', i)
            .split(',')
            .map((name) => name.trim())
            .filter(Boolean),
        },
      ]
    })
    .sort((a, b) => a.day.localeCompare(b.day))
}
type Session = ReturnType<typeof sessions>[number]

const spent = (list: Session[], currency: Currency) => sum(list, (s) => s[currency])
// The chosen {currency}; the filter offers only CURRENCIES.
const chosen = (values: Values) => values.currency as Currency

// Any SSR that isn't the rate-up. A session with no rate-up has no spooks.
const spooks = ({ rateUp, names }: Session) => (rateUp ? names.filter((n) => n !== rateUp) : [])
const copies = ({ rateUp, names }: Session) => names.filter((n) => n === rateUp).length

// The sessions of one rate-up during one banner, oldest chase first. Free pulls on a rerun are no
// chase. `won` is the index of the session that gave the first copy, -1 for a failed chase.
function chases(cols: Columns, all = sessions(cols)) {
  const db = cols[DB]
  const released = new Map(
    db.nikke.map((name, i) => [String(name), cellGameDay(db.releaseDate[i])]),
  )
  const grouped: Session[][] = []
  const open = new Map<string, Session[]>()
  for (const s of all) {
    if (!s.rateUp) continue
    const chase = open.get(s.rateUp)
    if (chase && daysBetween(chase[chase.length - 1].day, s.day) <= BANNER_DAYS) chase.push(s)
    else {
      grouped.push([s])
      open.set(s.rateUp, grouped[grouped.length - 1])
    }
  }
  return grouped.flatMap((list) => {
    const [{ rateUp, day }] = list
    const release = released.get(rateUp)
    const rerun = !!release && daysBetween(release, day) > BANNER_DAYS
    const won = list.findIndex((s) => copies(s) > 0)
    if (rerun && won < 0 && !spent(list, 'gems')) return []
    return [{ rateUp, day, list, won, copies: sum(list, copies) }]
  })
}
type Chase = ReturnType<typeof chases>[number]

// The chases of the chosen rate-up whose first session is in range.
export function chasing(
  cols: Columns,
  { rateUp = ANY_RATE_UP, range = ANY_PERIOD }: Values,
  today: string,
) {
  const within = inRange(range, today)
  return chases(cols).filter(
    (c) => within(c.day) && (rateUp === ANY_RATE_UP || c.rateUp === rateUp),
  )
}
export const failed = (list: Chase[]) => list.filter((c) => c.won < 0)
const successful = (list: Chase[]) => list.filter((c) => c.won >= 0)
// The sessions after the one that gave the first copy.
const greed = (c: Chase) => (c.won < 0 ? [] : c.list.slice(c.won + 1))
// The sessions up to and including the one that reached `goal` copies; null if it never did.
function upTo(c: Chase, goal: number): Session[] | null {
  let have = 0
  const i = c.list.findIndex((s) => (have += copies(s)) >= goal)
  return i < 0 ? null : c.list.slice(0, i + 1)
}
// The sessions up to the first copy, for a successful chase.
const toWin = (c: Chase) => c.list.slice(0, c.won + 1)
// Spooks before the first rate-up, in ssrDetails order.
const spooksFirst = (c: Chase) =>
  toWin(c)
    .flatMap((s) => s.names)
    .indexOf(c.rateUp)
// The chases that reached `goal`, with the sessions it took.
const reaching = (list: Chase[], goal: string) =>
  list.flatMap((c) => {
    const took = upTo(c, GOALS[goal])
    return took ? [{ ...c, took }] : []
  })
const chaseName = (c: Chase) => `${c.rateUp}, ${formatDate(c.day)}`
const mostChase = (list: Chase[], of: (c: Chase) => number) =>
  most(
    list.map((c) => ({ ...c, n: of(c) })),
    chaseName,
  )

// The sessions in range, on the chosen banner type when the fact has one.
function select(cols: Columns, { type = ANY_TYPE, range = ANY_PERIOD }: Values, today: string) {
  const within = inRange(range, today)
  return sessions(cols).filter((s) => within(s.day) && (type === ANY_TYPE || s.type === type))
}

const currency: Filter = { id: 'currency', label: 'Currency', options: [...CURRENCIES] }
const type: Filter = {
  id: 'type',
  label: 'Banner type',
  options: (cols) => [ANY_TYPE, ...distinct(cols[tab].rateUpType)],
  say: (v) => (v === ANY_TYPE ? '' : v),
}
const range = dateRange((cols) => cols[tab].date)
const rateUpNames = (cols: Columns) => distinct(cols[tab].rateUpName)
const rateUp: Filter = {
  id: 'rateUp',
  label: 'Rate-up',
  options: (cols) => [ANY_RATE_UP, ...rateUpNames(cols)],
}
const oneRateUp: Filter = { id: 'rateUp', label: 'Rate-up', options: rateUpNames }
const goal: Filter = { id: 'goal', label: 'Goal', options: Object.keys(GOALS) }
const odds: Filter = { id: 'odds', label: 'Odds', options: ['1%', '2%'] }

const reads = (...columns: string[]) => [{ tab: EVENT_TAB, columns: ['date', ...columns] }]
const withDb = (event: string[], db: string[]) => [
  ...reads(...event),
  { tab: NIKKE_DATABASE_TAB, columns: ['nikke', ...db] },
]
// What `chases` needs, plus what the fact itself counts.
const chaseReads = (...event: string[]) =>
  withDb(['rateUpName', 'ssrDetails', 'gems', ...event], ['releaseDate'])

const costReads = chaseReads('tickets', 'pulls')

// A rate-up on a Pilgrim banner, summer or not, is 1% whatever its manufacturer; any other 2%.
function onOdds(cols: Columns, values: Values, today: string) {
  return select(cols, { range: values.range }, today).filter(
    (s) => s.rateUp && (PILGRIM_BANNERS.includes(s.type) ? '1%' : '2%') === values.odds,
  )
}
const spookList = (cols: Columns, values: Values, today: string) =>
  chasing(cols, values, today).flatMap((c) => c.list.flatMap(spooks))

export const EVENT_FACTS: Fact[] = [
  {
    id: 'event-pulls',
    category: 'Pulls',
    title: 'Event pulls',
    question: 'How many {currency} did I spend on {type} event pulls {range}?',
    filters: [currency, type, range],
    reads: reads('rateUpType', ...CURRENCIES),
    compute: (c, v, today) => formatCount(spent(select(c, v, today), chosen(v))),
  },
  {
    id: 'event-ssrs',
    category: 'Pulls',
    title: 'Event SSRs',
    question: 'How many SSRs did {type} event pulls give me {range}?',
    filters: [type, range],
    reads: reads('rateUpType', 'totalSsr'),
    compute: (c, v, today) => formatCount(sum(select(c, v, today), (s) => s.totalSsr)),
  },
  {
    id: 'event-luck',
    category: 'Pulls',
    title: 'Event luck',
    question: 'What % of my {type} event pulls {range} gave an SSR, against an expected 4?',
    filters: [type, range],
    reads: reads('rateUpType', 'pulls', 'totalSsr'),
    compute: (c, v, today) => {
      const list = select(c, v, today)
      return formatShareOf(
        sum(list, (s) => s.totalSsr),
        spent(list, 'pulls'),
      )
    },
  },
  {
    id: 'event-biggest-day',
    category: 'Pulls',
    title: 'Biggest event day',
    question: "What is the most {currency} I've spent on event pulls in one day {range}?",
    filters: [currency, range],
    reads: reads(...CURRENCIES),
    compute: (c, v, today) => {
      const list = select(c, v, today)
      const days = groupByGameDay(list.map((s) => s.day)).map(([day, rows]) => ({
        day,
        n: spent(
          rows.map((i) => list[i]),
          chosen(v),
        ),
      }))
      return most(days, (d) => formatDate(d.day))
    },
  },
  {
    id: 'event-still-missing',
    category: 'Pulls',
    title: 'Event still missing',
    question: "How many NIKKE I've had a chance at have I never pulled from event pulls?",
    reads: withDb(['rateUpName', 'ssrDetails'], ['rarity', 'limited']),
    compute: (c) => {
      const list = sessions(c)
      const chanced = new Set(list.map((s) => s.rateUp))
      const pulled = new Set(list.flatMap((s) => s.names))
      const db = c[DB]
      const pool = db.nikke
        .map(String)
        .filter(
          (name, i) =>
            name && db.rarity[i] === 'SSR' && (!flagged(db.limited[i]) || chanced.has(name)),
        )
      return pool.length ? formatCount(pool.filter((name) => !pulled.has(name)).length) : null
    },
  },
  {
    id: 'event-rate-up-luck',
    category: 'Pulls',
    title: 'Rate-up luck',
    question: 'What % of my pulls on {odds} banners {range} gave the rate-up?',
    filters: [odds, range],
    reads: reads('rateUpName', 'rateUpType', 'pulls', 'ssrDetails'),
    compute: (c, v, today) => {
      const list = onOdds(c, v, today)
      return formatShareOf(sum(list, copies), spent(list, 'pulls'))
    },
  },
  {
    id: 'event-rate-up-share',
    category: 'Pulls',
    title: 'Rate-up share',
    question: 'What % of my SSRs from {odds} banners {range} were the rate-up?',
    filters: [odds, range],
    reads: reads('rateUpName', 'rateUpType', 'ssrDetails'),
    compute: (c, v, today) => {
      const list = onOdds(c, v, today)
      return formatShareOf(
        sum(list, copies),
        sum(list, (s) => s.names.length),
      )
    },
  },
  {
    id: 'event-spook-count',
    category: 'Pulls',
    title: 'Spook count',
    question: 'How many times did chasing {rateUp} spook me {range}?',
    filters: [rateUp, range],
    reads: chaseReads(),
    compute: (c, v, today) => formatCount(spookList(c, v, today).length),
  },
  {
    id: 'event-pilgrim-spooks',
    category: 'Pulls',
    title: 'Pilgrim spooks',
    question: 'How many Pilgrim spooks did chasing {rateUp} give me {range}?',
    filters: [rateUp, range],
    reads: withDb(['rateUpName', 'ssrDetails', 'gems'], ['releaseDate', 'overspec']),
    compute: (c, v, today) => {
      const overspec = namesWhere(c, 'overspec')
      return formatCount(spookList(c, v, today).filter((n) => overspec.has(n)).length)
    },
  },
  {
    id: 'event-frequent-spooker',
    category: 'Pulls',
    title: 'Frequent spooker',
    question: 'Which NIKKE spooked me most while chasing {rateUp} {range}?',
    filters: [rateUp, range],
    reads: chaseReads(),
    compute: (c, v, today) => topWithCount(spookList(c, v, today), 'spook'),
  },
  {
    id: 'event-worst-spook-streak',
    category: 'Pulls',
    title: 'Worst spook streak',
    question: 'What is the most spooks I sat through in one chase before {rateUp} arrived {range}?',
    filters: [rateUp, range],
    reads: chaseReads(),
    compute: (c, v, today) => {
      return mostChase(successful(chasing(c, v, today)), spooksFirst)
    },
  },
  {
    id: 'event-clean-wins',
    category: 'Pulls',
    title: 'Clean wins',
    question: 'How many chases gave me the rate-up before any spook {range}?',
    filters: [range],
    reads: chaseReads(),
    compute: (c, v, today) =>
      formatCount(successful(chasing(c, v, today)).filter((x) => spooksFirst(x) === 0).length),
  },
  {
    id: 'event-chase-record',
    category: 'Pulls',
    title: 'Chase record',
    question: 'How many of my chases reached {goal} {range}?',
    filters: [goal, range],
    reads: chaseReads(),
    compute: (c, v, today) =>
      formatCount(chasing(c, v, today).filter((x) => x.copies >= GOALS[v.goal]).length),
  },
  {
    id: 'event-priciest-chase',
    category: 'Pulls',
    title: 'Priciest chase',
    question: 'What is the most {currency} one chase took {range}?',
    filters: [currency, range],
    reads: costReads,
    compute: (c, v, today) => mostChase(chasing(c, v, today), (x) => spent(x.list, chosen(v))),
  },
  {
    id: 'event-costliest-failure',
    category: 'Pulls',
    title: 'Costliest failure',
    question: 'What is the most {currency} a failed chase drained {range}?',
    filters: [currency, range],
    reads: costReads,
    compute: (c, v, today) =>
      mostChase(failed(chasing(c, v, today)), (x) => spent(x.list, chosen(v))),
  },
  {
    id: 'event-wasted-on-failures',
    category: 'Pulls',
    title: 'Wasted on failures',
    question: 'How many {currency} went into failed chases {range}?',
    filters: [currency, range],
    reads: costReads,
    compute: (c, v, today) =>
      formatCount(sum(failed(chasing(c, v, today)), (x) => spent(x.list, chosen(v)))),
  },
  {
    id: 'event-price-of-success',
    category: 'Pulls',
    title: 'Price of success',
    question: 'How many {currency} did reaching {goal} of {rateUp} take on average {range}?',
    filters: [currency, goal, rateUp, range],
    reads: costReads,
    compute: (c, v, today) => {
      const costs = reaching(chasing(c, v, today), v.goal).map((x) => spent(x.took, chosen(v)))
      if (!costs.length) return null
      const average = Math.round(sum(costs, (n) => n) / costs.length)
      return `${formatCount(average)} over ${formatPlural(costs.length, 'chase')}`
    },
  },
  {
    id: 'event-quickest-win',
    category: 'Pulls',
    title: 'Quickest win',
    question: 'What is the fewest pulls a chase took to reach {goal} {range}?',
    filters: [goal, range],
    reads: chaseReads('pulls'),
    compute: (c, v, today) => {
      const reached = reaching(chasing(c, v, today), v.goal).map((x) => ({
        ...x,
        n: spent(x.took, 'pulls'),
      }))
      const best = firstMax(reached, (x) => -x.n)
      return best ? `${formatCount(best.n)} (${chaseName(best)})` : null
    },
  },
  {
    id: 'event-chase-receipt',
    category: 'Pulls',
    title: 'Chase receipt',
    question: 'How many {currency} did chasing {rateUp} cost me?',
    filters: [currency, oneRateUp],
    reads: costReads,
    compute: (c, v, today) => {
      const list = chasing(c, v, today)
      return list.length ? formatCount(sum(list, (x) => spent(x.list, chosen(v)))) : null
    },
  },
  {
    id: 'event-greed-tax',
    category: 'Pulls',
    title: 'Greed tax',
    question: 'How many {currency} did I spend chasing dupes of {rateUp} {range}?',
    filters: [currency, rateUp, range],
    reads: costReads,
    compute: (c, v, today) =>
      formatCount(sum(chasing(c, v, today), (x) => spent(greed(x), chosen(v)))),
  },
  {
    id: 'event-ticket-wins',
    category: 'Pulls',
    title: 'Ticket wins',
    question: 'How many chases did I win without spending gems {range}?',
    filters: [range],
    reads: chaseReads(),
    // Gems spent on dupes afterwards do not spoil a win.
    compute: (c, v, today) =>
      formatCount(successful(chasing(c, v, today)).filter((x) => !spent(toWin(x), 'gems')).length),
  },
  {
    id: 'event-failed-chases',
    category: 'Pulls',
    title: 'Failed chases',
    question: 'How many chases never gave me the rate-up {range}?',
    filters: [range],
    reads: chaseReads(),
    compute: (c, v, today) => formatCount(failed(chasing(c, v, today)).length),
  },
  {
    id: 'event-biggest-greed',
    category: 'Pulls',
    title: 'Biggest greed',
    question: 'What is the most {currency} one chase spent chasing dupes {range}?',
    filters: [currency, range],
    reads: costReads,
    compute: (c, v, today) =>
      mostChase(successful(chasing(c, v, today)), (x) => spent(greed(x), chosen(v))),
  },
  {
    id: 'event-greed-haul',
    category: 'Pulls',
    title: 'Greed haul',
    question: 'How many extra copies did chasing dupes of {rateUp} get me {range}?',
    filters: [rateUp, range],
    reads: chaseReads(),
    compute: (c, v, today) => formatCount(sum(chasing(c, v, today), (x) => sum(greed(x), copies))),
  },
  {
    id: 'event-empty-greed',
    category: 'Pulls',
    title: 'Empty greed',
    question: 'How many times did I chase dupes and get none {range}?',
    filters: [range],
    reads: chaseReads(),
    compute: (c, v, today) =>
      formatCount(
        chasing(c, v, today).filter((x) => greed(x).length && !sum(greed(x), copies)).length,
      ),
  },
  {
    id: 'event-instant-wins',
    category: 'Pulls',
    title: 'Instant wins',
    question: 'How many chases gave me the rate-up within 10 pulls {range}?',
    filters: [range],
    reads: chaseReads('pulls'),
    compute: (c, v, today) =>
      formatCount(
        successful(chasing(c, v, today)).filter((x) => spent(toWin(x), 'pulls') <= 10).length,
      ),
  },
  {
    id: 'event-sparks-worth',
    category: 'Pulls',
    title: "Spark's worth",
    question: 'How many chases took 200 pulls or more, a full spark on their own {range}?',
    filters: [range],
    reads: chaseReads('pulls'),
    compute: (c, v, today) =>
      formatCount(chasing(c, v, today).filter((x) => spent(x.list, 'pulls') >= SPARK_PULLS).length),
  },
  {
    id: 'event-spooked-after-failing',
    category: 'Pulls',
    title: 'Spooked after failing',
    question: 'How many NIKKE I failed to chase have spooked me since?',
    reads: chaseReads(),
    // A spook counts wherever it came from, free rerun pulls included.
    compute: (c) => {
      const all = sessions(c)
      const names = failed(chases(c, all)).flatMap((x) => {
        const since = all.slice(all.indexOf(x.list[x.list.length - 1]) + 1)
        return since.some((s) => spooks(s).includes(x.rateUp)) ? [x.rateUp] : []
      })
      return formatCount(new Set(names).size)
    },
  },
  {
    id: 'event-missed-limiteds',
    category: 'Pulls',
    title: 'Missed limiteds',
    question: 'How many limited NIKKE did I chase and never get from event pulls?',
    reads: withDb(['rateUpName', 'ssrDetails', 'gems'], ['releaseDate', 'limited']),
    compute: (c) => {
      const limited = namesWhere(c, 'limited')
      const pulled = new Set(sessions(c).flatMap((s) => s.names))
      const missed = chases(c)
        .map((x) => x.rateUp)
        .filter((name) => limited.has(name) && !pulled.has(name))
      return formatCount(new Set(missed).size)
    },
  },
  {
    id: 'event-losing-streak',
    category: 'Pulls',
    title: 'Losing streak',
    question: "What is the most chases I've failed in a row {range}?",
    filters: [range],
    reads: chaseReads(),
    compute: (c, v, today) => {
      const list = chasing(c, v, today)
      if (!list.length) return null
      const streaks: { from: string; n: number }[] = []
      list.forEach((x, i) => {
        if (x.won >= 0) return
        if (i && list[i - 1].won < 0) streaks[streaks.length - 1].n++
        else streaks.push({ from: x.day, n: 1 })
      })
      const worst = firstMax(streaks, (s) => s.n)
      return worst ? `${formatPlural(worst.n, 'chase')}, from ${formatDate(worst.from)}` : '0'
    },
  },
  {
    id: 'event-uninvited-guests',
    category: 'Pulls',
    title: 'Uninvited guests',
    question: 'How many NIKKE whose banner I skipped have spooked me anyway?',
    reads: withDb(['rateUpName', 'ssrDetails'], ['releaseDate']),
    compute: (c) => {
      const all = sessions(c)
      if (!all.length) return null
      const db = c[DB]
      const chased = new Set(all.map((s) => s.rateUp))
      const skipped = new Set(
        db.nikke.map(String).filter((name, i) => {
          const release = cellGameDay(db.releaseDate[i])
          return release !== null && release >= all[0].day && !chased.has(name)
        }),
      )
      const guests = all.flatMap(spooks).filter((name) => skipped.has(name))
      const times = new Map<string, number>()
      for (const name of guests) times.set(name, (times.get(name) ?? 0) + 1)
      const top = firstMax([...times], ([, n]) => n)
      return top
        ? `${formatCount(times.size)}, mostly ${top[0]} (${formatPlural(top[1], 'time')})`
        : '0'
    },
  },
]

// "40 (2 Mar 2025)": the biggest `n`, tie to the earliest. A biggest of 0 names nothing.
