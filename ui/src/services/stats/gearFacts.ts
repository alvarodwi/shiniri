import { GEAR_TAB, SPECIAL_TAB } from '@/config/sheets'
import { distinct } from '@/services/stats/anomalyFacts'
import type { Columns, Fact, Filter, Values } from '@/services/stats/facts'
import { formatCount, formatDate, formatPercent, formatPlural } from '@/services/stats/format'
import { ANY_PERIOD, dateRange, inRange } from '@/services/stats/ranges'
import { cellGameDay, firstMax, topWithCount } from '@/services/stats/rules'
import {
  ANOMALY_SOURCE,
  CLASS_TYPES,
  GEAR_SOURCES,
  MANUFACTURERS,
  SLOTS,
  SPECIAL_SOURCE,
} from '@/types/gear'

const { tab } = GEAR_TAB
const { arms, box, furnace } = GEAR_SOURCES

// What each source option counts.
const SOURCES: Record<string, string[]> = {
  'any source': [SPECIAL_SOURCE, ANOMALY_SOURCE, arms, box, furnace],
  'any box': [arms, box, furnace],
  'any interception': [SPECIAL_SOURCE, ANOMALY_SOURCE],
  ...Object.fromEntries([SPECIAL_SOURCE, ANOMALY_SOURCE, arms, box, furnace].map((s) => [s, [s]])),
}
// Chance facts skip the sources where the viewer chose what came out.
const CLASS_CHOSEN = [box]
const MANUFACTURER_CHOSEN = [box, furnace]

const ANY = {
  manufacturer: 'any manufacturer',
  class: 'any class',
  slot: 'any slot',
  boss: 'any boss',
}

export const kindName = (manufacturer: string, cls: string, slot: string) =>
  `${manufacturer} ${cls} ${slot}`

// The dated pieces, oldest first; a day keeps its row order.
function pieces(cols: Columns) {
  const t = cols[tab]
  const text = (name: string, i: number) => String(t[name]?.[i] ?? '')
  return t.date
    .flatMap((date, i) => {
      const day = cellGameDay(date)
      if (!day) return []
      const [manufacturer, cls, slot] = ['manufacturer', 'class', 'slot'].map((n) => text(n, i))
      const kind = manufacturer && cls && slot ? kindName(manufacturer, cls, slot) : ''
      return [{ i, date, day, source: text('source', i), manufacturer, class: cls, slot, kind }]
    })
    .sort((a, b) => a.day.localeCompare(b.day))
}
type Piece = ReturnType<typeof pieces>[number]

export const matches = (p: Pick<Piece, 'manufacturer' | 'class' | 'slot'>, values: Values) =>
  (['manufacturer', 'class', 'slot'] as const).every(
    (key) => !values[key] || values[key] === ANY[key] || p[key] === values[key],
  )

// Pieces from the chosen source (any when the fact has none), in range, in row order.
function select(cols: Columns, values: Values, today: string, excluded: string[] = []) {
  const { source = 'any source', range = ANY_PERIOD } = values
  const within = inRange(range, today)
  return pieces(cols)
    .filter((p) => SOURCES[source].includes(p.source) && !excluded.includes(p.source))
    .filter((p) => within(p.date))
    .sort((a, b) => a.i - b.i)
}

// Special Interception pieces; the boss is the one on the Special row of the same day.
function specialSelect(cols: Columns, values: Values, today: string) {
  const t = cols[SPECIAL_TAB.tab]
  const bosses = new Map(t.date.map((date, i) => [cellGameDay(date), String(t.boss[i] ?? '')]))
  const { boss = ANY.boss } = values
  return select(cols, { ...values, source: SPECIAL_SOURCE }, today).filter(
    (p) => boss === ANY.boss || bosses.get(p.day) === boss,
  )
}

type Key = 'manufacturer' | 'class' | 'slot' | 'kind'
const top = (list: Piece[], key: Key) =>
  topWithCount(
    list.map((p) => p[key]),
    'piece',
  )
// Share of the pieces that have the attribute filled in.
function share(list: Piece[], key: Exclude<Key, 'kind'>, value: string) {
  const known = list.filter((p) => p[key])
  return formatPercent(known.filter((p) => p[key] === value).length, known.length)
}

const sourceFilter = (excluded: string[] = []): Filter => ({
  id: 'source',
  label: 'Source',
  options: Object.keys(SOURCES).filter((s) => !excluded.includes(s)),
})
const source = sourceFilter()
const classSource = sourceFilter(CLASS_CHOSEN)
const manufacturerSource = sourceFilter(MANUFACTURER_CHOSEN)

