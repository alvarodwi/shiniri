import { describe, expect, it, vi } from 'vitest'

import { createLoader } from './loader'

import type { SheetsApi } from '@/services/google/sheetsApi'
import type { Fact } from '@/services/stats/facts'

const TAB = { spreadsheetId: 's', tab: 'T' }
const fact: Fact = {
  id: 'f',
  category: 'Gear',
  title: 'Title',
  question: 'Q?',
  reads: [{ tab: TAB, columns: ['b'] }],
  compute: () => '0',
}
const api = (getValues: ReturnType<typeof vi.fn>) => ({ getValues }) as unknown as SheetsApi
const ok = vi.fn(async (_id: string, range: string) =>
  range.endsWith('1:1') ? [['a', 'b']] : [['b'], [1], [2]],
)

describe('createLoader', () => {
  it('reads the header row then the declared column, once per loader', async () => {
    const getValues = vi.fn(ok)
    const load = createLoader()
    expect(await load(api(getValues), fact)).toEqual({ T: { b: [1, 2] } })
    await load(api(getValues), fact)
    expect(getValues.mock.calls.map((c) => c[1])).toEqual(["'T'!1:1", "'T'!B:B"])
  })
  it('does not remember a failed read', async () => {
    const getValues = vi.fn().mockRejectedValueOnce(new Error('boom')).mockImplementation(ok)
    const load = createLoader()
    await expect(load(api(getValues), fact)).rejects.toThrow('boom')
    expect(await load(api(getValues), fact)).toEqual({ T: { b: [1, 2] } })
  })
})
