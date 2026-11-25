import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useStatsStore } from './statsStore'

import type { SheetsApi } from '@/services/google/sheetsApi'
import { FACTS } from '@/services/stats/facts'
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
  category: 'A',
  title: 'Title',
  question: 'Q?',
  reads: [{ tab: TAB, columns: ['b'] }],
  compute: (c) => c.T.b.length,
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
  it('a missing header errors only that fact; another fact still answers', async () => {
    const api = fakeApi()
    const s = useStatsStore()
    await s.show(fact({ reads: [{ tab: TAB, columns: ['zzz'] }] }), api)
    expect(s.card.status).toBe('error')
    await s.show(fact(), api)
    expect(s.card).toMatchObject({ status: 'ready', answer: 3 })
  })
  it('finds columns by header name when they are reordered or inserted', async () => {
    const grid = [
      ['new', 'c', 'b', 'a'],
      ['n', 'p', 5, 'x'],
      ['n', 'q', 6, 'y'],
    ]
    const api = fakeApi(grid)
    const s = useStatsStore()
    await s.show(fact({ compute: (c) => c.T.b.reduce((a: number, v) => a + Number(v), 0) }), api)
    expect(s.card).toMatchObject({ status: 'ready', answer: 11 })
  })
  it('a failed read is an error, never "empty" or 0', async () => {
    const api = fakeApi()
    api.getValues.mockRejectedValue(new Error('boom'))
    const s = useStatsStore()
    await s.show(fact({ compute: () => 0 }), api)
    expect(s.card.status).toBe('error')
    expect(s.card).not.toHaveProperty('answer')
  })
  it('retry after a failed read loads the tab and shows the answer', async () => {
    const api = fakeApi()
    api.getValues.mockRejectedValueOnce(new Error('rate limit'))
    const s = useStatsStore()
    await s.show(fact(), api)
    expect(s.card.status).toBe('error')
    if (s.card.status !== 'error') return
    await s.show(s.card.fact, api, s.card.values) // what the Retry button does
    expect(s.card).toMatchObject({ status: 'ready', answer: 3 })
  })
  it('retry after a failed random roll picks the filters again', async () => {
    const api = fakeApi()
    api.getValues.mockRejectedValueOnce(new Error('rate limit'))
    const s = useStatsStore()
    const f = fact({
      question: 'Q {f}?',
      filters: [{ id: 'f', label: 'F', options: (c) => c.T.b.map(String) }],
      compute: (_c, v) => Number(v.f),
    })
    await s.roll(api, [f], () => 0.5) // 3 options -> index 1
    expect(s.card.status).toBe('error')
    await s.retry(api)
    expect(s.card).toMatchObject({ status: 'ready', values: { f: '2' }, answer: 2 })
  })
  it('does not retry a rate limit by itself', async () => {
    const api = fakeApi()
    api.getValues.mockRejectedValue(new Error('Google rate limit hit.'))
    const s = useStatsStore()
    vi.useFakeTimers()
    await s.show(fact(), api)
    await vi.advanceTimersByTimeAsync(60_000)
    vi.useRealTimers()
    expect(api.getValues).toHaveBeenCalledTimes(1)
    expect(s.card).toMatchObject({ status: 'error', error: 'Google rate limit hit.' })
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
  describe('pick flow', () => {
    const filter = { id: 'f', label: 'F', options: (c: Columns) => c.T.b.map(String) }
    const inA = fact({ id: 'a', category: 'A', filters: [filter], compute: (_c, v) => Number(v.f) })
    const inB = fact({ id: 'b', category: 'B', compute: () => 5 })
    const facts = [inA, inB]

    it('walks category, fact, filter, then ends on a card', async () => {
      const api = fakeApi()
      const s = useStatsStore()
      s.openPicker()
      expect(s.sheet).toEqual({ step: 'category' })
      s.pickCategory('A')
      expect(s.sheet).toEqual({ step: 'fact' })
      await s.pickFact(inA, api)
      expect(s.sheet).toEqual({ step: 'f' })
      await s.pickFilter('f', '2', api)
      expect(s.sheet).toBeNull()
      expect(s.card).toMatchObject({ status: 'ready', answer: 2 })
    })
    it('ends on a card with all steps random', async () => {
      const s = useStatsStore()
      s.openPicker()
      const api = fakeApi()
      s.pickCategory(undefined, facts, () => 0)
      await s.pickFact(undefined, api, facts, () => 0)
      await s.pickFilter('f', undefined, api, () => 0)
      expect(s.sheet).toBeNull()
      expect(s.card).toMatchObject({ status: 'ready', values: { f: '1' }, answer: 1 })
    })
    it('random category limits the fact step to that category', async () => {
      const s = useStatsStore()
      s.openPicker()
      s.pickCategory(undefined, facts, () => 0.99) // last category: B
      expect(s.category).toBe('B')
      await s.pickFact(undefined, fakeApi(), facts, () => 0)
      expect(s.card).toMatchObject({ fact: { id: 'b' }, status: 'ready', answer: 5 })
    })
    it('a fact without filters closes the sheet on its card', async () => {
      const s = useStatsStore()
      s.openPicker()
      await s.pickFact(inB, fakeApi())
      expect(s.sheet).toBeNull()
      expect(s.card.status).toBe('ready')
    })
    it('loads the fact tab when the fact is chosen, not before', async () => {
      const api = fakeApi()
      const s = useStatsStore()
      s.openPicker()
      s.pickCategory('A')
      expect(api.getValues).not.toHaveBeenCalled()
      await s.pickFact(inA, api)
      expect(api.getValues).toHaveBeenCalled()
      expect(s.card).toMatchObject({ status: 'pending', options: { f: ['1', '2', '0'] } })
    })
    it('a chip reopens the sheet at its step; changing it recomputes', async () => {
      const api = fakeApi()
      const s = useStatsStore()
      await s.show(inA, api, { f: '1' })
      s.editFilter('f')
      expect(s.sheet).toEqual({ step: 'f' })
      await s.pickFilter('f', '2', api)
      expect(s.sheet).toBeNull()
      expect(s.card).toMatchObject({ status: 'ready', answer: 2 })
    })
    it('a roll ignores the picked category', async () => {
      const s = useStatsStore()
      s.pickCategory('A')
      await s.roll(fakeApi(), facts, () => 0.99)
      expect(s.card).toMatchObject({ fact: { id: 'b' } })
    })
    it('does not reopen a sheet the viewer closed while the fact loaded', async () => {
      const s = useStatsStore()
      s.openPicker()
      const p = s.pickFact(inA, fakeApi())
      s.closePicker()
      await p
      expect(s.sheet).toBeNull()
    })
    it('closes the sheet when the fact fails to load', async () => {
      const api = fakeApi()
      api.getValues.mockRejectedValue(new Error('boom'))
      const s = useStatsStore()
      s.openPicker()
      await s.pickFact(inA, api)
      expect(s.sheet).toBeNull()
      expect(s.card.status).toBe('error')
    })
  })
  describe('range presets', () => {
    const rangeFact = FACTS.find((f) => f.id === 'anomaly-runs-by-range')!
    const serial = (iso: string) => (Date.parse(iso) - Date.UTC(1899, 11, 30)) / 86_400_000
    const dates = (isos: string[], asSerial = false) =>
      fakeApi([['date'], ...isos.map((d) => [asSerial ? serial(d) : d]), ['']])
    const count = async (range: string, now: string, api = dates(DAYS)) => {
      setActivePinia(createPinia()) // fresh tab cache per call
      const s = useStatsStore()
      await s.show(rangeFact, api, { range }, undefined, new Date(now))
      return s.card.status === 'ready' ? s.card.answer : s.card
    }
    // Wed 2026-11-25 is the game day below. Week: Mon 11-23..Sun 11-29; last week 11-16..11-22.
    const DAYS = [
      '2026-10-31',
      '2026-11-01',
      '2026-11-15',
      '2026-11-16',
      '2026-11-22',
      '2026-11-23',
      '2026-11-25',
    ]
    const NOW = '2026-11-25T12:00:00Z'

    it('resolves this week, last week, this month, last month', async () => {
      expect(await count('this week', NOW)).toBe(2)
      expect(await count('last week', NOW)).toBe(2)
      expect(await count('this month', NOW)).toBe(6)
      expect(await count('last month', NOW)).toBe(1)
      expect(await count('any time', NOW)).toBe(7)
    })
    it('falls on the previous game day between midnight UTC and the 20:00 UTC reset', async () => {
      const api = dates(['2026-11-22', '2026-11-23'])
      // Mon 11-23 00:30Z is still game day Sun 11-22 -> "this week" is Mon 11-16..Sun 11-22.
      expect(await count('this week', '2026-11-23T00:30:00Z', api)).toBe(1)
      // After the reset at 20:00Z it is Mon 11-23 -> only 11-23 is this week.
      expect(await count('this week', '2026-11-22T20:00:00Z', api)).toBe(1)
      expect(await count('last week', '2026-11-22T19:59:59Z', api)).toBe(0)
    })
    it('crosses month and year boundaries', async () => {
      const api = dates(['2025-12-31', '2026-01-01', '2026-01-04', '2026-01-05'])
      // Game day Mon 2026-01-05: last week is Mon 2025-12-29..Sun 2026-01-04.
      expect(await count('last week', '2026-01-05T10:00:00Z', api)).toBe(3)
      expect(await count('last month', '2026-01-05T10:00:00Z', api)).toBe(1)
      expect(await count('this month', '2026-01-05T10:00:00Z', api)).toBe(3)
      // Game day Tue 2026-03-31 -> last month is February.
      expect(
        await count('last month', '2026-03-31T10:00:00Z', dates(['2026-02-28', '2026-03-01'])),
      ).toBe(1)
    })
    it('treats serial-number and ISO-text date cells the same', async () => {
      for (const r of ['this week', 'last week', 'this month', 'last month', 'any time'])
        expect(await count(r, NOW, dates(DAYS, true))).toBe(await count(r, NOW, dates(DAYS)))
    })
    it('rolls a range preset like any other option', async () => {
      const s = useStatsStore()
      await s.roll(dates(DAYS), [rangeFact], () => 0.5, new Date(NOW)) // 5 options -> index 2
      expect(s.card).toMatchObject({ status: 'ready', values: { range: 'last week' }, answer: 2 })
    })
  })
})
