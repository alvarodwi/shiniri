import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useEventStore } from './eventStore'
import { baseline, overcoreValues } from './overcoreTestData'

import { EVENT_TAB, NIKKE_DATABASE_TAB } from '@/config/sheets'
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
    "'Event'!A1:I1": [[...EVENT_TAB.headers]],
    "'Event'!A:A": [['date'], ['2026-11-17']],
    [DB]: [
      [...NIKKE_DATABASE_TAB.headers],
      dbRow('5001', 'Biscuit', 'TETRA'),
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

describe('eventStore', () => {
  it('offers Pilgrim always and Abnormal only for a collaboration banner', async () => {
    const store = useEventStore()
    await store.load(fakeApi())
    const pool = () => store.pool.map((n) => n.name)
    expect(pool()).toEqual(['Biscuit', 'Modernia']) // no banner type yet
    store.setRateUpType('Regular')
    expect(pool()).toEqual(['Biscuit', 'Modernia'])
    store.setRateUpType('Collaboration Limited')
    expect(pool()).toEqual(['Biscuit', 'Modernia', 'Asuka'])
  })

  it('drops Abnormal picks and an Abnormal rate-up when the banner stops being a collab', async () => {
    const store = useEventStore()
    await store.load(fakeApi())
    store.setRateUpType('Collaboration Limited')
    store.entry.rateUpName = 'Asuka'
    store.add('Asuka')
    store.add('Biscuit')
    store.setRateUpType('Regular')
    expect(store.entry.names).toEqual(['Biscuit'])
    expect(store.entry.rateUpName).toBe('')
  })

  it('keeps a non-Abnormal rate-up when the banner type changes', async () => {
    const store = useEventStore()
    await store.load(fakeApi())
    store.setRateUpType('Pilgrim Limited')
    store.entry.rateUpName = 'Modernia'
    store.setRateUpType('Regular')
    expect(store.entry.rateUpName).toBe('Modernia')
  })

  it('cannot save before NikkeDatabase loads or with an invalid entry', async () => {
    const store = useEventStore()
    store.entry.rateUpType = 'Regular'
    store.entry.tix = '1'
    store.entry.gems = '0'
    expect(store.canSave).toBe(false) // not loaded yet
    await store.load(fakeApi())
    expect(store.canSave).toBe(true)
    store.entry.rateUpType = ''
    expect(store.canSave).toBe(false)
  })

  it('writes one row with an audit row, then resets', async () => {
    const store = useEventStore()
    const api = fakeApi()
    await store.load(api)
    store.entry.date = '2026-11-21'
    store.setRateUpType('Regular')
    store.entry.rateUpName = 'Biscuit'
    store.entry.gems = '600'
    store.entry.tix = '0'
    store.add('Biscuit')
    store.entry.notes = 'first pity'
    await store.save(api)
    expect(api.batchUpdateValues).toHaveBeenCalledTimes(1)
    const [, data] = api.batchUpdateValues.mock.calls[0]
    expect(data[0]).toEqual({
      range: "'Event'!A3:I3",
      rows: [['2026-11-21', "'Biscuit", 'Regular', 600, 0, 2, 1, "'Biscuit", "'first pity"]],
    })
    expect(data[1].rows[0][1]).toBe('Event')
    expect(store.entry.names).toEqual([])
    expect(store.entry.rateUpType).toBe('')
    expect(store.status).toBe('saved')
    expect(store.lastSaved).toBe("'Event'!A3:I3")
  })

  it('writes the Overcore row in the same batch and sets a remark', async () => {
    const store = useEventStore()
    const api = fakeApi()
    api.values["'RosterLog'!A1:D"].push(baseline('Biscuit'))
    await store.load(api)
    store.entry.date = '2026-11-21'
    store.setRateUpType('Regular')
    store.entry.rateUpName = 'Biscuit'
    store.entry.gems = '600'
    store.entry.tix = '0'
    store.add('Biscuit')
    await store.save(api)
    const [, data] = api.batchUpdateValues.mock.calls[0]
    expect(data.map((d) => d.range.split('!')[0])).toEqual([`'Event'`, `'Overcore'`, `'AuditLog'`])
    expect(data[1].rows).toEqual([['2026-11-21', 'Event', "'Biscuit", 'Tetra', '']])
    expect(store.remark).toMatch(/C8/)
    expect(store.status).toBe('saved')
  })

  it('a failed AllPulls read writes nothing and keeps the entry', async () => {
    const store = useEventStore()
    const api = fakeApi()
    await store.load(api)
    store.entry.date = '2026-11-21'
    store.setRateUpType('Regular')
    store.entry.rateUpName = 'Biscuit'
    store.entry.gems = '600'
    store.entry.tix = '0'
    store.add('Biscuit')
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

describe('eventStore isDirty', () => {
  it('tracks unsaved input and clears once the entry is fresh again', () => {
    setActivePinia(createPinia())
    const store = useEventStore()
    expect(store.isDirty).toBe(false)
    store.entry.notes = 'typed'
    expect(store.isDirty).toBe(true)
    store.entry.notes = ''
    expect(store.isDirty).toBe(false)
  })
})

describe('eventStore discard', () => {
  it('drops the typed entry', () => {
    setActivePinia(createPinia())
    const store = useEventStore()
    store.entry.notes = 'typed'
    store.discard()
    expect(store.entry.notes).toBe('')
    expect(store.isDirty).toBe(false)
  })
})
