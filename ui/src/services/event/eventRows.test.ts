import { describe, expect, it } from 'vitest'

import { pullsHint, toRow } from './eventRows'

import type { EventEntry } from '@/types/event'

const entry = (over: Partial<EventEntry> = {}): EventEntry => ({
  date: '2026-11-21',
  rateUpName: '',
  rateUpType: 'Regular',
  gems: '0',
  tix: '1',
  names: [],
  notes: '',
  ...over,
})

describe('toRow', () => {
  it('builds the row with a computed times and a counted totalSsr', () => {
    const e = entry({
      rateUpName: 'Biscuit',
      gems: '900',
      tix: '2',
      names: ['Biscuit', 'Biscuit'],
    })
    expect(toRow(e)).toEqual([
      '2026-11-21',
      "'Biscuit",
      'Regular',
      900,
      2,
      5,
      2,
      "'Biscuit, Biscuit",
      '',
    ])
  })

  it('writes trimmed notes as text in the last column', () => {
    expect(toRow(entry({ notes: ' pity at 40 ' }))?.[8]).toBe("'pity at 40")
  })

  it('counts a blank currency as 0 once the other one is filled', () => {
    expect(toRow(entry({ gems: '', tix: '2' }))).toEqual(expect.arrayContaining([0, 2]))
    expect(toRow(entry({ gems: '600', tix: '' }))?.slice(3, 6)).toEqual([600, 0, 2])
  })

  it('refuses both currencies blank', () => {
    expect(toRow(entry({ gems: '', tix: '' }))).toBeNull()
  })

  it('counts 300 gems as one pull', () => {
    expect(toRow(entry({ gems: '600', tix: '1' }))?.[5]).toBe(3)
  })

  it('refuses gems that are not a multiple of 300', () => {
    for (const gems of ['1', '100', '450', '601']) expect(toRow(entry({ gems }))).toBeNull()
  })

  it('counts tix alone', () => {
    expect(toRow(entry({ gems: '0', tix: '3' }))?.[5]).toBe(3)
  })

  it('leaves rateUpName and details blank when empty', () => {
    const row = toRow(entry())
    expect(row?.[1]).toBe('')
    expect(row?.[6]).toBe(0)
    expect(row?.[7]).toBe('')
  })

  it('refuses less than one pull', () => {
    expect(toRow(entry({ gems: '0', tix: '0' }))).toBeNull()
  })

  it('refuses a missing date or banner type', () => {
    expect(toRow(entry({ date: '' }))).toBeNull()
    expect(toRow(entry({ rateUpType: '' }))).toBeNull()
    expect(toRow(entry({ rateUpType: 'Birthday' }))).toBeNull()
  })

  it('refuses gems or tix that are not whole non-negative numbers', () => {
    for (const bad of ['-1', '1.5', 'abc']) {
      expect(toRow(entry({ gems: bad }))).toBeNull()
      expect(toRow(entry({ tix: bad }))).toBeNull()
    }
  })

  it('trims gems and tix', () => {
    const row = toRow(entry({ gems: ' 300 ', tix: ' 1 ' }))
    expect(row?.[3]).toBe(300)
    expect(row?.[4]).toBe(1)
    expect(row?.[5]).toBe(2)
  })
})

describe('pullsHint', () => {
  it('explains the rate while both currencies are blank', () => {
    expect(pullsHint(entry({ gems: '', tix: '' }))).toBe('300 gems = 1 voucher = 1 pull')
  })

  it('shows the pull count, even before a banner type is chosen', () => {
    expect(pullsHint(entry({ gems: '600', tix: '1', rateUpType: '' }))).toBe('3 pulls')
  })

  it('says why a total below one pull cannot be saved', () => {
    expect(pullsHint(entry({ gems: '0', tix: '0' }))).toBe('Under 1 pull')
  })

  it('says why gems that are not a multiple of 300 cannot be saved', () => {
    expect(pullsHint(entry({ gems: '450', tix: '1' }))).toBe('Gems come in multiples of 300')
  })

  it('says when an amount is not a whole number', () => {
    expect(pullsHint(entry({ gems: 'abc', tix: '1' }))).toBe('Gems and tix are whole numbers')
  })
})
