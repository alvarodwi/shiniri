import { OVERCORE_LINES } from '@/config/overcoreLines'
import { EXCHANGE_TAB, MOLD_TAB, NIKKE_DATABASE_TAB, OVERCORE_TAB } from '@/config/sheets'
import { painLevel } from '@/services/overcore/overcore'
import type { OvercoreSource } from '@/services/overcore/overcore'
import { distinct } from '@/services/stats/anomalyFacts'
import type { Columns, Fact, Filter, Values } from '@/services/stats/facts'
import { formatCount, formatDate, formatPlural } from '@/services/stats/format'
import { ATTRIBUTES, dated, hasTrait, traitOptions } from '@/services/stats/pullFacts'
import { ANY_PERIOD, dateRange, inRange } from '@/services/stats/ranges'
import { daysBetween, firstMax, most, sum, topWithCount } from '@/services/stats/rules'

// Facts on the Overcore tab. The two about wasted exchanges are in pullFacts.ts.

const TAB = OVERCORE_TAB.tab
const ANY_SOURCE = 'any source'
const ANY_TRAIT = 'any trait'
const SOURCES: OvercoreSource[] = ['Social', 'Event', 'Ordinary', 'Mold', 'Exchange', 'Extra']

const text = (cell: unknown) => String(cell ?? '').trim()

// By day, then row. An undeclared column reads as blank.
const overcores = (cols: Columns) =>
  dated(cols, TAB, 'date').map(({ day, get }) => ({
    day,
    source: get('source'),
    nikke: get('nikke'),
    notes: get('notes'),
  }))
type Overcore = ReturnType<typeof overcores>[number]

// --- Pain --------------------------------------------------------------------------------------

// Overcore stores neither the mold type nor the exchange currency: both come from the Mold or
// Exchange rows with the same day and NIKKE. null when none matches, or the matches disagree.
function painOf(cols: Columns) {
  const molds = dated(cols, MOLD_TAB.tab, 'date').map(({ day, get }) => ({
    day,
    names: get('ssrDetails').split(',').map(text),
    detail: get('moldType'),
  }))
  const exchanges = dated(cols, EXCHANGE_TAB.tab, 'date').map(({ day, get }) => ({
    day,
    names: [get('nikke')],
    detail: get('source'),
  }))
  return (o: Overcore): number | null => {
    const from = SOURCES.find((s) => s === o.source)
    if (!from) return null
    if (from !== 'Mold' && from !== 'Exchange') return painLevel(from, '')
    const levels = new Set(
      (from === 'Mold' ? molds : exchanges)
        .filter((r) => r.day === o.day && r.names.includes(o.nikke))
        .map((r) => painLevel(from, r.detail)),
    )
    return levels.size === 1 ? [...levels][0]! : null
  }
}

// Each overcore with its level, or null when any level is unknown: no total or ranking is guessed.
function pains(cols: Columns, list = overcores(cols)) {
  const level = painOf(cols)
  const out = list.map((o) => ({ ...o, level: level(o) }))
  return out.every((o) => o.level !== null) ? (out as (Overcore & { level: number })[]) : null
}

// "Rapi, 8 pain points": the key with the highest summed level.
function mostPain(cols: Columns, key: 'nikke' | 'day', name: (k: string) => string) {
  const totals = new Map<string, number>()
  for (const o of pains(cols) ?? []) totals.set(o[key], (totals.get(o[key]) ?? 0) + o.level)
  const top = firstMax([...totals], ([, n]) => n)
  return top ? `${name(top[0])}, ${formatPlural(top[1], 'pain point')}` : null
}

const painReads = [
  { tab: OVERCORE_TAB, columns: ['date', 'source', 'nikke'] },
  { tab: MOLD_TAB, columns: ['date', 'moldType', 'ssrDetails'] },
  { tab: EXCHANGE_TAB, columns: ['date', 'nikke', 'source'] },
]

// --- Filters -----------------------------------------------------------------------------------

const within = ({ range = ANY_PERIOD }: Values, today: string) => inRange(range, today)
const range = dateRange((c) => c[TAB].date)
const source = (say?: Filter['say']): Filter => ({
  id: 'source',
  label: 'Source',
  options: [ANY_SOURCE, ...SOURCES],
  say,
})
const trait: Filter = {
  id: 'trait',
  label: 'Trait',
  options: (c) => [ANY_TRAIT, ...traitOptions(c, distinct(c[TAB].nikke.map(text)))],
  say: (v) => (v === ANY_TRAIT ? '' : v),
}
const noted: Filter = {
  id: 'nikke',
  label: 'NIKKE',
  options: (c) =>
    distinct(
      overcores(c)
        .filter((o) => o.notes)
        .map((o) => o.nikke),
    ),
}

