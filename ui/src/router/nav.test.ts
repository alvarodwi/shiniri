import { describe, expect, it } from 'vitest'

import { NAV, groupOf } from './nav'

describe('groupOf', () => {
  it('finds the group from the path', () => {
    expect(groupOf('/journal/gear')?.key).toBe('journal')
    expect(groupOf('/gacha/costumes')?.key).toBe('gacha')
    expect(groupOf('/log')?.key).toBe('log')
  })
  it('returns null for an unknown path', () => {
    expect(groupOf('/nowhere')).toBeNull()
  })
  it('puts Stats before Log with no sub links', () => {
    const keys = NAV.map((g) => g.key)
    expect(keys.indexOf('stats')).toBe(keys.indexOf('log') - 1)
    expect(NAV.find((g) => g.key === 'stats')?.links).toEqual([])
    expect(groupOf('/stats')?.key).toBe('stats')
  })
  it('gives Log no sub links and the others the spec links', () => {
    const links = (k: string) => NAV.find((g) => g.key === k)?.links.map((l) => l.label)
    expect(links('log')).toEqual([])
    expect(links('journal')).toEqual(['Anomaly', 'Gear', 'Level', 'Solo Raid'])
    expect(links('gacha')).toEqual(['Pulls', 'Spending', 'Costumes'])
  })
})
