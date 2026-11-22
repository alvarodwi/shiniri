import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAnomalyStore } from './anomalyStore'

import { ANOMALY_TAB, GEAR_TAB } from '@/config/sheets'
import type { SheetsApi } from '@/services/google/sheetsApi'

const HEADER = "'Anomaly'!A1:I1"
const COL_A = "'Anomaly'!A:A"
const DATE = '2026-11-17'

function fakeApi(colA: string[], lastRow: string[]) {
  const values: Record<string, string[][]> = {
    [`'Anomaly'!A${colA.length}:I${colA.length}`]: [lastRow],
    [HEADER]: [[...ANOMALY_TAB.headers]],
    [COL_A]: colA.map((v) => [v]),
    "'AuditLog'!A1:D1": [['savedAt', 'form', 'ranges', 'rows']],
    "'AuditLog'!A:A": [['savedAt']],
    "'Gear'!A1:E1": [[...GEAR_TAB.headers]],
    "'Gear'!A:A": [['date'], ['x']],
  }
  const api = {
    values,
    getValues: vi.fn(async (_id: string, range: string) => values[range] ?? []),
    ensureRows: vi.fn<SheetsApi['ensureRows']>(async () => {}),
    batchUpdateValues: vi.fn<SheetsApi['batchUpdateValues']>(async (_id, data) => ({
      updatedRanges: data.map((d) => d.range),
    })),
  }
  return api satisfies SheetsApi
}

const ultraRow = [DATE, 'Ultra', '7', 'TRUE', '1', 'Attacker', 'Tetra', 'Helmet']

async function loaded(colA = ['date', '2026-11-16', DATE, DATE], lastRow = ultraRow) {
  const api = fakeApi(colA, lastRow)
  const store = useAnomalyStore()
  store.date = DATE
  await store.load(api)
  return { api, store }
}

function fillModules(store: ReturnType<typeof useAnomalyStore>) {
  store.activeRuns.forEach((_, i) =>
    store.setRun(i, { modules: 1, gear: { classType: 'Defender', manufacturer: 'Elysion' } }),
  )
}

beforeEach(() => setActivePinia(createPinia()))

