import {
  ALL_PULLS_TAB,
  EVENT_TAB,
  EXCHANGE_TAB,
  EXTRA_TAB,
  MOLD_TAB,
  NIKKE_DATABASE_TAB,
  ORDINARY_TAB,
  OVERCORE_TAB,
  SOCIAL_TAB,
} from '@/config/sheets'
import type { TabSpec } from '@/config/sheets'
import { distinct } from '@/services/stats/anomalyFacts'
import { chasing, failed } from '@/services/stats/eventFacts'
import { ANY_EXCHANGE, MILEAGE } from '@/services/stats/exchangeFacts'
import type { Columns, Fact, Filter, Values } from '@/services/stats/facts'
import {
  formatCount,
  formatDate,
  formatPlural,
  formatShareOf,
  formatVsOdds,
} from '@/services/stats/format'
import { expectedX100 as moldExpectedX100, isPlain, moldSessions } from '@/services/stats/moldFacts'
import { ANY_PERIOD, dateRange, inRange } from '@/services/stats/ranges'
import {
  addDays,
  cellGameDay,
  firstMax,
  groupByGameDay,
  longestGap,
  most,
  runs,
  sum,
  topWithCount,
} from '@/services/stats/rules'
import { FREE_PULLS } from '@/types/other'

// Facts that span several pull sources, and the wasted exchanges.

const ALL = ALL_PULLS_TAB.tab
const DB = NIKKE_DATABASE_TAB.tab
const ANY_SOURCE = 'any source'
// The sources with sessions of pulls; mold opens are not pulls.
const PULL_TABS: Record<string, TabSpec> = {
  Social: SOCIAL_TAB,
  Event: EVENT_TAB,
  Ordinary: ORDINARY_TAB,
}
const PULL_SOURCES = Object.keys(PULL_TABS)
const PAID_SOURCES = ['Event', 'Ordinary']
const CHANCE_SOURCES = [...PULL_SOURCES, 'Mold']
const SOURCES = [...CHANCE_SOURCES, 'Exchange', 'Extra']
// Expected SSRs per 100 pulls.
const PULL_ODDS: Record<string, number> = { Social: 2, Event: 4, Ordinary: 4 }
export const ATTRIBUTES = ['manufacturer', 'class', 'burst', 'element', 'weapon']
const BURSTS: Record<string, string> = { Step1: 'Burst I', Step2: 'Burst II', Step3: 'Burst III' }
// Months back.
const AGO: Record<string, number> = { '1 month ago': 1, '1 year ago': 12, '2 years ago': 24 }
const RESCUE_DAYS = 30
const SPARK_SOURCE = 'Gold Mileage'

const text = (cell: unknown) => String(cell ?? '').trim()
const within = ({ range = ANY_PERIOD }: Values, today: string) => inRange(range, today)

// The dated rows of the named columns, by game day then row. An undeclared column reads as blank.
export function dated(cols: Columns, tab: string, first: string) {
  const t = cols[tab]
  return t[first]
    .flatMap((_, i) => {
      const day = cellGameDay(t.date[i])
      return day ? [{ day, get: (name: string) => text(t[name]?.[i]) }] : []
    })
    .sort((a, b) => a.day.localeCompare(b.day))
}

// --- Social, Event and Ordinary sessions -------------------------------------------------------

function sessions(cols: Columns, source: string) {
  return dated(cols, PULL_TABS[source].tab, 'date').map(({ day, get }) => ({
    day,
    pulls: Number(get('pulls')),
    tickets: Number(get('tickets')),
    ssr: Number(get('totalSsr')),
  }))
}
type Session = ReturnType<typeof sessions>[number]

function byDay(list: Session[]) {
  return groupByGameDay(list.map((s) => s.day)).map(([day, rows]) => ({
    day,
    pulls: sum(rows, (i) => list[i].pulls),
    ssr: sum(rows, (i) => list[i].ssr),
  }))
}

const allDates = (sources: string[]) => (cols: Columns) =>
  sources.flatMap((s) => cols[PULL_TABS[s].tab].date)

