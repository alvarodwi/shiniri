import { defineStore } from 'pinia'

import { readCostumes } from '@/services/costume/costumeDatabase'
import type { Costume } from '@/services/costume/costumeDatabase'
import type { SheetsApi } from '@/services/google/sheetsApi'
import { sheetsApi } from '@/stores/authStore'

export const useCostumeStore = defineStore('costume', {
  state: () => ({
    costumes: [] as Costume[],
    status: 'idle' as 'idle' | 'loading',
    error: null as string | null,
  }),

  actions: {
    // Read-only; the sheet is the only copy.
    async load(api: SheetsApi = sheetsApi) {
      if (this.status === 'loading') return
      this.status = 'loading'
      this.error = null
      try {
        this.costumes = await readCostumes(api)
      } catch (e) {
        this.error = (e as Error).message
      } finally {
        this.status = 'idle'
      }
    },
  },
})
