import { defineStore } from 'pinia'

import { SOLO_RAID_TAB } from '@/config/sheets'
import type { SheetsApi } from '@/services/google/sheetsApi'
import { readColumnA, writeTabsAtEnd } from '@/services/sheets/tabWriter'
import { nextSeason, pastBosses, toRow } from '@/services/soloRaid/soloRaidRows'
import { sheetsApi } from '@/stores/authStore'
import type { RaidEntry, RankMode, Weakness } from '@/types/soloRaid'
import { gameDay } from '@/utils/gameDay'

const newEntry = (season: number | null): RaidEntry => ({
  season,
  date: gameDay(),
  boss: '',
  weakness: null,
  damage: '',
  rankMode: 'percent',
  rank: '',
  comments: '',
})

const isLogged = (colA: string[], season: number) =>
  colA.slice(1).some((v) => v.trim() === String(season))

export const useSoloRaidStore = defineStore('soloRaid', {
  state: () => ({
    entry: newEntry(null),
    bosses: [] as string[],
    status: 'idle' as 'idle' | 'loading' | 'saving' | 'saved' | 'error',
    error: null as string | null,
    lastSaved: null as string | null,
  }),

  getters: {
    row: (state) => toRow(state.entry),
    canSave(): boolean {
      return this.row !== null && this.status !== 'loading' && this.status !== 'saving'
    },
  },

  actions: {
    // Runs on every visit to the page, so it must not undo a save in flight or a typed season.
    async load(api: SheetsApi = sheetsApi): Promise<boolean> {
      if (this.status === 'saving') return false
      this.status = 'loading'
      this.error = null
      try {
        const [colA, colC] = await Promise.all([
          readColumnA(api, SOLO_RAID_TAB),
          api.getValues(
            SOLO_RAID_TAB.spreadsheetId,
            `'${SOLO_RAID_TAB.tab}'!C:C`,
            'UNFORMATTED_VALUE',
          ),
        ])
        if (this.entry.season === null) this.entry.season = nextSeason(colA)
        this.bosses = pastBosses(colC.map((r) => String(r[0] ?? '')))
        this.status = 'idle'
        return true
      } catch (e) {
        this.status = 'error'
        this.error = (e as Error).message
        return false
      }
    },

    setWeakness(w: Weakness) {
      this.entry.weakness = w
    },

    setRankMode(m: RankMode) {
      this.entry.rankMode = m
    },

    async save(api: SheetsApi = sheetsApi) {
      const row = this.row
      if (!this.canSave || !row) return
      this.status = 'saving'
      this.error = null
      this.lastSaved = null
      try {
        // Re-read at save time: another device, or an earlier save, may have logged this season.
        const season = this.entry.season as number
        if (isLogged(await readColumnA(api, SOLO_RAID_TAB), season))
          throw new Error(`Season ${season} is already logged.`)
        const { updatedRanges } = await writeTabsAtEnd(
          api,
          [{ tab: SOLO_RAID_TAB, rows: [row] }],
          'SoloRaid',
        )
        // Clear the form before reloading, so a failed reload can't leave the row to be saved twice.
        this.entry = newEntry(null)
        this.lastSaved = updatedRanges[0]
        this.status = 'idle' // the write is done; let load run
        if (await this.load(api)) this.status = 'saved'
      } catch (e) {
        this.status = 'error'
        this.error = (e as Error).message
      }
    },
  },
})