const filter = (
  id: string,
  label: string,
  options: Filter['options'],
  say?: Filter['say'],
): Filter => ({ id, label, options, say })
const sessionSource = (options: string[]) =>
  filter('source', 'Source', options, (v) => v.toLowerCase())
const pullSource = sessionSource(PULL_SOURCES)
const paidSource = sessionSource(PAID_SOURCES)
const payment = filter('payment', 'Payment', ['gems', 'tickets'])

const sessionReads = (sources: string[], ...columns: string[]) =>
  sources.map((s) => ({ tab: PULL_TABS[s], columns: ['date', ...columns] }))

const SESSION_FACTS: Fact[] = [
  {
    id: 'pulls-biggest-day',
    category: 'Pulls',
    title: 'Biggest pull day',
    question: "What is the most pulls I've made in one day {range}?",
    filters: [dateRange(allDates(PULL_SOURCES))],
    reads: sessionReads(PULL_SOURCES, 'pulls'),
    compute: (c, v, today) => {
      const inside = within(v, today)
      const list = PULL_SOURCES.flatMap((s) => sessions(c, s)).filter((s) => inside(s.day))
      return most(
        byDay(list).map((d) => ({ day: d.day, n: d.pulls })),
        (d) => formatDate(d.day),
      )
    },
  },
  {
    id: 'pulls-longest-dry-run',
    category: 'Pulls',
    title: 'Longest dry run',
    question: 'What is the most {source} pulls in a row without an SSR {range}?',
    filters: [pullSource, dateRange(allDates(PULL_SOURCES))],
    reads: sessionReads(PULL_SOURCES, 'pulls', 'totalSsr'),
    compute: (c, v, today) => {
      const inside = within(v, today)
      const list = sessions(c, v.source).filter((s) => inside(s.day))
      if (!list.length) return null // no sessions, as opposed to a run of 0
      const dry = runs(
        list,
        (s) => !s.ssr,
        (s) => s.pulls,
      )
      return most(dry, (r) => `from ${formatDate(r.day)}`)
    },
  },
  {
    id: 'pulls-current-dry-run',
    category: 'Pulls',
    title: 'Current dry run',
    question: 'How many {source} pulls have I made since my last SSR?',
    filters: [pullSource],
    reads: sessionReads(PULL_SOURCES, 'pulls', 'totalSsr'),
    compute: (c, v) => {
      const list = sessions(c, v.source)
      const last = list.map((s) => s.ssr > 0).lastIndexOf(true)
      return last < 0 ? null : formatCount(sum(list.slice(last + 1), (s) => s.pulls))
    },
  },
  {
    id: 'pulls-longest-ssr-wait',
    category: 'Pulls',
    title: 'Longest SSR wait',
    question: "What is the longest I've waited between {source} SSRs?",
    filters: [pullSource],
    reads: sessionReads(PULL_SOURCES, 'totalSsr'),
    compute: (c, v, today) =>
      longestGap(
        sessions(c, v.source)
          .filter((s) => s.ssr)
          .map((s) => s.day),
        today,
      ),
  },
  {
    id: 'pulls-longest-hoard',
    category: 'Pulls',
    title: 'Longest hoard',
    question: "What is the longest I've gone without any {source} pull?",
    filters: [pullSource],
    reads: sessionReads(PULL_SOURCES),
    compute: (c, v, today) =>
      longestGap(
        sessions(c, v.source).map((s) => s.day),
        today,
      ),
  },
  {
    id: 'pulls-surprise-packages',
    category: 'Pulls',
    title: 'Surprise packages',
    question: 'On how many days did fewer than 10 {source} pulls still give me an SSR {range}?',
    filters: [pullSource, dateRange(allDates(PULL_SOURCES))],
    reads: sessionReads(PULL_SOURCES, 'pulls', 'totalSsr'),
    compute: (c, v, today) => {
      const inside = within(v, today)
      const days = byDay(sessions(c, v.source))
      return formatCount(days.filter((d) => inside(d.day) && d.pulls < 10 && d.ssr).length)
    },
  },
  {
    id: 'pulls-payment-share',
    category: 'Pulls',
    title: 'Payment share',
    question: 'What % of my {source} pulls {range} were paid with {payment}?',
    filters: [paidSource, payment, dateRange(allDates(PAID_SOURCES))],
    reads: sessionReads(PAID_SOURCES, 'pulls', 'tickets'),
    // Gem-paid is whatever a ticket did not pay: the first pull of a day can cost 150 gems.
    compute: (c, v, today) => {
      const inside = within(v, today)
      const list = sessions(c, v.source).filter((s) => inside(s.day))
      const pulls = sum(list, (s) => s.pulls)
      const tickets = sum(list, (s) => s.tickets)
      return formatShareOf(v.payment === 'tickets' ? tickets : pulls - tickets, pulls)
    },
  },
  {
    id: 'pulls-packed-session',
    category: 'Pulls',
    title: 'Packed session',
    question: 'What is the most SSRs one {source} session gave me {range}?',
    filters: [paidSource, dateRange(allDates(PAID_SOURCES))],
    reads: sessionReads(PAID_SOURCES, 'totalSsr'),
    compute: (c, v, today) => {
      const inside = within(v, today)
      const list = sessions(c, v.source).filter((s) => inside(s.day))
      return most(
        list.map((s) => ({ day: s.day, n: s.ssr })),
        (s) => formatDate(s.day),
      )
    },
  },
  {
    id: 'pulls-vs-odds',
    category: 'Pulls',
    title: 'Overall luck',
    question: 'How many SSRs am I above or below the odds {range}?',
    filters: [dateRange((c) => [...allDates(PULL_SOURCES)(c), ...c[MOLD_TAB.tab].date])],
    reads: [
      ...sessionReads(PULL_SOURCES, 'pulls', 'totalSsr'),
      { tab: MOLD_TAB, columns: ['date', 'moldType', 'pulls', 'totalSsr'] },
    ],
    compute: (c, v, today) => {
      const inside = within(v, today)
      const pulled = PULL_SOURCES.flatMap((source) =>
        sessions(c, source)
          .filter((s) => inside(s.day))
          .map((s) => ({ ssr: s.ssr, dueX100: s.pulls * PULL_ODDS[source] })),
      )
      const molds = moldSessions(c)
        .filter((s) => inside(s.day) && isPlain(s.type))
        .map((s) => ({ ssr: s.ssr, dueX100: moldExpectedX100([s]) }))
      const list = [...pulled, ...molds]
      if (!list.length) return null
      return formatVsOdds(
        sum(list, (s) => s.ssr),
        sum(list, (s) => s.dueX100),
      )
    },
  },
]

