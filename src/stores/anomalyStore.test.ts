import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAnomalyStore } from './anomalyStore'

import { ANOMALY_TAB } from '@/config/sheets'
import type { SheetsApi } from '@/services/google/sheetsApi'

const HEADER = "'Anomaly'!A1:I1"
const COL_A = "'Anomaly'!A:A"
const DATE = '2026-11-17'

function fakeApi(colA: string[], lastRow: string[]) {
  const values: Record<string, string[][]> = {
    [`'Anomaly'!A${colA.length}:I${colA.length}`]: [lastRow],
    [HEADER]: [[...ANOMALY_TAB.headers]],
    [COL_A]: colA.map((v) => [v]),
  }
  const api = {
    values,
    getValues: vi.fn(async (_id: string, range: string) => values[range] ?? []),
    updateValues: vi.fn<SheetsApi['updateValues']>(async (_id, range) => ({ updatedRange: range })),
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
  it('defaults every run to the last row and counts the date', async () => {
    const { store } = await loaded()
    expect(store.runs).toHaveLength(10)
    expect(store.runs.every((r) => r.boss === 'Ultra' && r.stage === 7)).toBe(true)
    expect(store.existingForDate).toBe(2)
    expect(store.runCount).toBe(5)
  })

  it('cannot save until every active run is complete', async () => {
    const { store } = await loaded()
    expect(store.canSave).toBe(false)
    fillModules(store)
    expect(store.canSave).toBe(true)
  })

  it('saves without confirming when the date is empty', async () => {
    const { api, store } = await loaded(['date', '2026-11-16'])
    fillModules(store)
    const confirm = vi.fn(() => true)
    await store.save(api, confirm)
    expect(confirm).not.toHaveBeenCalled()
    expect(api.updateValues).toHaveBeenCalledOnce()
    expect(api.updateValues.mock.calls[0][2]).toHaveLength(5)
    expect(store.status).toBe('saved')
    expect(store.lastSaved).toEqual({ updatedRange: "'Anomaly'!A3:I7", count: 5 })
  })

  it('re-reads column A at save time for the duplicate check', async () => {
    const { api, store } = await loaded(['date', '2026-11-16'])
    fillModules(store)
    api.values[COL_A] = [['date'], ...Array.from({ length: 5 }, () => [DATE])]
    const confirm = vi.fn(() => true)
    await store.save(api, confirm)
    expect(confirm).toHaveBeenCalledWith(5, 10)
  })

  it('does not write when the duplicate confirm is declined', async () => {
    const { api, store } = await loaded()
    fillModules(store)
    await store.save(api, () => false)
    expect(api.updateValues).not.toHaveBeenCalled()
    expect(store.runs[0].modules).toBe(1)
    expect(store.status).toBe('idle')
  })

  it('keeps the form when the write fails', async () => {
    const { api, store } = await loaded(['date'])
    fillModules(store)
    api.updateValues.mockRejectedValueOnce(new Error('Sheets API 500: boom'))
    await store.save(api, () => true)
    expect(store.status).toBe('error')
    expect(store.error).toContain('boom')
    expect(store.runs.slice(0, 5).every((r) => r.modules === 1)).toBe(true)
  })

  it('writes only the active run count', async () => {
    const { api, store } = await loaded(['date'])
    store.runCount = 3
    fillModules(store)
    await store.save(api, () => true)
    expect(api.updateValues.mock.calls[0][2]).toHaveLength(3)
  })

  it('switches the daily limit on double days', async () => {
    const { api, store } = await loaded(['date'])
    store.setDoubleDay(true)
    expect(store.dailyLimit).toBe(10)
    expect(store.runCount).toBe(10)
    fillModules(store)
    await store.save(api, () => true)
    expect(api.updateValues.mock.calls[0][2]).toHaveLength(10)
    store.setDoubleDay(false)
    expect(store.runCount).toBe(5)
  })

  it('carries boss changes forward to untouched runs', async () => {
    const { store } = await loaded()
    store.setBossOrStage(1, { boss: 'Kraken' })
    store.setBossOrStage(0, { boss: 'Harvester' })
    expect(store.runs.slice(0, 3).map((r) => r.boss)).toEqual(['Harvester', 'Kraken', 'Harvester'])
  })

  it('clamps the run count to 1..dailyLimit', async () => {
    const { store } = await loaded()
    store.setRunCount(8)
    expect(store.runCount).toBe(5)
    store.setRunCount(0)
    expect(store.runCount).toBe(1)
    store.setRunCount(Number.NaN)
    expect(store.runCount).toBe(1)
  })

  it('falls back to kraken 9 on an empty sheet', async () => {
    const { store } = await loaded(['date'], [])
    expect(store.runs[0]).toMatchObject({ boss: 'Kraken', stage: 9 })
  })
})
