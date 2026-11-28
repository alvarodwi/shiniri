import { describe, expect, it } from 'vitest'

import { FACTS, fillQuestion } from './facts'

const fact = (id: string) => FACTS.find((f) => f.id === `costume-${id}`)!
// CostumeDatabase: [nikke, grade, source, owned]
const cols = (rows: unknown[][]) => ({
  CostumeDatabase: {
    nikke: rows.map((r) => r[0]),
    grade: rows.map((r) => r[1]),
    source: rows.map((r) => r[2]),
    owned: rows.map((r) => r[3]),
  },
})
const compute = (id: string, rows: unknown[][], values: Record<string, string> = {}) =>
  fact(id).compute(cols(rows), values, '2026-11-28')

const ROWS = [
  ['Rapi', 'Unique', 'Costume Gacha', true],
  ['Rapi', 'Epic', 'Event Pass', 'FALSE'],
  ['Anis', 'Epic', 'Mission Pass', 'TRUE'],
  ['Anis', 'Unique', '', true],
  ['Neon', 'Epic', 'Cash Shop', false],
  ['', '', '', ''],
]
const any = { grade: 'any grade', source: 'any source' }
const of = (grade: string, source: string) => ({ grade, source })

describe('costume facts', () => {
  it('owned counts owned costumes of the grade and source', () => {
    expect(compute('owned', ROWS, any)).toBe('3')
    expect(compute('owned', ROWS, of('Unique', 'any source'))).toBe('2')
    expect(compute('owned', ROWS, of('any grade', 'Costume Gacha'))).toBe('1')
    expect(compute('owned', ROWS, of('Epic', 'Cash Shop'))).toBe('0')
    expect(compute('owned', ROWS, of('Unique', 'Cash Shop'))).toBeNull()
    expect(compute('owned', [], any)).toBeNull()
  })

  it('completion is the owned share of the source', () => {
    expect(compute('completion', ROWS, { source: 'any source' })).toBe('60')
    expect(compute('completion', ROWS, { source: 'Costume Gacha' })).toBe('100')
    expect(compute('completion', ROWS, { source: 'Cash Shop' })).toBe('0')
    expect(compute('completion', [], { source: 'any source' })).toBeNull()
  })

  it('missing counts unowned costumes of the grade and source', () => {
    expect(compute('missing', ROWS, any)).toBe('2')
    expect(compute('missing', ROWS, of('Epic', 'Event Pass'))).toBe('1')
    expect(compute('missing', ROWS, of('Unique', 'any source'))).toBe('0')
    expect(compute('missing', ROWS, of('Unique', 'Cash Shop'))).toBeNull()
  })

  it('dressed counts each NIKKE with an owned costume once', () => {
    expect(compute('dressed', ROWS)).toBe('2')
    expect(compute('dressed', [['Neon', 'Epic', 'Cash Shop', false]])).toBe('0')
    expect(compute('dressed', [])).toBeNull()
  })

  it('skipped passes counts unowned event and mission pass costumes', () => {
    expect(compute('skipped-passes', ROWS)).toBe('1')
    expect(compute('skipped-passes', ROWS.slice(2, 3))).toBe('0')
    expect(compute('skipped-passes', ROWS.slice(0, 1))).toBeNull()
  })

  it('takes filter options from the data and drops "any" before a noun', () => {
    const [grades, sources] = fact('owned').filters!
    const options = (f: typeof grades) =>
      typeof f.options === 'function' ? f.options(cols(ROWS)) : f.options
    expect(options(grades)).toEqual(['any grade', 'Unique', 'Epic'])
    expect(options(sources)).toEqual([
      'any source',
      'Costume Gacha',
      'Event Pass',
      'Mission Pass',
      'Cash Shop',
    ])
    expect(fillQuestion(fact('owned'), any)).toBe('How many costumes from any source do I own?')
    expect(fillQuestion(fact('completion'), { source: 'any source' })).toBe(
      'What % of costumes do I own?',
    )
    expect(fillQuestion(fact('completion'), { source: 'Event Pass' })).toBe(
      'What % of Event Pass costumes do I own?',
    )
  })
})