// --- AllPulls ----------------------------------------------------------------------------------

const arrivals = (cols: Columns) =>
  dated(cols, ALL, 'nikke').flatMap(({ day, get }) => {
    const nikke = get('nikke')
    return nikke ? [{ day, nikke, source: get('source') }] : []
  })

// The arrivals from the chosen source (all six under "any") inside the chosen range.
function select(cols: Columns, values: Values, today: string) {
  const inside = within(values, today)
  const source = values.source ?? ANY_SOURCE
  return arrivals(cols).filter(
    (a) => inside(a.day) && (source === ANY_SOURCE || a.source === source),
  )
}
// Chosen copies (Exchange, Extra) are no chance.
const byChance = <T extends { source: string }>(list: T[]) =>
  list.filter((a) => CHANCE_SOURCES.includes(a.source))

// The trait of each NikkeDatabase NIKKE as answers word it.
export function traits(cols: Columns, attribute: string) {
  const db = cols[DB]
  const label = (raw: string) => {
    if (attribute === 'manufacturer') return raw.charAt(0) + raw.slice(1).toLowerCase()
    if (raw === 'Electronic') return 'Electric'
    return BURSTS[raw] ?? raw
  }
  return new Map(db.nikke.map((name, i) => [text(name), label(text(db[attribute][i]))]))
}

