import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useOrdinaryStore } from './ordinaryStore'
import { baseline, overcoreValues } from './overcoreTestData'

import { NIKKE_DATABASE_TAB, ORDINARY_TAB } from '@/config/sheets'
import type { SheetsApi } from '@/services/google/sheetsApi'

const DB = "'NikkeDatabase'!A1:L"
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
    "'Ordinary'!A1:G1": [[...ORDINARY_TAB.headers]],
    "'Ordinary'!A:A": [['date'], ['2026-11-17']],
    [DB]: [
      [...NIKKE_DATABASE_TAB.headers],
      dbRow('5001', 'Elysion', 'ELYSION'),
      dbRow('5002', 'Modernia', 'Pilgrim'),
      dbRow('5003', 'Asuka', 'ABNORMAL'),
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

describe('ordinaryStore', () => {
  it('offers Pilgrim but never Abnormal', async () => {
    const store = useOrdinaryStore()
    await store.load(fakeApi())
    expect(store.pool.map((n) => n.name)).toEqual(['Elysion', 'Modernia'])
  })

  it('cannot save before NikkeDatabase loads or with an invalid entry', async () => {
    const store = useOrdinaryStore()
    store.entry.tix = '1'
    expect(store.canSave).toBe(false) // not loaded yet
    await store.load(fakeApi())
    expect(store.canSave).toBe(true)
    store.entry.gems = '150'
    expect(store.canSave).toBe(false)
  })

  it('writes one row with an audit row, then resets', async () => {
    const store = useOrdinaryStore()
    const api = fakeApi()
    await store.load(api)
    store.entry.date = '2026-11-21'
    store.entry.gems = '600'
    store.entry.tix = '0'
    store.add('Elysion')
    store.entry.notes = 'first pity'
    await store.save(api)
    expect(api.batchUpdateValues).toHaveBeenCalledTimes(1)
    const [, data] = api.batchUpdateValues.mock.calls[0]
    expect(data[0]).toEqual({
      range: "'Ordinary'!A3:G3",
      rows: [['2026-11-21', 600, 0, 2, 1, "'Elysion", "'first pity"]],
    })
    expect(data[1].rows[0][1]).toBe('Ordinary')
    expect(store.entry.names).toEqual([])
    expect(store.status).toBe('saved')
    expect(store.lastSaved).toBe("'Ordinary'!A3:G3")
  })

  it('clears the entry even when the reload after save fails', async () => {
    const store = useOrdinaryStore()
    const api = fakeApi()
    await store.load(api)
    store.entry.tix = '1'
    store.add('Elysion')
    api.getValues.mockImplementation(async (_id: string, range: string) => {
      if (range === DB) throw new Error('read failed')
      return api.values[range] ?? []
    })
    await store.save(api)
    expect(store.entry.names).toEqual([])
    expect(store.status).toBe('error')
  })

  it('writes the Overcore row in the same batch and sets a remark', async () => {
    const store = useOrdinaryStore()
    const api = fakeApi()
    api.values["'RosterLog'!A1:D"].push(baseline('Elysion'))
    await store.load(api)
    store.entry.date = '2026-11-21'
    store.entry.gems = '600'
    store.entry.tix = '0'
    store.add('Elysion')
    await store.save(api)
    const [, data] = api.batchUpdateValues.mock.calls[0]
    expect(data.map((d) => d.range.split('!')[0])).toEqual([
      `'Ordinary'`,
      `'Overcore'`,
      `'AuditLog'`,
    ])
    expect(data[1].rows).toEqual([['2026-11-21', 'Ordinary', "'Elysion", 'Elysion', '']])
    expect(store.remark).toMatch(/C8/)
    expect(store.status).toBe('saved')
  })

  it('a failed AllPulls read writes nothing and keeps the entry', async () => {
    const store = useOrdinaryStore()
    const api = fakeApi()
    await store.load(api)
    store.entry.date = '2026-11-21'
    store.entry.gems = '600'
    store.entry.tix = '0'
    store.add('Elysion')
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

describe('ordinaryStore isDirty', () => {
  it('tracks unsaved input and clears once the entry is fresh again', () => {
    setActivePinia(createPinia())
    const store = useOrdinaryStore()
    expect(store.isDirty).toBe(false)
    store.entry.notes = 'typed'
    expect(store.isDirty).toBe(true)
    store.entry.notes = ''
    expect(store.isDirty).toBe(false)
  })
})

describe('ordinaryStore discard', () => {
  it('drops the typed entry', () => {
    setActivePinia(createPinia())
    const store = useOrdinaryStore()
    store.entry.notes = 'typed'
    store.discard()
    expect(store.entry.notes).toBe('')
    expect(store.isDirty).toBe(false)
  })
})
