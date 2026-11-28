import { NIKKE_DATABASE_TAB, ROSTER_LOG_TAB } from '@/config/sheets'
import { distinct } from '@/services/stats/anomalyFacts'
import { GOALS } from '@/services/stats/eventFacts'
import type { Columns, Fact, Filter } from '@/services/stats/facts'
import { formatCount, formatPlural } from '@/services/stats/format'
import {
  ANY_TRAIT,
  ATTRIBUTES,
  anyTraitFilter,
  dated,
  traits,
  withTrait,
} from '@/services/stats/pullFacts'
import { ANY_PERIOD, dateRange, inRange } from '@/services/stats/ranges'
import { firstMax, flagged, sum } from '@/services/stats/rules'

// Facts on what the roster holds now and how it grew: SSRs only, joined on nameCode.

const LOG = ROSTER_LOG_TAB.tab
const DB = NIKKE_DATABASE_TAB.tab
const NONE = 'None' // nothing missing is a real answer
const CORE_7 = GOALS['core 7']! // copies
const STAGES = ['MLB', 'core 7']

const text = (cell: unknown) => String(cell ?? '').trim()

const ssrs = (cols: Columns) => {
  const db = cols[DB]
  return db.nameCode.flatMap((cell, i) => {
    const code = text(cell)
    const name = text(db.nikke[i])
    return code && name && db.rarity[i] === 'SSR'
      ? [{ code, name, limited: flagged(db.limited?.[i]) }]
      : []
  })
}

// Every logged row, oldest first, with the copies it replaced (0 for a first row) and the day the
// NIKKE reached its copies.
function changes(cols: Columns) {
  const last = new Map<string, { copies: number; since: string }>()
  return dated(cols, LOG, 'date').flatMap(({ day, get }) => {
    const code = get('nameCode')
    const copies = Number(get('copies'))
    if (!code || !copies) return []
    const before = last.get(code)
    const since = before?.copies === copies ? before.since : day
    last.set(code, { copies, since })
    return [{ day, code, copies, since, before: before?.copies ?? 0 }]
  })
}

// The SSRs of the chosen trait, each with its latest row (undefined while unowned).
function roster(cols: Columns, trait: string) {
  const latest = new Map(changes(cols).map((c) => [c.code, c]))
  const wanted = withTrait(cols, trait)
  return ssrs(cols)
    .filter((n) => wanted(n.name))
    .map((n) => ({ ...n, latest: latest.get(n.code) }))
}
const owned = (cols: Columns, trait: string) =>
  roster(cols, trait).flatMap((n) => (n.latest ? [{ name: n.name, ...n.latest }] : []))

const trait = anyTraitFilter((c) => distinct(ssrs(c).map((n) => n.name)))
const stage: Filter = { id: 'stage', label: 'Stage', options: STAGES }
const attribute: Filter = { id: 'attribute', label: 'Attribute', options: ATTRIBUTES }
const range = dateRange((c) => c[LOG].date)

const logReads = { tab: ROSTER_LOG_TAB, columns: ['date', 'nameCode', 'copies'] }
const dbReads = (...columns: string[]) => ({
  tab: NIKKE_DATABASE_TAB,
  columns: ['nameCode', 'nikke', 'rarity', ...columns],
})
const traitReads = [logReads, dbReads(...ATTRIBUTES)]

export const ROSTER_FACTS: Fact[] = [
  {
    id: 'roster-collection',
    category: 'Roster',
    title: 'Collection',
    question: 'How many {trait} NIKKE do I own, out of how many?',
    filters: [trait],
    reads: traitReads,
    compute: (c, v) => {
      const all = roster(c, v.trait)
      return all.length
        ? `${formatCount(all.filter((n) => n.latest).length)} of ${formatCount(all.length)}`
        : null
    },
  },
  {
    id: 'roster-missing',
    category: 'Roster',
    title: 'Missing',
    question: "Which {trait} NIKKE don't I have?",
    filters: [trait],
    reads: [logReads, dbReads(...ATTRIBUTES, 'limited')],
    compute: (c, v) => {
      const all = roster(c, v.trait)
      if (!all.length) return null
      const missing = all.filter((n) => !n.latest)
      return missing.map((n) => (n.limited ? `${n.name} (limited)` : n.name)).join(', ') || NONE
    },
  },
  {
    id: 'roster-built',
    category: 'Roster',
    title: 'Built',
    question: 'How many {trait} NIKKE are at {stage}?',
    filters: [trait, stage],
    reads: traitReads,
    compute: (c, v) => {
      const all = roster(c, v.trait)
      const built = all.filter((n) => n.latest && n.latest.copies >= GOALS[v.stage]!)
      return all.length ? formatCount(built.length) : null
    },
  },
  {
    id: 'roster-next-in-line',
    category: 'Roster',
    title: 'Next in line',
    question: 'Which {trait} NIKKE is closest to core 7?',
    filters: [trait],
    reads: traitReads,
    compute: (c, v) => {
      const [next, ...rest] = owned(c, v.trait)
        .filter((n) => n.copies < CORE_7)
        .sort(
          (a, b) =>
            b.copies - a.copies || a.since.localeCompare(b.since) || a.name.localeCompare(b.name),
        )
      if (!next) return null
      const tied = rest.filter((n) => n.copies === next.copies).length
      const away = formatPlural(CORE_7 - next.copies, 'copy', 'copies')
      return `${next.name}, ${away} away${tied ? ` (+${formatCount(tied)} tied)` : ''}`
    },
  },
  {
    id: 'roster-favoured-group',
    category: 'Roster',
    title: 'Favoured group',
    question: 'Which {attribute} is most built, by average copies?',
    filters: [attribute],
    reads: traitReads,
    compute: (c, v) => {
      const of = traits(c, v.attribute)
      const groups = new Map<string, number[]>()
      for (const n of owned(c, ANY_TRAIT)) {
        const group = of.get(n.name)
        if (group) groups.set(group, [...(groups.get(group) ?? []), n.copies])
      }
      const averages = [...groups].map(([group, copies]) => ({
        group,
        average: sum(copies, (x) => x) / copies.length,
      }))
      const top = firstMax(averages, (a) => a.average)
      if (!top) return null
      const average = Math.round(top.average * 10) / 10
      return `${top.group}, ${formatPlural(average, 'copy', 'copies')} on average`
    },
  },
  {
    id: 'roster-growth',
    category: 'Roster',
    title: 'Roster growth',
    question: 'How many copies did my roster gain {range}?',
    filters: [range],
    reads: [logReads, dbReads()],
    compute: (c, v, today) => {
      const list = changes(c)
      if (!list.length) return null
      // The earliest date is the baseline: what was already owned, not a gain.
      const baseline = list[0].day
      const inside = inRange(v.range ?? ANY_PERIOD, today)
      const codes = new Set(ssrs(c).map((n) => n.code))
      const gains = list.filter((r) => r.day > baseline && codes.has(r.code) && inside(r.day))
      return formatCount(sum(gains, (r) => Math.max(0, r.copies - r.before)))
    },
  },
]