// The trait labels those NIKKE have, attribute by attribute.
export const traitOptions = (cols: Columns, names: string[]) =>
  ATTRIBUTES.flatMap((attribute) => {
    const of = traits(cols, attribute)
    return distinct(names.map((name) => of.get(name)))
  })

// Whether a NIKKE has the trait; the labels don't overlap between attributes.
export function hasTrait(cols: Columns, label: string) {
  const maps = ATTRIBUTES.map((a) => traits(cols, a))
  return (name: string) => maps.some((m) => m.get(name) === label)
}

const source = (options: string[]) => filter('source', 'Source', [ANY_SOURCE, ...options])
const anySource = source(SOURCES)
const pulledNikke = filter('nikke', 'NIKKE', (c) => distinct(c[ALL].nikke.map(text)))
const trait = filter('trait', 'Trait', (c) => traitOptions(c, distinct(c[ALL].nikke.map(text))))
const attribute = filter('attribute', 'Attribute', ATTRIBUTES)
const ago = filter('ago', 'When', Object.keys(AGO))
const range = dateRange((c) => c[ALL].date)

const allReads = (...columns: string[]) => [{ tab: ALL_PULLS_TAB, columns: ['date', ...columns] }]
const traitReads = [
  ...allReads('nikke', 'source'),
  { tab: NIKKE_DATABASE_TAB, columns: ['nikke', ...ATTRIBUTES] },
]

