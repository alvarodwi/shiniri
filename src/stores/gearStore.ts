import { defineStore } from 'pinia'

import { GEAR_MAX_ITEMS } from '@/config/limits'
import { FURNACE_TAB, T9MANU_TAB } from '@/config/sheets'
import { isCardComplete, newCard, rowsFor } from '@/services/gear/gearRows'
import type { SheetsApi } from '@/services/google/sheetsApi'
import { writeTabsAtEnd } from '@/services/sheets/tabWriter'
import type { WriteTarget } from '@/services/sheets/tabWriter'
import { sheetsApi } from '@/stores/authStore'
import type { GearCard, GearSource } from '@/types/gear'
import { gameDay } from '@/utils/gameDay'

export const useGearStore = defineStore('gear', {
  state: () => ({
    date: gameDay(),
    source: 'arms' as GearSource,
    count: 1,
    cards: [newCard()] as GearCard[],
    status: 'idle' as 'idle' | 'saving' | 'saved' | 'error',
    error: null as string | null,
    lastSaved: [] as { updatedRange: string; count: number }[],
  }),

  getters: {
    activeCards: (state) => state.cards,
    canSave(): boolean {
      return (
        this.status !== 'saving' && this.activeCards.every((c) => isCardComplete(c, this.source))
      )
    },
  },

  actions: {
    // Dropped cards are discarded, so raising the count again never brings back hidden picks.
    setCount(n: number) {
      this.count = Math.min(GEAR_MAX_ITEMS, Math.max(1, Math.trunc(n) || 1))
      this.cards = this.cards.slice(0, this.count)
      while (this.cards.length < this.count) this.cards.push(newCard())
    },

    setSource(source: GearSource) {
      this.source = source
    },

    // The furnace result is always the target's manufacturer.
    setCard(index: number, patch: Partial<GearCard>) {
      const card = { ...this.cards[index], ...patch }
      if (patch.target) card.manufacturer = patch.target
      this.cards[index] = card
    },

    async save(api: SheetsApi = sheetsApi) {
      if (!this.canSave) return
      this.status = 'saving'
      this.error = null
      this.lastSaved = []
      try {
        const { t9Manu, furnace } = rowsFor(this.date, this.source, this.activeCards)
        const targets: WriteTarget[] = [{ tab: T9MANU_TAB, rows: t9Manu }]
        if (furnace.length) targets.push({ tab: FURNACE_TAB, rows: furnace })
        const { updatedRanges } = await writeTabsAtEnd(api, targets, 'Gear')
        this.lastSaved = targets.map((t, i) => ({
          updatedRange: updatedRanges[i],
          count: t.rows.length,
        }))
        this.cards = [newCard()]
        this.count = 1
        this.status = 'saved'
      } catch (e) {
        this.status = 'error'
        this.error = (e as Error).message
      }
    },
  },
})
