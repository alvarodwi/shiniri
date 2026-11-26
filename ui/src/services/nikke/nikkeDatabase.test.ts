import { describe, expect, it } from 'vitest'

import { nikkeIcon, readNikkes, searchNikkes, toNikkes } from './nikkeDatabase'
import type { Nikke } from './nikkeDatabase'

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
      ['5001', 'Rapi', 'SSR', 'ELYSION', 'Attacker', 'Step3', 'Fire', 'AR', '10', '45000', 'TRUE'],
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
        limited: true,
        overspec: false,
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

  it('reads only TRUE as limited', () => {
    const rows = ['TRUE', 'true', 'FALSE', 'false', '', 'yes'].map((limited) => [
      ...['5001', 'Rapi', '', '', '', '', '', '', '', ''],
      limited,
    ])
    expect(toNikkes([...rows, ['5002', 'Anis']]).map((n) => n.limited)).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
      false,
    ])
  })

  it('reads only TRUE as overspec', () => {
    const rows = ['TRUE', 'true', 'FALSE', 'false', '', 'yes'].map((overspec) => [
      ...['5001', 'Rapi', '', '', '', '', '', '', '', '', ''],
      overspec,
    ])
    expect(toNikkes([...rows, ['5002', 'Anis']]).map((n) => n.overspec)).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
      false,
    ])
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
    expect(nikkes).toHaveLength(5)
    expect(nikkes[0].name).toBe('Rapi')
  })

  it('rejects a renamed header', async () => {
    const renamed = headers.map((h) => (h === 'nikke' ? 'Nikke' : h))
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

describe('searchNikkes', () => {
  const nikke = (name: string): Nikke => ({ ...toNikkes([['1', name]])[0] })
  const list = ['Biscuit', 'Soline: Frost Ticket', 'Frima', 'Admi', 'Maiden'].map(nikke)
  const names = (q: string, limit?: number) => searchNikkes(list, q, limit).map((n) => n.name)

  it('matches mid-string, ignoring case and surrounding spaces', () => {
    expect(names('frost')).toEqual(['Soline: Frost Ticket'])
    expect(names('  BIS ')).toEqual(['Biscuit'])
  })

  it('returns nothing for a blank query', () => {
    expect(names('')).toEqual([])
    expect(names('   ')).toEqual([])
  })

  it('caps the results at the limit', () => {
    expect(names('i', 2)).toHaveLength(2)
  })

  it('lists names starting with the query before mid-string matches', () => {
    expect(names('ma')).toEqual(['Maiden', 'Frima'])
  })
})
