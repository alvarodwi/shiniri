import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { hasMore, useLogStore } from './logStore'

import type { Spreadsheet } from '@/config/sheets'
import type { SheetsApi } from '@/services/google/sheetsApi'

const audit = (id: string) => ({
  spreadsheetId: id,
  tab: 'AuditLog',
  headers: ['savedAt', 'form', 'ranges', 'rows'],
})
const SHEETS: Spreadsheet[] = [
  { name: 'Journal', audit: audit('p') },
  { name: 'Gacha', audit: audit('g') },
]

const entry = (n: number) => [`2026-11-${n}`, 'Anomaly', `'Anomaly'!A${n}:I${n}`, '5']

function fakeApi(entries: Record<string, number>) {
  return {
    getValues: vi.fn(async (id: string, range: string) => {
      const count = entries[id]
      if (count === undefined) throw new Error(`Sheets API 403: no access to ${id}`)
      if (range === "'AuditLog'!A:A")
        return [['savedAt'], ...Array.from({ length: count }, (_, i) => [`2026-11-${i + 2}`])]
      const m = range.match(/A(\d+):D(\d+)$/)!
      return Array.from({ length: +m[2] - +m[1] + 1 }, (_, i) => entry(+m[1] + i))
    }),
    batchUpdateValues: vi.fn(),
    ensureRows: vi.fn(),
  } satisfies SheetsApi
}

beforeEach(() => setActivePinia(createPinia()))

const ranges = (api: ReturnType<typeof fakeApi>) =>
  api.getValues.mock.calls.map(([id, range]) => `${id}:${range}`)
describe('logStore', () => {
  it('opens one sheet only, newest 20 first', async () => {
    const api = fakeApi({ p: 25, g: 5 })
    const store = useLogStore()
    await store.open('Journal', api, SHEETS)
    const { entries } = store.sections[0]
    expect(ranges(api)).toEqual(["p:'AuditLog'!A:A", "p:'AuditLog'!A7:D26"])
    expect(entries).toHaveLength(20)
    expect(entries[0]).toEqual({
      savedAt: '2026-11-26',
      form: 'Anomaly',
      ranges: "'Anomaly'!A26:I26",
      rows: '5',
    })
    expect(entries[19].savedAt).toBe('2026-11-7')
    expect(store.sections[1]).toMatchObject({ name: 'Gacha', loaded: false, entries: [] })
  })
  it('pages older chunks down to row 2, never the header', async () => {
    const api = fakeApi({ p: 45, g: 0 })
    const store = useLogStore()
    await store.open('Journal', api, SHEETS)
    expect(hasMore(store.sections[0])).toBe(true)
    await store.more('Journal', api, SHEETS)
    await store.more('Journal', api, SHEETS)
    const s = store.sections[0]
    expect(ranges(api)).toEqual([
      "p:'AuditLog'!A:A",
      "p:'AuditLog'!A27:D46",
      "p:'AuditLog'!A7:D26",
      "p:'AuditLog'!A2:D6",
    ])
    expect(s.entries).toHaveLength(45)
    expect(s.entries[44].savedAt).toBe('2026-11-2')
    expect(hasMore(s)).toBe(false)
    await store.more('Journal', api, SHEETS)
    expect(api.getValues).toHaveBeenCalledTimes(4)
  })
  it('shows every entry when there are fewer than 20, never the header', async () => {
    const store = useLogStore()
    await store.open('Journal', fakeApi({ p: 3, g: 0 }), SHEETS)
    expect(store.sections[0].entries.map((e) => e.savedAt)).toEqual([
      '2026-11-4',
      '2026-11-3',
      '2026-11-2',
    ])
    expect(hasMore(store.sections[0])).toBe(false)
  })
  it('reads nothing more from an empty log', async () => {
    const api = fakeApi({ p: 0, g: 0 })
    const store = useLogStore()
    await store.open('Journal', api, SHEETS)
    expect(store.sections[0]).toMatchObject({ entries: [], loaded: true })
    expect(hasMore(store.sections[0])).toBe(false)
    expect(api.getValues).toHaveBeenCalledTimes(1)
  })
  it('keeps one spreadsheet error to its own section', async () => {
    const store = useLogStore()
    const api = fakeApi({ p: 2 })
    await store.open('Journal', api, SHEETS)
    await store.open('Gacha', api, SHEETS)
    expect(store.sections[0]).toMatchObject({ name: 'Journal', error: null })
    expect(store.sections[0].entries).toHaveLength(2)
    expect(store.sections[1]).toMatchObject({ name: 'Gacha', entries: [], loaded: false })
    expect(store.sections[1].error).toContain('403')
  })
  it('skips blank rows inside the window', async () => {
    const api = fakeApi({ p: 3, g: 0 })
    const real = api.getValues.getMockImplementation()!
    api.getValues.mockImplementation(async (id, range) =>
      range === "'AuditLog'!A2:D4" ? [entry(2), [], entry(4)] : real(id, range),
    )
    const store = useLogStore()
    await store.open('Journal', api, SHEETS)
    expect(store.sections[0].entries.map((e) => e.savedAt)).toEqual(['2026-11-4', '2026-11-2'])
  })
  it('ignores open on a loaded or busy sheet and a second more while one runs', async () => {
    const api = fakeApi({ p: 45, g: 0 })
    const store = useLogStore()
    await Promise.all([store.open('Journal', api, SHEETS), store.open('Journal', api, SHEETS)])
    expect(api.getValues).toHaveBeenCalledTimes(2)
    await store.open('Journal', api, SHEETS)
    expect(api.getValues).toHaveBeenCalledTimes(2)
    await Promise.all([store.more('Journal', api, SHEETS), store.more('Journal', api, SHEETS)])
    expect(api.getValues).toHaveBeenCalledTimes(3)
    expect(store.sections[0].entries).toHaveLength(40)
  })
  it('keeps loaded entries when an older chunk fails, and can retry', async () => {
    const api = fakeApi({ p: 45, g: 0 })
    const real = api.getValues.getMockImplementation()!
    let fail = true
    api.getValues.mockImplementation(async (id, range) => {
      if (fail && range === "'AuditLog'!A7:D26") throw new Error('Sheets API 500')
      return real(id, range)
    })
    const store = useLogStore()
    await store.open('Journal', api, SHEETS)
    await store.more('Journal', api, SHEETS)
    expect(store.sections[0].error).toContain('500')
    expect(store.sections[0].entries).toHaveLength(20)
    fail = false
    await store.more('Journal', api, SHEETS)
    expect(store.sections[0].error).toBeNull()
    expect(store.sections[0].entries).toHaveLength(40)
  })
  it('reset clears both sections so the next open rereads', async () => {
    const api = fakeApi({ p: 3, g: 3 })
    const store = useLogStore()
    await store.open('Journal', api, SHEETS)
    await store.open('Gacha', api, SHEETS)
    store.reset()
    expect(store.sections.map((s) => [s.entries.length, s.loaded])).toEqual([
      [0, false],
      [0, false],
    ])
    await store.open('Journal', api, SHEETS)
    expect(store.sections[0].entries).toHaveLength(3)
  })
})
