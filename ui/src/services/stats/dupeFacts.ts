import {
  ALL_PULLS_TAB,
  DUPE_TRACKER_TAB,
  NIKKE_DATABASE_TAB,
  ROSTER_LOG_TAB,
} from '@/config/sheets'
import { distinct } from '@/services/stats/anomalyFacts'
import type { Columns, Fact, Filter, Values } from '@/services/stats/facts'
import { formatCount, formatDate, formatPlural } from '@/services/stats/format'
import { ATTRIBUTES, dated, traits, anyTraitFilter, withTrait } from '@/services/stats/pullFacts'
import { ANY_PERIOD, dateRange, inRange } from '@/services/stats/ranges'
import {
  daysBetween,
  firstMax,
  groupByGameDay,
  median,
  most,
  sum,
  topWithCount,
} from '@/services/stats/rules'

// Facts on unused dupes: the computed DupeTracker tab for now, AllPulls joined to RosterLog for
// what was used.

const TRACKER = DUPE_TRACKER_TAB.tab
const DB = NIKKE_DATABASE_TAB.tab
const NONE = 'None' // an empty tracker is a real answer
const MAX_COPY = 11 // core 7

const text = (cell: unknown) => String(cell ?? '').trim()

// The NIKKE with dupes waiting, in tab order. A negative row is a logging gap.
function holding(cols: Columns) {
  const t = cols[TRACKER]
  return t.nikke.flatMap((cell, i) => {
    const nikke = text(cell)
    const unused = Number(t.unused[i])
    return nikke && unused > 0
      ? [{ nikke, unused, copies: Number(t.copies?.[i]), expected: Number(t.expected?.[i]) }]
      : []
  })
}

// Pulls that left a dupe: copy 2 to 11. The formula leaves copy blank up to the RosterLog baseline.
const dupePulls = (cols: Columns) =>
  dated(cols, ALL_PULLS_TAB.tab, 'date').flatMap(({ day, get }) => {
    const copy = Number(get('copy'))
    return copy >= 2 && copy <= MAX_COPY ? [{ day, nikke: get('nikke'), copy }] : []
  })

// Each dupe with the first RosterLog date that reaches its copy (undefined while unused). A date
// before the pull is a logging gap and drops the dupe.
function history(cols: Columns) {
  const roster = dated(cols, ROSTER_LOG_TAB.tab, 'date').map(({ day, get }) => ({
    day,
    nikke: get('nikke'),
    copies: Number(get('copies')),
  }))
  return dupePulls(cols).flatMap((p) => {
    const used = roster.find((r) => r.nikke === p.nikke && r.copies >= p.copy)?.day
    return used && used < p.day ? [] : [{ ...p, used }]
  })
}
// The used ones, in pull order, with how long each waited.
const usedDupes = (cols: Columns) =>
  history(cols).flatMap(({ day, nikke, used }) =>
    used ? [{ nikke, used, wait: daysBetween(day, used) }] : [],
  )
function usedInRange(cols: Columns, { range = ANY_PERIOD }: Values, today: string) {
  const inside = inRange(range, today)
  return usedDupes(cols).filter((d) => inside(d.used))
}
function usedWithTrait(cols: Columns, values: Values) {
  const wanted = withTrait(cols, values.trait)
  return usedDupes(cols).filter((d) => wanted(d.nikke))
}

const trait = anyTraitFilter((c) => distinct(c[DB].nikke.map(text)))
const attribute: Filter = { id: 'attribute', label: 'Attribute', options: ATTRIBUTES }
const usedRange = dateRange((c) => usedDupes(c).map((d) => d.used))

const trackerReads = (...columns: string[]) => ({
  tab: DUPE_TRACKER_TAB,
  columns: ['nikke', 'unused', ...columns],
})
const traitRead = { tab: NIKKE_DATABASE_TAB, columns: ['nikke', ...ATTRIBUTES] }
const pullReads = { tab: ALL_PULLS_TAB, columns: ['date', 'nikke', 'copy'] }
const historyReads = [pullReads, { tab: ROSTER_LOG_TAB, columns: ['date', 'nikke', 'copies'] }]

