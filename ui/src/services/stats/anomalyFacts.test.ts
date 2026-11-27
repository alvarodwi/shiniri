import { describe, expect, it } from 'vitest'

import { FACTS, fillQuestion } from './facts'

type Row = [
  date: unknown,
  boss: string,
  stage?: number,
  dropped?: boolean,
  modules?: number,
  classType?: string,
  manufacturer?: string,
  slot?: string,
]
const HEADERS = ['date', 'boss', 'stage', 'dropped', 'modules', 'class', 'manufacturer', 'dropType']

const fact = (id: string) => FACTS.find((f) => f.id === `anomaly-${id}`)!
// Only the columns the fact declares, as the loader would give them.
const run = (id: string, rows: Row[], values: Record<string, string> = {}) => {
  const columns = fact(id).reads[0].columns
  const Anomaly = Object.fromEntries(
    columns.map((name) => [name, rows.map((r) => r[HEADERS.indexOf(name)] ?? '')]),
  )
  return fact(id).compute({ Anomaly }, values, '2026-11-27')
}

const any = { boss: 'any boss', range: 'any period' }
const ultra = { ...any, boss: 'Ultra' }

const ROWS: Row[] = [
  ['2024-08-21', 'Kraken', 9, true, 3, '', '', 'Modules'],
  ['2024-08-22', 'Ultra', 9, true, 2, 'Attacker', 'Tetra', 'Helmet'],
  ['2024-08-22', 'Ultra', 7, false, 0, '', '', 'Helmet'],
  ['2024-08-22', 'Harvester', 8, true, 1, 'Defender', 'Elysion', 'Boots'],
  ['2024-08-23', 'Ultra', 8, true, 0, 'Attacker', 'Tetra', 'Helmet'],
  ['2024-08-23', 'Kraken', 7, false, 0, '', '', 'Modules'],
  ['', '', undefined, undefined, undefined], // a blank row left by a failed write
]
// Every run here: Ultra, below stage 9, no gear, no modules.
const BARE: Row[] = [['2024-08-22', 'Ultra', 7, false, 0]]

// [id, values, rows, expected]
const CASES: [string, Record<string, string>, Row[], string | null][] = [
  ['runs', any, ROWS, '6'],
  ['runs', ultra, ROWS, '3'],
  ['runs', any, [], '0'],
  ['top-boss', any, ROWS, 'Ultra, 3 runs'],
  ['top-boss', any, [ROWS[0], ROWS[1]], 'Kraken, 1 run'], // tie: earliest row
  ['top-boss', any, [], null],
  ['first-clear', ultra, ROWS, '22 Aug 2024'],
  ['first-clear', ultra, [...ROWS, ['2023-01-05', 'Ultra', 9]], '5 Jan 2023'], // by date, not row
  ['first-clear', ultra, BARE, null],
  ['modules', any, ROWS, '6'],
  ['modules', ultra, BARE, '0'],
  ['modules', any, [], '0'],
  ['double-days', any, ROWS, '0'],
  [
    'double-days',
    any,
    [6, 10, 5].flatMap((n, d) => Array<Row>(n).fill([`2024-08-0${d + 1}`, 'Kraken'])),
    '2',
  ],
  ['zero-days', any, ROWS, '1'],
  ['zero-days', any, [ROWS[0]], '0'],
  ['zero-days', any, [...BARE, ...BARE, ['2024-08-23', 'Ultra', 7, false, 1]], '1'],
  ['first-run', ultra, ROWS, '22 Aug 2024'],
  ['first-run', { boss: 'Indivilia' }, ROWS, null],
  ['module-runs', { ...any, size: 'any size' }, ROWS, '3'],
  ['module-runs', { ...any, size: '2' }, ROWS, '1'],
  ['module-runs', { ...ultra, size: '3' }, ROWS, '0'],
  ['gear-runs', any, ROWS, '3'], // Kraken left out
  ['gear-runs', ultra, BARE, '0'],
  ['best-day', any, ROWS, '3 modules, 21 Aug 2024'], // ties 22 Aug: earliest date
  ['best-day', ultra, ROWS, '2 modules, 22 Aug 2024'],
  ['best-day', ultra, BARE, '0 modules, 22 Aug 2024'],
  ['best-day', ultra, [], null],
  ['modules-per-run', any, ROWS, '1.00'],
  ['modules-per-run', ultra, ROWS, '0.67'],
  ['modules-per-run', ultra, BARE, '0.00'],
  ['modules-per-run', ultra, [], null],
  ['boss-share', ultra, ROWS, '50'],
  ['boss-share', { ...any, boss: 'Indivilia' }, ROWS, '0'],
  ['boss-share', ultra, [], null],
  ['module-rate', { ...ultra, size: 'any size' }, ROWS, '33'],
  ['module-rate', { ...ultra, size: '3' }, ROWS, '0'],
  ['module-rate', { ...ultra, size: '3' }, [], null],
  ['gear-rate', any, ROWS, '75'],
  ['gear-rate', ultra, BARE, '0'],
  ['gear-rate', any, [ROWS[0]], null],
  ['top-piece', any, ROWS, 'Tetra Attacker Helmet, 2 drops'],
  ['top-piece', any, [ROWS[3], ROWS[1]], 'Elysion Defender Boots, 1 drop'], // tie
  ['top-piece', any, BARE, null],
  ['top-manufacturer', any, ROWS, 'Tetra, 2 drops'],
  ['top-manufacturer', any, [ROWS[3], ROWS[1]], 'Elysion, 1 drop'],
  ['top-manufacturer', any, [['2024-08-22', 'Ultra', 9, true]], null],
  ['top-class', any, ROWS, 'Attacker, 2 drops'],
  ['top-class', any, [ROWS[3], ROWS[1]], 'Defender, 1 drop'],
  ['top-class', any, BARE, null],
  ['manufacturer-share', { ...any, manufacturer: 'Tetra' }, ROWS, '67'],
  ['manufacturer-share', { ...any, manufacturer: 'Pilgrim' }, ROWS, '0'],
  ['manufacturer-share', { ...any, manufacturer: 'Tetra' }, BARE, null],
  ['class-share', { ...any, class: 'Defender' }, ROWS, '33'],
  ['class-share', { ...any, class: 'Supporter' }, ROWS, '0'],
  ['class-share', { ...any, class: 'Defender' }, BARE, null],
  ['unguaranteed-runs', any, ROWS, '3'],
  ['unguaranteed-runs', any, [ROWS[0]], '0'],
  ['lucky-runs', any, ROWS, '2'],
  ['lucky-runs', ultra, BARE, '0'],
  ['missed-runs', any, ROWS, '1'],
  ['missed-runs', any, [ROWS[1]], '0'],
  ['lucky-rate', any, ROWS, '67'],
  ['lucky-rate', ultra, BARE, '0'],
  ['lucky-rate', any, [ROWS[1]], null],
]

