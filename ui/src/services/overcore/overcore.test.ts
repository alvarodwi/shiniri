import { describe, expect, it, vi } from 'vitest'

import {
  checkOvercores,
  copyStarts,
  findOvercores,
  overcoreRows,
  painLevel,
  remark,
} from './overcore'

import { OVERCORE_LINES, PILGRIM_LINE } from '@/config/overcoreLines'
import type { SheetsApi } from '@/services/google/sheetsApi'
import type { Nikke } from '@/services/nikke/nikkeDatabase'
import { HeaderMismatchError } from '@/services/sheets/tabWriter'

const AP_H = ['date', 'nikke', 'source', 'spook', 'copy', 'isOvercore']
const RL_H = ['date', 'nameCode', 'nikke', 'copies']
const roster = [
  RL_H,
  ['2026-11-21', '5001', 'Rapi', '10'],
  ['2026-11-21', '5002', 'Noah', '11'],
  ['2026-11-25', '5001', 'Rapi', '11'],
]
const pulls = [
  AP_H,
  ['2026-11-20', 'Rapi', 'Event', 'FALSE', '', 'FALSE'],
  ['2026-11-24', 'Rapi', 'Event', 'FALSE', '11', 'FALSE'],
  ['2026-11-24', 'Liter', 'Mold', '', '', ''],
  ['x'],
]
const nikke = (name: string, manufacturer: string): Nikke => ({
  nameCode: '1',
  name,
  rarity: 'SSR',
  manufacturer,
  class: '',
  burst: '',
  element: '',
  weapon: '',
  resourceId: '',
  releaseDate: '',
  limited: false,
  overspec: false,
})
const nikkes = [nikke('Rapi', 'ELYSION'), nikke('Noah', 'PILGRIM')]

