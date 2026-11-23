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
  it('gives Log no sub links and the others the spec links', () => {
    const links = (k: string) => NAV.find((g) => g.key === k)?.links.map((l) => l.label)
    expect(links('log')).toEqual([])
    expect(links('journal')).toEqual(['Anomaly', 'Gear', 'Level', 'Solo Raid'])
    expect(links('gacha')).toEqual(['Pulls', 'Spending', 'Costumes'])
  })
})
