import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { SheetsApi } from '@/services/google/sheetsApi'
import { FACTS } from '@/services/stats/facts'
import type { Answer, Fact, Values } from '@/services/stats/facts'
import { createLoader } from '@/services/stats/loader'
import { rollValues } from '@/services/stats/roll'
import { sheetsApi } from '@/stores/authStore'
import { gameDay } from '@/utils/gameDay'

// options: each filter's real options; pending: filters not all chosen yet, so no answer.
type Options = Record<string, string[]>
export type Card =
  | { status: 'idle' }
  | { status: 'loading'; fact: Fact; values: Values }
  | { status: 'pending'; fact: Fact; values: Values; options: Options }
  | { status: 'ready'; fact: Fact; values: Values; options: Options; answer: Answer }
  | { status: 'empty'; fact: Fact; values: Values; options: Options }
  | { status: 'error'; fact: Fact; values: Values; error: string }

export const useStatsStore = defineStore('stats', () => {
  const card = ref<Card>({ status: 'idle' })
  const load = createLoader()

  // Kept so Retry on a failed roll picks again instead of landing on a pending card.
  let lastPick: ((options: Options) => Values) | undefined

  // chooseValues: values to use once the options are known (random); else the given ones.
  async function show(
    fact: Fact,
    api: SheetsApi = sheetsApi,
    values: Values = {},
    chooseValues?: (options: Options) => Values,
    now: Date = new Date(),
  ) {
    lastPick = chooseValues
    card.value = { status: 'loading', fact, values }
    try {
      const cols = await load(api, fact)
      const options: Options = {}
      for (const f of fact.filters ?? [])
        options[f.id] = typeof f.options === 'function' ? f.options(cols) : f.options
      const chosen = chooseValues ? chooseValues(options) : values
      const allFiltersChosen = (fact.filters ?? []).every((f) => chosen[f.id] !== undefined)
      if (!allFiltersChosen)
        return (card.value = { status: 'pending', fact, values: chosen, options })
      const answer: Answer = fact.compute(cols, chosen, gameDay(now))
      card.value =
        answer === null
          ? { status: 'empty', fact, values: chosen, options }
          : { status: 'ready', fact, values: chosen, options, answer }
    } catch (e) {
      card.value = {
        status: 'error',
        fact,
        values,
        error: e instanceof Error ? e.message : String(e),
      }
    }
  }

  function retry(api?: SheetsApi, now?: Date) {
    if (card.value.status !== 'error') return
    return show(card.value.fact, api, card.value.values, lastPick, now)
  }

  // Recomputes from the cached tab: no new read.
  function setFilter(id: string, value: string, api?: SheetsApi, now?: Date) {
    if (card.value.status === 'idle') return
    const { fact, values } = card.value
    return show(fact, api, { ...values, [id]: value }, undefined, now)
  }

  // Random draws every filter from its real options and never re-rolls on 0 or an empty card.
  const roll = (api?: SheetsApi, facts: Fact[] = FACTS, random = Math.random, now?: Date) =>
    show(
      facts[Math.floor(random() * facts.length)],
      api,
      {},
      (options) => rollValues(options, random),
      now,
    )

  // Back to a blank page; the read cache stays for the session.
  function reset() {
    card.value = { status: 'idle' }
    lastPick = undefined
  }

  return { card, show, retry, setFilter, roll, reset }
})
