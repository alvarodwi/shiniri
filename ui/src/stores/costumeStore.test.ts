import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useCostumeStore } from './costumeStore'

import { COSTUME_DATABASE_TAB } from '@/config/sheets'
import type { SheetsApi } from '@/services/google/sheetsApi'

const header = [...COSTUME_DATABASE_TAB.headers]
const row = ['130007', 'Marian: Queen', 'Last Affection', 'Unique', 'Costume Gacha', 'x', 'TRUE']

const apiWith = (getValues: SheetsApi['getValues']) =>
  ({ getValues, batchUpdateValues: vi.fn(), ensureRows: vi.fn() }) satisfies SheetsApi

beforeEach(() => setActivePinia(createPinia()))

describe('costumeStore', () => {
  it('load fills costumes and returns to idle', async () => {
    const store = useCostumeStore()
    await store.load(apiWith(async () => [header, row]))
    expect(store.costumes).toHaveLength(1)
    expect(store.status).toBe('idle')
    expect(store.error).toBeNull()
  })

  it('load records the error message and keeps status idle when the read fails', async () => {
    const store = useCostumeStore()
    await store.load(
      apiWith(async () => {
        throw new Error('Sheets API 403')
      }),
    )
    expect(store.error).toBe('Sheets API 403')
    expect(store.status).toBe('idle')
  })

  it('load ignores a second call while loading', async () => {
    const getValues = vi.fn(async () => [header, row])
    const store = useCostumeStore()
    await Promise.all([store.load(apiWith(getValues)), store.load(apiWith(getValues))])
    expect(getValues).toHaveBeenCalledTimes(1)
  })
})
