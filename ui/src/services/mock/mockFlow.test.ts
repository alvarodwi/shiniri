import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MOCK_SHEETS } from './fixtures'
import { createMockSheetsApi } from './mockSheetsApi'

import { useLevelStore } from '@/stores/levelStore'
import { useLogStore } from '@/stores/logStore'
import { useMoldsStore } from '@/stores/moldsStore'
import { useSoloRaidStore } from '@/stores/soloRaidStore'
import { useSpareBodyStore } from '@/stores/spareBodyStore'
import { gameDay } from '@/utils/gameDay'

// The real stores against the mock sheet: what yarn dev:mock shows after a save.
beforeEach(() => setActivePinia(createPinia()))

describe('mock sheet with the real stores', () => {
  it('saves a level jump, then shows the next level and a Level row in the log', async () => {
    const api = createMockSheetsApi(MOCK_SHEETS)
    const level = useLevelStore()
    await level.load(api)
    expect(level.last).toBe(780)
    level.date = '2026-11-19'
    level.target = 790
    await level.save(api)
    expect(level.status).toBe('saved')
    expect(level.last).toBe(790)
    expect(level.lastSaved).toEqual({ updatedRange: "'LevelLog'!A7:D8", count: 2 })

    const log = useLogStore()
    await log.open('Journal', api)
    await log.open('Gacha', api)
    expect(log.sections.map((s) => s.name)).toEqual(['Journal', 'Gacha'])
    expect(log.sections[0].entries[0]).toMatchObject({ form: 'Level', rows: '2' })
    // the journal save did not land in the gacha log
    expect(log.sections[1].entries[0]).toMatchObject({ form: 'cli-nikke-database' })
  })

  it('saves a solo raid season and moves on to the next one', async () => {
    const api = createMockSheetsApi(MOCK_SHEETS)
    const raid = useSoloRaidStore()
    await raid.load(api)
    expect(raid.entry.season).toBe(45)
    expect(raid.bosses).toEqual(['Gravedigger', 'Mother Whale'])
    Object.assign(raid.entry, { boss: 'Kraken', damage: '1,234,567', rank: '5,5' })
    raid.setWeakness('Water')
    await raid.save(api)
    expect(raid.status).toBe('saved')
    expect(raid.entry.season).toBe(46)
    expect(raid.bosses[0]).toBe('Kraken')
  })

  // The two painful overcores `yarn dev:mock` reproduces (see ui/CLAUDE.md, Reviewing the UI).
  const overcoredWrites = (api: ReturnType<typeof createMockSheetsApi>) => {
    const spy = vi.spyOn(api, 'batchUpdateValues')
    return () =>
      spy.mock.calls.flatMap(([, data]) =>
        data.filter((d) => d.range.startsWith("'Overcore'")).flatMap((d) => d.rows),
      )
  }

  it('level 7: Gold Mileage Rapi', async () => {
    const api = createMockSheetsApi(MOCK_SHEETS)
    const added = overcoredWrites(api)
    const store = useSpareBodyStore()
    await store.load(api)
    store.setSource('Gold Mileage')
    Object.assign(store.entry, { target: 'Rapi', copies: '1' })
    await store.save(api)
    expect(store.status).toBe('saved')
    expect(added()).toEqual([[gameDay(), 'Exchange', "'Rapi", 'Elysion', '']])
    expect(store.remark).toContain('Rapi C8')
  })

  it('level 5 + Pilgrim line: Pilgrim Perfect Mold Noah', async () => {
    const api = createMockSheetsApi(MOCK_SHEETS)
    const added = overcoredWrites(api)
    const store = useMoldsStore()
    await store.load(api)
    store.setMoldType('Pilgrim Perfect Mold')
    Object.assign(store.entry, { amount: '1', names: ['Noah'] })
    await store.save(api)
    expect(store.status).toBe('saved')
    expect(added()).toEqual([[gameDay(), 'Mold', "'Noah", 'Pilgrim', '']])
    expect(store.remark).toMatch(/Noah C8.*And she's a Pilgrim\.$/)
  })
})
