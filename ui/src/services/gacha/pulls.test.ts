import { describe, expect, it } from 'vitest'

import { pulls, pullsHint } from './pulls'

const c = (gems: string, tix: string) => ({ gems, tix })

describe('pullsHint', () => {
  it('explains the rate while both currencies are blank', () => {
    expect(pullsHint(c('', ''))).toBe('300 gems = 1 voucher = 1 pull')
  })

  it('shows the pull count', () => {
    expect(pullsHint(c('600', '1'))).toBe('3 pulls')
  })

  it('says why a total below one pull cannot be saved', () => {
    expect(pullsHint(c('0', '0'))).toBe('Under 1 pull')
  })

  it('says why gems that are not a multiple of 300 cannot be saved', () => {
    expect(pullsHint(c('450', '1'))).toBe('Gems come in multiples of 300')
  })

  it('says when an amount is not a whole number', () => {
    expect(pullsHint(c('abc', '1'))).toBe('Gems and tix are whole numbers')
  })
})

describe('pulls', () => {
  it('counts 300 gems as one pull on top of tix', () => {
    expect(pulls(c('600', '3'))).toEqual({ gems: 600, tix: 3, times: 5 })
  })

  it('trims and counts a blank currency as 0', () => {
    expect(pulls(c(' 300 ', ''))).toEqual({ gems: 300, tix: 0, times: 1 })
  })

  it('is null for blank, non-multiple and negative amounts', () => {
    expect(pulls(c('', ''))).toBeNull()
    expect(pulls(c('150', '1'))).toBeNull()
    expect(pulls(c('-300', '1'))).toBeNull()
  })
})
