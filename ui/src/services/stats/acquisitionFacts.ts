import { ACQUISITION_LOG_TAB, NIKKE_DATABASE_TAB } from '@/config/sheets'
import { distinct } from '@/services/stats/anomalyFacts'
import type { Columns, Fact, Filter, Values } from '@/services/stats/facts'
import { formatCount, formatDate, formatPlural } from '@/services/stats/format'
import { ATTRIBUTES, traits } from '@/services/stats/pullFacts'
import { ANY_PERIOD, dateRange, inRange } from '@/services/stats/ranges'
import { cellGameDay, daysBetween, firstMax, topWithCount } from '@/services/stats/rules'

// Facts on the computed AcquisitionLog tab: one row per NIKKE, one slot per copy.

const TAB = ACQUISITION_LOG_TAB.tab
// Slot header to the stage's name on the cards.
const STAGES: Record<string, string> = {
  firstCopy: 'first copy',
  ...Object.fromEntries([1, 2, 3].map((n) => [`lb${n}`, `LB${n}`])),
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((n) => [`c${n}`, `core ${n}`])),
}
const SLOTS = Object.keys(STAGES)
const ANY_TRAIT = 'any trait'

const text = (cell: unknown) => String(cell ?? '').trim()

type Copy = { day: string; source: string }
// A filled slot is date, newline, source. '?' (untracked), blank and row 2's slot number are null.
function copy(cell: unknown): Copy | null {
  const [, day, source] = text(cell).match(/^(\d{4}-\d{2}-\d{2})\n(.+)$/) ?? []
  return day ? { day, source: source.trim() } : null
}

// One entry per NIKKE row, in row order. An undeclared column reads as blank.
function roster(cols: Columns) {
  const t = cols[TAB]
  return t.nikke.flatMap((cell, i) => {
    const nikke = text(cell)
    return nikke
      ? [
          {
            nikke,
            confidence: text(t.confidence?.[i]),
            release: cellGameDay(t.releaseDate?.[i]),
            at: (slot: string) => copy(t[slot]?.[i]),
          },
        ]
      : []
  })
}

// The known copies of one slot column, row 2 and unknowns left out.
const column = (cols: Columns, slot: string) => cols[TAB][slot].flatMap((c) => copy(c) ?? [])

const longest = (list: { nikke: string; n: number }[]) => {
  const best = firstMax(list, (x) => x.n)
  return best ? `${best.nikke}, ${formatPlural(best.n, 'day')}` : null
}

// Days from first copy to core 7, for the NIKKE where both are known.
const maxWaits = (cols: Columns) =>
  roster(cols).flatMap((r) => {
    const from = r.at('firstCopy')
    const to = r.at('c7')
    return from && to ? [{ nikke: r.nikke, n: daysBetween(from.day, to.day) }] : []
  })

const nikkeFilter: Filter = {
  id: 'nikke',
  label: 'NIKKE',
  options: (c) => distinct(c[TAB].nikke.map(text)),
}
const stage: Filter = { id: 'stage', label: 'Stage', options: Object.values(STAGES) }
const source: Filter = {
  id: 'source',
  label: 'Source',
  options: (c) => distinct(column(c, 'firstCopy').map((x) => x.source)),
}
const confidence: Filter = {
  id: 'confidence',
  label: 'Confidence',
  options: ['Perfect', 'Good', 'Approx', 'Unknown'],
}
const trait: Filter = {
  id: 'trait',
  label: 'Trait',
  options: (c) => {
    const names = distinct(c[TAB].nikke.map(text))
    return [
      ANY_TRAIT,
      ...ATTRIBUTES.flatMap((attribute) => {
        const of = traits(c, attribute)
        return distinct(names.map((name) => of.get(name)))
      }),
    ]
  },
  say: (v) => (v === ANY_TRAIT ? '' : v),
}

const reads = (...columns: string[]) => [{ tab: ACQUISITION_LOG_TAB, columns }]
const traitReads = (...columns: string[]) => [
  ...reads('nikke', 'c7', ...columns),
  { tab: NIKKE_DATABASE_TAB, columns: ['nikke', ...ATTRIBUTES] },
]

// The earliest core 7 among the NIKKE with the chosen trait.
function firstCore(cols: Columns, values: Values, recordedOnly: boolean) {
  const maps = values.trait === ANY_TRAIT ? [] : ATTRIBUTES.map((a) => traits(cols, a))
  const list = roster(cols).flatMap((r) => {
    const max = r.at('c7')
    const wanted = values.trait === ANY_TRAIT || maps.some((m) => m.get(r.nikke) === values.trait)
    return max && wanted && (!recordedOnly || r.confidence === 'Perfect')
      ? [{ nikke: r.nikke, day: max.day }]
      : []
  })
  const first = firstMax(list, (x) => -Date.parse(x.day))
  return first ? `${first.nikke}, ${formatDate(first.day)}` : null
}

