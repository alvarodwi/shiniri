import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { usePickerStore } from './pickerStore'
import { useStatsStore } from './statsStore'

import type { SheetsApi } from '@/services/google/sheetsApi'
import type { Columns, Fact } from '@/services/stats/facts'

const TAB = { spreadsheetId: 's', tab: 'T' }
const GRID = [
  ['a', 'b', 'c'],
  ['x', 1, 'p'],
  ['y', 2, 'q'],
  ['', 0, ''],
]
const fact = (over: Partial<Fact> = {}): Fact => ({
  id: 'f',
  category: 'Gear',
  title: 'Title',
  question: 'Q?',
  reads: [{ tab: TAB, columns: ['b'] }],
  compute: (c) => String(c.T.b.length),
  ...over,
})
const fakeApi = (grid = GRID) =>
  ({
    getValues: vi.fn(async (_id: string, range: string) => {
      const m = range.match(/!(?:(\d+):\d+|([A-Z]):[A-Z])$/)!
      return m[1] ? [grid[0]] : grid.map((r) => [r[m[2].charCodeAt(0) - 65]])
    }),
    batchUpdateValues: vi.fn(),
    ensureRows: vi.fn(),
  }) as unknown as SheetsApi & { getValues: ReturnType<typeof vi.fn> }

beforeEach(() => setActivePinia(createPinia()))

describe('pickerStore', () => {
  describe('pick flow', () => {
    const filter = { id: 'f', label: 'F', options: (c: Columns) => c.T.b.map(String) }
    const inA = fact({ id: 'a', category: 'Gear', filters: [filter], compute: (_c, v) => v.f })
    const inB = fact({ id: 'b', category: 'Raids', compute: () => '5' })
    const facts = [inA, inB]

    it('walks category, fact, filter, then ends on a card', async () => {
      const api = fakeApi()
      const s = usePickerStore()
      const stats = useStatsStore()
      s.openPicker()
      expect(s.sheet).toEqual({ step: 'category' })
      s.pickCategory('Gear')
      expect(s.sheet).toEqual({ step: 'fact' })
      await s.pickFact(inA, api)
      expect(s.sheet).toEqual({ step: 'f' })
      await s.pickFilter('f', '2', api)
      expect(s.sheet).toBeNull()
      expect(stats.card).toMatchObject({ status: 'ready', answer: '2' })
    })
    it('ends on a card with all steps random', async () => {
      const s = usePickerStore()
      const stats = useStatsStore()
      s.openPicker()
      const api = fakeApi()
      s.pickCategory(undefined, facts, () => 0)
      await s.pickFact(undefined, api, facts, () => 0)
      await s.pickFilter('f', undefined, api, () => 0)
      expect(s.sheet).toBeNull()
      expect(stats.card).toMatchObject({ status: 'ready', values: { f: '1' }, answer: '1' })
    })
    it('random category limits the fact step to that category', async () => {
      const s = usePickerStore()
      const stats = useStatsStore()
      s.openPicker()
      s.pickCategory(undefined, facts, () => 0.99) // last category: Raids
      expect(s.category).toBe('Raids')
      await s.pickFact(undefined, fakeApi(), facts, () => 0)
      expect(stats.card).toMatchObject({ fact: { id: 'b' }, status: 'ready', answer: '5' })
    })
    it('a fact without filters closes the sheet on its card', async () => {
      const s = usePickerStore()
      const stats = useStatsStore()
      s.openPicker()
      await s.pickFact(inB, fakeApi())
      expect(s.sheet).toBeNull()
      expect(stats.card.status).toBe('ready')
    })
    it('loads the fact tab when the fact is chosen, not before', async () => {
      const api = fakeApi()
      const s = usePickerStore()
      const stats = useStatsStore()
      s.openPicker()
      s.pickCategory('Gear')
      expect(api.getValues).not.toHaveBeenCalled()
      await s.pickFact(inA, api)
      expect(api.getValues).toHaveBeenCalled()
      expect(stats.card).toMatchObject({ status: 'pending', options: { f: ['1', '2', '0'] } })
    })
    it('a chip reopens the sheet at its step; changing it recomputes', async () => {
      const api = fakeApi()
      const s = usePickerStore()
      const stats = useStatsStore()
      await stats.show(inA, api, { f: '1' })
      s.editFilter('f')
      expect(s.sheet).toEqual({ step: 'f' })
      await s.pickFilter('f', '2', api)
      expect(s.sheet).toBeNull()
      expect(stats.card).toMatchObject({ status: 'ready', answer: '2' })
    })
    it('a roll ignores the picked category', async () => {
      const s = usePickerStore()
      const stats = useStatsStore()
      s.pickCategory('Gear')
      await stats.roll(fakeApi(), facts, () => 0.99)
      expect(stats.card).toMatchObject({ fact: { id: 'b' } })
    })
    it('does not reopen a sheet the viewer closed while the fact loaded', async () => {
      const s = usePickerStore()
      s.openPicker()
      const p = s.pickFact(inA, fakeApi())
      s.closePicker()
      await p
      expect(s.sheet).toBeNull()
    })
    it('closes the sheet when the fact fails to load', async () => {
      const api = fakeApi()
      api.getValues.mockRejectedValue(new Error('boom'))
      const s = usePickerStore()
      const stats = useStatsStore()
      s.openPicker()
      await s.pickFact(inA, api)
      expect(s.sheet).toBeNull()
      expect(stats.card.status).toBe('error')
    })
  })
})
