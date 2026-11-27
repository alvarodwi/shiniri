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

    const second = { id: 'g', label: 'G', options: ['x', 'y'] }
    const two = fact({ id: 't', filters: [filter, second], compute: (_c, v) => v.f + v.g })

    it('ends the sheet at the fact, then opens each unchosen filter in turn', async () => {
      const api = fakeApi()
      const s = usePickerStore()
      const stats = useStatsStore()
      s.openPicker()
      expect(s.sheet).toEqual({ step: 'category' })
      s.pickCategory('Gear')
      expect(s.sheet).toEqual({ step: 'fact' })
      await s.pickFact(two, api)
      expect(s.sheet).toBeNull()
      expect(s.openFilter).toBe('f')
      await s.pickFilter('f', '2', api)
      expect(s.openFilter).toBe('g')
      await s.pickFilter('g', 'x', api)
      expect(s.openFilter).toBeNull()
      expect(stats.card).toMatchObject({ status: 'ready', answer: '2x' })
    })
    it('ends on a card with all steps random', async () => {
      const s = usePickerStore()
      const stats = useStatsStore()
      s.openPicker()
      const api = fakeApi()
      s.pickCategory(undefined, facts, () => 0)
      await s.pickFact(undefined, api, facts, () => 0)
      await s.pickFilter('f', undefined, api, () => 0)
      expect(s.openFilter).toBeNull()
      expect(stats.card).toMatchObject({ status: 'ready', values: { f: '1' }, answer: '1' })
    })
    it('stays closed after Close until a chip reopens it', async () => {
      const api = fakeApi()
      const s = usePickerStore()
      await s.pickFact(two, api)
      s.closeFilter()
      expect(s.openFilter).toBeNull()
      s.toggleFilter('g')
      expect(s.openFilter).toBe('g')
      s.toggleFilter('g')
      expect(s.openFilter).toBeNull()
    })
    it('a new fact or a roll forgets the closed or reopened panel', async () => {
      const api = fakeApi()
      const s = usePickerStore()
      await s.pickFact(two, api)
      s.closeFilter()
      await s.pickFact(two, api)
      expect(s.openFilter).toBe('f')
      s.toggleFilter('g')
      await s.roll(api, [inB])
      expect(s.openFilter).toBeNull()
    })
    it('opens the first filter after retrying a failed load', async () => {
      const api = fakeApi()
      api.getValues.mockRejectedValueOnce(new Error('boom'))
      const s = usePickerStore()
      const stats = useStatsStore()
      await s.pickFact(inA, api)
      expect(s.openFilter).toBeNull()
      await stats.retry(api)
      expect(s.openFilter).toBe('f')
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
    it('a fact without filters shows its answer', async () => {
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
    it('a chip reopens a chosen filter; changing it recomputes and closes', async () => {
      const api = fakeApi()
      const s = usePickerStore()
      const stats = useStatsStore()
      await stats.show(inA, api, { f: '1' })
      expect(s.openFilter).toBeNull()
      s.toggleFilter('f')
      expect(s.openFilter).toBe('f')
      await s.pickFilter('f', '2', api)
      expect(s.openFilter).toBeNull()
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
