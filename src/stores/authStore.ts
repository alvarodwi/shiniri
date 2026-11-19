import { defineStore } from 'pinia'

import { getToken, hasFreshToken, signOut } from '@/services/google/auth'
import { createSheetsApi } from '@/services/google/sheetsApi'

export const sheetsApi = createSheetsApi(getToken)

export const useAuthStore = defineStore('auth', {
  state: () => ({
    signedIn: hasFreshToken(),
    busy: false,
    error: null as string | null,
  }),

  actions: {
    // Must run from a click: the consent popup is blocked otherwise.
    async signIn() {
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
      signOut()
      this.signedIn = false
    },
  },
})
