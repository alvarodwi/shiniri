import { describe, expect, it } from 'vitest'

import { fillQuestion } from './facts'
import {
  ANY_PERIOD,
  RANGE_PRESETS,
  chipText,
  customRange,
  dateFields,
  dateRange,
  inRange,
} from './ranges'
import { rollValues } from './roll'

const TODAY = '2026-11-25'
const DAYS = ['', '2024-08-22', '2025-01-01', '2025-12-31', '2026-11-25', '2026-11-26']
const kept = (range: string) => DAYS.filter(inRange(range, TODAY))
const cols = { T: { date: ['2026-11-25', '', 'junk', '2024-08-22', '2024-09-01'] } }
const filter = (quick?: boolean) => dateRange((c) => c.T.date, { quick })
const options = (quick?: boolean) => {
  const o = filter(quick).options
  return typeof o === 'function' ? o(cols) : o
}

describe('inRange', () => {
  it('keeps every dated row for any period', () => {
    expect(kept(ANY_PERIOD)).toEqual(DAYS.slice(1))
  })
  it('limits to one year', () => {
    expect(kept('in 2025')).toEqual(['2025-01-01', '2025-12-31'])
  })
  it('takes a custom range, both ends included', () => {
    expect(kept('2024-08-22..2025-01-01')).toEqual(['2024-08-22', '2025-01-01'])
  })
  it('ends an open custom range today', () => {
    expect(kept('2025-12-31..')).toEqual(['2025-12-31', '2026-11-25'])
  })
  it('throws on an unknown range', () => {
    expect(() => inRange('someday', TODAY)).toThrow('Unknown range preset "someday".')
  })
})

describe('customRange', () => {
  it('leaves the end open when To is today', () => {
    expect(customRange('2025-01-01', TODAY, TODAY)).toBe('2025-01-01..')
    expect(customRange('2025-01-01', '2025-02-01', TODAY)).toBe('2025-01-01..2025-02-01')
  })
})

describe('dateFields', () => {
  it('starts with To on today', () => {
    expect(dateFields(undefined, TODAY)).toEqual(['', TODAY])
    expect(dateFields(ANY_PERIOD, TODAY)).toEqual(['', TODAY])
  })
  it('follows a preset, year or custom range, never past today', () => {
    expect(dateFields('last week', TODAY)).toEqual(['2026-11-16', '2026-11-22'])
    expect(dateFields('this week', TODAY)).toEqual(['2026-11-23', TODAY])
    expect(dateFields('in 2025', TODAY)).toEqual(['2025-01-01', '2025-12-31'])
    expect(dateFields('2025-02-01..', TODAY)).toEqual(['2025-02-01', TODAY])
  })
})

describe('chipText', () => {
  it('words a custom range and keeps every other option', () => {
    expect(chipText(ANY_PERIOD)).toBe(ANY_PERIOD)
    expect(chipText('in 2025')).toBe('in 2025')
    expect(chipText('2024-08-22..')).toBe('since 22 Aug 2024')
  })
})

describe('dateRange filter', () => {
  it('offers any period, Quick and each year in the data', () => {
    expect(filter().label).toBe('Date range')
    expect(options()).toEqual([ANY_PERIOD, ...RANGE_PRESETS, 'in 2024', 'in 2026'])
  })
  it('can hide Quick', () => {
    expect(options(false)).toEqual([ANY_PERIOD, 'in 2024', 'in 2026'])
  })
  it('is rolled only from what it offers, never a custom range', () => {
    const o = options()
    const rolled = o.map((_, i) => rollValues({ range: o }, () => i / o.length).range)
    expect(rolled).toEqual(o)
    expect(rolled.some((v) => v.includes('..'))).toBe(false)
  })
})

describe('fillQuestion', () => {
  const fact = { question: 'How many pieces did I get {range}?', filters: [filter()] }
  const ask = (range?: string) => fillQuestion(fact, range ? { range } : {})

  it('words every date range choice', () => {
    expect(ask()).toBe('How many pieces did I get …?')
    expect(ask(ANY_PERIOD)).toBe('How many pieces did I get?')
    expect(ask('last week')).toBe('How many pieces did I get last week?')
    expect(ask('in 2025')).toBe('How many pieces did I get in 2025?')
    expect(ask('2024-08-22..')).toBe('How many pieces did I get since 22 Aug 2024?')
    expect(ask('2024-08-22..2024-09-01')).toBe(
      'How many pieces did I get from 22 Aug 2024 to 1 Sep 2024?',
    )
  })
  it('uses an option’s question text, dropping an empty one', () => {
    const boss = {
      id: 'boss',
      label: 'Boss',
      options: ['any boss', 'Kraken'],
      say: (v: string) => (v === 'any boss' ? '' : v),
    }
    const f = { question: 'How many {boss} runs?', filters: [boss] }
    expect(fillQuestion(f, { boss: 'any boss' })).toBe('How many runs?')
    expect(fillQuestion(f, { boss: 'Kraken' })).toBe('How many Kraken runs?')
  })
})
