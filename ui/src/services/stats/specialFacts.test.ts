import { describe, expect, it } from 'vitest'

import { FACTS, fillQuestion } from './facts'

type Row = [date: unknown, boss: string, t9: number, modules: number, t9Manu: number, empty: number]
const HEADERS = ['date', 'boss', 't9', 'modules', 't9Manu', 'empty']
type Run = [date: string, modules: number]

const fact = (id: string) => FACTS.find((f) => f.id === id)!
// Only the columns the fact declares, as the loader would give them.
const compute = (id: string, rows: Row[], values: Record<string, string>, anomaly: Run[] = []) => {
  const cols = Object.fromEntries(
    fact(id).reads.map(({ tab, columns }) => [
      tab.tab,
      Object.fromEntries(
        columns.map((name) => [
          name,
          tab.tab === 'Special'
            ? rows.map((r) => r[HEADERS.indexOf(name)])
            : anomaly.map((r) => r[name === 'date' ? 0 : 1]),
        ]),
      ),
    ]),
  )
  return fact(id).compute(cols, values, '2026-11-27')
}

const any = { boss: 'any boss', range: 'any period' }
const alteisen = { ...any, boss: 'Alteisen' }
const modules = { ...any, drop: 'a module' }
const t9 = { ...any, drop: 'T9 gear' }
const manu = { ...any, drop: 'manufacturer gear' }
const gear = { ...any, drop: 'any gear' }
const nothing = { ...any, drop: 'nothing' }

const ROWS: Row[] = [
  ['2023-07-01', 'Alteisen', 1, 1, 0, 1],
  ['2023-07-02', 'Gravedigger', 2, 0, 0, 1],
  ['2023-07-03', 'Blacksmith', 3, 0, 0, 3], // double reward day
  ['2023-07-04', 'Alteisen', 0, 3, 0, 0],
  // no row on 5 Jul
  ['2023-07-06', 'Gravedigger', 0, 1, 2, 0],
  ['', '', 0, 0, 0, 0], // a blank row
]
const TIED = ROWS.slice(0, 2) // one empty run each

// [id, values, rows, expected]
const CASES: [string, Record<string, string>, Row[], string | null][] = [
  ['runs', any, ROWS, '18'],
  ['runs', alteisen, ROWS, '6'],
  ['runs', { ...any, range: 'in 2024' }, ROWS, '0'],
  ['double-days', any, ROWS, '1'],
  ['double-days', any, TIED, '0'],
  ['drops', modules, ROWS, '5'],
  ['drops', t9, ROWS, '6'],
  ['drops', manu, ROWS, '2'],
  ['drops', gear, ROWS, '8'],
  ['drops', nothing, ROWS, '5'],
  ['drops', { ...manu, boss: 'Alteisen' }, ROWS, '0'],
  ['drop-rate', modules, ROWS, '28'],
  ['drop-rate', { ...manu, boss: 'Alteisen' }, ROWS, '0'],
  ['drop-rate', modules, [], null],
  ['best-day', modules, ROWS, '3 runs, 4 Jul 2023'],
  ['best-day', nothing, TIED, '1 run, 1 Jul 2023'], // tie: earliest date
  ['best-day', { ...manu, boss: 'Alteisen' }, ROWS, null],
  ['dry-days', modules, ROWS, '2'],
  ['dry-days', { ...modules, boss: 'Alteisen' }, ROWS, '0'],
  ['top-boss', gear, ROWS, 'Gravedigger, 4 runs'],
  ['top-boss', nothing, TIED, 'Alteisen, 1 run'], // tie: earliest row
  ['top-boss', manu, TIED, null],
  ['full-days', modules, ROWS, '1'],
  ['full-days', gear, ROWS, '0'],
  ['dry-streak', modules, ROWS, '2 days, from 2 Jul 2023'],
  ['dry-streak', nothing, ROWS, '1 day, from 4 Jul 2023'], // the missing 5 Jul breaks it; tie
  ['dry-streak', nothing, TIED, null],
  ['drop-streak', t9, ROWS, '3 days, from 1 Jul 2023'],
  ['drop-streak', modules, ROWS, '1 day, from 1 Jul 2023'], // tie
  ['drop-streak', manu, TIED, null],
]

const ANOMALY: Run[] = [
  ['2023-07-06', 2], // also a Special day
  ['2024-08-22', 1],
  ['2024-08-22', 0],
  ['', 0],
]
const y2024 = { range: 'in 2024' }

// [id, values, rows, anomaly, expected]
const COMBINED: [string, Record<string, string>, Row[], Run[], string][] = [
  ['runs', any, ROWS, ANOMALY, '21'],
  ['runs', y2024, ROWS, ANOMALY, '2'],
  ['runs', any, [], [], '0'],
  ['modules', any, ROWS, ANOMALY, '8'],
  ['modules', y2024, ROWS, ANOMALY, '1'],
  ['modules', any, [], [], '0'],
  ['days', any, ROWS, ANOMALY, '6'],
  ['days', y2024, ROWS, ANOMALY, '1'],
  ['days', any, [], [], '0'],
]

describe('Special and interception facts', () => {
  it.each(CASES)('special-%s %o', (id, values, rows, expected) => {
    expect(compute(`special-${id}`, rows, values)).toBe(expected)
  })

  it.each(COMBINED)('interception-%s %o', (id, values, rows, anomaly, expected) => {
    expect(compute(`interception-${id}`, rows, values, anomaly)).toBe(expected)
  })

  it('covers every fact', () => {
    const ids = (prefix: string) => FACTS.map((f) => f.id).filter((id) => id.startsWith(prefix))
    expect(ids('special-')).toEqual([...new Set(CASES.map(([id]) => `special-${id}`))])
    expect(ids('interception-')).toEqual([...new Set(COMBINED.map(([id]) => `interception-${id}`))])
  })

  it('words its question', () => {
    expect(fillQuestion(fact('special-drops'), { ...manu, range: 'in 2023' })).toBe(
      'How many runs against any boss in 2023 gave manufacturer gear?',
    )
  })

  it('offers bosses from the data, and years without the presets', () => {
    const [boss, , range] = fact('special-drops').filters!
    const cols = { Special: { date: ROWS.map((r) => r[0]), boss: ROWS.map((r) => r[1]) } }
    expect((boss.options as (c: typeof cols) => string[])(cols)).toEqual([
      'any boss',
      'Alteisen',
      'Gravedigger',
      'Blacksmith',
    ])
    expect((range.options as (c: typeof cols) => string[])(cols)).toEqual(['any period', 'in 2023'])
  })

  it('offers the presets and the years of both tabs on the combined facts', () => {
    const [range] = fact('interception-days').filters!
    const cols = { Anomaly: { date: ['2024-08-22'] }, Special: { date: ['2023-07-01'] } }
    expect((range.options as (c: typeof cols) => string[])(cols)).toEqual([
      'any period',
      'this week',
      'last week',
      'this month',
      'last month',
      'in 2023',
      'in 2024',
    ])
  })
})
