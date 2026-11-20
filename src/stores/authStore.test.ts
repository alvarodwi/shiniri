import { describe, expect, it, vi } from 'vitest'

import { sheetsApi, useSheetsApi } from './authStore'

import type { SheetsApi } from '@/services/google/sheetsApi'

describe('sheetsApi', () => {
  it('forwards to the implementation installed with useSheetsApi', async () => {
    const fake = {
      getValues: vi.fn(async () => [['x']]),
      batchUpdateValues: vi.fn(async () => ({ updatedRanges: ['r'] })),
      ensureRows: vi.fn(async () => {}),
    } satisfies SheetsApi
    useSheetsApi(fake)
    expect(await sheetsApi.getValues('id', "'T'!A:A", 'UNFORMATTED_VALUE')).toEqual([['x']])
    expect(fake.getValues).toHaveBeenCalledWith('id', "'T'!A:A", 'UNFORMATTED_VALUE')
    expect(await sheetsApi.batchUpdateValues('id', [])).toEqual({ updatedRanges: ['r'] })
  })
})
