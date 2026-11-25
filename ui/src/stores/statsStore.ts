import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { SheetsApi } from '@/services/google/sheetsApi'
import { columnLetter } from '@/services/sheets/tabWriter'
import { FACTS } from '@/services/stats/facts'
import type { Answer, Columns, Fact } from '@/services/stats/facts'
import { sheetsApi } from '@/stores/authStore'

export type Card =
  | { status: 'idle' }
  | { status: 'loading'; fact: Fact }
  | { status: 'ready'; fact: Fact; answer: Answer }
  | { status: 'empty'; fact: Fact }
  | { status: 'error'; fact: Fact; error: string }

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

  async function show(fact: Fact, api: SheetsApi = sheetsApi) {
    card.value = { status: 'loading', fact }
    try {
      const answer: Answer = fact.compute(await load(api, fact))
      card.value = answer === null ? { status: 'empty', fact } : { status: 'ready', fact, answer }
    } catch (e) {
      card.value = { status: 'error', fact, error: e instanceof Error ? e.message : String(e) }
    }
  }

  // Random never re-rolls on 0 or an empty card.
  const roll = (api?: SheetsApi, facts: Fact[] = FACTS, random = Math.random) =>
    show(facts[Math.floor(random() * facts.length)], api)

  return { card, show, roll }
})
