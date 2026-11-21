import { defineStore } from 'pinia'

import { EVENT_TAB } from '@/config/sheets'
import { toRow } from '@/services/event/eventRows'
import type { SheetsApi } from '@/services/google/sheetsApi'
import { readNikkes } from '@/services/nikke/nikkeDatabase'
import type { Nikke } from '@/services/nikke/nikkeDatabase'
import { ssrPool } from '@/services/nikke/nikkePool'
import { writeTabsAtEnd } from '@/services/sheets/tabWriter'
import { sheetsApi } from '@/stores/authStore'
import { COLLAB_TYPE } from '@/types/event'
import type { EventEntry } from '@/types/event'
import { gameDay } from '@/utils/gameDay'

const newEntry = (): EventEntry => ({
  date: gameDay(),
  rateUpName: '',
  rateUpType: '',
  gems: '',
  tix: '',
  names: [],
  notes: '',
})

const isAbnormal = (nikkes: Nikke[], name: string) =>
  nikkes.some((n) => n.name === name && n.manufacturer.toLowerCase() === 'abnormal')

export const useEventStore = defineStore('event', {
  state: () => ({
    entry: newEntry(),
    nikkes: [] as Nikke[],
    status: 'idle' as 'idle' | 'loading' | 'saving' | 'saved' | 'error',
    error: null as string | null,
    lastSaved: null as string | null,
  }),

  getters: {
    row: (state) => toRow(state.entry),
    // Pilgrim can come out of any event banner; Abnormal only out of a collaboration one.
    pool: (state) =>
      ssrPool(state.nikkes, { pilgrim: true, abnormal: state.entry.rateUpType === COLLAB_TYPE }),
    canSave(): boolean {
      return (
        this.row !== null &&
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

    // Leaving a collaboration banner removes Abnormal picks, so a stale one can't reach the sheet.
    // It goes by manufacturer, not pool membership, so an unloaded database never wipes names.
    setRateUpType(type: string) {
      this.entry.rateUpType = type
      if (type === COLLAB_TYPE) return
      this.entry.names = this.entry.names.filter((n) => !isAbnormal(this.nikkes, n))
      if (isAbnormal(this.nikkes, this.entry.rateUpName)) this.entry.rateUpName = ''
    },

    add(name: string) {
      this.entry.names.push(name)
    },

    removeAt(i: number) {
      this.entry.names.splice(i, 1)
    },

    async save(api: SheetsApi = sheetsApi) {
      const row = this.row
      if (!this.canSave || !row) return
      this.status = 'saving'
      this.error = null
      this.lastSaved = null
      try {
        const { updatedRanges } = await writeTabsAtEnd(
          api,
          [{ tab: EVENT_TAB, rows: [row] }],
          'Event',
        )
        // Clear the form before reloading, so a failed reload can't leave the row to be saved twice.
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