describe('overcore', () => {
  it('painLevel follows the owner order', () => {
    expect(painLevel('Extra', '')).toBe(1)
    expect(painLevel('Social', '')).toBe(1)
    expect(painLevel('Ordinary', '')).toBe(2)
    expect(painLevel('Mold', 'HQ Mold')).toBe(2)
    expect(painLevel('Event', '')).toBe(3)
    expect(painLevel('Mold', 'Tetra Mold')).toBe(4)
    expect(painLevel('Mold', 'HQ Perfect Mold')).toBe(5)
    expect(painLevel('Exchange', 'Union Chip')).toBe(6)
    expect(painLevel('Exchange', 'Gold Mileage')).toBe(7)
  })

  it('keeps pain levels under the new source names', () => {
    expect(painLevel('Mold', 'Pilgrim Perfect Mold')).toBe(5)
    expect(painLevel('Mold', 'Pilgrim Mold')).toBe(4)
    expect(painLevel('Mold', 'Yellow Mold')).toBe(2)
    expect(painLevel('Exchange', 'Gold Mileage')).toBe(7)
    expect(painLevel('Exchange', 'Union Chip')).toBe(6)
    expect(painLevel('Extra', '')).toBe(1)
  })

  it('copyStarts uses the last AllPulls copy, else the baseline, else 0', () => {
    const s = copyStarts(pulls, roster)
    expect(s.baseline).toBe('2026-11-21')
    expect([s.start('Rapi'), s.start('Noah'), s.start('Liter'), s.start('Nobody')]).toEqual([
      11, 11, 0, 0,
    ])
  })

  it('a blank copy on the last row falls back to the baseline', () => {
    const p = [AP_H, ['2026-11-24', 'Rapi', 'Event', '', '12', ''], ['2026-11-25', 'Rapi', 'Event']]
    expect(copyStarts(p, roster).start('Rapi')).toBe(10)
  })

  it('a dated RosterLog row with a blank name does not set the baseline', () => {
    const r = [RL_H, ['2026-11-01', '', '', ''], ...roster.slice(1)]
    expect(copyStarts(pulls, r).baseline).toBe('2026-11-21')
  })

  it('an error value in AllPulls copy throws naming it and the Nikke', () => {
    const p = [AP_H, ['2026-11-24', 'Rapi', 'Event', '', '#VALUE!', '']]
    expect(() => copyStarts(p, roster)).toThrow('AllPulls copy shows #VALUE! for Rapi')
  })

  it('same Nikke twice in a save is C8 then C9', () => {
    expect(
      findOvercores(['Rapi', 'Rapi', 'Liter'], '2026-11-26', copyStarts(pulls, roster)),
    ).toEqual([
      { name: 'Rapi', copy: 12 },
      { name: 'Rapi', copy: 13 },
    ])
  })

  it('a save on or before the baseline finds nothing, even at copy 11', () => {
    expect(findOvercores(['Noah'], '2026-11-21', copyStarts(pulls, roster))).toEqual([])
  })

  it('no RosterLog rows means no baseline and nothing found', () => {
    expect(findOvercores(['Noah'], '2026-11-26', copyStarts(pulls, [RL_H]))).toEqual([])
  })

  it('overcoreRows title-cases the maker and blanks unknown Nikkes', () => {
    expect(
      overcoreRows(
        [
          { name: 'Rapi', copy: 12 },
          { name: 'Ghost', copy: 12 },
        ],
        'Exchange',
        '2026-11-26',
        nikkes,
      ),
    ).toEqual([
      ['2026-11-26', 'Exchange', "'Rapi", 'Elysion', ''],
      ['2026-11-26', 'Exchange', "'Ghost", '', ''],
    ])
  })

  it('remark: the source level line, every overcore named, Pilgrim line added', () => {
    // A Pilgrim from a Perfect Mold keeps the mold line (level 5), never Exchange's "bought" line.
    const r = remark([{ name: 'Noah', copy: 12 }], 'Mold', 'Pilgrim Perfect Mold', nikkes, () => 0)
    expect(r).toBe(`${OVERCORE_LINES[5][0].replace('{who}', 'Noah C8')} ${PILGRIM_LINE}`)
    expect(
      remark(
        [
          { name: 'Rapi', copy: 12 },
          { name: 'Rapi', copy: 13 },
          { name: 'Noah', copy: 12 },
        ],
        'Exchange',
        'Gold Mileage',
        nikkes,
        () => 0,
      ),
    ).toBe(
      `${OVERCORE_LINES[7][0].replace('{who}', 'Rapi C8, Rapi C9 and Noah C8')} ${PILGRIM_LINE}`,
    )
    expect(remark([], 'Extra', '', nikkes)).toBeNull()
  })

  it('remark: unknown Nikke gets no Pilgrim line', () => {
    expect(remark([{ name: 'Ghost', copy: 12 }], 'Event', '', nikkes, () => 0)).toBe(
      OVERCORE_LINES[3][0].replace('{who}', 'Ghost C8'),
    )
  })

  const input = {
    from: 'Event' as const,
    detail: '',
    date: '2026-11-26',
    names: ['Rapi'],
    nikkes,
  }
  const fakeApi = (values: Record<string, string[][]>) =>
    ({
      getValues: vi.fn(async (_id: string, range: string) => values[range] ?? []),
    }) as unknown as SheetsApi

  it('checkOvercores throws on an AllPulls header mismatch', async () => {
    const api = fakeApi({ "'AllPulls'!A1:F": [['date', 'nikke']], "'RosterLog'!A1:D": roster })
    await expect(checkOvercores(api, input)).rejects.toThrow(HeaderMismatchError)
    await expect(checkOvercores(api, input)).rejects.toThrow(/^AllPulls: /)
  })

  it('checkOvercores returns rows and remark', async () => {
    const api = fakeApi({ "'AllPulls'!A1:F": pulls, "'RosterLog'!A1:D": roster })
    const r = await checkOvercores(api, input, () => 0)
    expect(r.rows).toEqual([['2026-11-26', 'Event', "'Rapi", 'Elysion', '']])
    expect(r.remark).toBe(OVERCORE_LINES[3][0].replace('{who}', 'Rapi C8'))
  })
})
