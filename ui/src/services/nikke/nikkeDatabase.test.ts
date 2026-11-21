import { describe, expect, it } from 'vitest'

import { nikkeIcon, readNikkes, toNikkes } from './nikkeDatabase'

import { NIKKE_DATABASE_TAB } from '@/config/sheets'
import { MOCK_SHEETS } from '@/services/mock/fixtures'
import { createMockSheetsApi } from '@/services/mock/mockSheetsApi'
import { HeaderMismatchError } from '@/services/sheets/tabWriter'

const id = NIKKE_DATABASE_TAB.spreadsheetId
const tab = NIKKE_DATABASE_TAB.tab
const headers = [...NIKKE_DATABASE_TAB.headers]

describe('toNikkes', () => {
  it('maps every column in header order', () => {
    const rows = [
      ['5001', 'Rapi', 'SSR', 'ELYSION', 'Attacker', 'Step3', 'Fire', 'AR', '10', '45000'],
    ]
    expect(toNikkes(rows)).toEqual([
      {
        nameCode: '5001',
        name: 'Rapi',
        rarity: 'SSR',
        manufacturer: 'ELYSION',
        class: 'Attacker',
        burst: 'Step3',
        element: 'Fire',
        weapon: 'AR',
        resourceId: '10',
        releaseDate: '2023-03-15',
      },
    ])
  })

  it('keeps a blank releaseDate blank, also when trailing cells are missing', () => {
    const [full, short] = toNikkes([
      ['5003', 'Asuka', 'SSR', 'ABNORMAL', 'Attacker', 'Step3', 'Fire', 'AR', '312', ''],
      ['5002', 'Anis', 'SSR'],
    ])
    expect(full.releaseDate).toBe('')
    expect(short.weapon).toBe('')
    expect(short.releaseDate).toBe('')
  })

  it('trims cells and skips rows with a blank nameCode or name', () => {
    const rows = [['', 'X', 'SSR'], ['5003', '  ', 'SSR'], [], [' 5004 ', ' Neon ']]
    expect(toNikkes(rows)).toMatchObject([{ nameCode: '5004', name: 'Neon' }])
    expect(toNikkes(rows)).toHaveLength(1)
  })
})

describe('readNikkes', () => {
  it('reads the mock NikkeDatabase', async () => {
    const nikkes = await readNikkes(createMockSheetsApi(MOCK_SHEETS))
    expect(nikkes).toHaveLength(4)
    expect(nikkes[0].name).toBe('Rapi')
  })

  it('rejects a renamed header', async () => {
    const renamed = headers.map((h) => (h === 'name' ? 'Name' : h))
    const api = createMockSheetsApi({ [id]: { [tab]: [renamed, ['5001', 'Rapi']] } })
    await expect(readNikkes(api)).rejects.toBeInstanceOf(HeaderMismatchError)
  })

  it('returns [] for a header-only tab', async () => {
    const api = createMockSheetsApi({ [id]: { [tab]: [headers] } })
    expect(await readNikkes(api)).toEqual([])
  })
})

describe('nikkeIcon', () => {
  it('zero-pads the resourceId to 3 digits and leaves longer ones alone', () => {
    expect(nikkeIcon('10')).toBe('/img/nikke/si/c010.webp')
    expect(nikkeIcon('1234')).toBe('/img/nikke/si/c1234.webp')
  })

  it('gives null for a blank or non-numeric resourceId', () => {
    expect(nikkeIcon('')).toBeNull()
    expect(nikkeIcon(' ')).toBeNull()
    expect(nikkeIcon('abc')).toBeNull()
  })
})
