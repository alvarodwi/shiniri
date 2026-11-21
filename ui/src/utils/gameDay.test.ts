import { describe, expect, it } from 'vitest'

import { gameDay } from './gameDay'

describe('gameDay', () => {
  it('keeps the previous date until the 03:00 WIB reset', () => {
    expect(gameDay(new Date('2026-11-17T19:59:59Z'))).toBe('2026-11-17')
  })

  it('rolls over at the reset', () => {
    expect(gameDay(new Date('2026-11-17T20:00:00Z'))).toBe('2026-11-18')
  })

  it('rolls over the year', () => {
    expect(gameDay(new Date('2026-12-31T21:00:00Z'))).toBe('2027-01-01')
  })
})