describe('anomalyStore', () => {
  it('defaults every run to the last row', async () => {
    const { store } = await loaded()
    expect(store.runs).toHaveLength(10)
    expect(store.runs.every((r) => r.boss === 'Ultra' && r.stage === 7)).toBe(true)
    expect(store.activeRuns).toHaveLength(5)
  })

  it('locks a day that already has rows and reads them', async () => {
    const colA = ['date', DATE, '2026-11-16', DATE]
    const api = fakeApi(colA, ultraRow)
    const kraken = [DATE, 'Kraken', '9', 'TRUE', '2']
    api.values["'Anomaly'!A2:I4"] = [kraken, ['2026-11-16', 'Harvester'], ultraRow]
    const store = useAnomalyStore()
    store.date = DATE
    await store.load(api)
    expect(store.locked).toBe(true)
    expect(store.loggedRows).toEqual([kraken, ultraRow])
    fillModules(store)
    expect(store.canSave).toBe(false)
  })

  it('unlocks when the date changes to an empty day', async () => {
    const { api, store } = await loaded()
    store.date = '2026-11-18'
    await store.readDay(api)
    expect(store.locked).toBe(false)
  })

  it('cannot save until every active run is complete', async () => {
    const { store } = await loaded(['date', '2026-11-16'])
    expect(store.canSave).toBe(false)
    fillModules(store)
    expect(store.canSave).toBe(true)
  })

  it('saves when the date is empty', async () => {
    const { api, store } = await loaded(['date', '2026-11-16'])
    fillModules(store)
    await store.save(api)
    expect(api.batchUpdateValues).toHaveBeenCalledOnce()
    expect(api.batchUpdateValues.mock.calls[0][1][0].rows).toHaveLength(5)
    expect(store.status).toBe('saved')
    expect(store.lastSaved).toEqual([
      { updatedRange: "'Anomaly'!A3:I7", count: 5 },
      { updatedRange: "'Gear'!A3:E7", count: 5 },
    ])
  })

  it('writes gear drops to Gear in the same write', async () => {
    const { api, store } = await loaded(['date'])
    fillModules(store)
    // Fallback defaults make every run Kraken 9; runs 1-3 become gear bosses.
    store.setBossOrStage(1, { boss: 'Ultra', stage: 7 })
    store.setBossOrStage(2, { boss: 'Ultra', stage: 7 })
    store.setRun(2, { dropped: false })
    store.setBossOrStage(3, { boss: 'Mirror Container', stage: 5 })
    await store.save(api)
    expect(api.batchUpdateValues).toHaveBeenCalledOnce()
    const [anomaly, t9] = api.batchUpdateValues.mock.calls[0][1]
    expect(anomaly.rows).toHaveLength(5)
    expect(t9.range).toBe("'Gear'!A3:E4")
    expect(t9.rows).toEqual([
      [DATE, 'Anomaly Interception', 'Defender', 'Elysion', 'Helmet'],
      [DATE, 'Anomaly Interception', 'Defender', 'Elysion', 'Gloves'],
    ])
  })

  it('writes Anomaly only when nothing dropped gear', async () => {
    const { api, store } = await loaded(['date'])
    store.setBossOrStage(0, { boss: 'Kraken', stage: 9 })
    await store.save(api)
    expect(api.batchUpdateValues.mock.calls[0][1].map((d) => d.range)).toEqual([
      "'Anomaly'!A2:I6",
      "'AuditLog'!A2:D2",
    ])
  })

  it('refuses to save when the day was logged elsewhere after loading', async () => {
    const { api, store } = await loaded(['date', '2026-11-16'])
    fillModules(store)
    api.values[COL_A] = [['date'], ...Array.from({ length: 5 }, () => [DATE])]
    await store.save(api)
    expect(api.batchUpdateValues).not.toHaveBeenCalled()
    expect(store.locked).toBe(true)
    expect(store.status).toBe('error')
    expect(store.error).toBe(`Already logged for ${DATE}.`)
  })

  it('clears the last success line when a later save fails', async () => {
    const { api, store } = await loaded(['date'])
    store.lastSaved = [{ updatedRange: "'Anomaly'!A2:I6", count: 5 }]
    fillModules(store)
    api.batchUpdateValues.mockRejectedValueOnce(new Error('Sheets API 500: boom'))
    await store.save(api)
    expect(store.lastSaved).toEqual([])
  })

  it('keeps the form when the write fails', async () => {
    const { api, store } = await loaded(['date'])
    fillModules(store)
    api.batchUpdateValues.mockRejectedValueOnce(new Error('Sheets API 500: boom'))
    await store.save(api)
    expect(store.status).toBe('error')
    expect(store.error).toContain('boom')
    expect(store.runs.slice(0, 5).every((r) => r.modules === 1)).toBe(true)
  })

  it('writes exactly 5 runs after a double day is turned back off', async () => {
    const { api, store } = await loaded(['date'])
    store.setDoubleDay(true)
    store.setRun(6, { modules: 2 })
    store.setDoubleDay(false)
    expect(store.activeRuns).toHaveLength(5)
    fillModules(store)
    await store.save(api)
    const rows = api.batchUpdateValues.mock.calls[0][1][0].rows
    expect(rows).toHaveLength(5)
    expect(rows.map((r) => r[4])).not.toContain(2) // run 7's edit stays hidden
  })

  it('switches the daily limit on double days', async () => {
    const { api, store } = await loaded(['date'])
    store.setDoubleDay(true)
    expect(store.dailyLimit).toBe(10)
    expect(store.activeRuns).toHaveLength(10)
    fillModules(store)
    await store.save(api)
    expect(api.batchUpdateValues.mock.calls[0][1][0].rows).toHaveLength(10)
    store.setDoubleDay(false)
    expect(store.activeRuns).toHaveLength(5)
  })

  it('carries boss changes forward to untouched runs', async () => {
    const { store } = await loaded()
    store.setBossOrStage(1, { boss: 'Kraken' })
    store.setBossOrStage(0, { boss: 'Harvester' })
    expect(store.runs.slice(0, 3).map((r) => r.boss)).toEqual(['Harvester', 'Kraken', 'Harvester'])
  })

  it('does not carry boss changes into runs already filled in', async () => {
    const { store } = await loaded()
    store.setRun(2, { modules: 2 })
    store.setBossOrStage(0, { boss: 'Harvester' })
    expect(store.runs.slice(0, 4).map((r) => r.boss)).toEqual([
      'Harvester',
      'Harvester',
      'Ultra',
      'Harvester',
    ])
  })

  it('resets the form after a successful write even if the reload fails', async () => {
    const { api, store } = await loaded(['date'])
    store.setBossOrStage(0, { boss: 'Ultra', stage: 7 })
    fillModules(store)
    const realGet = api.getValues.getMockImplementation()!
    api.batchUpdateValues.mockImplementationOnce(async (_id, data) => {
      api.getValues.mockImplementation(async (id, r) => {
        if (r === COL_A) throw new Error('network down')
        return realGet(id, r)
      })
      return { updatedRanges: data.map((d) => d.range) }
    })
    await store.save(api)
    expect(store.lastSaved[0].count).toBe(5)
    expect(store.runs.every((r) => r.modules === 0)).toBe(true)
    expect(store.runs[0]).toMatchObject({ boss: 'Ultra', stage: 7 })
  })

  it('falls back to kraken 9 on an empty sheet', async () => {
    const { store } = await loaded(['date'], [])
    expect(store.runs[0]).toMatchObject({ boss: 'Kraken', stage: 9 })
  })
})
