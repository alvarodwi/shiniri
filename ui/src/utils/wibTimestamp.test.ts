import { describe, expect, it } from 'vitest'

import { wibTimestamp } from './wibTimestamp'

describe('wibTimestamp', () => {
  it('formats UTC+7 as YYYY-MM-DD HH:mm:ss', () => {
    expect(wibTimestamp(new Date('2026-11-19T14:04:12Z'))).toBe('2026-11-19 21:04:12')
    expect(wibTimestamp(new Date('2026-11-19T20:30:00Z'))).toBe('2026-11-20 03:30:00')
  })
})
