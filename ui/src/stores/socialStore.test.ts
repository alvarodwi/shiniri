import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSocialStore } from './socialStore'

import { NIKKE_DATABASE_TAB, SOCIAL_TAB } from '@/config/sheets'
import type { SheetsApi } from '@/services/google/sheetsApi'

const DB = "'NikkeDatabase'!A1:J"

function fakeApi() {
  const values: Record<string, string[][]> = {
    "'AuditLog'!A1:D1": [['savedAt', 'form', 'ranges', 'rows']],
    "'AuditLog'!A:A": [['savedAt']],
    "'Social'!A1:E1": [[...SOCIAL_TAB.headers]],
    "'Social'!A:A": [['date'], ['2026-11-17']],
    [DB]: [
      [...NIKKE_DATABASE_TAB.headers],
      ['5001', 'Biscuit', 'SSR', 'TETRA', 'Supporter', 'Step1', 'Water', 'SMG', '10', ''],
      [
        '5002',
        'Soline: Frost Ticket',
        'SSR',
        'TETRA',
        'Attacker',
        'Step3',
        'Water',
        'AR',
        '11',
        '',
      ],
    ],
  }
  return {
    values,
    getValues: vi.fn(async (_id: string, range: string) => {
      const v = values[range]
      if (range === DB && v === undefined) throw new Error('no access')
      return v ?? []
    }),
    ensureRows: vi.fn<SheetsApi['ensureRows']>(async () => {}),
    batchUpdateValues: vi.fn<SheetsApi['batchUpdateValues']>(async (_id, data) => ({
      updatedRanges: data.map((d) => d.range),
    })),
  } satisfies SheetsApi & { values: unknown }
}

beforeEach(() => setActivePinia(createPinia()))

describe('socialStore', () => {
  it('loads NikkeDatabase', async () => {
    const store = useSocialStore()
    expect(await store.load(fakeApi())).toBe(true)
    expect(store.nikkes.map((n) => n.name)).toEqual(['Biscuit', 'Soline: Frost Ticket'])
  })

  it('offers only Nikkes a social pull can give', async () => {
    const store = useSocialStore()
    const api = fakeApi()
    const row = (code: string, name: string, rarity: string, manu: string) => [
      code,
      name,
      rarity,
      manu,
      'Attacker',
      'Step3',
      'Fire',
      'AR',
      '12',
      '',
    ]
    api.values[DB].push(
      row('5003', 'Anis', 'SR', 'TETRA'),
      row('5004', 'Asuka', 'SSR', 'ABNORMAL'),
      row('5005', 'Modernia', 'SSR', 'Pilgrim'),
    )
    await store.load(api)
    expect(store.nikkes).toHaveLength(5)
    expect(store.ssrNikkes.map((n) => n.name)).toEqual(['Biscuit', 'Soline: Frost Ticket'])
  })

  it('cannot save without Nikkes or valid times', async () => {
    const store = useSocialStore()
    store.entry.times = '10'
    expect(store.canSave).toBe(false) // not loaded yet
    await store.load(fakeApi())
    expect(store.canSave).toBe(true)
    store.entry.times = ''
    expect(store.canSave).toBe(false)
  })

  it('adds a name twice and removes one by position', () => {
    const store = useSocialStore()
    store.add('Biscuit')
    store.add('Biscuit')
    expect(store.entry.names).toEqual(['Biscuit', 'Biscuit'])
    store.removeAt(0)
    expect(store.entry.names).toEqual(['Biscuit'])
  })

  it('writes one row with an audit row, then resets', async () => {
    const store = useSocialStore()
    const api = fakeApi()
    await store.load(api)
    store.entry.date = '2026-11-21'
    store.entry.times = '20'
    store.add('Biscuit')
    await store.save(api)
    expect(api.batchUpdateValues).toHaveBeenCalledTimes(1)
    const [, data] = api.batchUpdateValues.mock.calls[0]
    expect(data[0]).toEqual({
      range: "'Social'!A3:E3",
      rows: [['2026-11-21', 20, 1, "'Biscuit", '']],
    })
    expect(data[1].rows[0][1]).toBe('Social')
    expect(store.entry.names).toEqual([])
    expect(store.entry.times).toBe('')
    expect(store.status).toBe('saved')
    expect(store.lastSaved).toBe("'Social'!A3:E3")
  })

  it('writes once when Save is tapped twice', async () => {
    const store = useSocialStore()
    const api = fakeApi()
    await store.load(api)
    store.entry.times = '10'
    await Promise.all([store.save(api), store.save(api)])
    expect(api.batchUpdateValues).toHaveBeenCalledTimes(1)
  })

  it('keeps the entry and disables Save when NikkeDatabase cannot be read', async () => {
    const store = useSocialStore()
    const api = fakeApi()
    delete api.values[DB]
    store.entry.times = '10'
    expect(await store.load(api)).toBe(false)
    expect(store.status).toBe('error')
    expect(store.error).toBe('no access')
    expect(store.entry.times).toBe('10')
    expect(store.canSave).toBe(false)
  })
})
