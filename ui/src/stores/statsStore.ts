import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { SheetsApi } from '@/services/google/sheetsApi'
import { columnLetter } from '@/services/sheets/tabWriter'
import { FACTS } from '@/services/stats/facts'
import type { Answer, Columns, Fact, Values } from '@/services/stats/facts'
import { sheetsApi } from '@/stores/authStore'

// options: each filter's real options; pending: filters not all chosen yet, so no answer.
type Options = Record<string, string[]>
export type Card =
  | { status: 'idle' }
  | { status: 'loading'; fact: Fact; values: Values }
  | { status: 'pending'; fact: Fact; values: Values; options: Options }
  | { status: 'ready'; fact: Fact; values: Values; options: Options; answer: Answer }
  | { status: 'empty'; fact: Fact; values: Values; options: Options }
  | { status: 'error'; fact: Fact; values: Values; error: string }

const quoted = (tab: string) => `'${tab.replace(/'/g, "''")}'`

export const useStatsStore = defineStore('stats', () => {
  const card = ref<Card>({ status: 'idle' })
  // In-memory only, per session: one read per tab header row and per column.
  const cache = new Map<string, Promise<unknown[][]>>()

  function read(api: SheetsApi, id: string, range: string) {
    const key = `${id}!${range}`
    let hit = cache.get(key)
    if (!hit) {
      hit = api.getValues(id, range, 'UNFORMATTED_VALUE')
      cache.set(key, hit)
      hit.catch(() => cache.delete(key)) // a failed read is retried, not remembered
    }
    return hit
  }

  async function load(api: SheetsApi, fact: Fact): Promise<Columns> {
    const out: Columns = {}
    for (const { tab, columns } of fact.reads) {
      const [header = []] = await read(api, tab.spreadsheetId, `${quoted(tab.tab)}!1:1`)
      const cols: Record<string, unknown[]> = {}
      for (const name of columns) {
        const i = header.indexOf(name)
        if (i < 0) throw new Error(`Tab ${tab.tab} has no header "${name}".`)
        const letter = columnLetter(i + 1)
        const values = await read(api, tab.spreadsheetId, `${quoted(tab.tab)}!${letter}:${letter}`)
        cols[name] = values.slice(1).map((r) => r[0] ?? '')
      }
      out[tab.tab] = cols
    }
    return out
  }

  // pick: values to use once the options are known (random); else the given ones.
  async function show(
    fact: Fact,
    api: SheetsApi = sheetsApi,
    values: Values = {},
    pick?: (options: Options) => Values,
  ) {
    card.value = { status: 'loading', fact, values }
    try {
      const cols = await load(api, fact)
      const options: Options = {}
      for (const f of fact.filters ?? [])
        options[f.id] = typeof f.options === 'function' ? f.options(cols) : f.options
      const chosen = pick ? pick(options) : values
      const done = (fact.filters ?? []).every((f) => chosen[f.id] !== undefined)
      if (!done) return (card.value = { status: 'pending', fact, values: chosen, options })
      const answer: Answer = fact.compute(cols, chosen)
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

  // Recomputes from the cached tab: no new read.
  function setFilter(id: string, value: string, api?: SheetsApi) {
    if (card.value.status === 'idle') return
    const { fact, values } = card.value
    return show(fact, api, { ...values, [id]: value })
  }

  // Random draws every filter from its real options and never re-rolls on 0 or an empty card.
  const roll = (api?: SheetsApi, facts: Fact[] = FACTS, random = Math.random) =>
    show(facts[Math.floor(random() * facts.length)], api, {}, (options) =>
      Object.fromEntries(
        Object.entries(options)
          .filter(([, o]) => o.length)
          .map(([id, o]) => [id, o[Math.floor(random() * o.length)]]),
      ),
    )

  return { card, show, setFilter, roll }
})