const attribute = (
  id: 'manufacturer' | 'class' | 'slot',
  label: string,
  values: readonly string[],
) => {
  const one: Filter = { id, label, options: [...values] }
  return { one, any: { ...one, options: [ANY[id], ...values] } }
}
const manufacturer = attribute('manufacturer', 'Manufacturer', MANUFACTURERS)
const classType = attribute('class', 'Class', CLASS_TYPES)
const slot = attribute('slot', 'Slot', SLOTS)
export const manufacturerFilter = manufacturer.any
export const kindFilters = [manufacturer.any, classType.any, slot.any]
// "full any manufacturer any class sets" would not read, so "any" drops out of this question.
const silentAny = (f: Filter, any: string): Filter => ({
  ...f,
  say: (v) => (v === any ? '' : v),
})

const range = dateRange((cols) => cols[tab].date)
const boss: Filter = {
  id: 'boss',
  label: 'Boss',
  options: (cols) => [ANY.boss, ...distinct(cols[SPECIAL_TAB.tab].boss)],
}
// Finished history: a preset would always be empty.
const specialRange = dateRange((cols) => cols[SPECIAL_TAB.tab].date, { quick: false })

const reads = [{ tab: GEAR_TAB, columns: ['date', 'source', 'class', 'manufacturer', 'slot'] }]
const specialReads = [...reads, { tab: SPECIAL_TAB, columns: ['date', 'boss'] }]

