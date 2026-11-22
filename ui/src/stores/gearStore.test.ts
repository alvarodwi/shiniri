import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useGearStore } from './gearStore'

import { FURNACE_TAB, GEAR_TAB } from '@/config/sheets'
import type { SheetsApi } from '@/services/google/sheetsApi'
import type { GearItem } from '@/types/gear'

const DATE = '2026-11-19'

function fakeApi() {
  const values: Record<string, string[][]> = {
    "'AuditLog'!A1:D1": [['savedAt', 'form', 'ranges', 'rows']],
    "'AuditLog'!A:A": [['savedAt']],
    "'Gear'!A1:E1": [[...GEAR_TAB.headers]],
    "'Gear'!A:A": [['date'], ['x']],
    "'Furnace'!A1:E1": [[...FURNACE_TAB.headers]],
    "'Furnace'!A:A": [['date'], ['x'], ['x']],
  }
  return {
    getValues: vi.fn(async (_id: string, range: string) => values[range] ?? []),
    ensureRows: vi.fn<SheetsApi['ensureRows']>(async () => {}),
    batchUpdateValues: vi.fn<SheetsApi['batchUpdateValues']>(async (_id, data) => ({
      updatedRanges: data.map((d) => d.range),
    })),
  } satisfies SheetsApi
}

const pick: GearItem = { manufacturer: 'Tetra', classType: 'Attacker', slot: 'Gloves' }
const sac: GearItem = { manufacturer: 'Abnormal', classType: 'Supporter', slot: 'Boots' }

function setup() {
  const store = useGearStore()
  store.date = DATE
  return { store, api: fakeApi() }
}

beforeEach(() => setActivePinia(createPinia()))

describe('gearStore', () => {
  it('saves an arms opening as one Gear row per item', async () => {
    const { store, api } = setup()
    store.setCount(3)
    store.activeCards.forEach((_, i) => store.setCard(i, pick))
    expect(store.canSave).toBe(true)
    await store.save(api)
    expect(api.batchUpdateValues).toHaveBeenCalledOnce()
    const data = api.batchUpdateValues.mock.calls[0][1]
    expect(data.map((d) => d.range)).toEqual(["'Gear'!A3:E5", "'AuditLog'!A2:D2"])
    expect(data[0].rows[0]).toEqual([DATE, 'Manufacturer Arms', 'Attacker', 'Tetra', 'Gloves'])
  })

  it('saves furnace attempts to Gear and Furnace in one write', async () => {
    const { store, api } = setup()
    store.setSource('furnace')
    store.setCard(0, { target: 'Pilgrim', sacrifices: [sac, sac] })
    store.setCard(0, { classType: 'Defender', slot: 'Torso' })
    await store.save(api)
    const data = api.batchUpdateValues.mock.calls[0][1]
    expect(data.map((d) => d.range)).toEqual([
      "'Gear'!A3:E3",
      "'Furnace'!A4:E4",
      "'AuditLog'!A2:D2",
    ])
    expect(data[1].rows[0]).toEqual([
      DATE,
      'Pilgrim',
      'Abnormal-Supporter-Boots',
      'Abnormal-Supporter-Boots',
      'Pilgrim-Defender-Torso',
    ])
  })

  it('clears the cards and keeps the source after saving', async () => {
    const { store, api } = setup()
    store.setSource('box')
    store.setCount(2)
    store.activeCards.forEach((_, i) => store.setCard(i, pick))
    await store.save(api)
    expect(store.status).toBe('saved')
    expect(store.source).toBe('box')
    expect(store.count).toBe(1)
    expect(store.cards.every((c) => c.classType === null)).toBe(true)
    expect(store.lastSaved).toEqual([{ updatedRange: "'Gear'!A3:E4", count: 2 }])
  })

  it('saves only the active cards and shows blanks when the count grows again', async () => {
    const { store, api } = setup()
    store.setCount(3)
    store.activeCards.forEach((_, i) => store.setCard(i, pick))
    store.setCount(1)
    expect(store.activeCards).toHaveLength(1)
    store.setCount(3)
    expect(store.activeCards[1].classType).toBe(null)
    store.setCount(1)
    await store.save(api)
    expect(api.batchUpdateValues.mock.calls[0][1][0].rows).toHaveLength(1)
  })

  it('clamps the count to 1..10', () => {
    const { store } = setup()
    store.setCount(11)
    expect(store.count).toBe(10)
    store.setCount(0)
    expect(store.count).toBe(1)
    store.setCount(Number.NaN)
    expect(store.count).toBe(1)
  })

  it('moves the furnace result to a new target, keeping its class', () => {
    const { store } = setup()
    store.setSource('furnace')
    store.setCard(0, { classType: 'Defender', slot: 'Torso' })
    store.setCard(0, { target: 'Pilgrim' })
    expect(store.cards[0]).toMatchObject({ manufacturer: 'Pilgrim', classType: 'Defender' })
    store.setCard(0, { target: 'Tetra' })
    expect(store.cards[0]).toMatchObject({ manufacturer: 'Tetra', slot: 'Torso' })
  })

  it('cannot save incomplete cards', () => {
    const { store } = setup()
    store.setCard(0, { manufacturer: 'Tetra', classType: 'Attacker' })
    expect(store.canSave).toBe(false)
  })

  it('keeps the cards and shows the error when the write fails', async () => {
    const { store, api } = setup()
    store.setCard(0, pick)
    api.batchUpdateValues.mockRejectedValueOnce(new Error('Sheets API 500: boom'))
    await store.save(api)
    expect(store.status).toBe('error')
    expect(store.error).toContain('boom')
    expect(store.cards[0]).toMatchObject(pick)
  })

  it('clears the last success line when a later save fails', async () => {
    const { store, api } = setup()
    store.setCard(0, pick)
    await store.save(api)
    store.setCard(0, pick)
    api.batchUpdateValues.mockRejectedValueOnce(new Error('Sheets API 500: boom'))
    await store.save(api)
    expect(store.lastSaved).toEqual([])
  })
})