describe('anomaly facts', () => {
  it.each(CASES)('%s %o', (id, values, rows, expected) => {
    expect(run(id, rows, values)).toBe(expected)
  })

  it('has 23 facts, each covered above', () => {
    const ids = FACTS.filter((f) => f.id.startsWith('anomaly-')).map((f) => f.id)
    expect(ids).toHaveLength(23)
    expect(new Set(CASES.map(([id]) => `anomaly-${id}`))).toEqual(new Set(ids))
  })

  it('reads serial dates and text booleans, and applies the range', () => {
    const rows: Row[] = [
      [45526, 'Ultra', 8, 'TRUE' as unknown as boolean], // 22 Aug 2024
      ['2026-11-26', 'Ultra', 8, true],
    ]
    expect(run('gear-runs', rows, ultra)).toBe('2')
    expect(run('gear-runs', rows, { ...ultra, range: 'in 2024' })).toBe('1')
    expect(run('gear-runs', rows, { ...ultra, range: 'this week' })).toBe('1')
  })

  it('offers options from the data, leaving Kraken out of gear boss', () => {
    const cols = {
      Anomaly: {
        boss: ['Kraken', 'Ultra', '', 'Ultra'],
        class: ['', 'Attacker'],
        manufacturer: ['', 'Tetra'],
      },
    }
    const options = (id: string, filter: string) => {
      const o = fact(id).filters!.find((f) => f.id === filter)!.options
      return typeof o === 'function' ? o(cols) : o
    }
    expect(options('runs', 'boss')).toEqual(['any boss', 'Kraken', 'Ultra'])
    expect(options('boss-share', 'boss')).toEqual(['Kraken', 'Ultra'])
    expect(options('gear-runs', 'boss')).toEqual(['any boss', 'Ultra'])
    expect(options('manufacturer-share', 'manufacturer')).toEqual(['Tetra'])
    expect(options('class-share', 'class')).toEqual(['Attacker'])
  })

  it('words the size in the question', () => {
    const q = (size: string) => fillQuestion(fact('module-runs'), { ...any, size })
    expect(q('any size')).toBe('How many runs against any boss had a module drop?')
    expect(q('2')).toBe('How many runs against any boss had a module drop of size 2?')
  })
})