const reads = (...columns: string[]) => [{ tab: OVERCORE_TAB, columns }]
const traitReads = (...columns: string[]) => [
  ...reads(...columns),
  { tab: NIKKE_DATABASE_TAB, columns: ['nikke', ...ATTRIBUTES] },
]

const fromSource = (value: string) => (o: Overcore) => value === ANY_SOURCE || o.source === value
const withTrait = (cols: Columns, value: string) => {
  const has = value === ANY_TRAIT ? () => true : hasTrait(cols, value)
  return (o: Overcore) => has(o.nikke)
}

export const OVERCORE_FACTS: Fact[] = [
  {
    id: 'overcore-pain-total',
    category: 'Overcore',
    title: 'Pain total',
    question: 'How many pain points have I taken {range}?',
    filters: [range],
    reads: painReads,
    compute: (c, v, today) => {
      const inside = within(v, today)
      const list = pains(
        c,
        overcores(c).filter((o) => inside(o.day)),
      )
      return list && formatCount(sum(list, (o) => o.level))
    },
  },
  {
    id: 'overcore-most-painful',
    category: 'Overcore',
    title: 'Most painful NIKKE',
    question: 'Which NIKKE has hurt me most?',
    reads: painReads,
    compute: (c) => mostPain(c, 'nikke', (n) => n),
  },
  {
    id: 'overcore-worst-day',
    category: 'Overcore',
    title: 'Worst day',
    question: 'Which day hurt the most?',
    reads: painReads,
    compute: (c) => mostPain(c, 'day', formatDate),
  },
  {
    id: 'overcore-sore-spot',
    category: 'Overcore',
    title: 'Sore spot',
    question: 'What was my most painful {source} overcore?',
    filters: [source((v) => (v === ANY_SOURCE ? '' : v))],
    reads: painReads,
    compute: (c, v) => {
      const list = pains(c, overcores(c).filter(fromSource(v.source!)))
      const worst = firstMax(list ?? [], (o) => o.level)
      if (!worst) return null
      const line = OVERCORE_LINES[worst.level as keyof typeof OVERCORE_LINES][0]!
      return `${line.replace('{who}', worst.nikke)} (${formatDate(worst.day)})`
    },
  },
  {
    id: 'overcore-count',
    category: 'Overcore',
    title: 'Overcore count',
    question: 'How many overcores of {trait} NIKKE from {source} have I had {range}?',
    filters: [trait, source(), range],
    reads: traitReads('date', 'source', 'nikke'),
    compute: (c, v, today) => {
      const inside = within(v, today)
      return formatCount(
        overcores(c)
          .filter(fromSource(v.source!))
          .filter(withTrait(c, v.trait!))
          .filter((o) => inside(o.day)).length,
      )
    },
  },
  {
    id: 'overcore-repeat',
    category: 'Overcore',
    title: 'Repeat offender',
    question: 'Which {trait} NIKKE has overcored most often?',
    filters: [trait],
    reads: traitReads('date', 'nikke'),
    compute: (c, v) =>
      topWithCount(
        overcores(c)
          .filter(withTrait(c, v.trait!))
          .map((o) => o.nikke),
        'overcore',
      ),
  },
  {
    id: 'overcore-first',
    category: 'Overcore',
    title: 'First overcore',
    question: 'Which {trait} NIKKE went past core 7 first?',
    filters: [trait],
    reads: traitReads('date', 'nikke'),
    compute: (c, v) => {
      const first = overcores(c).find(withTrait(c, v.trait!))
      return first ? `${first.nikke}, ${formatDate(first.day)}` : null
    },
  },
  {
    id: 'overcore-blessed-streak',
    category: 'Overcore',
    title: 'Blessed streak',
    question: 'How many days was my longest blessed stretch without an overcore?',
    reads: reads('date'),
    compute: (c, _, today) => {
      const days = overcores(c).map((o) => o.day)
      const gaps = days.map((from, i) => {
        const to = days[i + 1] ?? today
        return { from, to, n: daysBetween(from, to) }
      })
      return most(gaps, (g) => `${formatDate(g.from)} to ${formatDate(g.to)}`)
    },
  },
  {
    id: 'overcore-days-of-peace',
    category: 'Overcore',
    title: 'Days of peace',
    question: 'How many days have I gone since my last overcore?',
    reads: reads('date'),
    compute: (c, _, today) => {
      const last = overcores(c).at(-1)
      return last ? formatCount(daysBetween(last.day, today)) : null
    },
  },
  {
    id: 'overcore-diary',
    category: 'Overcore',
    title: 'Dear diary',
    question: "What did I write about {nikke}'s latest overcore?",
    filters: [noted],
    reads: reads('date', 'nikke', 'notes'),
    compute: (c, v) => {
      const latest = firstMax(
        overcores(c).filter((o) => o.nikke === v.nikke && o.notes),
        (o) => Date.parse(o.day),
      )
      return latest ? `${latest.notes} (${formatDate(latest.day)})` : null
    },
  },
]
