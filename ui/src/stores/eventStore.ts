import { defineStore } from 'pinia'

import { OVERCORE_TAB, EVENT_TAB } from '@/config/sheets'
import { canDrop } from '@/services/event/eventPool'
import { toRow } from '@/services/event/eventRows'
import type { SheetsApi } from '@/services/google/sheetsApi'
import { readNikkes } from '@/services/nikke/nikkeDatabase'
import type { Nikke } from '@/services/nikke/nikkeDatabase'
import { ssrPool } from '@/services/nikke/nikkePool'
import { checkOvercores } from '@/services/overcore/overcore'
import { writeTabsAtEnd } from '@/services/sheets/tabWriter'
import { sheetsApi } from '@/stores/authStore'
import { COLLAB_TYPE } from '@/types/event'
import type { EventEntry } from '@/types/event'
import { isEntryDirty } from '@/utils/dirty'
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
    remark: null as string | null,
  }),

  getters: {
    isDirty: (state) => isEntryDirty(state.entry, newEntry()),
    row: (state) => toRow(state.entry),
    // The rate-up choices: any SSR, Abnormal only for a collaboration banner.
    pool: (state) =>
      ssrPool(state.nikkes, { overspec: true, limited: true }).filter(
        (n) =>
          state.entry.rateUpType === COLLAB_TYPE || n.manufacturer.toLowerCase() !== 'abnormal',
      ),
    listPool: (state) =>
      ssrPool(state.nikkes, { overspec: true, limited: true }).filter((n) =>
        canDrop(n, state.entry),
      ),
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
    discard() {
      this.entry = newEntry()
    },
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

    // Picks the banner can't give are removed, so a stale one can't reach the sheet. It goes by the
    // unit's own flags, not pool membership, so an unloaded database never wipes names.
    prune() {
      this.entry.names = this.entry.names.filter((name) => {
        const n = this.nikkes.find((x) => x.name === name)
        return !n || canDrop(n, this.entry)
      })
    },

    // Leaving a collaboration banner also clears an Abnormal rate-up.
    setRateUpType(type: string) {
      this.entry.rateUpType = type
      if (type !== COLLAB_TYPE && isAbnormal(this.nikkes, this.entry.rateUpName)) {
        this.entry.rateUpName = ''
      }
      this.prune()
    },

    setRateUpName(name: string) {
      this.entry.rateUpName = name
      this.prune()
    },

    // A date input emits '' or a year like 0002 while being typed; pruning waits for a real one.
    setDate(date: string) {
      this.entry.date = date
      if (date >= '2022') this.prune()
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
      this.remark = null
      try {
        const entry = this.entry
        const oc = await checkOvercores(api, {
          from: 'Event',
          detail: '',
          date: entry.date,
          names: entry.names,
          nikkes: this.nikkes,
        })
        const { updatedRanges } = await writeTabsAtEnd(
          api,
          [
            { tab: EVENT_TAB, rows: [row] },
            ...(oc.rows.length ? [{ tab: OVERCORE_TAB, rows: oc.rows }] : []),
          ],
          'Event',
        )
        this.remark = oc.remark
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
