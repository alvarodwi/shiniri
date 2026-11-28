import { COSTUME_DATABASE_TAB } from '@/config/sheets'
import { distinct } from '@/services/stats/anomalyFacts'
import type { Columns, Fact, Filter, Values } from '@/services/stats/facts'
import {
  formatCount,
  formatDate,
  formatPercent,
  formatPlural,
  formatUsd,
} from '@/services/stats/format'
import { cellGameDay, firstMax, flagged, gapsBetween, sum } from '@/services/stats/rules'

const { tab } = COSTUME_DATABASE_TAB
const ANY_GRADE = 'any grade'
const ANY_SOURCE = 'any source'
const PASS_SOURCES = ['Event Pass', 'Mission Pass']

const text = (cell: unknown) => String(cell ?? '').trim()

// Rows with any content. An undeclared column reads as blank.
function costumes(cols: Columns) {
  const t = cols[tab]
  const length = Math.max(0, ...Object.values(t).map((column) => column.length))
  return Array.from({ length }, (_, i) => ({
    nikke: text(t.nikke?.[i]),
    name: text(t.costumeName?.[i]),
    date: cellGameDay(t.releaseDate?.[i]),
    usd: Number(text(t.priceUsd?.[i])) || 0, // Free, blank and text add 0
    grade: text(t.grade?.[i]),
    source: text(t.source?.[i]),
    owned: flagged(t.owned?.[i]),
    blank: !Object.values(t).some((column) => text(column[i])),
  })).filter((c) => !c.blank)
}

// The costumes of the chosen grade and source; a blank cell matches only the "any" option.
const select = (cols: Columns, { grade = ANY_GRADE, source = ANY_SOURCE }: Values) =>
  costumes(cols).filter(
    (c) =>
      (grade === ANY_GRADE || c.grade === grade) && (source === ANY_SOURCE || c.source === source),
  )

// A set with no costumes is no answer; owning none of an existing one is "0".
const countOf = (set: ReturnType<typeof costumes>, wantOwned: boolean) =>
  set.length ? formatCount(set.filter((c) => c.owned === wantOwned).length) : null

// Costumes already out; a future or blank date is not released.
const released = (cols: Columns, today: string) =>
  costumes(cols).filter((c) => c.date && c.date <= today)

const grade: Filter = {
  id: 'grade',
  label: 'Grade',
  options: (c) => [ANY_GRADE, ...distinct(c[tab].grade.map(text))],
  say: (v) => (v === ANY_GRADE ? '' : v),
}
const source: Filter = {
  id: 'source',
  label: 'Costume source',
  options: (c) => [ANY_SOURCE, ...distinct(c[tab].source.map(text))],
}

// "What % of costumes", not "of any source costumes".
const sourceBeforeNoun: Filter = { ...source, say: (v) => (v === ANY_SOURCE ? '' : v) }

const reads = (...columns: string[]) => [{ tab: COSTUME_DATABASE_TAB, columns }]

