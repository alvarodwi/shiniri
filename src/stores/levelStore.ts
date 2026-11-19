import { defineStore } from 'pinia'

import { LEVEL_TAB } from '@/config/sheets'
import { cellToIsoDate } from '@/services/anomaly/anomalyRows'
import type { SheetsApi } from '@/services/google/sheetsApi'
import { lastLevel, levelSteps, toRows } from '@/services/level/levelRows'
import { readColumnA, writeTabsAtEnd } from '@/services/sheets/tabWriter'
import { sheetsApi } from '@/stores/authStore'
import { gameDay } from '@/utils/gameDay'

// The last level and its achievedAt as ISO text, read unformatted so the display format can't matter.
async function readLast(api: SheetsApi) {
  const entry = lastLevel(await readColumnA(api, LEVEL_TAB))
  if (!entry) return { level: null, date: null }
  const [[b = ''] = []] = await api.getValues(
    LEVEL_TAB.spreadsheetId,
    `'${LEVEL_TAB.tab}'!B${entry.row}`,
    'UNFORMATTED_VALUE',
  )
  return { level: entry.level, date: cellToIsoDate(String(b)) || null }
}

// ISO dates compare as text. A date before the last level's would make its daysElapsed negative.
const dateProblem = (date: string, lastDate: string | null): string | null =>
  !date
    ? 'Pick a date.'
    : lastDate && date < lastDate
      ? `The date is before the last logged level's (${lastDate}).`
      : null

export const useLevelStore = defineStore('level', {
  state: () => ({
    date: gameDay(),
    last: null as number | null,
    lastDate: null as string | null,
    target: null as number | null,
    note: '',
    status: 'idle' as 'idle' | 'loading' | 'saving' | 'saved' | 'error',
    error: null as string | null,
    lastSaved: null as { updatedRange: string; count: number } | null,
  }),

  getters: {
    steps: (state) => levelSteps(state.last, state.target ?? 0),
    dateProblem: (state) => dateProblem(state.date, state.lastDate),
    canSave(): boolean {
      return (
        this.steps.length > 0 &&
        !this.dateProblem &&
        this.status !== 'loading' &&
        this.status !== 'saving'
      )
    },
  },

  actions: {
    async load(api: SheetsApi = sheetsApi): Promise<boolean> {
      this.status = 'loading'
      this.error = null
      try {
        const { level, date } = await readLast(api)
        this.last = level
        this.lastDate = date
        this.target = level === null ? null : level + 5
        this.status = 'idle'
        return true
      } catch (e) {
        this.status = 'error'
        this.error = (e as Error).message
        return false
      }
    },

    async save(api: SheetsApi = sheetsApi) {
      if (!this.canSave) return
      this.status = 'saving'
      this.error = null
      this.lastSaved = null
      try {
        // Re-read at save time: another device may have logged a level since this page loaded.
        const { level, date } = await readLast(api)
        this.last = level
        this.lastDate = date
        const target = this.target ?? 0
        const steps = levelSteps(this.last, target)
        if (!steps.length)
          throw new Error(`Level ${target} is not above the last logged level (${this.last}).`)
        const problem = dateProblem(this.date, this.lastDate)
        if (problem) throw new Error(problem)
        const rows = toRows(steps, this.date, this.note)
        const { updatedRanges } = await writeTabsAtEnd(api, [{ tab: LEVEL_TAB, rows }], 'Level')
        // Clear the note before reloading, so a failed reload can't leave it to be saved twice.
        this.note = ''
        this.lastSaved = { updatedRange: updatedRanges[0], count: rows.length }
        if (await this.load(api)) this.status = 'saved'
      } catch (e) {
        this.status = 'error'
        this.error = (e as Error).message
      }
    },
  },
})
