import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useStatsStore } from './statsStore'

import type { SheetsApi } from '@/services/google/sheetsApi'
import type { Fact } from '@/services/stats/facts'

const TAB = { spreadsheetId: 's', tab: 'T' }
const GRID = [
  ['a', 'b', 'c'],
  ['x', 1, 'p'],
  ['y', 2, 'q'],
  ['', 0, ''],
]
const fact = (over: Partial<Fact> = {}): Fact => ({
  id: 'f',
  title: 'Title',
  question: 'Q?',
  reads: [{ tab: TAB, columns: ['b'] }],
  compute: (c) => c.T.b.length,
  ...over,
})
const fakeApi = () =>
  ({
    getValues: vi.fn(async (_id: string, range: string) => {
      const m = range.match(/!(?:(\d+):\d+|([A-Z]):[A-Z])$/)!
      return m[1] ? [GRID[0]] : GRID.map((r) => [r[m[2].charCodeAt(0) - 65]])
    }),
    batchUpdateValues: vi.fn(),
    ensureRows: vi.fn(),
  }) as unknown as SheetsApi & { getValues: ReturnType<typeof vi.fn> }
const ranges = (api: ReturnType<typeof fakeApi>) => api.getValues.mock.calls.map((c) => c[1])

beforeEach(() => setActivePinia(createPinia()))

describe('statsStore', () => {
  it('reads nothing until a fact is chosen, then only the declared column', async () => {
    const api = fakeApi()
    const s = useStatsStore()
    expect(api.getValues).not.toHaveBeenCalled()
    await s.show(fact(), api)
    expect(ranges(api)).toEqual(["'T'!1:1", "'T'!B:B"])
    expect(s.card).toMatchObject({ status: 'ready', answer: 3 })
  })
  it('reads a tab once per session', async () => {
    const api = fakeApi()
    const s = useStatsStore()
    await s.show(fact(), api)
    await s.show(fact({ id: 'g', compute: () => 7 }), api)
    expect(api.getValues).toHaveBeenCalledTimes(2)
  })
  it('shows 0 as an answer and null as no answer', async () => {
    const s = useStatsStore()
    await s.show(fact({ compute: () => 0 }), fakeApi())
    expect(s.card).toMatchObject({ status: 'ready', answer: 0 })
    await s.show(fact({ compute: () => null }), fakeApi())
    expect(s.card.status).toBe('empty')
  })
  it('errors on a missing header, naming tab and header', async () => {
    const s = useStatsStore()
    await s.show(fact({ reads: [{ tab: TAB, columns: ['zzz'] }] }), fakeApi())
    expect(s.card).toMatchObject({ status: 'error', error: 'Tab T has no header "zzz".' })
  })
  it('does not remember a failed read', async () => {
    const api = fakeApi()
    api.getValues.mockRejectedValueOnce(new Error('rate limit'))
    const s = useStatsStore()
    await s.show(fact(), api)
    expect(s.card).toMatchObject({ status: 'error', error: 'rate limit' })
    await s.show(fact(), api)
    expect(s.card.status).toBe('ready')
  })
  it('rolls a fact without re-rolling on 0', async () => {
    const s = useStatsStore()
    await s.roll(fakeApi(), [fact({ compute: () => 0 })], () => 0.99)
    expect(s.card).toMatchObject({ status: 'ready', answer: 0 })
  })
  describe('filters', () => {
    const filtered = (over: Partial<Fact> = {}) =>
      fact({
        question: 'Q {f}?',
        filters: [{ id: 'f', label: 'F', options: (c) => ['any', ...c.T.b.map(String)] }],
        compute: (_c, v) => (v.f === '0' ? 0 : v.f === 'none' ? null : Number(v.f) || 9),
        ...over,
      })
    it('waits for a choice: no default, options derived from data', async () => {
      const s = useStatsStore()
      await s.show(filtered(), fakeApi())
      expect(s.card).toMatchObject({
        status: 'pending',
        values: {},
        options: { f: ['any', '1', '2', '0'] },
      })
    })
    it('recomputes on change without a new read', async () => {
      const api = fakeApi()
      const s = useStatsStore()
      await s.show(filtered(), api)
      const reads = api.getValues.mock.calls.length
      await s.setFilter('f', '2', api)
      expect(s.card).toMatchObject({ status: 'ready', answer: 2, values: { f: '2' } })
      expect(api.getValues).toHaveBeenCalledTimes(reads)
    })
    it('rolls filter values from the real options with the injected random', async () => {
      const s = useStatsStore()
      await s.roll(fakeApi(), [filtered()], () => 0.5) // 4 options -> index 2
      expect(s.card).toMatchObject({ status: 'ready', values: { f: '2' }, answer: 2 })
    })
    it('does not re-roll on 0 or empty after a filter roll', async () => {
      const s = useStatsStore()
      await s.roll(fakeApi(), [filtered()], () => 0.99) // last option '0' -> answer 0
      expect(s.card).toMatchObject({ status: 'ready', answer: 0 })
      await s.roll(fakeApi(), [filtered({ compute: () => null })], () => 0)
      expect(s.card.status).toBe('empty')
    })
  })
})
