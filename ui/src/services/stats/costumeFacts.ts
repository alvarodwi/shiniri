import { COSTUME_DATABASE_TAB } from '@/config/sheets'
import { distinct } from '@/services/stats/anomalyFacts'
import type { Columns, Fact, Filter, Values } from '@/services/stats/facts'
import { formatCount, formatPercent } from '@/services/stats/format'
import { flagged } from '@/services/stats/rules'

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
]
