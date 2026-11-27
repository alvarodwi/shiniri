import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { SheetsApi } from '@/services/google/sheetsApi'
import { FACTS } from '@/services/stats/facts'
import type { Category, Fact } from '@/services/stats/facts'
import { useStatsStore } from '@/stores/statsStore'

// The pick sheet: one step at a time, ending on the card. `category` only limits the fact step;
// roll() ignores it.
type Step = 'category' | 'fact' | string // a filter id

const pickFrom = <T>(items: T[], random: () => number) => items[Math.floor(random() * items.length)]

export const usePickerStore = defineStore('picker', () => {
  const stats = useStatsStore()
  const sheet = ref<{ step: Step } | null>(null)
  const category = ref<Category | null>(null)

  function openPicker() {
    category.value = null
    sheet.value = { step: 'category' }
  }

  // No category = random.
  function pickCategory(name?: Category, facts: Fact[] = FACTS, random = Math.random) {
    category.value = name ?? pickFrom([...new Set(facts.map((f) => f.category))], random)
    sheet.value = { step: 'fact' }
  }

  // Next filter step still unchosen, else the sheet closes on the card (also when the load failed).
  function advance() {
    const c = stats.card
    const next =
      c.status === 'pending' ? c.fact.filters?.find((f) => c.values[f.id] === undefined) : null
    sheet.value = next ? { step: next.id } : null
  }

  // No fact = random within the picked category. Choosing loads the tab, so filter options exist.
  async function pickFact(
    fact?: Fact,
    api?: SheetsApi,
    facts: Fact[] = FACTS,
    random = Math.random,
    now?: Date,
  ) {
    if (stats.card.status === 'loading') return // ignore a double tap
    const pool = facts.filter((f) => !category.value || f.category === category.value)
    const chosen = fact ?? pickFrom(pool, random)
    if (!chosen) return
    const sheetBefore = sheet.value
    await stats.show(chosen, api, {}, undefined, now)
    if (sheet.value === sheetBefore) advance() // the viewer closed or moved the sheet meanwhile
  }

  // No value = random from the filter's real options.
  async function pickFilter(
    id: string,
    value?: string,
    api?: SheetsApi,
    random = Math.random,
    now?: Date,
  ) {
    const c = stats.card
    if (c.status === 'idle' || c.status === 'loading') return
    const v = value ?? ('options' in c ? pickFrom(c.options[id] ?? [], random) : undefined)
    if (v === undefined) return
    const sheetBefore = sheet.value
    await stats.setFilter(id, v, api, now)
    if (sheet.value === sheetBefore) advance()
  }

  const editFilter = (id: string) => (sheet.value = { step: id })
  const closePicker = () => {
    sheet.value = null
    category.value = null
  }

  return {
    sheet,
    category,
    openPicker,
    pickCategory,
    pickFact,
    pickFilter,
    editFilter,
    closePicker,
  }
})
