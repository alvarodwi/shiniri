import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSoloRaidStore } from './soloRaidStore'

import { SOLO_RAID_TAB } from '@/config/sheets'
import type { SheetsApi } from '@/services/google/sheetsApi'

const COL_A = "'SoloRaid'!A:A"

function fakeApi() {
  const values: Record<string, string[][]> = {
    "'AuditLog'!A1:D1": [['savedAt', 'form', 'ranges', 'rows']],
    "'AuditLog'!A:A": [['savedAt']],
    "'SoloRaid'!A1:G1": [[...SOLO_RAID_TAB.headers]],
    [COL_A]: [['season'], ['1'], ['2']],
    "'SoloRaid'!C:C": [['boss'], ['Mother Whale'], ['Gravedigger']],
  }
  return {
    values,
    getValues: vi.fn(async (_id: string, range: string) => values[range] ?? []),
    batchUpdateValues: vi.fn<SheetsApi['batchUpdateValues']>(async (_id, data) => ({
      updatedRanges: data.map((d) => d.range),
    })),
  } satisfies SheetsApi & { values: unknown }
}

function fill(store: ReturnType<typeof useSoloRaidStore>) {
  store.entry.date = '2026-11-14'
  store.entry.boss = 'Mother Whale'
  store.setWeakness('Electric')
  store.entry.damage = '12,345,678,901'
  store.entry.rank = '7.95'
}

beforeEach(() => setActivePinia(createPinia()))

describe('soloRaidStore', () => {
  it('loads the next season and past bosses, most recent first', async () => {
    const store = useSoloRaidStore()
    expect(await store.load(fakeApi())).toBe(true)
    expect(store.entry.season).toBe(3)
    expect(store.bosses).toEqual(['Gravedigger', 'Mother Whale'])
  })

  it('cannot save until every required field is valid', async () => {
    const store = useSoloRaidStore()
    await store.load(fakeApi())
    expect(store.canSave).toBe(false)
    fill(store)
    expect(store.canSave).toBe(true)
    store.setRankMode('place')
    expect(store.canSave).toBe(false) // 7.95 is not a placement
  })

  it('writes one row with an audit row, then resets for the next season', async () => {
    const store = useSoloRaidStore()
    const api = fakeApi()
    await store.load(api)
    fill(store)
    await store.save(api)
    expect(api.batchUpdateValues).toHaveBeenCalledOnce()
    const [raid, audit] = api.batchUpdateValues.mock.calls[0][1]
    expect(raid).toEqual({
      range: "'SoloRaid'!A4:G4",
      rows: [[3, '2026-11-14', "'Mother Whale", 'Electric', 12345678901, "'7.95%", '']],
    })
    expect(audit.rows[0].slice(1)).toEqual(['SoloRaid', "''SoloRaid'!A4:G4", 1])
    expect(store.status).toBe('saved')
    expect(store.lastSaved).toBe("'SoloRaid'!A4:G4")
    expect(store.entry).toMatchObject({
      boss: '',
      weakness: null,
      damage: '',
      rankMode: 'percent',
      rank: '',
      comments: '',
    })
  })

  it('keeps the entry when the write fails, so it can be retried', async () => {
    const store = useSoloRaidStore()
    const api = fakeApi()
    await store.load(api)
    fill(store)
    api.batchUpdateValues.mockRejectedValueOnce(new Error('offline'))
    await store.save(api)
    expect(store.status).toBe('error')
    expect(store.entry).toMatchObject({ season: 3, boss: 'Mother Whale', rank: '7.95' })
  })

  it('clears the entry after a write even when the reload fails', async () => {
    const store = useSoloRaidStore()
    const api = fakeApi()
    await store.load(api)
    fill(store)
    const read = api.getValues.getMockImplementation()!
    // the reload is the first read after the write
    api.batchUpdateValues.mockImplementationOnce(async (_id, data) => {
      api.getValues.mockImplementation(async () => {
        throw new Error('offline')
      })
      return { updatedRanges: data.map((d) => d.range) }
    })
    await store.save(api)
    api.getValues.mockImplementation(read)
    expect(store.status).toBe('error')
    expect(store.lastSaved).toBe("'SoloRaid'!A4:G4")
    expect(store.entry.boss).toBe('')
  })

  it('does not reload over a save in progress, nor over a typed season', async () => {
    const store = useSoloRaidStore()
    const api = fakeApi()
    await store.load(api)
    store.entry.season = 7
    await store.load(api)
    expect(store.entry.season).toBe(7)
    store.status = 'saving'
    expect(await store.load(api)).toBe(false)
    expect(store.status).toBe('saving')
  })

  it('refuses a season already logged since the page loaded', async () => {
    const store = useSoloRaidStore()
    const api = fakeApi()
    await store.load(api)
    fill(store)
    api.values[COL_A] = [['season'], ['1'], ['2'], ['3']]
    await store.save(api)
    expect(api.batchUpdateValues).not.toHaveBeenCalled()
    expect(store.status).toBe('error')
    expect(store.error).toContain('3')
  })
})
