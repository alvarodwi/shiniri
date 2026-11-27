import { describe, expect, it } from 'vitest'

import { cellGameDay, firstMax, groupByGameDay, topWithCount } from './rules'

describe('stats rules', () => {
  it('gives a tie to the earliest row', () => {
    const rows = [
      { id: 'a', n: 1 },
      { id: 'b', n: 3 },
      { id: 'c', n: 3 },
    ]
    expect(firstMax(rows, (r) => r.n)?.id).toBe('b')
    expect(firstMax(rows, (r) => -r.n)?.id).toBe('a')
    expect(firstMax([], () => 0)).toBeUndefined()
  })
  it('names the most frequent value with its count, skipping blanks', () => {
    expect(topWithCount(['', 'Elysion', 'Tetra', 'Tetra', 'Elysion', ''], 'drop')).toBe(
      'Elysion, 2 drops',
    )
    expect(topWithCount(['Tetra'], 'drop')).toBe('Tetra, 1 drop')
    expect(topWithCount(['', ''], 'drop')).toBeNull()
    expect(topWithCount(['a', 'a'], 'copy', 'copies')).toBe('a, 2 copies')
  })
  it('takes the game day of a date cell, shifting only timestamps', () => {
    expect(cellGameDay('2024-08-22')).toBe('2024-08-22')
    // WIB timestamps: the game day turns over at 03:00 WIB.
    expect(cellGameDay('2024-08-22 02:59:59')).toBe('2024-08-21')
    expect(cellGameDay('2024-08-22 03:00:00')).toBe('2024-08-22')
    expect(cellGameDay(45526)).toBe('2024-08-22') // serial date
    expect(cellGameDay(45526 + 2 / 24)).toBe('2024-08-21') // serial 02:00
    expect(cellGameDay('')).toBeNull()
    expect(cellGameDay('soon')).toBeNull()
    expect(cellGameDay('2024-08-22 25:00')).toBeNull()
  })
  it('groups rows by game day, oldest day first', () => {
    expect(groupByGameDay(['2024-08-23', '', '2024-08-22', '2024-08-23 01:00:00'])).toEqual([
      ['2024-08-22', [2, 3]],
      ['2024-08-23', [0]],
    ])
  })
})
