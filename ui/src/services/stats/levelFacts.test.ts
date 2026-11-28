import { describe, expect, it } from 'vitest'

import { FACTS } from './facts'

const fact = (id: string) => FACTS.find((f) => f.id === id)!
// [synchroLevel, date]
const compute = (id: string, rows: unknown[][], values: Record<string, string>) =>
  fact(id).compute(
    { LevelLog: { synchroLevel: rows.map((r) => r[0]), date: rows.map((r) => r[1]) } },
    values,
    '2026-11-27',
  )

const ROWS = [
  [750, '2025-12-02'],
  [755, '2025-12-22'], // 20 days
  [760, '2026-01-11'], // 20 days
  [765, '2026-10-29'], // jump 760 to 775
  [770, '2026-10-29'],
  [775, '2026-10-29'],
  [780, '2026-11-08'], // 10 days
  ['', ''],
]
const FIRST_JUMP = [
  [200, '2023-01-01'],
  [205, '2023-01-01'],
]
const TIED = [
  [100, '2026-01-01'],
  [105, '2026-01-11'],
  [110, '2026-01-21'],
]

const any = { range: 'any period' }
const none = { range: 'in 2022' }
const five = { ...any, levels: '5 levels' }

// [id, values, rows, expected]
const CASES: [string, Record<string, string>, unknown[][], string | null][] = [
  // 341 days over 30 levels
  ['pace', five, ROWS, '56.8'],
  ['pace', { ...any, levels: '1 level' }, ROWS, '11.4'],
  // from 755 on 22 Dec 2025: 321 days over 25 levels
  ['pace', { ...five, range: 'in 2026' }, ROWS, '64.2'],
  ['pace', five, FIRST_JUMP, '0.0'],
  ['pace', five, ROWS.slice(0, 1), null], // nothing gained
  ['pace', { ...five, ...none }, ROWS, null],
  ['jumps', any, ROWS, '1'],
  ['jumps', none, ROWS, '0'],
  ['last-jump', {}, ROWS, '760 to 775, 29 Oct 2026'],
  ['last-jump', {}, FIRST_JUMP, null], // no earlier milestone to run from
  ['last-jump', {}, TIED, null],
  // last 365 days: 341 days over 30 levels = 57 per 5, after 8 Nov 2026
  ['next', {}, ROWS, '785, 4 Jan 2027'],
  ['next', {}, TIED.slice(0, 2), '110, 21 Jan 2026'], // already past, still shown
  ['next', {}, FIRST_JUMP, null], // nothing in the last 365 days
  ['next', {}, [], null],
  ['slowest', any, ROWS, '760 to 765, 291 days'],
  ['slowest', { range: 'in 2025' }, ROWS, '750 to 755, 20 days'],
  ['slowest', any, TIED, '100 to 105, 10 days'], // tie: earliest
  ['slowest', any, FIRST_JUMP, '200 to 205, 0 days'],
  ['slowest', none, ROWS, null],
]

describe('level facts', () => {
  it.each(CASES)('levellog-%s %o', (id, values, rows, expected) => {
    expect(compute(`levellog-${id}`, rows, values)).toBe(expected)
  })

  it('has all 5 facts in Progress', () => {
    const facts = FACTS.filter((f) => f.id.startsWith('levellog-'))
    expect(facts).toHaveLength(5)
    expect(facts.every((f) => f.category === 'Progress')).toBe(true)
  })
})
