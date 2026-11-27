import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { SheetsApi } from '@/services/google/sheetsApi'
import { FACTS } from '@/services/stats/facts'
import type { Category, Fact } from '@/services/stats/facts'
import { useStatsStore } from '@/stores/statsStore'

// The pick sheet (category, then fact) and the card's filter panel. `category` only limits the fact
// step; roll() ignores it.
type Step = 'category' | 'fact'

const pickFrom = <T>(items: T[], random: () => number) => items[Math.floor(random() * items.length)]

export const usePickerStore = defineStore('picker', () => {
  const stats = useStatsStore()
  const sheet = ref<{ step: Step } | null>(null)
  const category = ref<Category | null>(null)
  // undefined: the first unchosen filter opens by itself; null: closed; else the chip's filter.
  const editing = ref<string | null | undefined>(undefined)
  const openFilter = computed(() => {
    const c = stats.card
    if (!('options' in c)) return null
    if (editing.value !== undefined) return editing.value
    return c.fact.filters?.find((f) => c.values[f.id] === undefined)?.id ?? null
  })

  function openPicker() {
    category.value = null
    sheet.value = { step: 'category' }
  }

  // No category = random.
  function pickCategory(name?: Category, facts: Fact[] = FACTS, random = Math.random) {
    category.value = name ?? pickFrom([...new Set(facts.map((f) => f.category))], random)
    sheet.value = { step: 'fact' }
  }

  // No fact = random within the picked category. The sheet ends here; filters are on the card.
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
    editing.value = undefined
    await stats.show(chosen, api, {}, undefined, now)
    if (sheet.value === sheetBefore) sheet.value = null // unless the viewer moved it meanwhile
  }

  // No value = random from the filter's real options. A first choice moves on to the next unchosen
  // filter; a change closes the panel.
  async function pickFilter(
    id: string,
    value?: string,
    api?: SheetsApi,
    random = Math.random,
    now?: Date,
  ) {
    const c = stats.card
    if (!('options' in c)) return
    const v = value ?? pickFrom(c.options[id] ?? [], random)
    if (v === undefined) return
    editing.value = c.values[id] === undefined ? undefined : null
    await stats.setFilter(id, v, api, now)
  }

  function roll(api?: SheetsApi, facts?: Fact[], random?: () => number, now?: Date) {
    editing.value = undefined
    return stats.roll(api, facts, random, now)
  }

  const toggleFilter = (id: string) => (editing.value = openFilter.value === id ? null : id)
  const closeFilter = () => (editing.value = null)
  const closePicker = () => {
    sheet.value = null
    category.value = null
  }
  // Leaving the page.
  function reset() {
    closePicker()
    editing.value = undefined
  }

  return {
    sheet,
    category,
    openFilter,
    openPicker,
    pickCategory,
    pickFact,
    pickFilter,
    roll,
    toggleFilter,
    closeFilter,
    closePicker,
    reset,
  }
})
