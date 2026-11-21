import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSpareBodyStore } from './spareBodyStore'

import { NIKKE_DATABASE_TAB, SPARE_BODY_TAB } from '@/config/sheets'
import type { SheetsApi } from '@/services/google/sheetsApi'

const DB = "'NikkeDatabase'!A1:J"
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
    "'SpareBody'!A1:D1": [[...SPARE_BODY_TAB.headers]],
    "'SpareBody'!A:A": [['date'], ['2026-11-17']],
    [DB]: [
      [...NIKKE_DATABASE_TAB.headers],
      dbRow('5001', 'Modernia', 'Pilgrim'),
      dbRow('5002', 'Asuka', 'ABNORMAL'),
      dbRow('5003', 'Sin', 'Pilgrim'),
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

describe('spareBodyStore', () => {
  it('has an empty pool until a source is set', async () => {
    const store = useSpareBodyStore()
    await store.load(fakeApi())
    expect(store.pool).toEqual([])
    store.setSource('Union Chip')
    expect(store.pool.map((n) => n.name)).toEqual(['Sin'])
  })

  it('clears a target outside the new pool', async () => {
    const store = useSpareBodyStore()
    await store.load(fakeApi())
    store.setSource('Gold Mileage')
    store.entry.target = 'Asuka'
    store.setSource('Silver Mileage')
    expect(store.entry.target).toBe('')
  })

  it('keeps a target that is in the new pool', async () => {
    const store = useSpareBodyStore()
    await store.load(fakeApi())
    store.setSource('Gold Mileage')
    store.entry.target = 'Sin'
    store.setSource('Union Chip')
    expect(store.entry.target).toBe('Sin')
  })

  it('cannot save while rows is null', async () => {
    const store = useSpareBodyStore()
    await store.load(fakeApi())
    expect(store.canSave).toBe(false)
    store.setSource('Gold Mileage')
    store.entry.target = 'Asuka'
    expect(store.canSave).toBe(true)
  })

  it('writes every copy with one audit row, then resets', async () => {
    const store = useSpareBodyStore()
    const api = fakeApi()
    await store.load(api)
    store.entry.date = '2026-11-21'
    store.setSource('Gold Mileage')
    store.entry.target = 'Asuka'
    store.entry.copies = '2'
    await store.save(api)
    const [, data] = api.batchUpdateValues.mock.calls[0]
    expect(data[0]).toEqual({
      range: "'SpareBody'!A3:D4",
      rows: [
        ['2026-11-21', "'Asuka", 'Gold Mileage', ''],
        ['2026-11-21', "'Asuka", 'Gold Mileage', ''],
      ],
    })
    expect(data).toHaveLength(2)
    expect(data[1].rows[0][1]).toBe('SpareBody')
    expect(store.entry.target).toBe('')
    expect(store.entry.copies).toBe('1')
    expect(store.status).toBe('saved')
    expect(store.lastSaved).toBe("'SpareBody'!A3:D4")
  })
})
