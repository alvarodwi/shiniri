import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { MOCK_TABS } from './fixtures'
import { createMockSheetsApi } from './mockSheetsApi'

import { useLevelStore } from '@/stores/levelStore'
import { useLogStore } from '@/stores/logStore'
import { useSoloRaidStore } from '@/stores/soloRaidStore'

// The real stores against the mock sheet: what yarn dev:mock shows after a save.
beforeEach(() => setActivePinia(createPinia()))

describe('mock sheet with the real stores', () => {
  it('saves a level jump, then shows the next level and a Level row in the log', async () => {
    const api = createMockSheetsApi(MOCK_TABS)
    const level = useLevelStore()
    await level.load(api)
    expect(level.last).toBe(780)
    level.date = '2026-11-19'
    level.target = 790
    await level.save(api)
    expect(level.status).toBe('saved')
    expect(level.last).toBe(790)
    expect(level.lastSaved).toEqual({ updatedRange: "'LevelLogs'!A7:D8", count: 2 })

    const log = useLogStore()
    await log.load(api)
    expect(log.sections[0].entries[0]).toMatchObject({ form: 'Level', rows: '2' })
  })

  it('saves a solo raid season and moves on to the next one', async () => {
    const api = createMockSheetsApi(MOCK_TABS)
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
})