const ALL_FACTS: Fact[] = [
  {
    id: 'pulls-best-day',
    category: 'Pulls',
    title: 'Luckiest day',
    question: 'What is the most SSRs I got from {source} in one day {range}?',
    filters: [source(CHANCE_SOURCES), range],
    reads: allReads('nikke', 'source'),
    compute: (c, v, today) => {
      const list = byChance(select(c, v, today))
      const days = groupByGameDay(list.map((a) => a.day))
      return most(
        days.map(([day, rows]) => ({ day, n: rows.length })),
        (d) => formatDate(d.day),
      )
    },
  },
  {
    id: 'pulls-nikke-count',
    category: 'Pulls',
    title: 'Total copies',
    question: 'How many times have I got {nikke} from {source} {range}?',
    filters: [pulledNikke, anySource, range],
    reads: allReads('nikke', 'source'),
    compute: (c, v, today) =>
      formatCount(select(c, v, today).filter((a) => a.nikke === v.nikke).length),
  },
  {
    id: 'pulls-last-visit',
    category: 'Pulls',
    title: 'Last arrival',
    question: 'When did I last get {nikke} from {source}?',
    filters: [pulledNikke, anySource],
    reads: allReads('nikke', 'source'),
    compute: (c, v, today) => {
      const last = select(c, v, today)
        .filter((a) => a.nikke === v.nikke)
        .at(-1)
      return last ? formatDate(last.day) : null
    },
  },
  {
    id: 'pulls-frequent',
    category: 'Pulls',
    title: 'Most frequent face',
    question: 'Which NIKKE did I get most often from {source} {range}?',
    filters: [anySource, range],
    reads: allReads('nikke', 'source'),
    compute: (c, v, today) =>
      topWithCount(
        select(c, v, today).map((a) => a.nikke),
        'copy',
        'copies',
      ),
  },
  {
    id: 'pulls-trait-count',
    category: 'Pulls',
    title: 'Total trait haul',
    question: 'How many {trait} NIKKE did I get from {source} {range}?',
    filters: [trait, anySource, range],
    reads: traitReads,
    compute: (c, v, today) => {
      const has = hasTrait(c, v.trait)
      return formatCount(select(c, v, today).filter((a) => has(a.nikke)).length)
    },
  },
  {
    id: 'pulls-top-trait',
    category: 'Pulls',
    title: 'Overall top trait',
    question: 'Which {attribute} did I get most from {source} {range}?',
    filters: [attribute, anySource, range],
    reads: traitReads,
    compute: (c, v, today) => {
      const of = traits(c, v.attribute)
      return topWithCount(
        select(c, v, today).map((a) => of.get(a.nikke)),
        'copy',
        'copies',
      )
    },
  },
  {
    id: 'pulls-found-me',
    category: 'Pulls',
    title: 'Found me anyway',
    question: 'How many NIKKE whose banner I skipped found me through other sources?',
    reads: [
      ...allReads('nikke', 'source'),
      { tab: EVENT_TAB, columns: ['date', 'rateUpName'] },
      { tab: NIKKE_DATABASE_TAB, columns: ['nikke', 'rarity', 'releaseDate'] },
    ],
    compute: (c) => {
      const events = dated(c, EVENT_TAB.tab, 'date')
      if (!events.length) return null
      const chased = new Set(events.map((e) => e.get('rateUpName')))
      const db = c[DB]
      const skipped = new Set(
        db.nikke.map(text).filter((name, i) => {
          const release = cellGameDay(db.releaseDate[i])
          return (
            db.rarity[i] === 'SSR' && !!release && release >= events[0].day && !chased.has(name)
          )
        }),
      )
      // Event spooks are the Event facts' business; an exchange is chosen.
      const roads = ['Social', 'Ordinary', 'Mold', 'Extra']
      const found = arrivals(c).filter((a) => roads.includes(a.source) && skipped.has(a.nikke))
      return formatCount(new Set(found.map((a) => a.nikke)).size)
    },
  },
  {
    id: 'pulls-main-supplier',
    category: 'Pulls',
    title: 'Main supplier',
    question: 'Which source gave me the most SSRs {range}?',
    filters: [range],
    reads: allReads('source'),
    compute: (c, v, today) => {
      const inside = within(v, today)
      return topWithCount(
        dated(c, ALL, 'source')
          .filter((r) => inside(r.day))
          .map((r) => r.get('source')),
        'SSR',
      )
    },
  },
  {
    id: 'pulls-every-road',
    category: 'Pulls',
    title: 'Every road',
    question: 'Which NIKKE reached me through the most sources?',
    reads: allReads('nikke', 'source'),
    compute: (c) => {
      const roads = new Map<string, Set<string>>()
      for (const a of arrivals(c))
        roads.set(a.nikke, (roads.get(a.nikke) ?? new Set()).add(a.source))
      const top = firstMax([...roads], ([, sources]) => sources.size)
      return top ? `${top[0]}, ${formatPlural(top[1].size, 'source')}` : null
    },
  },
  {
    id: 'pulls-twins',
    category: 'Pulls',
    title: 'Twins',
    question: 'On how many days did the same NIKKE arrive twice or more {range}?',
    filters: [range],
    reads: allReads('nikke', 'source'),
    compute: (c, v, today) => {
      const list = byChance(select(c, v, today))
      const days = groupByGameDay(list.map((a) => a.day)).filter(
        ([, rows]) => new Set(rows.map((i) => list[i].nikke)).size < rows.length,
      )
      return formatCount(days.length)
    },
  },
  {
    id: 'pulls-on-this-day',
    category: 'Pulls',
    title: 'On this day',
    question: 'Who did I get {ago}?',
    filters: [ago],
    reads: allReads('nikke'),
    compute: (c, v, today) => {
      const then = new Date(today)
      then.setUTCMonth(then.getUTCMonth() - AGO[v.ago])
      // A day that month lacks rolls over into the next one: there is no such date.
      if (then.getUTCDate() !== Number(today.slice(8, 10))) return null
      const day = then.toISOString().slice(0, 10)
      const got = new Map<string, number>()
      for (const a of arrivals(c)) if (a.day === day) got.set(a.nikke, (got.get(a.nikke) ?? 0) + 1)
      return got.size
        ? [...got].map(([name, n]) => (n > 1 ? `${name} ×${n}` : name)).join(', ')
        : null
    },
  },
]

// --- Mileage and wasted exchanges --------------------------------------------------------------

const exchanges = (cols: Columns) =>
  dated(cols, EXCHANGE_TAB.tab, 'source').map(({ day, get }) => ({
    day,
    nikke: get('nikke'),
    source: get('source'),
  }))

