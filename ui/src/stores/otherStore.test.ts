import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useOtherStore } from './otherStore'
import { baseline, overcoreValues } from './overcoreTestData'

import { NIKKE_DATABASE_TAB, OTHER_TAB } from '@/config/sheets'
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
    ...overcoreValues(),
    "'Other'!A1:I1": [[...OTHER_TAB.headers]],
    "'Other'!A:A": [['date'], ['2026-11-17']],
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

describe('otherStore', () => {
  it('prunes Guaranteed SSR fields when switching to Welfare Unit', async () => {
    const store = useOtherStore()
    await store.load(fakeApi())
    store.setSourceType('Guaranteed SSR')
    Object.assign(store.entry, { names: ['Yan', 'Grave'], gems: '6600', times: '31' })
    store.setSourceType('Welfare Unit')
    expect(store.entry.names).toEqual(['Yan'])
    expect(store.entry.gems).toBe('')
    expect(store.entry.times).toBe('')
  })

  it('clears rateUpName when leaving Free Pulls', async () => {
    const store = useOtherStore()
    await store.load(fakeApi())
    store.setSourceType('Free Pulls')
    store.entry.rateUpName = 'Scarlet: Goddeath'
    store.setSourceType('Welfare Pass')
    expect(store.entry.rateUpName).toBe('')
  })

  it('clears sourceInfo when switching to Free Pulls', async () => {
    const store = useOtherStore()
    await store.load(fakeApi())
    store.setSourceType('Welfare Unit')
    store.entry.sourceInfo = '3.5 Anniv'
    store.setSourceType('Free Pulls')
    expect(store.entry.sourceInfo).toBe('')
  })

  it('cannot save while rows is null', async () => {
    const store = useOtherStore()
    await store.load(fakeApi())
    expect(store.canSave).toBe(false)
  })

  it('writes every copy with one audit row, then resets', async () => {
    const store = useOtherStore()
    const api = fakeApi()
    await store.load(api)
    store.entry.date = '2026-11-21'
    store.setSourceType('Welfare Unit')
    Object.assign(store.entry, { sourceInfo: '3.5 Anniv', names: ['Asuka'], copies: '2' })
    await store.save(api)
    const [, data] = api.batchUpdateValues.mock.calls[0]
    const row = ['2026-11-21', 'Welfare Unit', "'3.5 Anniv", '', '', 1, 1, "'Asuka", '']
    expect(data[0]).toEqual({ range: "'Other'!A3:I4", rows: [row, row] })
    expect(data).toHaveLength(2)
    expect(data[1].rows[0][1]).toBe('Other')
    expect(store.entry.sourceType).toBe('')
    expect(store.status).toBe('saved')
    expect(store.lastSaved).toBe("'Other'!A3:I4")
  })

  it('writes the Overcored row in the same batch and sets a remark', async () => {
    const store = useOtherStore()
    const api = fakeApi()
    api.values["'RosterLog'!A1:D"].push(baseline('Modernia'))
    await store.load(api)
    store.entry.date = '2026-11-21'
    store.setSourceType('Welfare Unit')
    Object.assign(store.entry, { sourceInfo: '3.5 Anniv', names: ['Modernia'], copies: '2' })
    await store.save(api)
    const [, data] = api.batchUpdateValues.mock.calls[0]
    expect(data.map((d) => d.range.split('!')[0])).toEqual([`'Other'`, `'Overcored'`, `'AuditLog'`])
    expect(data[1].rows).toEqual([
      ['2026-11-21', 'Other', "'Modernia", 'Pilgrim', ''],
      ['2026-11-21', 'Other', "'Modernia", 'Pilgrim', ''],
    ])
    expect(store.remark).toMatch(/C8/)
    expect(store.status).toBe('saved')
  })

  it('a failed AllPulls read writes nothing and keeps the entry', async () => {
    const store = useOtherStore()
    const api = fakeApi()
    await store.load(api)
    store.entry.date = '2026-11-21'
    store.setSourceType('Welfare Unit')
    Object.assign(store.entry, { sourceInfo: '3.5 Anniv', names: ['Asuka'], copies: '2' })
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