export const DUPE_FACTS: Fact[] = [
  {
    id: 'dupes-total',
    category: 'Roster',
    title: 'Unused dupes',
    question: 'How many unused {trait} dupes am I holding?',
    filters: [trait],
    reads: [trackerReads(), traitRead],
    compute: (c, v) => {
      const wanted = withTrait(c, v.trait)
      const held = holding(c).filter((h) => wanted(h.nikke))
      return formatCount(sum(held, (h) => h.unused))
    },
  },
  {
    id: 'dupes-pile',
    category: 'Roster',
    title: 'Dupe pile',
    question: 'Which {attribute} has the most unused dupes?',
    filters: [attribute],
    reads: [trackerReads(), traitRead],
    compute: (c, v) => {
      const held = holding(c)
      if (!held.length) return NONE
      const of = traits(c, v.attribute)
      return topWithCount(
        held.flatMap((h) => Array(h.unused).fill(of.get(h.nikke))),
        'dupe',
      )
    },
  },
  {
    id: 'dupes-biggest-stack',
    category: 'Roster',
    title: 'Biggest stack',
    question: 'Which NIKKE has the most unused dupes?',
    reads: [trackerReads()],
    compute: (c) => {
      const top = firstMax(holding(c), (h) => h.unused)
      return top ? `${top.nikke}, ${formatPlural(top.unused, 'dupe')}` : NONE
    },
  },
  {
    id: 'dupes-oldest',
    category: 'Roster',
    title: 'Oldest unused dupe',
    question: 'Which unused dupe has been waiting longest?',
    reads: [trackerReads('copies'), pullReads],
    compute: (c, _, today) => {
      const held = holding(c)
      if (!held.length) return NONE
      const pulls = dupePulls(c)
      // The copies past `copies` are the unused ones; one pulled before the baseline has no row.
      const waiting = held.flatMap((h) => {
        const first = pulls.find(
          (p) => p.nikke === h.nikke && p.copy > h.copies && p.copy <= h.copies + h.unused,
        )
        return first ? [{ nikke: h.nikke, n: daysBetween(first.day, today) }] : []
      })
      const oldest = firstMax(waiting, (w) => w.n)
      return oldest ? `${oldest.nikke}, ${formatPlural(oldest.n, 'day')}` : null
    },
  },
  {
    id: 'dupes-longest-wait',
    category: 'Roster',
    title: 'Longest wait',
    question: "Which {trait} NIKKE's dupe waited longest before I used it?",
    filters: [trait],
    reads: [...historyReads, traitRead],
    compute: (c, v) => {
      const top = firstMax(usedWithTrait(c, v), (d) => d.wait)
      return top ? `${top.nikke}, ${formatPlural(top.wait, 'day')}` : null
    },
  },
  {
    id: 'dupes-typical-wait',
    category: 'Roster',
    title: 'Typical wait',
    question: 'How long do my {trait} dupes usually wait?',
    filters: [trait],
    reads: [...historyReads, traitRead],
    compute: (c, v) => {
      const waits = usedWithTrait(c, v).map((d) => d.wait)
      return waits.length ? formatPlural(Math.round(median(waits)), 'day') : null
    },
  },
  {
    id: 'dupes-used',
    category: 'Roster',
    title: 'Dupes used',
    question: 'How many dupes did I use {range}?',
    filters: [usedRange],
    reads: historyReads,
    compute: (c, v, today) => formatCount(usedInRange(c, v, today).length),
  },
  {
    id: 'dupes-ready-to-max',
    category: 'Roster',
    title: 'Ready to max',
    question: 'Which NIKKE would reach core 7 if I used my dupes?',
    reads: [trackerReads('expected')],
    compute: (c) =>
      holding(c)
        .filter((h) => h.expected >= MAX_COPY)
        .map((h) => h.nikke)
        .join(', ') || NONE,
  },
  {
    id: 'dupes-biggest-hoard',
    category: 'Roster',
    title: 'Biggest hoard',
    question: "What's the most unused dupes I've held at once?",
    reads: historyReads,
    compute: (c) => {
      // A day's pulls count before its uses, so a dupe used the same day was still held.
      const steps = history(c)
        .flatMap(({ day, used }) => [{ day, step: 1 }, ...(used ? [{ day: used, step: -1 }] : [])])
        .sort((a, b) => a.day.localeCompare(b.day) || b.step - a.step)
      let held = 0
      return most(
        steps.map(({ day, step }) => ({ day, n: (held += step) })),
        (s) => formatDate(s.day),
      )
    },
  },
  {
    id: 'dupes-upgrade-spree',
    category: 'Roster',
    title: 'Upgrade spree',
    question: 'Which day did I use the most dupes?',
    reads: historyReads,
    compute: (c) => {
      const used = usedDupes(c).map((d) => d.used)
      return most(
        groupByGameDay(used).map(([day, rows]) => ({ day, n: rows.length })),
        (d) => formatDate(d.day),
      )
    },
  },
  {
    id: 'dupes-favourite',
    category: 'Roster',
    title: 'Favourite to upgrade',
    question: 'Which NIKKE did I use the most dupes on {range}?',
    filters: [usedRange],
    reads: historyReads,
    compute: (c, v, today) =>
      topWithCount(
        usedInRange(c, v, today).map((d) => d.nikke),
        'dupe',
      ),
  },
]