export const ACQUISITION_FACTS: Fact[] = [
  {
    id: 'acquisition-copy-date',
    category: 'Roster',
    title: 'Copy date',
    question: 'When did {nikke} reach {stage}, and from which source?',
    filters: [nikkeFilter, stage],
    reads: reads('nikke', ...SLOTS),
    compute: (c, v) => {
      const slot = SLOTS.find((s) => STAGES[s] === v.stage)!
      const got = roster(c)
        .find((r) => r.nikke === v.nikke)
        ?.at(slot)
      return got ? `${formatDate(got.day)}, ${got.source}` : null
    },
  },
  {
    id: 'acquisition-lb-wait',
    category: 'Roster',
    title: 'Limit break wait',
    question: 'How many days did {nikke} take from first copy to LB3?',
    filters: [nikkeFilter],
    reads: reads('nikke', 'firstCopy', 'lb3'),
    compute: (c, v) => {
      const row = roster(c).find((r) => r.nikke === v.nikke)
      const from = row?.at('firstCopy')
      const to = row?.at('lb3')
      return from && to ? formatPlural(daysBetween(from.day, to.day), 'day') : null
    },
  },
  {
    id: 'acquisition-fastest-max',
    category: 'Roster',
    title: 'Fastest max core',
    question: 'Which NIKKE went from first copy to core 7 fastest?',
    reads: reads('nikke', 'firstCopy', 'c7'),
    compute: (c) => {
      const best = firstMax(maxWaits(c), (x) => -x.n)
      return best ? `${best.nikke}, ${formatPlural(best.n, 'day')}` : null
    },
  },
  {
    id: 'acquisition-slowest-max',
    category: 'Roster',
    title: 'Slowest max core',
    question: 'Which NIKKE took longest from first copy to core 7?',
    reads: reads('nikke', 'firstCopy', 'c7'),
    compute: (c) => longest(maxWaits(c)),
  },
  {
    id: 'acquisition-drought',
    category: 'Roster',
    title: 'Dupe drought',
    question: "What's the longest wait between two copies of one NIKKE?",
    reads: reads('nikke', ...SLOTS),
    compute: (c) => {
      const gaps = roster(c).flatMap((r) =>
        SLOTS.slice(1).flatMap((slot, i) => {
          const from = r.at(SLOTS[i])
          const to = r.at(slot)
          return from && to
            ? [{ nikke: r.nikke, from: from.day, n: daysBetween(from.day, to.day) }]
            : []
        }),
      )
      const best = firstMax(gaps, (g) => g.n)
      return best
        ? `${best.nikke}, ${formatPlural(best.n, 'day')} from ${formatDate(best.from)}`
        : null
    },
  },
  {
    id: 'acquisition-first-meetings',
    category: 'Roster',
    title: 'First meetings',
    question: 'How many NIKKE did I first get from {source} {range}?',
    filters: [source, dateRange((c) => column(c, 'firstCopy').map((x) => x.day))],
    reads: reads('firstCopy'),
    compute: (c, v, today) => {
      const inside = inRange(v.range ?? ANY_PERIOD, today)
      const met = column(c, 'firstCopy').filter((x) => x.source === v.source && inside(x.day))
      return formatCount(met.length)
    },
  },
  {
    id: 'acquisition-finishing-source',
    category: 'Roster',
    title: 'Finishing source',
    question: 'Which source most often gave the core 7 copy?',
    reads: reads('c7'),
    compute: (c) =>
      topWithCount(
        column(c, 'c7').map((x) => x.source),
        'NIKKE',
        'NIKKE',
      ),
  },
  {
    id: 'acquisition-release-day',
    category: 'Roster',
    title: 'Release day pickups',
    question: 'How many NIKKE did I get on their release day {range}?',
    filters: [dateRange((c) => column(c, 'firstCopy').map((x) => x.day))],
    // releaseDate repeats down the tab, so firstCopy rows line up with it by index.
    reads: reads('releaseDate', 'firstCopy'),
    compute: (c, v, today) => {
      const inside = inRange(v.range ?? ANY_PERIOD, today)
      const t = c[TAB]
      const same = t.firstCopy.filter((cell, i) => {
        const day = copy(cell)?.day
        return !!day && day === cellGameDay(t.releaseDate[i]) && inside(day)
      })
      return formatCount(same.length)
    },
  },
  {
    id: 'acquisition-late-arrival',
    category: 'Roster',
    title: 'Late arrival',
    question: 'Which NIKKE took longest after release to reach me?',
    reads: reads('nikke', 'releaseDate', ...SLOTS),
    compute: (c) => {
      const list = roster(c)
      // Logging starts at the earliest copy on the tab; older releases may have arrived unlogged.
      const start = SLOTS.flatMap((s) => column(c, s).map((x) => x.day)).sort()[0]
      return longest(
        list.flatMap((r) => {
          const first = r.at('firstCopy')
          return first && r.release && r.release >= start
            ? [{ nikke: r.nikke, n: daysBetween(r.release, first.day) }]
            : []
        }),
      )
    },
  },
  {
    id: 'acquisition-confidence',
    category: 'Roster',
    title: 'History confidence',
    question: 'How many NIKKE have {confidence} history?',
    filters: [confidence],
    reads: reads('confidence'),
    compute: (c, v) => {
      const all = c[TAB].confidence.map(text).filter(Boolean)
      return all.length ? formatCount(all.filter((x) => x === v.confidence).length) : null
    },
  },
  {
    id: 'acquisition-first-max',
    category: 'Roster',
    title: 'First max core',
    question: 'Which {trait} NIKKE reached core 7 first?',
    filters: [trait],
    reads: traitReads(),
    compute: (c, v) => firstCore(c, v, false),
  },
  {
    id: 'acquisition-first-recorded-max',
    category: 'Roster',
    title: 'First recorded core',
    question: 'Which fully recorded {trait} NIKKE reached core 7 first?',
    filters: [trait],
    reads: traitReads('confidence'),
    compute: (c, v) => firstCore(c, v, true),
  },
]
