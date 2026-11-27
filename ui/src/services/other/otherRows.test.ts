import { describe, expect, it } from 'vitest'

import { otherPool, toRows } from './otherRows'

import type { Nikke } from '@/services/nikke/nikkeDatabase'
import type { OtherEntry } from '@/types/other'

const entry = (over: Partial<OtherEntry> = {}): OtherEntry => ({
  date: '2026-04-23',
  sourceType: 'Welfare Unit',
  sourceInfo: ' 3.5 Anniv ',
  rateUpName: '',
  gems: '',
  times: '',
  copies: '1',
  names: ['Avistar'],
  notes: '',
  ...over,
})

describe('otherPool', () => {
  it('gives SSRs with overspec but not Abnormal', () => {
    const n = (name: string, rarity: string, manufacturer: string) =>
      ({ name, rarity, manufacturer, overspec: manufacturer === 'Pilgrim' }) as Nikke
    const db = [n('A', 'SSR', 'Pilgrim'), n('B', 'SSR', 'ABNORMAL'), n('C', 'SR', 'Tetra')]
    expect(otherPool(db).map((x) => x.name)).toEqual(['A'])
  })
})

describe('toRows', () => {
  it('writes a row per copy for Welfare Unit, note on the last', () => {
    const row = ['2026-04-23', 'Welfare Unit', "'3.5 Anniv", '', '', 1, 1, "'Avistar"]
    expect(toRows(entry({ copies: '4', notes: 'mlb' }))).toEqual([
      [...row, ''],
      [...row, ''],
      [...row, ''],
      [...row, "'mlb"],
    ])
  })
  it('blanks sourceInfo for Free Pulls and keeps rateUpName', () => {
    expect(
      toRows(
        entry({
          sourceType: 'Free Pulls',
          rateUpName: 'Scarlet: Goddeath',
          sourceInfo: 'stale',
          names: ['Arcana'],
        }),
      ),
    ).toEqual([['2026-04-23', 'Free Pulls', '', "'Scarlet: Goddeath", '', 1, 1, "'Arcana", '']])
  })
  it('writes one row per Free Pulls hit, ignoring copies', () => {
    const rows = toRows(
      entry({
        sourceType: 'Free Pulls',
        rateUpName: 'Scarlet: Goddeath',
        names: ['Arcana'],
        copies: '9',
      }),
    )
    expect(rows).toHaveLength(1)
  })
  it('writes one Guaranteed SSR row with gems, times and every name', () => {
    expect(
      toRows(
        entry({
          sourceType: 'Guaranteed SSR',
          sourceInfo: 'Step Up 2025',
          gems: '6600',
          times: '31',
          names: ['Yan', 'Grave'],
          copies: '9',
        }),
      ),
    ).toEqual([
      ['2026-04-23', 'Guaranteed SSR', "'Step Up 2025", '', 6600, 31, 2, "'Yan, Grave", ''],
    ])
  })
  it('leaves gems blank for Guaranteed SSR when empty', () => {
    const rows = toRows(
      entry({
        sourceType: 'Guaranteed SSR',
        sourceInfo: 'Tutorial',
        times: '10',
        names: ['Liter'],
      }),
    )
    expect(rows?.[0][4]).toBe('')
  })
  it('ignores stale gems and times for Welfare Pass', () => {
    const rows = toRows(entry({ sourceType: 'Welfare Pass', gems: '300', times: '5' }))
    expect(rows?.[0].slice(4, 7)).toEqual(['', 1, 1])
  })
  it.each([
    { date: '' },
    { sourceType: '' },
    { sourceType: 'Freebie' },
    { sourceInfo: ' ' },
    { names: [] },
    { names: ['A', 'B'] },
    { copies: '12' },
    { sourceType: 'Free Pulls', rateUpName: '' },
    { sourceType: 'Guaranteed SSR', names: [], times: '3' },
    { sourceType: 'Guaranteed SSR', times: '' },
    { sourceType: 'Guaranteed SSR', times: '0' },
    { sourceType: 'Guaranteed SSR', times: '1.5' },
    { sourceType: 'Guaranteed SSR', times: '3', gems: 'x' },
    { sourceType: 'Guaranteed SSR', times: '3', gems: '-300' },
  ])('is null for %j', (over) => {
    expect(toRows(entry(over))).toBeNull()
  })
})
