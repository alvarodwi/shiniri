import { describe, expect, it } from 'vitest'

import {
  formatCount,
  formatDate,
  formatDuration,
  formatLarge,
  formatMoney,
  formatMonth,
  formatPercent,
  formatPlural,
  formatSigned,
} from './format'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('stats answer formatting', () => {
  it('writes dates and months', () => {
    expect(formatDate('2024-08-22')).toBe('22 Aug 2024')
    expect(formatDate('2023-07-08')).toBe('8 Jul 2023')
    expect(formatMonth('2026-09-30')).toBe('Sep 2026')
  })
  it('separates thousands only when there are some', () => {
    expect(formatCount(0)).toBe('0')
    expect(formatCount(999)).toBe('999')
    expect(formatCount(1839)).toBe('1,839')
    expect(formatPlural(1, 'level')).toBe('1 level')
    expect(formatPlural(1839, 'drop')).toBe('1,839 drops')
  })
  it('shortens large numbers to three digits, uppercase', () => {
    expect(formatLarge(16_700_000_000)).toBe('16.7B')
    expect(formatLarge(1_031_000_000_000)).toBe('1.03T')
  })
  it('writes durations in at most two adjacent units', () => {
    expect(formatDuration(0)).toBe('0 min')
    expect(formatDuration(14 * MIN + 59_000)).toBe('14 min')
    expect(formatDuration(HOUR + 9 * MIN)).toBe('1 h 9 min')
    expect(formatDuration(30 * DAY + HOUR + 5 * MIN)).toBe('30 days 1 h')
    expect(formatDuration(DAY + 5 * MIN)).toBe('1 day')
    expect(formatDuration(2 * HOUR)).toBe('2 h')
  })
  it('rounds percents, and has none of nothing', () => {
    expect(formatPercent(323, 629)).toBe('51')
    expect(formatPercent(0, 5)).toBe('0')
    expect(formatPercent(0, 0)).toBeNull()
  })
  it('signs changes', () => {
    expect(formatSigned(3600)).toBe('+3,600')
    expect(formatSigned(-18_400)).toBe('-18,400')
    expect(formatSigned(0)).toBe('0')
  })
  it('writes money in rupiah with dollars', () => {
    expect(formatMoney(31_631_619, 1948.27)).toBe('Rp31,631,619 ($1,948.27)')
    expect(formatMoney(15_000, 1)).toBe('Rp15,000 ($1.00)')
  })
})
