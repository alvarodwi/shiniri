import { defineStore } from 'pinia'

import { SPARE_BODY_TAB } from '@/config/sheets'
import type { SheetsApi } from '@/services/google/sheetsApi'
import { readNikkes } from '@/services/nikke/nikkeDatabase'
import type { Nikke } from '@/services/nikke/nikkeDatabase'
import { writeTabsAtEnd } from '@/services/sheets/tabWriter'
import { spareBodyPool, toRows } from '@/services/spareBody/spareBodyRows'
import { sheetsApi } from '@/stores/authStore'
import type { SpareBodyEntry } from '@/types/spareBody'
import { gameDay } from '@/utils/gameDay'

const newEntry = (): SpareBodyEntry => ({
  date: gameDay(),
  source: '',
  target: '',
  copies: '1',
  notes: '',
})

export const useSpareBodyStore = defineStore('spareBody', {
  state: () => ({
    entry: newEntry(),
    nikkes: [] as Nikke[],
    status: 'idle' as 'idle' | 'loading' | 'saving' | 'saved' | 'error',
    error: null as string | null,
    lastSaved: null as string | null,
  }),

  getters: {
    rows: (state) => toRows(state.entry),
    pool: (state) => spareBodyPool(state.nikkes, state.entry.source),
    canSave(): boolean {
      return (
        this.rows !== null &&
        this.nikkes.length > 0 &&
        this.status !== 'loading' &&
        this.status !== 'saving'
      )
    },
  },

  actions: {
    // Runs on every visit to the page, so it must not undo a save in flight or a typed entry.
    async load(api: SheetsApi = sheetsApi): Promise<boolean> {
      if (this.status === 'saving') return false
      this.status = 'loading'
      this.error = null
      try {
        this.nikkes = await readNikkes(api)
        this.status = 'idle'
        return true
      } catch (e) {
        this.nikkes = []
        this.status = 'error'
        this.error = (e as Error).message
        return false
      }
    },

    setSource(s: string) {
      this.entry.source = s
      if (!this.pool.some((n) => n.name === this.entry.target)) this.entry.target = ''
    },

    async save(api: SheetsApi = sheetsApi) {
      const rows = this.rows
      if (!this.canSave || !rows) return
      this.status = 'saving'
      this.error = null
      this.lastSaved = null
      try {
        const { updatedRanges } = await writeTabsAtEnd(
          api,
          [{ tab: SPARE_BODY_TAB, rows }],
          'SpareBody',
        )
        // Clear the form before reloading, so a failed reload can't leave the rows to be saved twice.
        this.entry = newEntry()
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
