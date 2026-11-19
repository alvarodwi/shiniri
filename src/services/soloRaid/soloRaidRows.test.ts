import { describe, expect, it } from 'vitest'

import { nextSeason, parseDamage, pastBosses, rankText, toRow } from './soloRaidRows'

import type { RaidEntry } from '@/types/soloRaid'

describe('nextSeason', () => {
  it('is the last season + 1, skipping trailing blanks', () => {
    expect(nextSeason(['season', '1', '2'])).toBe(3)
    expect(nextSeason(['season', '2', '', ' '])).toBe(3)
  })

  it('is 1 for a header-only tab', () => {
    expect(nextSeason(['season'])).toBe(1)
  })

  it('is null when the last cell is not a number', () => {
    expect(nextSeason(['season', '2', 'x'])).toBeNull()
  })
})

describe('pastBosses', () => {
  it('lists distinct bosses, most recent first', () => {
    expect(pastBosses(['boss', 'A', 'B', 'A', ' ', ''])).toEqual(['A', 'B'])
  })
})

describe('parseDamage', () => {
  it('accepts digits with or without separators', () => {
    for (const s of ['12345678901', '12,345,678,901', '12.345.678.901', ' 12 345 678 901 '])
      expect(parseDamage(s)).toBe(12345678901)
  })

  it('rejects empty, zero and non-digits', () => {
    for (const s of ['', '0', '12a', '-5']) expect(parseDamage(s)).toBeNull()
  })

  it('rejects separators that are not thousands groups, so 12.5 is not read as 125', () => {
    for (const s of ['12.5', '1,23,456', '12,345.678']) expect(parseDamage(s)).toBeNull()
  })
})

describe('rankText', () => {
  it('writes a top-% as text with two decimals', () => {
    expect(rankText('percent', '7.95')).toBe("'7.95%")
    expect(rankText('percent', '7.9')).toBe("'7.90%")
    expect(rankText('percent', '100')).toBe("'100.00%")
  })

  it('accepts a comma decimal, as an Indonesian keyboard types it', () => {
    expect(rankText('percent', '7,95')).toBe("'7.95%")
  })

  it('rejects more than two decimals instead of rounding them away', () => {
    for (const s of ['7.955', '0.001', '0.00']) expect(rankText('percent', s)).toBeNull()
  })

  it('rejects a top-% outside (0, 100]', () => {
    for (const s of ['0', '100.01', '', 'abc']) expect(rankText('percent', s)).toBeNull()
  })

  it('writes a placement as #N text, 1 to 500', () => {
    expect(rankText('place', '123')).toBe("'#123")
    for (const s of ['8.5', '0', '501', '']) expect(rankText('place', s)).toBeNull()
  })
})

describe('toRow', () => {
  const entry: RaidEntry = {
    season: 45,
    date: '2026-11-14',
    boss: ' Mother Whale ',
    weakness: 'Electric',
    damage: '12,345,678,901',
    rankMode: 'percent',
    rank: '7.95',
    comments: '',
  }

  it('builds the SoloRaid row', () => {
    expect(toRow(entry)).toEqual([
      45,
      '2026-11-14',
      "'Mother Whale",
      'Electric',
      12345678901,
      "'7.95%",
      '',
    ])
  })

  it('keeps a formula-looking boss as text', () => {
    expect(toRow({ ...entry, boss: '=1+1' })?.[2]).toBe("'=1+1")
  })

  it('is null when a required part is missing or invalid', () => {
    expect(toRow({ ...entry, weakness: null })).toBeNull()
    expect(toRow({ ...entry, season: 0 })).toBeNull()
    expect(toRow({ ...entry, season: null })).toBeNull()
    expect(toRow({ ...entry, boss: ' ' })).toBeNull()
    expect(toRow({ ...entry, date: '' })).toBeNull()
    expect(toRow({ ...entry, damage: 'x' })).toBeNull()
    expect(toRow({ ...entry, rankMode: 'place', rank: '8.5' })).toBeNull()
  })
})