export const COSTUME_FACTS: Fact[] = [
  {
    id: 'costume-owned',
    category: 'Database',
    title: 'Costumes owned',
    question: 'How many {grade} costumes from {source} do I own?',
    filters: [grade, source],
    reads: reads('grade', 'source', 'owned'),
    compute: (c, v) => countOf(select(c, v), true),
  },
  {
    id: 'costume-completion',
    category: 'Database',
    title: 'Wardrobe completion',
    question: 'What % of {source} costumes do I own?',
    filters: [sourceBeforeNoun],
    reads: reads('source', 'owned'),
    compute: (c, v) => {
      const set = select(c, v)
      return formatPercent(set.filter((x) => x.owned).length, set.length)
    },
  },
  {
    id: 'costume-missing',
    category: 'Database',
    title: 'Missing costumes',
    question: 'How many {grade} costumes from {source} am I missing?',
    filters: [grade, source],
    reads: reads('grade', 'source', 'owned'),
    compute: (c, v) => countOf(select(c, v), false),
  },
  {
    id: 'costume-dressed',
    category: 'Database',
    title: 'Dressed NIKKE',
    question: 'How many NIKKE have a costume I own?',
    reads: reads('nikke', 'owned'),
    compute: (c) => {
      const set = costumes(c)
      const dressed = new Set(set.flatMap((x) => (x.owned && x.nikke ? [x.nikke] : [])))
      return set.length ? formatCount(dressed.size) : null
    },
  },
  {
    id: 'costume-skipped-passes',
    category: 'Database',
    title: 'Skipped passes',
    question: 'How many pass costumes have I let go?',
    reads: reads('source', 'owned'),
    compute: (c) =>
      countOf(
        costumes(c).filter((x) => PASS_SOURCES.includes(x.source)),
        false,
      ),
  },
  {
    id: 'costume-oldest-gap',
    category: 'Database',
    title: 'Oldest wardrobe gap',
    question: 'Which released costume have I gone longest without?',
    reads: reads('nikke', 'costumeName', 'owned', 'releaseDate'),
    compute: (c, _v, today) => {
      const gap = firstMax(
        released(c, today).filter((x) => !x.owned),
        (x) => -Date.parse(x.date!),
      )
      return gap ? `${gap.nikke}, ${gap.name}, ${formatDate(gap.date!)}` : null
    },
  },
  {
    id: 'costume-by-year',
    category: 'Database',
    title: 'Wardrobe by year',
    question: 'How many of the {grade} costumes from {source} released in {year} do I own?',
    filters: [
      {
        id: 'year',
        label: 'Year',
        options: (cols) =>
          distinct(
            cols[tab].releaseDate?.flatMap((d) => cellGameDay(d)?.slice(0, 4) ?? []) ?? [],
          ).sort(),
      },
      grade,
      source,
    ],
    reads: reads('grade', 'source', 'owned', 'releaseDate'),
    compute: (c, v, today) => {
      const inYear = select(c, v).filter(
        (x) => x.date && x.date <= today && x.date.startsWith(v.year),
      )
      return inYear.length
        ? `${formatCount(inYear.filter((x) => x.owned).length)} of ${formatCount(inYear.length)}`
        : null
    },
  },
  {
    id: 'costume-drought',
    category: 'Database',
    title: 'Release drought',
    question: 'What was the longest gap between two costume releases?',
    reads: reads('releaseDate'),
    compute: (c, _v, today) => {
      const days = [...new Set(released(c, today).map((x) => x.date!))].sort()
      if (days.length < 2) return null
      const best = firstMax(gapsBetween(days, days[days.length - 1]), (g) => g.n)!
      return `${formatPlural(best.n, 'day')}, ${formatDate(best.from)} to ${formatDate(best.to)}`
    },
  },
  {
    id: 'costume-upcoming',
    category: 'Database',
    title: 'Upcoming costumes',
    question: 'How many costumes are still to be released?',
    reads: reads('releaseDate'),
    compute: (c, _v, today) => {
      const all = costumes(c)
      return all.length ? formatCount(all.filter((x) => x.date && x.date > today).length) : null
    },
  },
  {
    id: 'costume-list-value',
    category: 'Database',
    title: 'List value of the wardrobe',
    question: 'What is the list price of my {source} costumes?',
    filters: [sourceBeforeNoun],
    reads: reads('source', 'owned', 'priceUsd'),
    compute: (c, v) => {
      const set = select(c, v)
      return set.length
        ? formatUsd(
            sum(
              set.filter((x) => x.owned),
              (x) => x.usd,
            ),
          )
        : null
    },
  },
  {
    id: 'costume-skipped-value',
    category: 'Database',
    title: 'Value I skipped',
    question: 'What is the list price of the pass costumes I let go?',
    reads: reads('source', 'owned', 'priceUsd'),
    compute: (c) => {
      const passes = costumes(c).filter((x) => PASS_SOURCES.includes(x.source))
      return passes.length
        ? formatUsd(
            sum(
              passes.filter((x) => !x.owned),
              (x) => x.usd,
            ),
          )
        : null
    },
  },
]
