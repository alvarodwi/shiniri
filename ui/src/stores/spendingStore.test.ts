import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSpendingStore } from './spendingStore'

import { NIKKE_DATABASE_TAB, SPENDING_TAB } from '@/config/sheets'
import type { SheetsApi } from '@/services/google/sheetsApi'

const DB = "'NikkeDatabase'!A1:J"
const HISTORY = "'Spending'!A1:G"

function fakeApi(history: unknown[][] = []) {
  const values: Record<string, unknown[][]> = {
    "'AuditLog'!A1:D1": [['savedAt', 'form', 'ranges', 'rows']],
    "'AuditLog'!A:A": [['savedAt']],
    "'Spending'!A1:G1": [[...SPENDING_TAB.headers]],
    "'Spending'!A:A": [['purchaseDate'], ...history.map((r) => [r[0]])],
    [HISTORY]: [[...SPENDING_TAB.headers], ...history],
    [DB]: [
      [...NIKKE_DATABASE_TAB.headers],
      ['5001', 'Isabel', 'SSR', 'ELYSION', 'Attacker', 'Step3', 'Fire', 'SR', '10', ''],
      ['5002', 'Asuka', 'SSR', 'ABNORMAL', 'Attacker', 'Step3', 'Fire', 'AR', '11', ''],
      ['5003', 'Neon', 'SR', 'ELYSION', 'Attacker', 'Step3', 'Fire', 'SG', '12', ''],
    ],
  }
  return {
    getValues: vi.fn(async (_id: string, range: string) => (values[range] ?? []) as string[][]),
    ensureRows: vi.fn<SheetsApi['ensureRows']>(async () => {}),
    batchUpdateValues: vi.fn<SheetsApi['batchUpdateValues']>(async (_id, data) => ({
      updatedRanges: data.map((d) => d.range),
    })),
  } satisfies SheetsApi
}

const MONTHLY_ROWS = [
  [46000, '30-day supply', 'Monthly Pass', 82140, 4.99, 'GooglePlay', ''],
  [46100, '30-day supply', 'Monthly Pass', 79000, 4.99, 'RazerGold', ''],
]

beforeEach(() => setActivePinia(createPinia()))

describe('spendingStore', () => {
  it('loads history and offers every SSR, collab included', async () => {
    const store = useSpendingStore()
    expect(await store.load(fakeApi(MONTHLY_ROWS))).toBe(true)
    expect(store.history).toHaveLength(2)
    expect(store.pool.map((n) => n.name)).toEqual(['Isabel', 'Asuka'])
  })

  it('fails the load on a renamed header', async () => {
    const api = fakeApi()
    api.getValues.mockImplementation(async (_id, range) =>
      range === HISTORY ? [['date', 'packageName']] : [],
    )
    const store = useSpendingStore()
    expect(await store.load(api)).toBe(false)
    expect(store.error).toMatch(/purchaseDate/)
  })

  it('fills the monthly pass from the last one', async () => {
    const store = useSpendingStore()
    await store.load(fakeApi(MONTHLY_ROWS))
    store.quickMonthly()
    expect(store.name).toBe('30-day supply')
    expect(store.platform).toBe('RazerGold')
    expect(store.row?.slice(1)).toEqual([
      "'30-day supply",
      'Monthly Pass',
      79000,
      4.99,
      'RazerGold',
      '',
    ])
  })

  it('leaves prices blank for a first monthly pass', async () => {
    const store = useSpendingStore()
    await store.load(fakeApi())
    store.quickMonthly()
    expect(store.entry.type).toBe('Monthly Pass')
    expect(store.entry.priceIdr).toBe('')
    expect(store.row).toBeNull()
  })

  it('drops the picked SSR when the type changes', async () => {
    const store = useSpendingStore()
    store.setType('Costume')
    store.entry.ssr = 'Isabel'
    store.entry.platform = 'Apple'
    store.setType('Music Pack')
    expect(store.name).toBe('')
    expect(store.entry.platform).toBe('')
  })

  it('saves one row with its audit row and resets the form', async () => {
    const api = fakeApi(MONTHLY_ROWS)
    const store = useSpendingStore()
    await store.load(api)
    store.quickMonthly()
    store.entry.date = '2026-11-22'
    await store.save(api)
    expect(store.status).toBe('saved')
    const [, data] = api.batchUpdateValues.mock.calls[0]
    expect(data[0]).toEqual({
      range: "'Spending'!A4:G4",
      rows: [['2026-11-22', "'30-day supply", 'Monthly Pass', 79000, 4.99, 'RazerGold', '']],
    })
    expect(data[1].range).toMatch(/^'AuditLog'!/)
    expect(store.entry.type).toBe('')
  })
})