export const GEAR_FACTS: Fact[] = [
  {
    id: 'gear-pieces',
    category: 'Gear',
    title: 'Gear obtained',
    question: 'How many pieces ({manufacturer}, {class}, {slot}) did I get from {source} {range}?',
    filters: [...kindFilters, source, range],
    reads,
    compute: (c, v, today) => formatCount(select(c, v, today).filter((p) => matches(p, v)).length),
  },
  {
    id: 'gear-first-piece',
    category: 'Gear',
    title: 'First gear piece',
    question: 'When did I first get a piece ({manufacturer}, {class}, {slot}) from {source}?',
    filters: [...kindFilters, source],
    reads,
    compute: (c, v, today) => {
      const days = select(c, v, today)
        .filter((p) => matches(p, v))
        .map((p) => p.day)
        .sort()
      return days.length ? formatDate(days[0]) : null
    },
  },
  {
    id: 'gear-top-piece',
    category: 'Gear',
    title: 'Most common piece',
    question: 'Which piece did I get most from {source} {range}?',
    filters: [manufacturerSource, range],
    reads,
    compute: (c, v, today) => top(select(c, v, today, MANUFACTURER_CHOSEN), 'kind'),
  },
  {
    id: 'gear-top-manufacturer',
    category: 'Gear',
    title: 'Most common manufacturer',
    question: 'Which manufacturer did I get most from {source} {range}?',
    filters: [manufacturerSource, range],
    reads,
    compute: (c, v, today) => top(select(c, v, today, MANUFACTURER_CHOSEN), 'manufacturer'),
  },
  {
    id: 'gear-top-class',
    category: 'Gear',
    title: 'Most common class',
    question: 'Which class did I get most from {source} {range}?',
    filters: [classSource, range],
    reads,
    compute: (c, v, today) => top(select(c, v, today, CLASS_CHOSEN), 'class'),
  },
  {
    id: 'gear-top-slot',
    category: 'Gear',
    title: 'Most common slot',
    question: 'Which slot did I get most from {source} {range}?',
    filters: [classSource, range],
    reads,
    compute: (c, v, today) => top(select(c, v, today, CLASS_CHOSEN), 'slot'),
  },
  {
    id: 'gear-manufacturer-share',
    category: 'Gear',
    title: 'Overall manufacturer share',
    question: 'What % of pieces from {source} {range} were {manufacturer}?',
    filters: [manufacturer.one, manufacturerSource, range],
    reads,
    compute: (c, v, today) =>
      share(select(c, v, today, MANUFACTURER_CHOSEN), 'manufacturer', v.manufacturer),
  },
  {
    id: 'gear-class-share',
    category: 'Gear',
    title: 'Overall class share',
    question: 'What % of pieces from {source} {range} were for {class}?',
    filters: [classType.one, classSource, range],
    reads,
    compute: (c, v, today) => share(select(c, v, today, CLASS_CHOSEN), 'class', v.class),
  },
  {
    id: 'gear-slot-share',
    category: 'Gear',
    title: 'Overall slot share',
    question: 'What % of pieces from {source} {range} were {slot}?',
    filters: [slot.one, classSource, range],
    reads,
    compute: (c, v, today) => share(select(c, v, today, CLASS_CHOSEN), 'slot', v.slot),
  },
  {
    id: 'gear-collection',
    category: 'Gear',
    title: 'Pieces collected',
    question: 'How many of the 60 possible pieces have I got from {source}?',
    filters: [source],
    reads,
    compute: (c, v, today) => formatCount(distinct(select(c, v, today).map((p) => p.kind)).length),
  },
  {
    id: 'gear-last-new-piece',
    category: 'Gear',
    title: 'Last new piece',
    question: 'Which piece from {source} was the last one I got for the first time?',
    filters: [source],
    reads,
    compute: (c, v) => {
      const firsts = new Map<string, string>() // kind → first day, oldest first
      for (const p of pieces(c))
        if (p.kind && SOURCES[v.source].includes(p.source) && !firsts.has(p.kind))
          firsts.set(p.kind, p.day)
      const last = firstMax([...firsts], ([, day]) => Date.parse(day))
      return last ? `${last[0]}, ${formatDate(last[1])}` : null
    },
  },
  {
    id: 'gear-complete-sets',
    category: 'Gear',
    title: 'Complete sets',
    question: 'How many full {manufacturer} {class} sets could I build from my pieces?',
    filters: [silentAny(manufacturer.any, ANY.manufacturer), silentAny(classType.any, ANY.class)],
    reads,
    compute: (c, v, today) => {
      const counts = new Map<string, number>()
      for (const p of select(c, {}, today).filter((p) => p.kind && matches(p, v)))
        counts.set(p.kind, (counts.get(p.kind) ?? 0) + 1)
      let sets = 0
      for (const m of MANUFACTURERS)
        for (const cls of CLASS_TYPES)
          sets += Math.min(...SLOTS.map((s) => counts.get(kindName(m, cls, s)) ?? 0))
      return formatCount(sets)
    },
  },
  {
    id: 'gear-overdue-piece',
    category: 'Gear',
    title: 'Overdue piece',
    question: 'Which piece have I gone longest without getting?',
    reads,
    compute: (c, _, today) => {
      const latest = new Map<string, string>() // kind → latest day, longest ago first
      for (const p of pieces(c)) {
        if (!p.kind) continue
        latest.delete(p.kind)
        latest.set(p.kind, p.day)
      }
      const [oldest] = latest
      if (!oldest) return null
      const days = (Date.parse(today) - Date.parse(oldest[1])) / 86_400_000
      return `${oldest[0]}, ${formatPlural(days, 'day')}`
    },
  },
  {
    id: 'gear-special-pieces',
    category: 'Gear',
    title: 'Special gear pieces',
    question: 'How many pieces ({manufacturer}, {class}, {slot}) did {boss} give me {range}?',
    filters: [...kindFilters, boss, specialRange],
    reads: specialReads,
    compute: (c, v, today) =>
      formatCount(specialSelect(c, v, today).filter((p) => matches(p, v)).length),
  },
  {
    id: 'gear-special-top-piece',
    category: 'Gear',
    title: 'Special top piece',
    question: 'Which piece did I get most from {boss} {range}?',
    filters: [boss, specialRange],
    reads: specialReads,
    compute: (c, v, today) => top(specialSelect(c, v, today), 'kind'),
  },
  {
    id: 'gear-special-top-manufacturer',
    category: 'Gear',
    title: 'Special top manufacturer',
    question: 'Which manufacturer did I get most from {boss} {range}?',
    filters: [boss, specialRange],
    reads: specialReads,
    compute: (c, v, today) => top(specialSelect(c, v, today), 'manufacturer'),
  },
  {
    id: 'gear-special-top-class',
    category: 'Gear',
    title: 'Special top class',
    question: 'Which class did I get most from {boss} {range}?',
    filters: [boss, specialRange],
    reads: specialReads,
    compute: (c, v, today) => top(specialSelect(c, v, today), 'class'),
  },
  {
    id: 'gear-special-top-slot',
    category: 'Gear',
    title: 'Special top slot',
    question: 'Which slot did I get most from {boss} {range}?',
    filters: [boss, specialRange],
    reads: specialReads,
    compute: (c, v, today) => top(specialSelect(c, v, today), 'slot'),
  },
  {
    id: 'gear-special-manufacturer-share',
    category: 'Gear',
    title: 'Special manufacturer share',
    question: 'What % of pieces from {boss} {range} were {manufacturer}?',
    filters: [manufacturer.one, boss, specialRange],
    reads: specialReads,
    compute: (c, v, today) => share(specialSelect(c, v, today), 'manufacturer', v.manufacturer),
  },
  {
    id: 'gear-special-class-share',
    category: 'Gear',
    title: 'Special class share',
    question: 'What % of pieces from {boss} {range} were for {class}?',
    filters: [classType.one, boss, specialRange],
    reads: specialReads,
    compute: (c, v, today) => share(specialSelect(c, v, today), 'class', v.class),
  },
  {
    id: 'gear-special-slot-share',
    category: 'Gear',
    title: 'Special slot share',
    question: 'What % of pieces from {boss} {range} were {slot}?',
    filters: [slot.one, boss, specialRange],
    reads: specialReads,
    compute: (c, v, today) => share(specialSelect(c, v, today), 'slot', v.slot),
  },
]
