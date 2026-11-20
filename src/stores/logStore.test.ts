import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useLogStore } from './logStore'

import type { Spreadsheet } from '@/config/sheets'
import type { SheetsApi } from '@/services/google/sheetsApi'

const audit = (id: string) => ({
  spreadsheetId: id,
  tab: 'AuditLog',
  headers: ['savedAt', 'form', 'ranges', 'rows'],
})
const SHEETS: Spreadsheet[] = [
  { name: 'Progression', audit: audit('p') },
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

describe('logStore', () => {
  it('shows the last 20 entries, newest first', async () => {
    const api = fakeApi({ p: 25, g: 0 })
    const store = useLogStore()
    await store.load(api, SHEETS)
    const { entries } = store.sections[0]
    expect(api.getValues).toHaveBeenCalledWith('p', "'AuditLog'!A7:D26")
    expect(entries).toHaveLength(20)
    expect(entries[0]).toEqual({
      savedAt: '2026-11-26',
      form: 'Anomaly',
      ranges: "'Anomaly'!A26:I26",
      rows: '5',
    })
    expect(entries[19].savedAt).toBe('2026-11-7')
  })

  it('shows every entry when there are fewer than 20, never the header', async () => {
    const store = useLogStore()
    await store.load(fakeApi({ p: 3, g: 0 }), SHEETS)
    expect(store.sections[0].entries.map((e) => e.savedAt)).toEqual([
      '2026-11-4',
      '2026-11-3',
      '2026-11-2',
    ])
  })

  it('reads nothing more from an empty log', async () => {
    const api = fakeApi({ p: 0, g: 0 })
    const store = useLogStore()
    await store.load(api, SHEETS)
    expect(store.sections.map((s) => s.entries)).toEqual([[], []])
    expect(api.getValues).toHaveBeenCalledTimes(2)
  })

  it('keeps one spreadsheet error to its own section', async () => {
    const store = useLogStore()
    await store.load(fakeApi({ p: 2 }), SHEETS)
    expect(store.sections[0]).toMatchObject({ name: 'Progression', error: null })
    expect(store.sections[0].entries).toHaveLength(2)
    expect(store.sections[1]).toMatchObject({ name: 'Gacha', entries: [] })
    expect(store.sections[1].error).toContain('403')
    expect(store.status).toBe('idle')
  })

  it('skips blank rows inside the window', async () => {
    const api = fakeApi({ p: 3, g: 0 })
    const real = api.getValues.getMockImplementation()!
    api.getValues.mockImplementation(async (id, range) =>
      range === "'AuditLog'!A2:D4" ? [entry(2), [], entry(4)] : real(id, range),
    )
    const store = useLogStore()
    await store.load(api, SHEETS)
    expect(store.sections[0].entries.map((e) => e.savedAt)).toEqual(['2026-11-4', '2026-11-2'])
  })

  it('ignores a second load while one is running', async () => {
    const api = fakeApi({ p: 1, g: 1 })
    const store = useLogStore()
    await Promise.all([store.load(api, SHEETS), store.load(api, SHEETS)])
    expect(api.getValues).toHaveBeenCalledTimes(4)
  })
})
