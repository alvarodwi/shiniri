import { defineStore } from 'pinia'

import { getToken, hasFreshToken, signOut } from '@/services/google/auth'
import { createSheetsApi } from '@/services/google/sheetsApi'
import type { SheetsApi } from '@/services/google/sheetsApi'

let impl: SheetsApi = createSheetsApi(getToken)

// Stores default to this object, so swapping `impl` (mock mode) reroutes every read and write.
export const sheetsApi: SheetsApi = {
  getValues: (...args) => impl.getValues(...args),
  batchUpdateValues: (...args) => impl.batchUpdateValues(...args),
}

export function useSheetsApi(api: SheetsApi): void {
  impl = api
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    signedIn: __MOCK__ || hasFreshToken(),
    busy: false,
    error: null as string | null,
  }),

  actions: {
    // Must run from a click: the consent popup is blocked otherwise.
    async signIn() {
      if (__MOCK__) {
        this.signedIn = true
        return
      }
      this.busy = true
      this.error = null
      try {
        await getToken({ forceRefresh: true })
        this.signedIn = true
      } catch (e) {
        this.error = (e as Error).message
      } finally {
        this.busy = false
      }
    },

    signOut() {
      if (!__MOCK__) signOut()
      this.signedIn = false
    },
  },
})
