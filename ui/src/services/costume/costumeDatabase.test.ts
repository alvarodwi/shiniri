import { describe, expect, it } from 'vitest'

import {
  costumeImage,
  ownedNewestFirst,
  readCostumes,
  searchOwned,
  toCostumes,
} from './costumeDatabase'
import type { Costume } from './costumeDatabase'

import { COSTUME_DATABASE_TAB } from '@/config/sheets'
import { MOCK_SHEETS } from '@/services/mock/fixtures'
import { createMockSheetsApi } from '@/services/mock/mockSheetsApi'
import { HeaderMismatchError } from '@/services/sheets/tabWriter'

const id = COSTUME_DATABASE_TAB.spreadsheetId
const tab = COSTUME_DATABASE_TAB.tab
const headers = [...COSTUME_DATABASE_TAB.headers]

const row = (cid: string, nikke: string, name: string, owned: unknown = true) =>
  [cid, nikke, name, 'Unique', 'Costume Gacha', 'character/mi/mi_c019_01_s.webp', owned] as string[]

describe('toCostumes', () => {
  it('maps every column in header order', () => {
    expect(
      toCostumes([
        [
          '130007',
          'Marian: Queen',
          'Last Affection',
          'Unique',
          'Costume Gacha',
          'character/mi/mi_c019_01_s.webp',
          'TRUE',
        ],
      ]),
    ).toEqual([
      {
        costumeId: '130007',
        nikke: 'Marian: Queen',
        costumeName: 'Last Affection',
        grade: 'Unique',
        source: 'Costume Gacha',
        image: 'character/mi/mi_c019_01_s.webp',
        owned: true,
        releaseDate: '',
      },
    ])
  })

  it('owned is true for true, "TRUE" and "true"; false for "FALSE", blank and a missing cell', () => {
    const rows = [
      row('1', 'A', 'a', true),
      row('2', 'B', 'b', 'TRUE'),
      row('3', 'C', 'c', ' true '),
      row('4', 'D', 'd', 'FALSE'),
      row('5', 'E', 'e', ''),
      row('6', 'F', 'f').slice(0, 6),
    ]
    expect(toCostumes(rows).map((c) => c.owned)).toEqual([true, true, true, false, false, false])
  })

  it('skips rows with a blank costumeId or nikke, but keeps one with a blank costumeName', () => {
    const rows = [row('', 'A', 'a'), row('2', ' ', 'b'), row('3', 'C', ''), [], row('5', 'E', 'e')]
    expect(toCostumes(rows).map((c) => c.costumeId)).toEqual(['3', '5'])
  })

  it('reads releaseDate from the lookup column when present', () => {
    const r = [...row('1', 'A', 'a'), '', '', '', 45000]
    expect(toCostumes([r as string[]], 10)[0].releaseDate).toBe('2023-03-15')
    expect(toCostumes([row('1', 'A', 'a')])[0].releaseDate).toBe('')
  })
})

const make = (cid: string, nikke: string, name: string, owned: boolean): Costume => ({
  costumeId: cid,
  nikke,
  costumeName: name,
  grade: '',
  source: '',
  image: '',
  owned,
  releaseDate: '',
})
const sample = [
  make('1', 'Marian', 'Last Affection', true),
  make('2', 'Rapi', 'Red Hood', false),
  make('3', 'Anis', 'Sparkling Summer', true),
  make('4', 'Neon', 'Blue Ocean', true),
]

describe('ownedNewestFirst', () => {
  it('reverses and drops unowned', () => {
    expect(ownedNewestFirst(sample).map((c) => c.costumeId)).toEqual(['4', '3', '1'])
  })
})

describe('searchOwned', () => {
  it('matches nikke or costume name and keeps newest first', () => {
    expect(searchOwned(sample, 'a').map((c) => c.costumeId)).toEqual(['4', '3', '1'])
    expect(searchOwned(sample, 'SPARK').map((c) => c.costumeId)).toEqual(['3'])
    expect(searchOwned(sample, 'neon').map((c) => c.costumeId)).toEqual(['4'])
    expect(searchOwned(sample, 'rapi')).toEqual([])
  })
  it('a blank query matches every owned costume', () => {
    expect(searchOwned(sample, '  ')).toHaveLength(3)
  })
})

describe('costumeImage', () => {
  it('maps the path and returns null for a path outside character/mi', () => {
    expect(costumeImage('character/mi/mi_c019_01_s.webp')).toBe(
      `${import.meta.env.BASE_URL}img/nikke/mi/mi_c019_01_s.webp`,
    )
    expect(costumeImage('character/si/si_c019_00_s.webp')).toBeNull()
    expect(costumeImage('character/mi/x.png')).toBeNull()
    expect(costumeImage('')).toBeNull()
  })
})

describe('readCostumes', () => {
  it('reads the mock CostumeDatabase', async () => {
    const costumes = await readCostumes(createMockSheetsApi(MOCK_SHEETS))
    expect(costumes.length).toBeGreaterThanOrEqual(3)
    expect(costumes[0].nikke).toBe('Marian: Queen')
    expect(costumes.some((c) => c.owned) && costumes.some((c) => !c.owned)).toBe(true)
  })

  it('throws HeaderMismatchError on a renamed header', async () => {
    const renamed = headers.map((h) => (h === 'nikke' ? 'Nikke' : h))
    const api = createMockSheetsApi({ [id]: { [tab]: [renamed, row('1', 'A', 'a')] } })
    await expect(readCostumes(api)).rejects.toBeInstanceOf(HeaderMismatchError)
  })

  it('finds releaseDate in column K', async () => {
    const head = [...headers, '', '', '', 'releaseDate']
    const api = createMockSheetsApi({
      [id]: { [tab]: [head, [...row('1', 'A', 'a'), '', '', '', '2024-02-01']] },
    })
    expect((await readCostumes(api))[0].releaseDate).toBe('2024-02-01')
  })
})
