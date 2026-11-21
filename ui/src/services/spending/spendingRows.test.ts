import { describe, expect, it } from 'vitest'

import {
  lastMonthly,
  monthOf,
  packageName,
  pastNames,
  suggestedPlatform,
  toHistory,
  toRow,
} from './spendingRows'

import type { SpendingEntry } from '@/types/spending'

const entry = (over: Partial<SpendingEntry> = {}): SpendingEntry => ({
  date: '2026-11-22',
  type: '',
  name: '',
  ssr: '',
  month: '',
  priceIdr: '',
  priceUsd: '',
  platform: '',
  notes: '',
  ...over,
})

const history = toHistory([
  [46000, '30-day supply', 'Monthly Pass', 82140, 4.99, 'GooglePlay', ''],
  [46001, 'Isabel Event Pass (November)', 'Event Pass, Costume', 314333, 19.99, 'Apple', ''],
  [46002, 'T.T.S Summer Pack V.1', 'Music Pack', 89000, 4.99, 'Apple', ''],
  [46003, 'Grave Event Pass (May)', 'Event Pass', 334721, 19.99, 'DebitCard', ''],
  [46004, '30-day supply', 'Monthly Pass', 79000, 4.99, 'RazerGold', 'from midas buy'],
  [46005, 'T.T.S Summer Pack V.1', 'Music Pack', 89000, 4.99, 'Apple'],
  ['', '', '', '', '', '', ''],
])

describe('packageName', () => {
  it('builds each type its own way', () => {
    expect(packageName(entry({ type: 'Monthly Pass', name: 'ignored' }))).toBe('30-day supply')
    expect(packageName(entry({ type: 'Event Pass', ssr: 'Isabel' }))).toBe(
      'Isabel Event Pass (November)',
    )
    expect(packageName(entry({ type: 'Mission Pass', ssr: 'Dolla', month: 'March' }))).toBe(
      'Dolla Mission Pass (March)',
    )
    expect(packageName(entry({ type: 'Costume Gacha', ssr: 'Snow White: Heavy Arms' }))).toBe(
      'Snow White: Heavy Arms Costume Gacha',
    )
    expect(packageName(entry({ type: 'Costume', ssr: 'Centi' }))).toBe('Centi Costume')
    expect(packageName(entry({ type: 'Music Pack', name: ' T.T.S Pack V.1 ' }))).toBe(
      'T.T.S Pack V.1',
    )
  })

  it('ignores the field the type does not use', () => {
    expect(packageName(entry({ type: 'Costume', ssr: 'Centi', name: 'Campaign Pass 1' }))).toBe(
      'Centi Costume',
    )
    expect(packageName(entry({ type: 'Campaign Pass', ssr: 'Centi' }))).toBe('')
    expect(packageName(entry({ type: 'Event Pass' }))).toBe('')
    expect(packageName(entry({ type: '' }))).toBe('')
  })
})

describe('monthOf', () => {
  it('names the month of an ISO date', () => {
    expect(monthOf('2026-01-31')).toBe('January')
    expect(monthOf('2026-12-01')).toBe('December')
    expect(monthOf('')).toBe('')
  })
})

describe('history', () => {
  it('skips blank rows and reads numbers as numbers', () => {
    expect(history).toHaveLength(6)
    expect(history[4]).toEqual({
      packageName: '30-day supply',
      type: 'Monthly Pass',
      priceIdr: '79000',
      priceUsd: '4.99',
      platform: 'RazerGold',
    })
  })

  it('suggests the last platform of the package, then of the type', () => {
    expect(suggestedPlatform(history, '30-day supply', 'Monthly Pass')).toBe('RazerGold')
    // A compound type never matches a single one.
    expect(suggestedPlatform(history, 'Mint Event Pass (December)', 'Event Pass')).toBe('DebitCard')
    expect(suggestedPlatform(history, 'Centi Costume', 'Costume')).toBe('')
  })

  it('finds the last monthly pass', () => {
    expect(lastMonthly(history)?.priceIdr).toBe('79000')
    expect(lastMonthly([])).toBeUndefined()
  })

  it('lists past names of a type, newest first, once each', () => {
    expect(pastNames(history, 'Music Pack')).toEqual(['T.T.S Summer Pack V.1'])
  })
})

describe('toRow', () => {
  const full = entry({
    type: 'Event Pass',
    ssr: 'Isabel',
    priceIdr: '314333',
    priceUsd: '19.99',
    notes: 'anniv',
  })

  it('writes columns A-G with numeric prices', () => {
    expect(toRow(full, 'RazerGold')).toEqual([
      '2026-11-22',
      "'Isabel Event Pass (November)",
      'Event Pass',
      314333,
      19.99,
      'RazerGold',
      "'anniv",
    ])
  })

  it('is null while anything required is missing or invalid', () => {
    expect(toRow(full, '')).toBeNull()
    expect(toRow(full, 'Paypal')).toBeNull()
    expect(toRow({ ...full, date: '' }, 'RazerGold')).toBeNull()
    expect(toRow({ ...full, ssr: '' }, 'RazerGold')).toBeNull()
    expect(toRow({ ...full, type: 'Event Pass, Costume' }, 'RazerGold')).toBeNull()
    for (const idr of ['', '79.000', '79,000', '0', '-5'])
      expect(toRow({ ...full, priceIdr: idr }, 'RazerGold')).toBeNull()
    for (const usd of ['', '4,99', '4.999', '0'])
      expect(toRow({ ...full, priceUsd: usd }, 'RazerGold')).toBeNull()
  })

  it('accepts a whole-dollar price', () => {
    expect(toRow({ ...full, priceUsd: '15' }, 'Apple')?.[4]).toBe(15)
  })
})
