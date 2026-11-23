import { defineStore } from 'pinia'

import { OVERCORE_TAB, SOCIAL_TAB } from '@/config/sheets'
import type { SheetsApi } from '@/services/google/sheetsApi'
import { readNikkes } from '@/services/nikke/nikkeDatabase'
import type { Nikke } from '@/services/nikke/nikkeDatabase'
import { ssrPool } from '@/services/nikke/nikkePool'
import { checkOvercores } from '@/services/overcore/overcore'
import { writeTabsAtEnd } from '@/services/sheets/tabWriter'
import { toRow } from '@/services/social/socialRows'
import { sheetsApi } from '@/stores/authStore'
import type { SocialEntry } from '@/types/social'
import { isEntryDirty } from '@/utils/dirty'
import { gameDay } from '@/utils/gameDay'

const newEntry = (): SocialEntry => ({ date: gameDay(), times: '', names: [], notes: '' })

export const useSocialStore = defineStore('social', {
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
    // totalSsr counts SSRs only. Abnormal (collab, event only) and Pilgrim (event and ordinary only)
    // never come out of a social pull.
    ssrNikkes: (state) => ssrPool(state.nikkes, { pilgrim: false, abnormal: false }),
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
          from: 'Social',
          detail: '',
          date: entry.date,
          names: entry.names,
          nikkes: this.nikkes,
        })
        const { updatedRanges } = await writeTabsAtEnd(
          api,
          [
            { tab: SOCIAL_TAB, rows: [row] },
            ...(oc.rows.length ? [{ tab: OVERCORE_TAB, rows: oc.rows }] : []),
          ],
          'Social',
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
