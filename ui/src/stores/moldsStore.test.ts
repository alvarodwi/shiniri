import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useMoldsStore } from './moldsStore'
import { baseline, overcoreValues } from './overcoreTestData'

import { NIKKE_DATABASE_TAB, MOLD_TAB } from '@/config/sheets'
import type { SheetsApi } from '@/services/google/sheetsApi'

const DB = "'NikkeDatabase'!A1:K"
const dbRow = (code: string, name: string, manufacturer: string) => [
  code,
  name,
  'SSR',
  manufacturer,
  'Attacker',
  'Step3',
  'Fire',
  'AR',
  '12',
  '',
]

function fakeApi() {
  const values: Record<string, string[][]> = {
    "'AuditLog'!A1:D1": [['savedAt', 'form', 'ranges', 'rows']],
    "'AuditLog'!A:A": [['savedAt']],
    ...overcoreValues(),
    "'Mold'!A1:F1": [[...MOLD_TAB.headers]],
    "'Mold'!A:A": [['date'], ['2026-11-17']],
    [DB]: [
      [...NIKKE_DATABASE_TAB.headers],
      dbRow('5001', 'Elysion', 'ELYSION'),
      dbRow('5002', 'Modernia', 'Pilgrim'),
      dbRow('5003', 'Asuka', 'ABNORMAL'),
      dbRow('5004', 'Maxwell', 'Missilis'),
    ],
  }
  return {
    values,
    getValues: vi.fn(async (_id: string, range: string) => values[range] ?? []),
    ensureRows: vi.fn<SheetsApi['ensureRows']>(async () => {}),
    batchUpdateValues: vi.fn<SheetsApi['batchUpdateValues']>(async (_id, data) => ({
      updatedRanges: data.map((d) => d.range),
    })),
  } satisfies SheetsApi & { values: unknown }
}

beforeEach(() => setActivePinia(createPinia()))

describe('moldsStore', () => {
  it('has an empty pool until a type is set, then the type pool', async () => {
    const store = useMoldsStore()
    await store.load(fakeApi())
    expect(store.pool).toEqual([])
    store.setMoldType('Pilgrim Mold')
    expect(store.pool.map((n) => n.name)).toEqual(['Modernia'])
  })

  it('drops names outside the new pool when the type changes', async () => {
    const store = useMoldsStore()
    await store.load(fakeApi())
    store.setMoldType('Yellow Mold')
    store.entry.names = ['Elysion', 'Maxwell']
    store.setMoldType('Elysion Mold')
    expect(store.entry.names).toEqual(['Elysion'])
  })

  it('cannot save while the row is invalid', async () => {
    const store = useMoldsStore()
    await store.load(fakeApi())
    expect(store.canSave).toBe(false)
    store.setMoldType('Yellow Mold')
    store.entry.amount = '1'
    expect(store.canSave).toBe(true)
  })

  it('writes one row with an audit row, then resets', async () => {
    const store = useMoldsStore()
    const api = fakeApi()
    await store.load(api)
    store.entry.date = '2026-11-21'
    store.setMoldType('Yellow Mold')
    store.entry.amount = '5'
    store.entry.names = ['Elysion']
    await store.save(api)
    const [, data] = api.batchUpdateValues.mock.calls[0]
    expect(data[0]).toEqual({
      range: "'Mold'!A3:F3",
      rows: [['2026-11-21', 'Yellow Mold', 5, 1, "'Elysion", '']],
    })
    expect(data[1].rows[0][1]).toBe('Mold')
    expect(store.entry.names).toEqual([])
    expect(store.entry.moldType).toBe('')
    expect(store.status).toBe('saved')
    expect(store.lastSaved).toBe("'Mold'!A3:F3")
  })

  it('writes the Overcore row in the same batch and sets a remark', async () => {
    const store = useMoldsStore()
    const api = fakeApi()
    api.values["'RosterLog'!A1:D"].push(baseline('Modernia'))
    await store.load(api)
    store.entry.date = '2026-11-21'
    store.setMoldType('Pilgrim Perfect Mold')
    store.entry.amount = '1'
    store.entry.names = ['Modernia']
    await store.save(api)
    const [, data] = api.batchUpdateValues.mock.calls[0]
    expect(data.map((d) => d.range.split('!')[0])).toEqual([`'Mold'`, `'Overcore'`, `'AuditLog'`])
    expect(data[1].rows).toEqual([['2026-11-21', 'Mold', "'Modernia", 'Pilgrim', '']])
    expect(data[2].rows[0][1]).toBe('Mold')
    expect(store.remark).toMatch(/C8/)
    expect(store.remark).toMatch(/And she's a Pilgrim\.$/)
    expect(store.status).toBe('saved')
  })

  it('a failed AllPulls read writes nothing and keeps the entry', async () => {
    const store = useMoldsStore()
    const api = fakeApi()
    await store.load(api)
    store.entry.date = '2026-11-21'
    store.setMoldType('Pilgrim Perfect Mold')
    store.entry.amount = '1'
    store.entry.names = ['Modernia']
    const read = api.getValues.getMockImplementation()!
    api.getValues.mockImplementation(async (id: string, range: string) => {
      if (range.startsWith("'AllPulls'")) throw new Error('no access')
      return read(id, range)
    })
    await store.save(api)
    expect(store.status).toBe('error')
    expect(api.batchUpdateValues).not.toHaveBeenCalled()
    expect(store.remark).toBeNull()
    expect(store.entry.names.length).toBe(1)
  })
})

describe('moldsStore isDirty', () => {
  it('tracks unsaved input and clears once the entry is fresh again', () => {
    setActivePinia(createPinia())
    const store = useMoldsStore()
    expect(store.isDirty).toBe(false)
    store.entry.notes = 'typed'
    expect(store.isDirty).toBe(true)
    store.entry.notes = ''
    expect(store.isDirty).toBe(false)
  })
})

describe('moldsStore discard', () => {
  it('drops the typed entry', () => {
    setActivePinia(createPinia())
    const store = useMoldsStore()
    store.entry.notes = 'typed'
    store.discard()
    expect(store.entry.notes).toBe('')
    expect(store.isDirty).toBe(false)
  })
})
