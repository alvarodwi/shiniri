import { FURNACE_TAB } from '@/config/sheets'
import type { Columns, Fact, Values } from '@/services/stats/facts'
import { formatCount } from '@/services/stats/format'
import { kindFilters, kindName, manufacturerFilter, matches } from '@/services/stats/gearFacts'
import { ANY_PERIOD, dateRange, inRange } from '@/services/stats/ranges'
import { topWithCount } from '@/services/stats/rules'

const { tab } = FURNACE_TAB
const ANY_TARGET = manufacturerFilter.options[0]

// The attempts in range, in row order. Columns a fact did not declare read as blank.
function attempts(cols: Columns, { range = ANY_PERIOD }: Values, today: string) {
  const t = cols[tab]
  const within = inRange(range, today)
  return t.date.flatMap((date, i) => {
    if (!within(date)) return []
    const text = (name: string) => String(t[name]?.[i] ?? '')
    const sacrifices = [1, 2].map((n) => ({
      manufacturer: text(`sacrifice${n}Manufacturer`),
      class: text(`sacrifice${n}Class`),
      slot: text(`sacrifice${n}Slot`),
    }))
    return [
      {
        target: text('target'),
        sacrifices,
        class: text('resultClass'),
        slot: text('resultSlot'),
      },
    ]
  })
}
type Attempt = ReturnType<typeof attempts>[number]
type Sacrifice = Attempt['sacrifices'][number]

const sacrificed = (cols: Columns, values: Values, today: string) =>
  attempts(cols, values, today).flatMap((a) => a.sacrifices)
const top = (cells: string[]) => topWithCount(cells, 'piece')

// Attempts where one sacrifice shares every one of these parts with the result.
const returned = (cols: Columns, values: Values, today: string, parts: ('class' | 'slot')[]) =>
  formatCount(
    attempts(cols, values, today).filter((a) =>
      a.sacrifices.some((s) => parts.every((p) => a[p] !== '' && s[p] === a[p])),
    ).length,
  )

const range = dateRange((cols) => cols[tab].date)
const target = { ...manufacturerFilter, id: 'target', label: 'Target' }

const reads = (...columns: string[]) => [{ tab: FURNACE_TAB, columns: ['date', ...columns] }]
const sacrificeColumns = (...parts: (keyof Sacrifice)[]) =>
  [1, 2].flatMap((n) => parts.map((p) => `sacrifice${n}${p[0].toUpperCase()}${p.slice(1)}`))
const kindColumns = sacrificeColumns('class', 'manufacturer', 'slot')

export const FURNACE_FACTS: Fact[] = [
  {
    id: 'furnace-sacrificed',
    category: 'Gear',
    title: 'Pieces sacrificed',
    question: 'How many pieces ({manufacturer}, {class}, {slot}) have I sacrificed {range}?',
    filters: [...kindFilters, range],
    reads: reads(...kindColumns),
    compute: (c, v, today) =>
      formatCount(sacrificed(c, v, today).filter((s) => matches(s, v)).length),
  },
  {
    id: 'furnace-top-piece',
    category: 'Gear',
    title: 'Most sacrificed piece',
    question: 'Which piece have I sacrificed most {range}?',
    filters: [range],
    reads: reads(...kindColumns),
    compute: (c, v, today) =>
      top(
        sacrificed(c, v, today).map((s) =>
          s.manufacturer && s.class && s.slot ? kindName(s.manufacturer, s.class, s.slot) : '',
        ),
      ),
  },
  {
    id: 'furnace-top-manufacturer',
    category: 'Gear',
    title: 'Most sacrificed manufacturer',
    question: 'Which manufacturer have I sacrificed most {range}?',
    filters: [range],
    reads: reads(...sacrificeColumns('manufacturer')),
    compute: (c, v, today) => top(sacrificed(c, v, today).map((s) => s.manufacturer)),
  },
  {
    id: 'furnace-top-class',
    category: 'Gear',
    title: 'Most sacrificed class',
    question: 'Which class have I sacrificed most {range}?',
    filters: [range],
    reads: reads(...sacrificeColumns('class')),
    compute: (c, v, today) => top(sacrificed(c, v, today).map((s) => s.class)),
  },
  {
    id: 'furnace-top-slot',
    category: 'Gear',
    title: 'Most sacrificed slot',
    question: 'Which slot have I sacrificed most {range}?',
    filters: [range],
    reads: reads(...sacrificeColumns('slot')),
    compute: (c, v, today) => top(sacrificed(c, v, today).map((s) => s.slot)),
  },
  {
    id: 'furnace-attempts',
    category: 'Gear',
    title: 'Furnace attempts',
    question: 'How many times have I used the furnace for {target} {range}?',
    filters: [target, range],
    reads: reads('target'),
    compute: (c, v, today) =>
      formatCount(
        attempts(c, v, today).filter((a) => v.target === ANY_TARGET || a.target === v.target)
          .length,
      ),
  },
  {
    id: 'furnace-top-target',
    category: 'Gear',
    title: 'Favourite furnace target',
    question: 'Which manufacturer have I targeted most {range}?',
    filters: [range],
    reads: reads('target'),
    compute: (c, v, today) =>
      topWithCount(
        attempts(c, v, today).map((a) => a.target),
        'attempt',
      ),
  },
  {
    id: 'furnace-same-slot',
    category: 'Gear',
    title: 'Slot returned',
    question: 'In how many attempts did the result share a slot with a sacrifice {range}?',
    filters: [range],
    reads: reads(...sacrificeColumns('slot'), 'resultSlot'),
    compute: (c, v, today) => returned(c, v, today, ['slot']),
  },
  {
    id: 'furnace-same-class',
    category: 'Gear',
    title: 'Class returned',
    question: 'In how many attempts did the result share a class with a sacrifice {range}?',
    filters: [range],
    reads: reads(...sacrificeColumns('class'), 'resultClass'),
    compute: (c, v, today) => returned(c, v, today, ['class']),
  },
  {
    id: 'furnace-same-piece',
    category: 'Gear',
    title: 'Piece returned',
    question:
      'In how many attempts did the result match the class and slot of a sacrifice {range}?',
    filters: [range],
    reads: reads(...sacrificeColumns('class', 'slot'), 'resultClass', 'resultSlot'),
    compute: (c, v, today) => returned(c, v, today, ['class', 'slot']),
  },
]