// Each overcore takes the latest exchange of its NIKKE, dated on or before it, that no earlier one
// took. Liberations are free, so never wasted.
function wasted(cols: Columns) {
  const left = exchanges(cols).filter((e) => e.source !== 'Liberation')
  return dated(cols, OVERCORE_TAB.tab, 'nikke').flatMap(({ day, get }) => {
    const i = left.map((e) => e.nikke === get('nikke') && e.day <= day).lastIndexOf(true)
    return i < 0 ? [] : left.splice(i, 1)
  })
}

const wastedReads = [
  { tab: EXCHANGE_TAB, columns: ['date', 'nikke', 'source'] },
  { tab: OVERCORE_TAB, columns: ['date', 'nikke'] },
]

const MILEAGE_AND_WASTE_FACTS: Fact[] = [
  {
    id: 'pulls-rescued-chases',
    category: 'Pulls',
    title: 'Rescued chases',
    question: 'How many failed chases did mileage or free pulls rescue {range}?',
    filters: [dateRange((c) => c[EVENT_TAB.tab].date)],
    reads: [
      { tab: EVENT_TAB, columns: ['date', 'rateUpName', 'gems', 'ssrDetails'] },
      { tab: EXCHANGE_TAB, columns: ['date', 'nikke', 'source'] },
      { tab: EXTRA_TAB, columns: ['date', 'source', 'rateUpName', 'ssrDetails'] },
      { tab: NIKKE_DATABASE_TAB, columns: ['nikke', 'releaseDate'] },
    ],
    compute: (c, v, today) => {
      const mileage = exchanges(c).filter((e) => MILEAGE.includes(e.source))
      const free = dated(c, EXTRA_TAB.tab, 'source').flatMap(({ day, get }) =>
        get('source') === FREE_PULLS &&
        get('ssrDetails').split(',').map(text).includes(get('rateUpName'))
          ? [{ day, nikke: get('rateUpName') }]
          : [],
      )
      const copies = [...mileage, ...free]
      const rescued = failed(chasing(c, { range: v.range }, today)).filter((chase) => {
        const until = addDays(chase.list[chase.list.length - 1].day, RESCUE_DAYS)
        return copies.some((x) => x.nikke === chase.rateUp && x.day >= chase.day && x.day <= until)
      })
      return formatCount(rescued.length)
    },
  },
  {
    id: 'pulls-sparks',
    category: 'Pulls',
    title: 'Sparks used',
    question: 'How many times have I sparked {range}?',
    filters: [dateRange((c) => c[EXCHANGE_TAB.tab].date)],
    reads: [{ tab: EXCHANGE_TAB, columns: ['date', 'source'] }],
    compute: (c, v, today) => {
      const inside = within(v, today)
      return formatCount(
        exchanges(c).filter((e) => e.source === SPARK_SOURCE && inside(e.day)).length,
      )
    },
  },
  {
    id: 'overcore-wasted',
    category: 'Overcore',
    title: 'Wasted exchanges',
    question: 'How many of my {source} exchanges turned out to be wasted?',
    filters: [
      filter(
        'source',
        'Exchanged with',
        [ANY_EXCHANGE, ...MILEAGE, 'Union Chip', 'Bonus Recruit'],
        (s) => (s === ANY_EXCHANGE ? '' : s),
      ),
    ],
    reads: wastedReads,
    // The source filter applies after pairing.
    compute: (c, v) =>
      formatCount(
        wasted(c).filter((e) => v.source === ANY_EXCHANGE || e.source === v.source).length,
      ),
  },
  {
    id: 'overcore-most-wasted',
    category: 'Overcore',
    title: 'Most wasted on',
    question: 'Which NIKKE did I waste the most exchanges on?',
    reads: wastedReads,
    compute: (c) =>
      topWithCount(
        wasted(c).map((e) => e.nikke),
        'wasted exchange',
      ),
  },
]

export const PULL_FACTS: Fact[] = [...SESSION_FACTS, ...ALL_FACTS, ...MILEAGE_AND_WASTE_FACTS]
