import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useLevelStore } from './levelStore'

import { LEVEL_TAB } from '@/config/sheets'
import type { SheetsApi } from '@/services/google/sheetsApi'

const DATE = '2026-11-19'
const COL_A = "'LevelLogs'!A:A"

function fakeApi(levels: string[]) {
  const values: Record<string, string[][]> = {
    "'AuditLog'!A1:D1": [['savedAt', 'form', 'ranges', 'rows']],
    "'AuditLog'!A:A": [['savedAt']],
    "'LevelLogs'!A1:D1": [[...LEVEL_TAB.headers]],
    [COL_A]: [['newSynchroLevel'], ...levels.map((l) => [l])],
    // 45968 is 2025-11-07 as a sheet serial; every fake row shares it
    ...Object.fromEntries(levels.map((_, i) => [`'LevelLogs'!B${i + 2}`, [['45968']]])),
  }
  return {
    values,
    getValues: vi.fn(async (_id: string, range: string) => values[range] ?? []),
    batchUpdateValues: vi.fn<SheetsApi['batchUpdateValues']>(async (_id, data) => ({
      updatedRanges: data.map((d) => d.range),
    })),
  } satisfies SheetsApi & { values: unknown }
}

function setup(levels: string[]) {
  const store = useLevelStore()
  store.date = DATE
  return { store, api: fakeApi(levels) }
}

beforeEach(() => setActivePinia(createPinia()))

describe('levelStore', () => {
  it('loads the last level and defaults the target to the next step', async () => {
    const { store, api } = setup(['200', '210'])
    expect(await store.load(api)).toBe(true)
    expect(store.last).toBe(210)
    expect(store.lastDate).toBe('2025-11-07')
    expect(store.target).toBe(215)
    expect(store.steps).toEqual([215])
    expect(store.canSave).toBe(true)
  })

  it('has no default target on an empty tab', async () => {
    const { store, api } = setup([])
    await store.load(api)
    expect(store.last).toBeNull()
    expect(store.target).toBeNull()
    expect(store.canSave).toBe(false)
  })

  it('cannot save without a date or with a date before the last level', async () => {
    const { store, api } = setup(['210'])
    await store.load(api)
    store.date = ''
    expect(store.canSave).toBe(false)
    store.date = '2025-11-06'
    expect(store.canSave).toBe(false)
    store.date = '2025-11-07'
    expect(store.canSave).toBe(true)
  })

  it('cannot save a target that is not a multiple of 5', async () => {
    const { store, api } = setup(['210'])
    await store.load(api)
    store.target = 222
    expect(store.canSave).toBe(false)
  })

  it('writes every step of a jump in one batch with formulas and an audit row', async () => {
    const { store, api } = setup(['200', '210'])
    await store.load(api)
    store.target = 225
    store.note = 'jump'
    await store.save(api)
    expect(api.batchUpdateValues).toHaveBeenCalledOnce()
    const [level, audit] = api.batchUpdateValues.mock.calls[0][1]
    expect(level).toEqual({
      range: "'LevelLogs'!A4:D6",
      rows: [
        [215, DATE, '=IF(B5="","",B5-B4)', ''],
        [220, DATE, '=IF(B6="","",B6-B5)', ''],
        [225, DATE, '=IF(B7="","",B7-B6)', "'jump"],
      ],
    })
    expect(audit.rows[0].slice(1)).toEqual(['Level', "''LevelLogs'!A4:D6", 3])
    expect(store.status).toBe('saved')
    expect(store.note).toBe('')
    expect(store.lastSaved).toEqual({ updatedRange: "'LevelLogs'!A4:D6", count: 3 })
  })

  it('re-reads the last level at save time and refuses a level already logged', async () => {
    const { store, api } = setup(['210'])
    await store.load(api)
    store.target = 225
    api.values[COL_A] = [['newSynchroLevel'], ['210'], ['225']]
    api.values["'LevelLogs'!B3"] = [['45968']]
    await store.save(api)
    expect(api.batchUpdateValues).not.toHaveBeenCalled()
    expect(store.status).toBe('error')
    expect(store.error).toContain('225')
  })
})
