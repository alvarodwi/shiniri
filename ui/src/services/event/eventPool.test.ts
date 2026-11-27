import { describe, expect, it } from 'vitest'

import { canDrop } from './eventPool'

import type { Nikke } from '@/services/nikke/nikkeDatabase'
import type { EventEntry } from '@/types/event'

const anne = {
  name: 'Anne',
  manufacturer: 'MISSILIS',
  releaseDate: '2022-12-15',
  limited: true,
  overspec: false,
} as Nikke
const on = (date: string, rateUpType = 'Winter Limited') =>
  canDrop(anne, { date, rateUpType, rateUpName: '' } as EventEntry)

describe('canDrop', () => {
  it('carries an old seasonal unit over from the next year on', () => {
    expect(on('2022-12-20')).toBe(false)
    expect(on('2023-12-14')).toBe(true)
  })

  it('does not rule it out while the date is half typed', () => {
    for (const date of ['', '0002-12-14', '0202-12-14']) expect(on(date)).toBe(true)
    expect(on('', 'Regular')).toBe(false)
  })
})
